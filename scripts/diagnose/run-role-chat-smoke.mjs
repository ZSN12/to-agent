import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { createAppStateStore } from '../../backend/app-state-store.mjs'
import { createZHostManager, resolveTaskWeaverRuntimeHome } from '../../backend/agent/z-host/index.mjs'
import { createChatTurnPersistence } from '../../backend/chat-turn-persistence.mjs'
import { resolveModelKeyForChat } from '../../backend/chat-model-resolver.mjs'
import { registerChatIpc } from '../../backend/ipc/register-chat-ipc.mjs'
import { registerChatSendIpc } from '../../backend/ipc/register-chat-send-ipc.mjs'
import { createDshChatService } from '../../backend/dsh-chat-service.mjs'
import { createModelService } from '../../backend/model-service.mjs'
import { createPermissionService } from '../../backend/permission-service.mjs'
import { createProfileStore } from '../../backend/profile-store.mjs'
import { createRoleProfileStore } from '../../backend/role-profile-store.mjs'
import { resolveTaskWeaverOpenCodexRoot } from '../../backend/opencodex-package-root.mjs'
import { createUsageStore } from '../../backend/usage-store.mjs'
import { classifyLifecycleSmokeError } from '../lifecycle-smoke-diagnostics.mjs'

// This diagnostic makes real provider requests. It always uses a temporary
// Host home and isolated app state; never attach it to the running desktop app.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
if (!process.argv.includes('--local')) {
  throw new Error('Pass --local to run isolated real-provider Bot requests')
}
const bundleArgIndex = process.argv.indexOf('--bundle')
const bundlePathArg = bundleArgIndex < 0 ? null : process.argv[bundleArgIndex + 1]
if (bundleArgIndex >= 0 && (!bundlePathArg || bundlePathArg.startsWith('--'))) {
  throw new Error('Pass an app bundle path after --bundle')
}
const bundleResourcesPath = bundlePathArg ? path.join(path.resolve(bundlePathArg), 'Contents/Resources') : null
const runtimeRoot = bundleResourcesPath
  ? path.join(bundleResourcesPath, 'backend/runtime')
  : path.join(root, 'vendor/taskweaver-z-runtime')
const backendRoot = bundleResourcesPath
  ? path.join(bundleResourcesPath, 'app/backend')
  : path.join(root, 'backend')
const opencodexSearchRoot = bundleResourcesPath
  ? path.join(bundleResourcesPath, 'app')
  : root
const { createRoleChatService } = await import(pathToFileURL(path.join(backendRoot, 'role-chat-service.mjs')).href)
const opencodexPackageRoot = resolveTaskWeaverOpenCodexRoot(opencodexSearchRoot)
const resourcesPath = bundleResourcesPath
  ?? (process.env.TASKWEAVER_RESOURCES_PATH
    ?? await fs.access('/Applications/TaskWeaver.app/Contents/Resources')
      .then(() => '/Applications/TaskWeaver.app/Contents/Resources')
      .catch(() => null))

const startedAt = Date.now()
const reportDir = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-role-chat-smoke-'))
const userDataPath = path.join(os.homedir(), 'Library/Application Support/taskweaver-desktop')
const runtimeHome = resolveTaskWeaverRuntimeHome({ env: process.env, home: os.homedir() })
const events = []
const report = { status: 'running', startedAt, scenarios: [] }
let activeStage = 'smoke-harness-setup'
let manager
let chat
let modelService
let roleChat
let roleChatIpc
let permissions
let persistNativeTurn
let heartbeat
let mergeStoredMessagesWithDshTranscript
const activeConversationIds = new Set()
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

function bounded(promise, label, timeoutMs = 240_000) {
  let timer
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Test observation deadline: ${label}`)), timeoutMs)
    }),
  ]).finally(() => clearTimeout(timer))
}

async function waitFor(predicate, label, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(`Test observation deadline: ${label}`)
    await sleep(100)
  }
}

function connection(expectedId) {
  return {
    isDestroyed: () => false,
    send(channel, event) {
      if (channel !== 'chat:stream') return
      events.push({
        time: Date.now(),
        expectedId,
        conversationId: event.conversationId,
        type: event.type,
        status: event.status,
        roleId: event.roleId,
        roleName: event.roleName,
        toolName: event.toolName,
        turnId: event.turnId,
      })
    },
  }
}

function createRoleChatIpcInvoker(roleChatService) {
  const handlers = new Map()
  const lockedConversations = new Set()
  const ipcMain = { handle: (channel, handler) => handlers.set(channel, handler) }
  const resolveConversationId = async requestedId => {
    if (requestedId) return (await appState.getConversationState(requestedId)).conversationId
    return (await appState.getState()).conversationId
  }
  const getConversationRuntimeContext = async conversationId => {
    const state = await appState.getConversationState(conversationId)
    return { workspacePath: state.workspacePath, permissionMode: state.permissionMode, workspaceTrusted: true }
  }
  const chatTurnPipeline = {
    runTurn: async () => { throw new Error('Unexpected single-agent turn in Bot smoke') },
    abortVerification: () => false,
  }
  const withTurnLock = async (conversationId, run) => {
    if (lockedConversations.has(conversationId)) throw new Error('该会话的上一条任务仍在处理中')
    lockedConversations.add(conversationId)
    try {
      await appState.getConversationState(conversationId)
      return await run()
    } finally {
      lockedConversations.delete(conversationId)
    }
  }
  registerChatSendIpc({
    ipcMain,
    appBootstrap: { start: async () => {} },
    resolveIpcConversationId: resolveConversationId,
    getConversationRuntimeContext,
    withTurnLock,
    chatTurnPipeline,
    roleChatService,
  })
  registerChatIpc({
    ipcMain,
    dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
    skills: { list: async () => [] },
    chat,
    roleChatService,
    orchestration: { abort: async () => false },
    conversationHub: { getSessionIdForConversation: () => null },
    resolveIpcConversationId: resolveConversationId,
    hostManager: manager,
    getConversationRuntimeContext,
    turnInProgressByConversation: lockedConversations,
    withTurnLock,
    chatTurnPipeline,
    chatDocumentAttachments: { takeDocuments: async () => [] },
  })
  const handler = handlers.get('chat:sendAsRoles')
  assert.equal(typeof handler, 'function', 'the production Bot send IPC must register')

  const invoke = (payload) => handler({
    sender: payload.webContents,
    senderFrame: { url: 'taskweaver://app' },
  }, payload)
  const send = async (payload) => {
    const response = await invoke(payload)
    if (!response?.ok) throw new Error(response?.error || 'Bot send IPC failed')
    return response.data
  }
  const cancel = async (conversationId) => {
    const handler = handlers.get('chat:cancel')
    if (typeof handler !== 'function') throw new Error('The production chat cancel IPC did not register')
    const response = await handler({ sender: connection(conversationId), senderFrame: { url: 'taskweaver://app' } }, conversationId)
    if (!response?.ok) throw new Error(response?.error || 'Bot cancel IPC failed')
    return response.data
  }
  return { invoke, send, cancel }
}

function roleSessionKey(profile, conversationId) {
  const conversationHash = createHash('sha256').update(conversationId).digest('hex').slice(0, 16)
  const personaHash = createHash('sha256').update(profile.persona).digest('hex').slice(0, 20)
  return `tw-role-${profile.id}-${conversationHash}-${personaHash}`
}

async function nativeHistory(api, sessionId) {
  const response = await api.sessions.history({ sessionId })
  assert.equal(response.result?.ok, true, 'Host history must be readable after a Bot turn')
  return response.result.value.events.map(row => row.event)
}

async function runScenario({ name, strategy, text, verify, selectedRoles = roles }) {
  activeStage = `${name}:create-isolated-conversation`
  const conversationId = `role-smoke-${name}-${randomUUID()}`
  activeConversationIds.add(conversationId)
  await appState.createBackgroundConversation({
    conversationId,
    workspacePath: root,
    permissionMode: 'readonly',
    title: `Bot ${name} smoke`,
  })
  const since = Date.now()
  activeStage = `${name}:provider-turn`
  const request = roleChatIpc.send({
    webContents: connection(conversationId),
    conversationId,
    text,
    roleIds: selectedRoles.map(profile => profile.id),
    discussionStrategy: strategy,
    summarize: false,
    runtimeContext: { workspacePath: root, permissionMode: 'readonly', workspaceTrusted: true },
  })
  request.catch(() => {})
  let result
  try {
    result = await bounded(request, `${name} role round`)
  } catch (error) {
    if (roleChat.isRunning(conversationId)) {
      roleChat.abort(conversationId)
      await roleChat.waitForAbort(conversationId)
      await request.catch(() => {})
    }
    throw error
  }

  if (result.roleErrors.length > 0) {
    throw Object.assign(new Error('one or more configured Bots failed'), {
      smokeDetails: {
        stage: `${name}:provider-turn`,
        roleFailures: result.roleErrors.map(({ roleId, roleName, message }) => ({
          roleId,
          roleName,
          ...classifyLifecycleSmokeError(message),
        })),
      },
    })
  }
  activeStage = `${name}:persisted-messages`
  assert.equal(result.assistants.length, selectedRoles.length, `${name} must persist one reply per Bot`)
  assert.equal(roleChat.isRunning(conversationId), false, `${name} must release its role-run lock`)

  const state = await appState.getConversationState(conversationId)
  const assistants = state.messages.filter(message => message.roleMode && message.speakerId)
  assert.equal(assistants.length, selectedRoles.length, `${name} must persist all Bot replies into the conversation`)
  for (const profile of selectedRoles) {
    const message = assistants.find(row => row.speakerId === profile.id)
    assert.ok(message?.text?.trim(), `${profile.name} must have a durable non-empty role reply`)
    assert.equal(message.roleMode, true)
  }

  const scenarioEvents = events.filter(event => event.expectedId === conversationId)
  assert.ok(scenarioEvents.length >= selectedRoles.length * 2, `${name} must emit role lifecycle events`)
  const progress = scenarioEvents.filter(event => event.type === 'role_progress')
  assert.ok(progress.every(event => event.conversationId === conversationId), 'role progress must stay on its originating conversation')
  activeStage = `${name}:strategy-verification`
  const verification = await verify({ conversationId, assistants, progress, scenarioEvents, since })

  activeStage = `${name}:native-host-history`
  const nativeSessions = []
  for (const profile of selectedRoles) {
    const sessionKey = roleSessionKey(profile, conversationId)
    const sessionId = chat.getSessionId(sessionKey)
    assert.ok(sessionId, `${profile.name} must have its own Host session`)
    const history = await nativeHistory(api, sessionId)
    const turnEnds = history.filter(event => event.type === 'turn/end')
    assert.equal(turnEnds.length, 1, `${profile.name} Host session must contain exactly one turn`)
    assert.equal(turnEnds[0].data?.reason?.kind, 'completed', `${profile.name} Host turn must complete successfully`)
    const toolCalls = history.filter(event => event.type === 'tool/call').map(event => event.data?.name).filter(Boolean)
    nativeSessions.push({ roleId: profile.id, roleName: profile.name, modelKey: profile.modelKey, toolCalls })
  }

  const row = {
    name,
    strategy,
    status: 'passed',
    elapsedMs: Date.now() - since,
    persistedAssistantCount: assistants.length,
    hostTurnCount: selectedRoles.length,
    hostTurnsCompleted: selectedRoles.length,
    lifecycleEvents: progress.length,
    sessions: nativeSessions,
    ...verification,
  }
  report.scenarios.push(row)
  console.log(JSON.stringify({ scenario: name, ...row }))
  activeConversationIds.delete(conversationId)
  return row
}

async function runVerificationCalibrationScenario() {
  return runScenario({
    name: 'exact-arithmetic-with-independent-checks',
    strategy: 'independent',
    text: '请计算 1234 × 5678，并给出两种彼此独立的校验方法，其中一种使用模 9 或数字和。不要调用工具。',
    verify: async ({ assistants }) => {
      const replies = assistants.map(({ name, text }) => {
        const mentionsMod9 = /模\s*9|mod\s*9|九余数|数位和|数字和/i.test(text)
        const statesLimitation = /(?:不能|不足以|不应|无法|并不能|不代表|不是)[^。；\n]{0,50}(?:证明|保证|确认|完全正确|排除所有)|(?:只是|仅是|仅能|只能)[^。；\n]{0,40}(?:筛查|校验|发现|检查|排除部分)/i.test(text)
        const overclaimsMod9 = text.split(/[。；\n]/).some(clause => (
          /模\s*9|九余数|数字和|数位和/i.test(clause)
          && /证明|证实|保证|完全验证/.test(clause)
          && !/不能|不足以|不应|无法|并不能|不代表|不是/.test(clause)
        ))
        return {
          role: name,
          correctProductPresent: text.replace(/\D/g, '').includes('7006652'),
          mentionsMod9,
          statesLimitation,
          overclaimsMod9,
          excerpt: text.slice(0, 900),
        }
      })
      if (!replies.every(reply => reply.correctProductPresent)) {
        throw Object.assign(new Error('Each Bot must report the exact product 7,006,652.'), {
          smokeDetails: { stage: 'exact-arithmetic-with-independent-checks:strategy-verification', calibrationDiagnostics: replies },
        })
      }
      if (!replies.every(reply => reply.mentionsMod9 && reply.statesLimitation && !reply.overclaimsMod9)) {
        throw Object.assign(new Error('Weak arithmetic checks must be described as consistency checks, not proof.'), {
          smokeDetails: { stage: 'exact-arithmetic-with-independent-checks:strategy-verification', calibrationDiagnostics: replies },
        })
      }
      return { replies }
    },
  })
}

async function loadTranscriptMerger() {
  if (mergeStoredMessagesWithDshTranscript) return mergeStoredMessagesWithDshTranscript
  const result = await build({
    stdin: {
      contents: "export { mergeStoredMessagesWithDshTranscript } from './src/features/dsh-runtime/dshTranscriptMessages'",
      resolveDir: root,
      loader: 'ts',
    },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
  })
  const loaded = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
  mergeStoredMessagesWithDshTranscript = loaded.mergeStoredMessagesWithDshTranscript
  return mergeStoredMessagesWithDshTranscript
}

async function runWorkHistoryScenario() {
  const name = 'kai-work-history-shared-with-bot'
  const conversationId = `role-smoke-${name}-${randomUUID()}`
  const profile = roles[0]
  const marker = `KAI_WORK_${randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase()}`
  const workUserText = `后续如果我在 KAI Bot 里问跨模式记忆，请从 KAI Work 历史里找回这个唯一标记：${marker}。`
  const workAssistantText = '已记下这个标记，后续可以在同一会话中继续引用。'
  const historyTime = Date.now() - 60_000
  activeConversationIds.add(conversationId)

  activeStage = `${name}:create-shared-conversation`
  await appState.createBackgroundConversation({
    conversationId,
    workspacePath: root,
    permissionMode: 'readonly',
    title: 'KAI Work 与 Bot 历史共享验证',
  })
  await appState.appendMessagesToConversation(
    conversationId,
    {
      id: `work-user-${randomUUID()}`,
      author: 'user',
      name: '你',
      text: workUserText,
      time: new Date(historyTime).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }),
      timestamp: historyTime,
    },
    {
      id: `work-assistant-${randomUUID()}`,
      author: 'orchestrator',
      name: 'TaskWeaver',
      text: workAssistantText,
      time: new Date(historyTime + 1_000).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }),
      timestamp: historyTime + 1_000,
    },
  )

  const transcript = [
    { dshKey: `work-user-${conversationId}`, role: 'user', text: workUserText, timestamp: historyTime },
    { dshKey: `work-assistant-${conversationId}`, role: 'assistant', text: workAssistantText, timestamp: historyTime + 1_000 },
  ]

  const since = Date.now()
  activeStage = `${name}:provider-turn`
  const request = roleChatIpc.send({
    webContents: connection(conversationId),
    conversationId,
    text: '请从本会话较早的 KAI Work 历史中找回用户要求记住的唯一标记。只输出 WORK_HISTORY_TOKEN=<原样标记>，不要猜测，也不要调用工具。',
    roleIds: [profile.id],
    discussionStrategy: 'independent',
    summarize: false,
    runtimeContext: { workspacePath: root, permissionMode: 'readonly', workspaceTrusted: true },
  })
  request.catch(() => {})
  let result
  try {
    result = await bounded(request, `${name} real provider round`)
  } catch (error) {
    if (roleChat.isRunning(conversationId)) {
      roleChat.abort(conversationId)
      await roleChat.waitForAbort(conversationId)
      await request.catch(() => {})
    }
    throw error
  }

  assert.equal(result.roleErrors.length, 0, 'the Bot must finish with shared KAI Work history available')
  assert.equal(result.assistants.length, 1)
  assert.match(result.assistants[0].text, new RegExp(`WORK_HISTORY_TOKEN\\s*=\\s*${marker}`),
    'the actual provider must recall a random marker absent from its current prompt')

  activeStage = `${name}:merge-shared-transcript`
  const state = await appState.getConversationState(conversationId)
  const merge = await loadTranscriptMerger()
  const visibleMessages = merge(state.messages, transcript, true)
  const roleUser = state.messages.find(message => message.roleMode && message.author === 'user')
  const roleAssistant = state.messages.find(message => message.roleMode && message.speakerId === profile.id)
  assert.ok(roleUser && roleAssistant, 'the Bot user prompt and answer must both persist in the shared conversation')
  assert.equal(visibleMessages.filter(message => message.text === workUserText).length, 1,
    'the native Work user row must appear exactly once in the shared transcript')
  assert.equal(visibleMessages.filter(message => message.text === workAssistantText).length, 1,
    'the native Work assistant row must appear exactly once in the shared transcript')
  assert.equal(visibleMessages.filter(message => message.id === roleUser.id).length, 1,
    'the Bot prompt must appear exactly once in the shared transcript')
  assert.equal(visibleMessages.filter(message => message.id === roleAssistant.id).length, 1,
    'the Bot answer must appear exactly once in the shared transcript')
  assert.ok(visibleMessages.indexOf(roleUser) < visibleMessages.indexOf(roleAssistant),
    'the Bot prompt must precede its answer in the merged transcript')

  const row = {
    name,
    status: 'passed',
    elapsedMs: Date.now() - since,
    recalledWorkMarker: true,
    mergedMessageCount: visibleMessages.length,
    workRowsVisibleOnce: true,
    botRowsVisibleOnce: true,
  }
  report.scenarios.push(row)
  console.log(JSON.stringify({ scenario: name, ...row }))
  activeConversationIds.delete(conversationId)
  return row
}

async function runCompletedTurnFollowUpScenario() {
  const name = 'completed-turn-follow-up-retains-history'
  activeStage = `${name}:create-isolated-conversation`
  const conversationId = `role-smoke-${name}-${randomUUID()}`
  activeConversationIds.add(conversationId)
  await appState.createBackgroundConversation({
    conversationId,
    workspacePath: root,
    permissionMode: 'readonly',
    title: `Bot ${name} smoke`,
  })

  const since = Date.now()
  const sendRound = async (roundName, text, expectedMarker) => {
    activeStage = `${name}:${roundName}`
    const request = roleChatIpc.send({
      webContents: connection(conversationId),
      conversationId,
      text,
      roleIds: roles.map(profile => profile.id),
      discussionStrategy: 'independent',
      summarize: false,
      runtimeContext: { workspacePath: root, permissionMode: 'readonly', workspaceTrusted: true },
    })
    request.catch(() => {})
    let result
    try {
      result = await bounded(request, `${name} ${roundName}`)
    } catch (error) {
      if (roleChat.isRunning(conversationId)) {
        roleChat.abort(conversationId)
        await roleChat.waitForAbort(conversationId)
        await request.catch(() => {})
      }
      throw error
    }
    assert.equal(result.roleErrors.length, 0, `${roundName} must complete for both Bots`)
    assert.equal(result.assistants.length, roles.length, `${roundName} must persist one reply per Bot`)
    for (const assistant of result.assistants) {
      assert.ok(assistant.text.includes(expectedMarker), `${assistant.name} must return the ${roundName} marker`)
    }
    assert.equal(roleChat.isRunning(conversationId), false, `${roundName} must release the conversation lock before the next round`)
    return result
  }

  const first = await sendRound(
    'first-round',
    '请不要调用工具，只输出这一行原样文本：GROUP_ROUND_ONE_READY。',
    'GROUP_ROUND_ONE_READY',
  )
  const firstState = await appState.getConversationState(conversationId)
  const firstMessages = firstState.messages.filter(message => message.roleMode && message.speakerId)
  assert.equal(firstMessages.length, roles.length, 'the completed first round must be durable before the follow-up is sent')
  const firstMessagesByRole = new Map(firstMessages.map(message => [message.speakerId, message]))
  for (const profile of roles) {
    assert.ok(firstMessagesByRole.get(profile.id)?.text?.includes('GROUP_ROUND_ONE_READY'),
      `${profile.name} first-round answer must be available to the next round`)
  }

  const second = await sendRound(
    'second-round',
    '这是同一会话的第二轮。请不要调用工具，只输出这一行原样文本：GROUP_ROUND_TWO_READY。',
    'GROUP_ROUND_TWO_READY',
  )
  const finalState = await appState.getConversationState(conversationId)
  const finalMessages = finalState.messages.filter(message => message.roleMode && message.speakerId)
  assert.equal(finalMessages.length, roles.length * 2, 'the second round must retain all first-round answers and add two new replies')
  for (const profile of roles) {
    const roleMessages = finalMessages.filter(message => message.speakerId === profile.id)
    assert.equal(roleMessages.length, 2, `${profile.name} must keep one durable answer per round`)
    assert.equal(roleMessages[0].id, firstMessagesByRole.get(profile.id).id,
      `${profile.name} first-round reply must not disappear when the next round starts`)
    assert.ok(roleMessages[0].text.includes('GROUP_ROUND_ONE_READY'))
    assert.ok(roleMessages[1].text.includes('GROUP_ROUND_TWO_READY'))
  }
  assert.equal(first.assistants.length + second.assistants.length, roles.length * 2)

  const scenarioEvents = events.filter(event => event.expectedId === conversationId)
  const completedCounts = new Map(roles.map(profile => [profile.id,
    scenarioEvents.filter(event => event.type === 'role_progress'
      && event.roleId === profile.id && event.status === 'completed').length]))
  assert.ok([...completedCounts.values()].every(count => count === 2),
    'both rounds must emit a completed lifecycle event for each Bot')

  activeStage = `${name}:native-host-history`
  const nativeSessions = []
  for (const profile of roles) {
    const sessionId = chat.getSessionId(roleSessionKey(profile, conversationId))
    assert.ok(sessionId, `${profile.name} must reuse its Host session across both rounds`)
    const history = await nativeHistory(api, sessionId)
    const turnEnds = history.filter(event => event.type === 'turn/end')
    assert.equal(turnEnds.length, 2, `${profile.name} Host history must contain one completed turn per round`)
    assert.ok(turnEnds.every(event => event.data?.reason?.kind === 'completed'))
    nativeSessions.push({ roleId: profile.id, roleName: profile.name, turnCount: turnEnds.length })
  }

  const row = {
    name,
    strategy: 'independent',
    status: 'passed',
    elapsedMs: Date.now() - since,
    completedRounds: 2,
    persistedAssistantCount: finalMessages.length,
    hostTurnCount: roles.length * 2,
    hostTurnsCompleted: roles.length * 2,
    lifecycleEvents: scenarioEvents.filter(event => event.type === 'role_progress').length,
    priorRoundAnswersRetained: true,
    sessions: nativeSessions,
  }
  report.scenarios.push(row)
  console.log(JSON.stringify({ scenario: name, ...row }))
  activeConversationIds.delete(conversationId)
  return row
}

async function runWritePermissionScenario() {
  const name = 'review-role-honors-full-access'
  activeStage = `${name}:create-isolated-workspace-directory`
  const conversationId = `role-smoke-${name}-${randomUUID()}`
  const workspacePath = path.join(reportDir, 'review-role-write-workspace')
  const targetPath = path.join(workspacePath, 'review-permission-proof.txt')
  await fs.mkdir(workspacePath, { recursive: true, mode: 0o700 })
  activeConversationIds.add(conversationId)
  activeStage = `${name}:create-isolated-conversation`
  const createdConversation = await appState.createBackgroundConversation({
    conversationId,
    workspacePath,
    permissionMode: 'full',
    title: `Bot ${name} smoke`,
  })
  activeStage = `${name}:read-isolated-conversation`
  const conversationState = await appState.getConversationState(createdConversation.conversationId)
  assert.equal(createdConversation.conversationId, conversationId, 'the isolated conversation must preserve its requested ID')
  assert.equal(conversationState.permissionMode, 'full', 'the test conversation must carry the selected full-access permission')

  activeStage = `${name}:create-isolated-role-profile`
  const isolatedRoleProfileStore = createRoleProfileStore(path.join(reportDir, 'review-role-profile-store'))
  const reviewRole = await isolatedRoleProfileStore.upsert({
    name: '授权边界审查员',
    description: '审查并修复已授权工作区中的问题',
    modelKey: roles[0].modelKey,
    persona: '你是一名代码审查员。审查是职责，不代表只读；依据用户明确任务和 Host 权限执行。用户要求修复且会话授权允许时，可以直接修改当前工作区。',
    stylePreset: 'precise',
  })
  activeStage = `${name}:create-role-chat-service`
  const writePermissionRoleChat = createRoleChatService({
    roleProfileStore: isolatedRoleProfileStore,
    profileStore,
    resolveModelKeyForChat,
    chat,
    appState,
    permissions,
    persistNativeTurn,
  })

  const since = Date.now()
  activeStage = `${name}:provider-write-turn`
  const writePermissionRoleIpc = createRoleChatIpcInvoker(writePermissionRoleChat)
  const request = writePermissionRoleIpc.send({
    webContents: connection(conversationId),
    conversationId,
    text: '请在当前工作区创建文件 review-permission-proof.txt，只写一行 ROLE_WRITE_OK，然后确认完成。不要修改或创建任何其他文件。',
    roleIds: [reviewRole.id],
    discussionStrategy: 'relay',
    summarize: false,
    runtimeContext: {
      workspacePath: conversationState.workspacePath,
      permissionMode: conversationState.permissionMode,
      workspaceTrusted: true,
    },
  })
  request.catch(() => {})
  let result
  try {
    result = await bounded(request, `${name} actual workspace write`)
  } catch (error) {
    if (writePermissionRoleChat.isRunning(conversationId)) {
      writePermissionRoleChat.abort(conversationId)
      await writePermissionRoleChat.waitForAbort(conversationId)
      await request.catch(() => {})
    }
    throw error
  }
  assert.equal(result.roleErrors.length, 0, 'a full-access review role must finish without a permission denial')
  assert.equal(result.assistants.length, 1, 'the review role must return a durable answer')
  const written = await fs.readFile(targetPath, 'utf8')
  assert.match(written, /ROLE_WRITE_OK/, 'the real Host write tool must create the marker in the isolated workspace')
  assert.equal(await fs.readdir(workspacePath).then(files => files.join(',')), 'review-permission-proof.txt',
    'the test task must not modify any other workspace file')
  assert.equal(writePermissionRoleChat.isRunning(conversationId), false)

  activeStage = `${name}:native-host-history`
  const sessionId = chat.getSessionId(roleSessionKey(reviewRole, conversationId))
  assert.ok(sessionId, 'the review role must use its own Host session')
  const history = await nativeHistory(api, sessionId)
  const turnEnds = history.filter(event => event.type === 'turn/end')
  const toolCalls = history.filter(event => event.type === 'tool/call').map(event => event.data?.name).filter(Boolean)
  assert.equal(turnEnds.length, 1)
  assert.equal(turnEnds[0].data?.reason?.kind, 'completed')
  assert.ok(toolCalls.length > 0, 'the marker must be created through an actual Host tool call')

  const row = {
    name,
    strategy: 'full-access',
    status: 'passed',
    elapsedMs: Date.now() - since,
    permissionMode: conversationState.permissionMode,
    role: reviewRole.name,
    fileWritten: true,
    toolCalls,
    completedHostTurns: turnEnds.length,
  }
  report.scenarios.push(row)
  console.log(JSON.stringify({ scenario: name, ...row }))
  activeConversationIds.delete(conversationId)
  return row
}

async function runSummaryScenario() {
  const name = 'independent-replies-with-lead-summary'
  const conversationId = `role-smoke-${name}-${randomUUID()}`
  activeConversationIds.add(conversationId)
  activeStage = `${name}:create-isolated-conversation`
  await appState.createBackgroundConversation({
    conversationId,
    workspacePath: root,
    permissionMode: 'readonly',
    title: `Bot ${name}`,
  })

  const since = Date.now()
  activeStage = `${name}:provider-turns-and-summary`
  const request = roleChatIpc.send({
    webContents: connection(conversationId),
    conversationId,
    text: '请独立回答：17 是否为质数？给出简短理由，并在回答中包含 PRIME_CHECK。不要调用工具。',
    roleIds: roles.map(profile => profile.id),
    discussionStrategy: 'independent',
    summarize: true,
    runtimeContext: { workspacePath: root, permissionMode: 'readonly', workspaceTrusted: true },
  })
  request.catch(() => {})
  let result
  try {
    result = await bounded(request, `${name} provider turns and lead summary`)
  } catch (error) {
    if (roleChat.isRunning(conversationId)) {
      roleChat.abort(conversationId)
      await roleChat.waitForAbort(conversationId)
      await request.catch(() => {})
    }
    throw error
  }

  assert.equal(result.roleErrors.length, 0, 'both independent replies and the summary must complete')
  assert.equal(result.assistants.length, 3, 'two independent replies and one summary must be persisted')
  const state = await appState.getConversationState(conversationId)
  const assistants = state.messages.filter(message => message.roleMode && message.speakerId)
  assert.equal(assistants.length, 3)
  const summaries = assistants.filter(message => message.roleSummary === true)
  assert.equal(summaries.length, 1, 'the lead summary must be marked as a summary message')
  assert.equal(summaries[0].speakerId, roles[0].id, 'the first selected Bot must host the requested summary')
  assert.ok(summaries[0].text.trim(), 'the summary must persist non-empty text')
  assert.equal(assistants.filter(message => !message.roleSummary).length, 2)
  assert.equal(roleChat.isRunning(conversationId), false)

  const progress = events.filter(event => event.expectedId === conversationId && event.type === 'role_progress')
  assert.equal(progress.filter(event => event.status === 'started').length, 3)
  assert.equal(progress.filter(event => event.status === 'completed').length, 3)
  assert.ok(progress.some(event => event.roleId === roles[0].id && event.roleName.includes('汇总')),
    'the lead Bot must emit a distinct summary lifecycle event')

  activeStage = `${name}:native-host-history`
  for (const [index, profile] of roles.entries()) {
    const sessionId = chat.getSessionId(roleSessionKey(profile, conversationId))
    assert.ok(sessionId)
    const history = await nativeHistory(api, sessionId)
    const turnEnds = history.filter(event => event.type === 'turn/end')
    assert.equal(turnEnds.length, index === 0 ? 2 : 1, 'the lead Host session must contain its answer and summary turns')
    assert.ok(turnEnds.every(event => event.data?.reason?.kind === 'completed'))
  }

  const row = {
    name,
    status: 'passed',
    elapsedMs: Date.now() - since,
    independentReplies: 2,
    leadSummaries: summaries.length,
    completedHostTurns: 3,
    summaryLifecycle: true,
  }
  report.scenarios.push(row)
  console.log(JSON.stringify({ scenario: name, ...row }))
  activeConversationIds.delete(conversationId)
  return row
}

async function runProviderFailureIsolationScenario() {
  const name = 'one-unavailable-model-does-not-hide-other-bot-or-block-retry'
  const conversationId = `role-smoke-${name}-${randomUUID()}`
  const [failedProfile, healthyProfile] = roles
  const unavailableModelKey = 'taskweaver-smoke-invalid-provider/unavailable-model'
  activeConversationIds.add(conversationId)
  activeStage = `${name}:create-isolated-conversation`
  await appState.createBackgroundConversation({
    conversationId,
    workspacePath: root,
    permissionMode: 'readonly',
    title: `Bot ${name}`,
  })

  const failingRouteProfileStore = {
    async get(id) {
      const profile = await roleProfileStore.get(id)
      return id === failedProfile.id && profile
        ? { ...profile, modelKey: unavailableModelKey }
        : profile
    },
  }
  const failureService = createRoleChatService({
    roleProfileStore: failingRouteProfileStore,
    profileStore,
    resolveModelKeyForChat,
    chat,
    appState,
    permissions,
    persistNativeTurn,
  })
  const failureIpc = createRoleChatIpcInvoker(failureService)
  const healthyMarker = `HEALTHY_BOT_${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`
  const since = Date.now()
  activeStage = `${name}:mixed-provider-outcome`
  const request = failureIpc.send({
    webContents: connection(conversationId),
    conversationId,
    text: `只输出 HEALTHY_MARKER=${healthyMarker}，不要调用工具，不要解释。`,
    roleIds: [failedProfile.id, healthyProfile.id],
    discussionStrategy: 'independent',
    summarize: false,
    runtimeContext: { workspacePath: root, permissionMode: 'readonly', workspaceTrusted: true },
  })
  request.catch(() => {})

  let mixedResult
  try {
    mixedResult = await bounded(request, `${name} mixed provider result`)
  } catch (error) {
    if (failureService.isRunning(conversationId)) {
      failureService.abort(conversationId)
      await failureService.waitForAbort(conversationId)
      await request.catch(() => {})
    }
    throw error
  }

  activeStage = `${name}:failed-route-isolated`
  assert.equal(mixedResult.roleErrors.length, 1, 'the unavailable model must fail only its own Bot')
  assert.equal(mixedResult.roleErrors[0].roleId, failedProfile.id)
  assert.match(mixedResult.roleErrors[0].message, /未找到模型/)
  assert.equal(mixedResult.assistants.length, 1, 'the other Bot reply must still be returned and persisted')
  assert.equal(mixedResult.assistants[0].speakerId, healthyProfile.id)
  assert.match(mixedResult.assistants[0].text, new RegExp(healthyMarker))
  assert.equal(failureService.isRunning(conversationId), false, 'a mixed success/failure turn must release its lock')

  const firstProgress = events.filter(event => event.expectedId === conversationId && event.type === 'role_progress')
  assert.ok(firstProgress.some(event => event.roleId === failedProfile.id && event.status === 'failed'),
    'the unavailable route must emit a failure event for its Bot')
  assert.ok(firstProgress.some(event => event.roleId === healthyProfile.id && event.status === 'completed'),
    'the healthy provider must emit completion despite the other route failure')

  activeStage = `${name}:retry-same-conversation`
  const recoveryMarker = `RECOVERED_${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`
  const retry = await bounded(failureIpc.send({
    webContents: connection(conversationId),
    conversationId,
    text: `只输出 RECOVERY_MARKER=${recoveryMarker}，不要调用工具，不要解释。`,
    roleIds: [healthyProfile.id],
    discussionStrategy: 'independent',
    summarize: false,
    runtimeContext: { workspacePath: root, permissionMode: 'readonly', workspaceTrusted: true },
  }), `${name} retry after isolated route failure`)
  assert.equal(retry.roleErrors.length, 0, 'the same conversation must accept a retry after one Bot fails')
  assert.equal(retry.assistants.length, 1)
  assert.equal(retry.assistants[0].speakerId, healthyProfile.id)
  assert.match(retry.assistants[0].text, new RegExp(recoveryMarker))
  assert.equal(failureService.isRunning(conversationId), false)

  const state = await appState.getConversationState(conversationId)
  const persistedUsers = state.messages.filter(message => message.roleMode && message.author === 'user')
  const persistedAssistants = state.messages.filter(message => message.roleMode && message.speakerId)
  assert.equal(persistedUsers.length, 2, 'both the failed round and retry prompt must persist once')
  assert.equal(persistedAssistants.length, 2, 'only the healthy Bot replies must persist')
  assert.ok(persistedAssistants.every(message => message.speakerId === healthyProfile.id))

  const healthySessionId = chat.getSessionId(roleSessionKey(healthyProfile, conversationId))
  assert.ok(healthySessionId, 'the healthy Bot must keep its independent Host session')
  const healthyHistory = await nativeHistory(api, healthySessionId)
  const completedTurns = healthyHistory.filter(event => event.type === 'turn/end')
  assert.equal(completedTurns.length, 2)
  assert.ok(completedTurns.every(event => event.data?.reason?.kind === 'completed'))

  const row = {
    name,
    status: 'passed',
    elapsedMs: Date.now() - since,
    unavailableRouteIsolated: true,
    healthyReplyRetained: true,
    retrySucceeded: true,
    healthyHostTurns: completedTurns.length,
  }
  report.scenarios.push(row)
  console.log(JSON.stringify({ scenario: name, ...row }))
  activeConversationIds.delete(conversationId)
  return row
}

async function runConcurrentConversationsScenario() {
  const name = 'independent-conversations-run-concurrently'
  const selectedRoles = roles.slice(0, 2)
  const firstConversationId = `role-smoke-${name}-1-${randomUUID()}`
  const markers = selectedRoles.map((_, index) => `CHAT_${index + 1}_${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`)
  activeConversationIds.add(firstConversationId)

  activeStage = `${name}:create-first-conversation`
  await appState.createBackgroundConversation({
    conversationId: firstConversationId,
    workspacePath: root,
    permissionMode: 'readonly',
    title: `Bot ${name} 1`,
  })

  const since = Date.now()
  activeStage = `${name}:start-first-provider-turn`
  const firstSessionKey = roleSessionKey(selectedRoles[0], firstConversationId)
  const firstRequest = roleChatIpc.send({
    webContents: connection(firstConversationId),
    conversationId: firstConversationId,
    text: `只读检查以下文件，概括各自职责，指出两条实际调用边界，结尾单独写 ${markers[0]}。不要修改：backend/role-chat-service.mjs、backend/dsh-chat-service.mjs、backend/dsh-chat/chat-send.mjs、backend/ipc/register-chat-send-ipc.mjs、src/features/app/hooks/useConversationRun.ts、src/features/chat/MainConversation.tsx。`,
    roleIds: [selectedRoles[0].id],
    discussionStrategy: 'independent',
    summarize: false,
    runtimeContext: { workspacePath: root, permissionMode: 'readonly', workspaceTrusted: true },
  })
  firstRequest.catch(() => {})

  await waitFor(() => chat.isBusy(firstSessionKey)
    && events.some(event => event.expectedId === firstConversationId && event.type === 'tool' && event.status === 'running'),
  `${name} first conversation enters a real Host tool call`)

  activeStage = `${name}:open-new-conversation-during-run`
  const secondState = await appState.createThread({
    workspacePath: root,
    permissionMode: 'readonly',
    title: `Bot ${name} 2`,
  })
  const secondConversationId = secondState.conversationId
  assert.ok(secondConversationId && secondConversationId !== firstConversationId, 'opening a new conversation must create a separate ID')
  activeConversationIds.add(secondConversationId)
  assert.equal((await appState.getState()).conversationId, secondConversationId,
    'the newly opened conversation must become the active conversation while the first keeps running')
  assert.equal(roleChat.isRunning(firstConversationId), true, 'opening a new conversation must not finish the first task')
  assert.equal(chat.isBusy(firstSessionKey), true, 'the first Host task must still be running after the conversation switch')

  activeStage = `${name}:reject-same-conversation-duplicate`
  const duplicate = await roleChatIpc.invoke({
    webContents: connection(firstConversationId),
    conversationId: firstConversationId,
    text: '这个重复任务应该在 IPC 锁处被拒绝，不应启动第二个 Host 回合。',
    roleIds: [selectedRoles[0].id],
    discussionStrategy: 'independent',
    summarize: false,
  })
  assert.equal(duplicate.ok, false, 'a same-conversation duplicate must be rejected by the IPC turn lock')
  assert.match(duplicate.error, /上一条任务仍在处理中/)

  activeStage = `${name}:send-task-in-new-conversation`
  const secondRequest = roleChatIpc.send({
    webContents: connection(secondConversationId),
    conversationId: secondConversationId,
    text: `仅回复下面这个标记，不调用工具、不解释：${markers[1]}`,
    roleIds: [selectedRoles[1].id],
    discussionStrategy: 'independent',
    summarize: false,
    runtimeContext: { workspacePath: root, permissionMode: 'readonly', workspaceTrusted: true },
  })
  secondRequest.catch(() => {})
  const conversationIds = [firstConversationId, secondConversationId]
  const requests = [firstRequest, secondRequest]

  let results
  try {
    results = await bounded(Promise.all(requests), `${name} concurrent Bot conversations`)
  } catch (error) {
    for (const conversationId of conversationIds) {
      if (roleChat.isRunning(conversationId)) roleChat.abort(conversationId)
    }
    await Promise.all(conversationIds.map(conversationId => roleChat.waitForAbort(conversationId)))
    await Promise.all(requests.map(request => request.catch(() => {})))
    throw error
  }

  activeStage = `${name}:provider-result-count`
  assert.equal(results.length, 2)
  for (const [index, profile] of selectedRoles.entries()) {
    activeStage = `${name}:role-${index + 1}-provider-result`
    assert.equal(results[index].roleErrors.length, 0, `${profile.name} must finish its independent conversation`)
    assert.equal(results[index].assistants.length, 1)
    activeStage = `${name}:role-${index + 1}-reply-marker`
    assert.match(results[index].assistants[0].text, new RegExp(markers[index]), `${profile.name} must answer its own conversation marker`)
    assert.equal(roleChat.isRunning(conversationIds[index]), false, 'each conversation must release its own run lock')

    activeStage = `${name}:read-role-${index + 1}-transcript`
    const state = await appState.getConversationState(conversationIds[index])
    activeStage = `${name}:role-${index + 1}-transcript-isolation`
    assert.ok(state.messages.some(message => message.author === 'user' && message.text.includes(markers[index])),
      'the user message must persist in its originating conversation')
    assert.ok(!state.messages.some(message => message.author === 'user' && message.text.includes(markers[1 - index])),
      'one conversation must not receive the other conversation message')
    const assistants = state.messages.filter(message => message.roleMode && message.speakerId)
    assert.equal(assistants.length, 1)
    assert.equal(assistants[0].speakerId, profile.id)
    assert.match(assistants[0].text, new RegExp(markers[index]))
  }

  const progressByConversation = conversationIds.map(conversationId => events.filter(event => (
    event.expectedId === conversationId && event.type === 'role_progress'
  )))
  const startedAt = progressByConversation.map(progress => progress.find(event => event.status === 'started')?.time)
  const completedAt = progressByConversation.map(progress => progress.find(event => event.status === 'completed')?.time)
  assert.ok(startedAt.every(Boolean) && completedAt.every(Boolean), 'both conversations must emit start and completion events')
  const overlapMs = Math.min(...completedAt) - Math.max(...startedAt)
  assert.ok(overlapMs > 0, 'real provider turns for separate conversations must overlap')

  activeStage = `${name}:isolated-host-sessions`
  const sessionIds = []
  for (const [index, profile] of selectedRoles.entries()) {
    const sessionId = chat.getSessionId(roleSessionKey(profile, conversationIds[index]))
    assert.ok(sessionId, `${profile.name} must retain a Host session for its conversation`)
    assert.ok(!sessionIds.includes(sessionId), 'separate conversations must not share a Host session')
    sessionIds.push(sessionId)
    const history = await nativeHistory(api, sessionId)
    const turnEnds = history.filter(event => event.type === 'turn/end')
    assert.equal(turnEnds.length, 1)
    assert.equal(turnEnds[0].data?.reason?.kind, 'completed')
  }

  const row = {
    name,
    status: 'passed',
    elapsedMs: Date.now() - since,
    conversations: conversationIds.length,
    roles: selectedRoles.map(({ name: roleName, modelKey }) => ({ roleName, modelKey })),
    overlapMs,
    isolatedTranscripts: true,
    separateHostSessions: true,
  }
  report.scenarios.push(row)
  console.log(JSON.stringify({ scenario: name, ...row }))
  for (const conversationId of conversationIds) activeConversationIds.delete(conversationId)
  return row
}

async function runCancelIsolationScenario() {
  const name = 'stop-one-conversation-keeps-other-running'
  const selectedRoles = roles.slice(0, 2)
  const conversationIds = selectedRoles.map((_, index) => `role-smoke-${name}-${index + 1}-${randomUUID()}`)
  const markers = selectedRoles.map((_, index) => `CANCEL_${index + 1}_${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`)
  const sessionKeys = selectedRoles.map((profile, index) => roleSessionKey(profile, conversationIds[index]))
  for (const conversationId of conversationIds) activeConversationIds.add(conversationId)

  activeStage = `${name}:create-isolated-conversations`
  for (const [index, conversationId] of conversationIds.entries()) {
    await appState.createBackgroundConversation({
      conversationId,
      workspacePath: root,
      permissionMode: 'readonly',
      title: `Bot ${name} ${index + 1}`,
    })
  }

  const prompts = [
    `只读检查并概括以下文件的执行职责，不要修改文件。完成后单独写 ${markers[0]}：backend/role-chat-service.mjs、backend/dsh-chat-service.mjs、backend/dsh-chat/chat-send.mjs、backend/permission-service.mjs、backend/sandbox-policy.mjs。`,
    `只读检查 TaskWeaver 的多会话并发、Bot 任务状态与 UI 回显链路。逐一读取这些文件，再给出有依据的完整数据流、至少 4 个风险点和验证建议，末尾单独写 ${markers[1]}。不要修改文件：backend/role-chat-service.mjs、backend/dsh-chat-service.mjs、backend/dsh-chat/chat-send.mjs、backend/dsh-chat/session-registry.mjs、backend/ipc/register-chat-send-ipc.mjs、backend/ipc/register-chat-ipc.mjs、src/features/app/hooks/useConversationRun.ts、src/features/app/hooks/useThreadActions.ts、src/features/chat/MainConversation.tsx、src/features/composer/Composer.tsx、src/features/dsh-runtime/dshTranscriptMessages.ts、src/features/chat/conversation-run-lifecycle.ts。`,
  ]

  const since = Date.now()
  activeStage = `${name}:parallel-provider-turns`
  const requests = selectedRoles.map((profile, index) => roleChatIpc.send({
    webContents: connection(conversationIds[index]),
    conversationId: conversationIds[index],
    text: prompts[index],
    roleIds: [profile.id],
    discussionStrategy: 'independent',
    summarize: false,
    runtimeContext: { workspacePath: root, permissionMode: 'readonly', workspaceTrusted: true },
  }))
  for (const request of requests) request.catch(() => {})

  try {
    const bothHostSessionsActive = () => conversationIds.every((conversationId, index) => (
      roleChat.isRunning(conversationId)
      && chat.isBusy(sessionKeys[index])
      && events.some(event => event.expectedId === conversationId && event.type === 'role_progress' && event.status === 'started')
    ))
    const sessionObservation = waitFor(bothHostSessionsActive, `${name} both Bots inside real Host sessions`)
      .then(() => ({ kind: 'sessions-active' }), error => ({ kind: 'observation-timeout', error }))
    const firstSettlement = Promise.race(requests.map((request, index) => request.then(
      result => ({ kind: 'role-settled', index, result }),
      error => ({ kind: 'ipc-rejected', index, error }),
    )))
    const observation = await Promise.race([sessionObservation, firstSettlement])
    if (observation.kind === 'observation-timeout') throw observation.error
    if (observation.kind !== 'sessions-active' && !bothHostSessionsActive()) {
      const roleFailures = selectedRoles.map((profile, index) => {
        const roleProgress = events.filter(event => event.expectedId === conversationIds[index] && event.type === 'role_progress')
        const settledResult = observation.index === index ? observation.result : null
        const roleErrors = Array.isArray(settledResult?.roleErrors) ? settledResult.roleErrors : []
        return {
          roleName: profile.name,
          lifecycleStatuses: roleProgress.map(event => event.status),
          ...(observation.index === index && observation.kind === 'ipc-rejected'
            ? { ...classifyLifecycleSmokeError(observation.error) }
            : {}),
          ...(roleErrors.length ? { errorCategories: roleErrors.map(({ message }) => classifyLifecycleSmokeError(message).errorCategory) } : {}),
        }
      })
      throw Object.assign(new Error('A real Bot conversation ended before both Host tool calls became active'), {
        smokeDetails: { stage: `${name}:provider-finished-before-concurrent-sessions`, roleFailures },
      })
    }
    assert.ok(conversationIds.every((conversationId, index) => roleChat.isRunning(conversationId)))

    activeStage = `${name}:cancel-first-conversation`
    const cancellation = await roleChatIpc.cancel(conversationIds[0])
    assert.equal(cancellation.stopped, true, 'the production chat:cancel IPC must stop the first Bot conversation')
    const cancelledResult = await bounded(requests[0], `${name} first conversation cancellation`)
    assert.ok(cancelledResult.roleErrors.length > 0, 'the cancelled conversation must not report successful completion')
    assert.equal(roleChat.isRunning(conversationIds[0]), false, 'the cancelled conversation must release its run lock')
    assert.equal(roleChat.isRunning(conversationIds[1]), true, 'cancelling one conversation must leave the other running')
    assert.equal(chat.isBusy(sessionKeys[1]), true, 'the second Host session must remain active after cancelling the first')

    activeStage = `${name}:complete-second-conversation`
    const completedResult = await bounded(requests[1], `${name} unaffected conversation completion`)
    if (completedResult.roleErrors.length > 0) {
      throw Object.assign(new Error('The unaffected Bot conversation returned a role error after targeted cancellation.'), {
        smokeDetails: {
          stage: `${name}:complete-second-conversation`,
          roleFailures: completedResult.roleErrors.map(({ roleId, roleName, message }) => ({
            roleId,
            roleName,
            ...classifyLifecycleSmokeError(message),
          })),
        },
      })
    }
    assert.equal(completedResult.assistants.length, 1)
    assert.match(completedResult.assistants[0].text, new RegExp(markers[1]))

    const firstState = await appState.getConversationState(conversationIds[0])
    const secondState = await appState.getConversationState(conversationIds[1])
    assert.ok(firstState.messages.some(message => message.author === 'user' && message.text.includes(markers[0])))
    assert.ok(!firstState.messages.some(message => message.author === 'user' && message.text.includes(markers[1])))
    assert.ok(secondState.messages.some(message => message.author === 'user' && message.text.includes(markers[1])))
    assert.ok(!secondState.messages.some(message => message.author === 'user' && message.text.includes(markers[0])))
    const firstProgress = events.filter(event => event.expectedId === conversationIds[0] && event.type === 'role_progress')
    const secondProgress = events.filter(event => event.expectedId === conversationIds[1] && event.type === 'role_progress')
    assert.ok(firstProgress.some(event => event.status === 'cancelled'), 'the first Bot must emit cancellation for its own conversation')
    assert.ok(secondProgress.some(event => event.status === 'completed'), 'the second Bot must emit completion for its own conversation')

    activeStage = `${name}:native-host-history`
    const firstSessionId = chat.getSessionId(sessionKeys[0])
    const secondSessionId = chat.getSessionId(sessionKeys[1])
    assert.ok(firstSessionId && secondSessionId && firstSessionId !== secondSessionId)
    const firstHistory = await nativeHistory(api, firstSessionId)
    const secondHistory = await nativeHistory(api, secondSessionId)
    assert.ok(firstHistory.some(event => event.type === 'turn/end' && event.data?.reason?.kind !== 'completed'),
      'the cancelled Host turn must end without a completed status')
    assert.ok(secondHistory.some(event => event.type === 'turn/end' && event.data?.reason?.kind === 'completed'),
      'the unaffected Host turn must complete normally')

    const row = {
      name,
      status: 'passed',
      elapsedMs: Date.now() - since,
      cancelledConversation: selectedRoles[0].name,
      completedConversation: selectedRoles[1].name,
      cancelledOnlyTargetSession: true,
      unaffectedHostTurnCompleted: true,
      isolatedTranscripts: true,
    }
    report.scenarios.push(row)
    console.log(JSON.stringify({ scenario: name, ...row }))
    for (const conversationId of conversationIds) activeConversationIds.delete(conversationId)
    return row
  } catch (error) {
    for (const conversationId of conversationIds) {
      if (roleChat.isRunning(conversationId)) roleChat.abort(conversationId)
    }
    await Promise.all(conversationIds.map(conversationId => roleChat.waitForAbort(conversationId)))
    const allSettled = Promise.all(requests.map(request => request.catch(() => {})))
    const didSettle = await Promise.race([
      allSettled.then(() => true),
      sleep(15_000).then(() => false),
    ])
    if (!didSettle) {
      error.smokeDetails = {
        ...(error.smokeDetails ?? {}),
        stage: activeStage,
        cleanupTimedOut: true,
      }
    }
    throw error
  }
}

async function runSteerScenario() {
  const name = 'steer-active-bot'
  activeStage = `${name}:create-isolated-conversation`
  const conversationId = `role-smoke-${name}-${randomUUID()}`
  const profile = roles[0]
  const sessionKey = roleSessionKey(profile, conversationId)
  activeConversationIds.add(conversationId)
  await appState.createBackgroundConversation({
    conversationId,
    workspacePath: root,
    permissionMode: 'readonly',
    title: `Bot ${name} smoke`,
  })

  const since = Date.now()
  activeStage = `${name}:provider-turn`
  const request = roleChatIpc.send({
    webContents: connection(conversationId),
    conversationId,
    text: '请只读逐一读取以下文件，完成一份调用链说明：backend/role-chat-service.mjs、backend/dsh-chat-service.mjs、backend/dsh-chat/chat-send.mjs、backend/ipc/register-chat-send-ipc.mjs、src/features/app/hooks/useConversationRun.ts、src/features/composer/Composer.tsx。每个文件至少说明一个调用责任和一个边界；按数据流串起来，末尾写 STEER_BASE_DONE。只读，不运行命令，不修改内容。',
    roleIds: [profile.id],
    discussionStrategy: 'relay',
    summarize: false,
    runtimeContext: { workspacePath: root, permissionMode: 'readonly', workspaceTrusted: true },
  })
  request.catch(() => {})

  try {
    await waitFor(() => chat.isBusy(sessionKey)
      && events.some(event => event.expectedId === conversationId
        && event.type === 'tool' && event.status === 'running'), 'active Bot file read before correction')
    const steer = await roleChat.steer({
      conversationId,
      text: '纠偏：不要继续扩展扫描，基于已经读取的内容直接总结；最终回答末尾请单独一行原样写 STEER_APPLIED_OK。',
      webContents: connection(conversationId),
    })
    assert.equal(steer.accepted, true, 'a correction must be accepted by the active Bot turn')
    assert.equal(steer.targets, 1, 'the correction must target the currently running Bot Host session')
    activeStage = `${name}:provider-completion`
    const result = await bounded(request, `${name} role round`)
    assert.equal(result.roleErrors.length, 0, 'the corrected Bot turn must complete without role errors')
    const state = await appState.getConversationState(conversationId)
    const assistant = state.messages.find(message => message.roleMode && message.speakerId === profile.id)
    assert.ok(assistant?.text?.includes('STEER_APPLIED_OK'), 'the live Bot response must reflect the correction')
    assert.ok(state.messages.some(message => message.author === 'user'
      && message.roleMode && message.behavior === 'steer'
      && message.text.includes('STEER_APPLIED_OK')), 'the correction must persist in the shared transcript')
    assert.equal(roleChat.isRunning(conversationId), false, 'the corrected role run must release its lock')

    activeStage = `${name}:native-host-history`
    const sessionId = chat.getSessionId(sessionKey)
    assert.ok(sessionId, 'the running Bot must retain its independent Host session')
    const history = await nativeHistory(api, sessionId)
    const turnEnds = history.filter(event => event.type === 'turn/end')
    assert.equal(turnEnds.length, 1, 'steering must affect the live turn instead of starting a second turn')
    assert.equal(turnEnds[0].data?.reason?.kind, 'completed')
    const toolCalls = history.filter(event => event.type === 'tool/call')
    assert.ok(toolCalls.length > 0, 'the initial task must really execute read tools')

    const row = {
      name,
      strategy: 'relay',
      status: 'passed',
      elapsedMs: Date.now() - since,
      correctionAccepted: true,
      correctionTargets: steer.targets,
      correctedReply: true,
      completedHostTurns: turnEnds.length,
      toolCalls: toolCalls.length,
      persistedCorrection: true,
    }
    report.scenarios.push(row)
    console.log(JSON.stringify({ scenario: name, ...row }))
    activeConversationIds.delete(conversationId)
    return row
  } catch (error) {
    if (roleChat.isRunning(conversationId)) {
      roleChat.abort(conversationId)
      await roleChat.waitForAbort(conversationId)
      await request.catch(() => {})
    }
    throw error
  }
}

const roleProfileStore = createRoleProfileStore(userDataPath)
const profileStore = createProfileStore(userDataPath)
const appState = createAppStateStore(reportDir, root)
const usageStore = createUsageStore(reportDir)
let roles = []
let api

try {
  await fs.mkdir(path.join(reportDir, 'dsh'), { recursive: true, mode: 0o700 })
  for (const file of ['settings.yaml', '.credentials.yaml']) {
    const target = path.join(reportDir, 'dsh', file)
    try {
      await fs.copyFile(path.join(runtimeHome, file), target)
      await fs.chmod(target, 0o600)
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
  }

  roles = (await roleProfileStore.list()).slice(0, 2)
  assert.equal(roles.length, 2, 'two configured Bot profiles are required for the multi-Bot smoke')
  assert.notEqual(roles[0].modelKey, roles[1].modelKey, 'the smoke must exercise both configured provider routes')
  const addedModels = await profileStore.listAddedModelKeys()
  for (const role of roles) {
    assert.ok(addedModels.includes(role.modelKey), `${role.name} model is not currently added to TaskWeaver`)
  }
  if (roles.some(role => role.modelKey.startsWith('bridge-'))) {
    assert.ok(opencodexPackageRoot, 'Bridge smoke tests require the same OpenCodex package root as app startup')
    const openCodexHome = path.join(userDataPath, 'opencodex')
    await fs.access(openCodexHome)
    // Keep threads and DSH settings disposable, but point the provider bridge
    // at the account's real OAuth store so rotated credentials are persisted.
    await fs.symlink(openCodexHome, path.join(reportDir, 'opencodex'), 'dir')
  }

  manager = createZHostManager({
    runtimeRoot,
    opencodexPackageRoot,
    userDataPath: reportDir,
    home: reportDir,
    environment: {
      ...process.env,
      TASKWEAVER_BACKEND_ROOT: backendRoot,
      TASKWEAVER_HOME: path.join(reportDir, 'dsh'),
      ...(resourcesPath ? { TASKWEAVER_RESOURCES_PATH: resourcesPath } : {}),
    },
  })
  ;({ api } = await manager.start())
  modelService = createModelService({
    profileStore,
    dshHostManager: manager,
    userDataPath: reportDir,
    dshRuntimeRoot: runtimeRoot,
    priceRegistryPath: path.join(root, 'pricing/registry.json'),
  })
  chat = createDshChatService({
    hostManager: manager,
    userDataPath: reportDir,
    modelService,
    profileStore,
    getWorkspacePath: () => root,
    getPermissionMode: () => 'readonly',
  })
  permissions = createPermissionService({
    dialog: { showMessageBox: async () => ({ response: 1 }) },
    getParentWindow: () => null,
    getWorkspacePath: () => root,
    getWorkspaceTrusted: () => true,
    getAutoReviewReads: () => true,
    appState,
  })
  persistNativeTurn = createChatTurnPersistence({ appState, usageStore })
  roleChat = createRoleChatService({
    roleProfileStore,
    profileStore,
    resolveModelKeyForChat,
    chat,
    appState,
    permissions,
    persistNativeTurn,
  })
  roleChatIpc = createRoleChatIpcInvoker(roleChat)

  console.log(JSON.stringify({
    status: 'starting',
    modelKeys: roles.map(({ id, name, modelKey }) => ({ id, name, modelKey })),
    permissionMode: process.argv.includes('--write-permission-only') ? 'full' : 'readonly',
  }))
  heartbeat = setInterval(() => {
    console.log(JSON.stringify({
      status: 'running',
      elapsedMs: Date.now() - startedAt,
      completedScenarios: report.scenarios.length,
      activeConversations: [...activeConversationIds],
    }))
  }, 20_000)

  const steerOnly = process.argv.includes('--steer-only')
  const followUpOnly = process.argv.includes('--follow-up-only')
  const writePermissionOnly = process.argv.includes('--write-permission-only')
  const concurrentConversationsOnly = process.argv.includes('--concurrent-conversations-only')
  const cancelIsolationOnly = process.argv.includes('--cancel-isolation-only')
  const summaryOnly = process.argv.includes('--summary-only')
  const workHistoryOnly = process.argv.includes('--work-history-only')
  const providerFailureOnly = process.argv.includes('--provider-failure-only')
  const toolRecoveryOnly = process.argv.includes('--tool-recovery-only')
  const relayOnly = process.argv.includes('--relay-only')
  const verificationCalibrationOnly = process.argv.includes('--verification-calibration-only')
  const runCoreScenarios = !steerOnly && !followUpOnly && !writePermissionOnly && !concurrentConversationsOnly
    && !cancelIsolationOnly && !summaryOnly && !workHistoryOnly && !providerFailureOnly && !toolRecoveryOnly
    && !verificationCalibrationOnly
  if (relayOnly || runCoreScenarios) {
    if (!relayOnly) {
      await runScenario({
        name: 'independent-parallel-review',
        strategy: 'independent',
        text: '请只读审查当前仓库的多 Bot 群聊调用链。请读取 backend/role-chat-service.mjs、backend/dsh-chat-service.mjs、src/features/composer/Composer.tsx、src/features/chat/MainConversation.tsx 和 src/App.tsx，说明消息从界面进入 Bot 服务、再到各自 Host 会话并回到消息列表的过程。给出 3 个有文件与函数依据的风险点，每条标清代码事实或你的推断。只读文件，不执行命令，不修改内容。',
        verify: async ({ progress, since }) => {
          const starts = roles.map(profile => progress.find(event => event.roleId === profile.id && event.status === 'started')?.time)
          const ends = roles.map(profile => progress.find(event => event.roleId === profile.id && event.status === 'completed')?.time)
          assert.ok(starts.every(Boolean) && ends.every(Boolean), 'both independent Bots must emit start and completion events')
          const overlapMs = Math.min(...ends) - Math.max(...starts)
          assert.ok(overlapMs > 0, 'independent Bot Host runs must overlap in time')
          assert.ok(Date.now() - since > 1_000, 'independent review must execute as a real provider task')
          return { overlapMs, concurrent: true }
        },
      })
    }

    await runScenario({
      name: 'relay-forwards-prior-reply',
      strategy: 'relay',
      text: '请只输出两行，不要调用工具。第一行写 TOKEN: 后接 8 位大写字母或数字组成的新随机码。第二行写 PRIOR: 后接前序 Bot 本轮回答里的 TOKEN 值；如果本轮没有前序回答则写 PRIOR:NONE。不要使用用户消息里的任何码。',
      verify: async ({ assistants, progress }) => {
        const byRole = new Map(assistants.map(message => [message.speakerId, message.text]))
        const first = byRole.get(roles[0].id) ?? ''
        const second = byRole.get(roles[1].id) ?? ''
        const token = first.match(/TOKEN\s*:\s*([A-Z0-9]{8})/i)?.[1]?.toUpperCase()
        const firstCompleted = progress.findIndex(event => event.roleId === roles[0].id && event.status === 'completed')
        const secondStarted = progress.findIndex(event => event.roleId === roles[1].id && event.status === 'started')
        const relayDiagnostics = {
          firstTokenPresent: Boolean(token),
          firstHasNoPrior: /PRIOR\s*:\s*NONE/i.test(first),
          secondQuotesFirstToken: Boolean(token && new RegExp(`PRIOR\\s*:\\s*${token}(?:\\b|$)`, 'i').test(second)),
          nextBotStartedAfterCompletion: firstCompleted >= 0 && secondStarted > firstCompleted,
          firstReplyChars: first.length,
          secondReplyChars: second.length,
        }
        if (!relayDiagnostics.firstTokenPresent
          || !relayDiagnostics.firstHasNoPrior
          || !relayDiagnostics.secondQuotesFirstToken
          || !relayDiagnostics.nextBotStartedAfterCompletion) {
          throw Object.assign(new Error('Relay provider output did not satisfy the token-forwarding checks.'), {
            smokeDetails: { stage: 'relay-forwards-prior-reply:strategy-verification', relayDiagnostics },
          })
        }
        return { ...relayDiagnostics, priorReplyForwarded: true, sequential: true }
      },
    })

  }

  if (followUpOnly) await runCompletedTurnFollowUpScenario()
  else if (!relayOnly && !steerOnly && !writePermissionOnly && !concurrentConversationsOnly && !cancelIsolationOnly && !summaryOnly && !workHistoryOnly && !providerFailureOnly && !toolRecoveryOnly && !verificationCalibrationOnly) await runCompletedTurnFollowUpScenario()
  if (!relayOnly && !followUpOnly && !writePermissionOnly && !concurrentConversationsOnly && !cancelIsolationOnly && !summaryOnly && !workHistoryOnly && !providerFailureOnly && !toolRecoveryOnly && !verificationCalibrationOnly) await runSteerScenario()
  if (writePermissionOnly) await runWritePermissionScenario()
  if (concurrentConversationsOnly) await runConcurrentConversationsScenario()
  if (cancelIsolationOnly) await runCancelIsolationScenario()
  if (summaryOnly) await runSummaryScenario()
  if (workHistoryOnly) await runWorkHistoryScenario()
  if (providerFailureOnly) await runProviderFailureIsolationScenario()
  if (toolRecoveryOnly) {
    for (const profile of roles) {
      await runScenario({
        name: `tool-error-recovers-${profile.name}`,
        strategy: 'independent',
        selectedRoles: [profile],
        text: [
          '请按顺序只调用两次 read 工具，不要调用其他工具、不要运行命令、不要修改文件。',
          '第 1 次：read 的 file_path 精确使用 `__taskweaver_smoke_missing__/definitely-not-found.md`；收到文件不存在错误后继续，不要重试这个路径。',
          '第 2 次：read 的 file_path 使用 `backend/role-chat-service.mjs`。',
          '两次工具调用完成后，简短说明第一次读取失败、第二次成功，并在最后单独写 TOOL_RECOVERY_OK。',
        ].join('\n'),
        verify: async ({ assistants, progress, conversationId, scenarioEvents }) => {
          const sessionId = chat.getSessionId(roleSessionKey(profile, conversationId))
          assert.ok(sessionId, `${profile.name} must retain its Host session after tool recovery`)
          const history = await nativeHistory(api, sessionId)
          const calls = history.filter(event => event.type === 'tool/call')
          const results = history.filter(event => event.type === 'tool/result')
          const callPath = event => {
            try { return JSON.parse(event.data?.arguments || '{}').file_path } catch { return undefined }
          }
          const resultCallId = event => event.data?.message?.source?.callId
            ?? event.data?.message?.content?.find(block => block?.type === 'tool-result')?.toolCallId
          const erroredCallIds = new Set(results.filter(event => event.data?.error
            || event.data?.message?.isError
            || event.data?.message?.content?.some(block => block?.isError))
            .map(resultCallId).filter(Boolean))
          const missingIndex = calls.findIndex(event => callPath(event) === '__taskweaver_smoke_missing__/definitely-not-found.md')
          const recoveryIndex = calls.findIndex(event => callPath(event) === 'backend/role-chat-service.mjs')
          assert.ok(missingIndex >= 0, 'the provider must attempt the deterministic missing-file read')
          assert.ok(erroredCallIds.has(calls[missingIndex].data?.callId), 'the missing-file tool call must return an error')
          assert.ok(recoveryIndex > missingIndex, 'the provider must continue to the valid read after the failed tool call')
          assert.ok(!erroredCallIds.has(calls[recoveryIndex].data?.callId), 'the recovery file read must succeed')
          assert.match(assistants[0].text, /TOOL_RECOVERY_OK/)
          assert.ok(progress.some(event => event.roleId === profile.id && event.status === 'completed'))
          assert.ok(!progress.some(event => event.roleId === profile.id && event.status === 'failed'))
          const failedReadStreamIndex = scenarioEvents.findIndex(event => event.type === 'tool'
            && event.toolName === 'read' && event.status === 'error')
          const recoveredReadStreamIndex = scenarioEvents.findIndex(event => event.type === 'tool'
            && event.toolName === 'read' && event.status === 'done')
          assert.ok(failedReadStreamIndex >= 0, 'the renderer stream must receive the failed read status')
          assert.ok(recoveredReadStreamIndex > failedReadStreamIndex,
            'the renderer stream must receive the successful recovery after the error')
          return {
            failedReadObserved: true,
            recoveryReadObserved: true,
            toolOrder: calls.map(callPath).filter(Boolean),
            rendererSawErrorThenRecovery: true,
            completedAfterToolError: true,
          }
        },
      })
    }
  }
  if (verificationCalibrationOnly) await runVerificationCalibrationScenario()

  report.status = 'passed'
  report.elapsedMs = Date.now() - startedAt
  console.log(JSON.stringify({
    status: report.status,
    elapsedMs: report.elapsedMs,
    scenarios: report.scenarios.map(({ name, status, elapsedMs, concurrent, sequential, priorReplyForwarded, overlapMs, persistedAssistantCount, hostTurnCount }) => ({
      name, status, elapsedMs, ...(concurrent ? { concurrent, overlapMs } : {}),
      ...(sequential ? { sequential, priorReplyForwarded } : {}), persistedAssistantCount, hostTurnCount,
    })),
  }))
} catch (error) {
  const classified = classifyLifecycleSmokeError(error)
  report.status = 'failed'
  report.elapsedMs = Date.now() - startedAt
  report.failure = {
    ...classified,
    stage: error?.smokeDetails?.stage ?? activeStage,
    assertion: error?.name === 'AssertionError',
    ...(error?.smokeDetails?.cleanupTimedOut ? { cleanupTimedOut: true } : {}),
    ...(error?.smokeDetails?.roleFailures ? { roleFailures: error.smokeDetails.roleFailures } : {}),
    ...(error?.smokeDetails?.relayDiagnostics ? { relayDiagnostics: error.smokeDetails.relayDiagnostics } : {}),
    ...(error?.smokeDetails?.calibrationDiagnostics ? { calibrationDiagnostics: error.smokeDetails.calibrationDiagnostics } : {}),
  }
  process.exitCode = 1
  console.error(JSON.stringify({ status: report.status, elapsedMs: report.elapsedMs, failure: report.failure }))
} finally {
  clearInterval(heartbeat)
  try {
    for (const conversationId of activeConversationIds) {
      if (roleChat?.isRunning(conversationId)) roleChat.abort(conversationId)
      await roleChat?.waitForAbort(conversationId).catch(() => {})
    }
    try {
      if (chat) await chat.stop()
      else await manager?.stop()
    } finally {
      try {
        await modelService?.dispose()
      } finally {
        await fs.rm(reportDir, { recursive: true, force: true })
      }
    }
  } catch (cleanupError) {
    process.exitCode = 1
    console.error(JSON.stringify({ cleanup: 'failed', ...classifyLifecycleSmokeError(cleanupError) }))
  }
}
