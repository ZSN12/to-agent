import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createDshChatService } from '../electron/backend/dsh-chat-service.mjs'
import { applySkillInstructions } from '../electron/backend/skill-prompt.mjs'

const modelService = {
  async getDshModelConfig(modelKey) {
    return { provider: 'test', id: modelKey.split('/')[1], apiKey: 'secret-for-test-only', name: 'Test', contextWindow: 16_000, maxTokens: 2_000, active: true }
  },
  async listProvidersAuth() {
    return [{ id: 'test', configured: true }]
  },
}
const profileStore = { async getThinkingLevel() { return null } }
const webContents = { send() {}, isDestroyed() { return false } }

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * 等待某个条件成立再继续。
 *
 * 这里不能用固定 `setTimeout`：`dsh-chat-service` 在会话创建与权限切换时都会
 * `persistSessions()` 真写盘，磁盘抖动会让 10ms 的固定等待偶发不足，
 * 于是断言随机落在「还没轮到」的瞬间（表现为 assert 失败或顶层 await 永久挂起）。
 */
async function waitFor(predicate, { label = 'condition', timeout = 5000, interval = 5 } = {}) {
  const deadline = Date.now() + timeout
  for (;;) {
    if (predicate()) return
    if (Date.now() > deadline) throw new Error(`等待超时（${timeout}ms）：${label}`)
    await sleep(interval)
  }
}

function pushAssistantText(runtime, sessionId, text = 'ok') {
  runtime.push({ payload: { type: 'session/event', sessionId, event: {
    type: 'assistant/chunk', data: { chunk: { type: 'text-delta', text } },
  } } })
}

assert.equal(
  applySkillInstructions('用户任务', { name: 'dingtalk-chat', nativeInvocation: '/dingtalk-chat', source: 'dsh' }),
  '/dingtalk-chat\n用户任务',
)

function createMockRuntime({
  permissionCommandSupported = true,
  permissionProjectionMismatch = false,
  promptFailure = null,
  modelsOmitReasoningOnRead = false,
  initialModelSelection = null,
  existingSessionPresets = {},
  lockedPresetSessions = [],
} = {}) {
  const waiters = []
  const frames = []
  const created = []
  const selected = []
  const prompts = []
  const nativeCommands = []
  const permissionCommands = []
  const approvalResponses = []
  const presetSelections = []
  const sessionModels = new Map()
  const sessionPermissions = new Map()
  const sessionPresets = new Map(Object.entries(existingSessionPresets))
  const lockedPresets = new Set(lockedPresetSessions)
  let cancelCount = 0

  function push(frame) {
    const waiter = waiters.shift()
    if (waiter) waiter({ value: frame, done: false })
    else frames.push(frame)
  }

  const api = {
    events: {
      async *mux(_payload, signal, onOpen) {
        onOpen?.()
        while (!signal.aborted) {
          if (frames.length) {
            yield frames.shift()
            continue
          }
          let resolveFrame
          const frame = new Promise((resolve) => {
            resolveFrame = resolve
            waiters.push(resolve)
          })
          let onAbort
          const aborted = new Promise((resolve) => {
            onAbort = () => resolve({ done: true })
            signal.addEventListener('abort', onAbort, { once: true })
          })
          const next = await Promise.race([
            frame,
            aborted,
          ])
          signal.removeEventListener('abort', onAbort)
          if (signal.aborted) {
            const staleWaiter = waiters.indexOf(resolveFrame)
            if (staleWaiter >= 0) waiters.splice(staleWaiter, 1)
            return
          }
          if (!next.done) yield next.value
        }
      },
    },
    sessions: {
      async create({ sessionId, cwd, agentPreset }) {
        created.push({ sessionId, cwd, agentPreset })
        const existingPreset = sessionPresets.get(sessionId)
        if (existingPreset && agentPreset && existingPreset !== agentPreset) {
          return { result: { ok: false, error: {
            code: 'agent-preset-conflict',
            message: `session "${sessionId}" already uses "${existingPreset}"`,
          } } }
        }
        if (!existingPreset && agentPreset) sessionPresets.set(sessionId, agentPreset)
        if (initialModelSelection && !sessionModels.has(sessionId)) {
          sessionModels.set(sessionId, { ...initialModelSelection })
        }
        return { result: { ok: true, value: { sessionId, agentPreset: sessionPresets.get(sessionId) ?? agentPreset } } }
      },
      async selectModel(input) {
        selected.push(input)
        const selectedRoute = {
          provider: input.provider,
          model: input.model,
          ...(input.reasoningEffort ? { reasoningEffort: input.reasoningEffort } : {}),
        }
        sessionModels.set(input.sessionId, selectedRoute)
        return { result: { ok: true, value: { selected: selectedRoute } } }
      },
      async models({ sessionId }) {
        const current = sessionModels.get(sessionId) ?? null
        const exposed = current && modelsOmitReasoningOnRead
          ? { provider: current.provider, model: current.model }
          : current
        return {
          result: {
            ok: true,
            value: {
              current: exposed,
              routable: true,
              groups: [],
              failures: [],
            },
          },
        }
      },
      async prompt(input) {
        if (input.content?.length === 1 && input.content[0]?.type === 'text' && input.content[0].text.startsWith('/permission ')) {
          permissionCommands.push(input)
          if (!permissionCommandSupported) return { result: { ok: true, value: { accepted: true } } }
          sessionPermissions.set(input.sessionId, input.content[0].text.slice('/permission '.length))
          return { result: { ok: true, value: { accepted: true, command: { kind: 'success', text: input.content[0].text } } } }
        }
        if (input.commandOnly === true) {
          nativeCommands.push(input)
          return { result: { ok: true, value: {
            accepted: true,
            command: { kind: 'success', text: `Host handled ${input.content[0].text}` },
          } } }
        }
        prompts.push(input)
        if (promptFailure) throw promptFailure(input)
        return { result: { ok: true, value: { accepted: true } } }
      },
      async history({ sessionId }) {
        return { result: { ok: true, value: { events: [], projections: { values: { permissions: { currentValue: permissionProjectionMismatch ? 'read-only' : sessionPermissions.get(sessionId) } } } } } }
      },
      async cancel({ sessionId }) {
        cancelCount += 1
        push({ payload: { type: 'session/event', sessionId, event: { type: 'turn/end', data: { reason: { kind: 'aborted' } } } } })
        return { result: { ok: true, value: { cancelled: true } } }
      },
      async updateQueue() { return { result: { ok: true, value: { accepted: true } } } },
    },
    agentPresets: {
      async select({ sessionId, agentPreset }) {
        presetSelections.push({ sessionId, agentPreset })
        if (lockedPresets.has(sessionId)) {
          return { result: { ok: false, error: {
            code: 'agent-preset-locked',
            message: `session "${sessionId}" has already started; its agent preset is fixed`,
          } } }
        }
        sessionPresets.set(sessionId, agentPreset)
        return { result: { ok: true, value: { agentPreset } } }
      },
    },
    llm: {
      async providers() {
        return { result: { ok: true, value: { providers: [{ provider: 'test', active: true, settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'test'] }] } } }
      },
    },
    credentials: { async set() { return { result: { ok: true, value: {} } } } },
    settings: { async mutate() { return { result: { ok: true, value: {} } } } },
    async respond(message) {
      approvalResponses.push(message)
      return { accepted: true }
    },
  }

  const hostManager = {
    async start() { return { api, baseUrl: 'http://127.0.0.1:34567' } },
    async stop() {},
  }

  return {
    hostManager,
    push,
    prompts,
    nativeCommands,
    permissionCommands,
    created,
    selected,
    presetSelections,
    approvalResponses,
    getCancelCount: () => cancelCount,
  }
}

// A global reasoning preference is ignored only when the selected model
// explicitly declares reasoning unsupported. This mirrors real provider
// catalogs where a non-reasoning Gemini route rejects `medium` outright.
const noReasoningHome = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-no-reasoning-model-'))
const noReasoningRuntime = createMockRuntime()
const noReasoningService = createDshChatService({
  hostManager: noReasoningRuntime.hostManager,
  userDataPath: noReasoningHome,
  getWorkspacePath: () => noReasoningHome,
  profileStore: { async getThinkingLevel() { return 'medium' } },
  modelService: {
    async getDshModelConfig() {
      return { provider: 'test', id: 'plain', reasoning: false, name: 'Plain Test', contextWindow: 16_000, maxTokens: 2_000 }
    },
    async listProvidersAuth() { return [{ id: 'test', configured: true }] },
  },
})
try {
  const noReasoningTurn = noReasoningService.send({
    text: 'reply briefly', modelKey: 'test/plain', conversationId: 'no-reasoning', webContents,
  })
  await waitFor(() => noReasoningService.isBusy('no-reasoning'), { label: 'non-reasoning model turn is registered' })
  const selection = noReasoningRuntime.selected.find((row) => row.model === 'plain')
  assert.ok(selection, 'model route should be selected')
  assert.equal('reasoningEffort' in selection, false, 'global medium reasoning preference must not be sent to a model that rejects reasoning')
  pushAssistantText(noReasoningRuntime, 'tw-no-reasoning')
  noReasoningRuntime.push({ payload: {
    type: 'session/event', sessionId: 'tw-no-reasoning',
    event: { type: 'turn/end', data: { reason: { kind: 'completed' } } },
  } })
  await noReasoningTurn
} finally {
  await noReasoningService.stop()
  await fs.rm(noReasoningHome, { recursive: true, force: true })
}

const limitedReasoningHome = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-limited-reasoning-model-'))
const limitedReasoningRuntime = createMockRuntime()
const limitedReasoningService = createDshChatService({
  hostManager: limitedReasoningRuntime.hostManager,
  userDataPath: limitedReasoningHome,
  getWorkspacePath: () => limitedReasoningHome,
  profileStore: { async getThinkingLevel() { return 'medium' } },
  modelService: {
    async getDshModelConfig() {
      return {
        provider: 'test', id: 'limited', reasoning: true,
        supportedThinkingLevels: ['off', 'low', 'high'], defaultThinkingLevel: 'low',
      }
    },
    async listProvidersAuth() { return [{ id: 'test', configured: true }] },
  },
})
try {
  const limitedTurn = limitedReasoningService.send({
    text: 'reply briefly', modelKey: 'test/limited', conversationId: 'limited-reasoning', webContents,
  })
  await waitFor(() => limitedReasoningService.isBusy('limited-reasoning'), { label: 'limited-reasoning model turn is registered' })
  const selection = limitedReasoningRuntime.selected.find((row) => row.model === 'limited')
  assert.equal(selection?.reasoningEffort, 'low', 'unsupported global medium effort should fall back to the model-declared low default')
  pushAssistantText(limitedReasoningRuntime, 'tw-limited-reasoning')
  limitedReasoningRuntime.push({ payload: {
    type: 'session/event', sessionId: 'tw-limited-reasoning',
    event: { type: 'turn/end', data: { reason: { kind: 'completed' } } },
  } })
  await limitedTurn
} finally {
  await limitedReasoningService.stop()
  await fs.rm(limitedReasoningHome, { recursive: true, force: true })
}

const home = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-dsh-chat-'))
const runtime = createMockRuntime()
const outputs = []
const promptByteMetrics = []
let currentPermissionMode = 'ask'
const scopedWebContents = { send(_channel, event) { outputs.push(event) }, isDestroyed() { return false } }

// A mounted DSH projection is not proof that its snapshot stream is ready:
// session.open() or mux gap repair can delay projection updates. The direct
// chat stream must still deliver text/reasoning while that projection exists.
const projectedHome = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-projected-stream-'))
const projectedRuntime = createMockRuntime()
const projectedEvents = []
const projectedWebContents = { send(_channel, event) { projectedEvents.push(event) }, isDestroyed() { return false } }
const projectedService = createDshChatService({
  hostManager: projectedRuntime.hostManager,
  userDataPath: projectedHome,
  getWorkspacePath: () => projectedHome,
  profileStore,
  modelService,
  conversationHub: {
    hasLiveProjection: () => true,
    bindApi() {},
    handleMuxEnvelope() {},
  },
})
try {
  const projectedTurn = projectedService.send({
    text: 'stream even when projection is attached',
    modelKey: 'test/model-projection',
    conversationId: 'projection-stream',
    webContents: projectedWebContents,
  })
  await waitFor(() => projectedService.isBusy('projection-stream'), { label: 'projection stream turn started' })
  const projectedSessionId = projectedRuntime.created.find((item) => item.sessionId.endsWith('projection-stream')).sessionId
  projectedRuntime.push({ payload: { type: 'session/event', sessionId: projectedSessionId, event: {
    type: 'assistant/chunk', data: { turn: 1, step: 1, chunk: { type: 'reasoning-delta', text: 'reasoning first' } },
  } } })
  projectedRuntime.push({ payload: { type: 'session/event', sessionId: projectedSessionId, event: {
    type: 'assistant/chunk', data: { turn: 1, step: 1, chunk: { type: 'text-delta', text: 'visible answer now' } },
  } } })
  await waitFor(() => projectedEvents.some((event) => event.type === 'delta'), { label: 'direct delta despite live projection' })
  assert.ok(projectedEvents.some((event) => event.type === 'thinking_delta' && event.delta === 'reasoning first'))
  assert.ok(projectedEvents.some((event) => event.type === 'delta' && event.delta === 'visible answer now'))
  const projectedThinkingEndIndex = projectedEvents.findIndex((event) => event.type === 'thinking_end')
  const projectedTextIndex = projectedEvents.findIndex((event) => event.type === 'delta')
  assert.ok(projectedThinkingEndIndex >= 0, 'the reasoning segment should have an explicit end event')
  assert.ok(projectedThinkingEndIndex < projectedTextIndex,
  'the visible Think segment must settle before answer text begins')
  projectedRuntime.push({ payload: { type: 'session/event', sessionId: projectedSessionId, event: {
    type: 'assistant/message',
    data: { turn: 1, step: 1, message: { role: 'assistant', content: [{ type: 'text', text: 'visible answer now' }] } },
  } } })
  assert.equal(projectedEvents.some((event) => event.type === 'done'), false,
    'visible text must arrive before the terminal done event')
  projectedRuntime.push({ payload: { type: 'session/event', sessionId: projectedSessionId, event: {
    type: 'turn/end', data: { reason: { kind: 'completed' } },
  } } })
  await projectedTurn
  assert.equal(projectedEvents.filter((event) => event.type === 'delta').length, 1,
    'assistant/message must not duplicate text already emitted as chunks')

  const toolBoundaryEvents = []
  const toolBoundaryWebContents = { send(_channel, event) { toolBoundaryEvents.push(event) }, isDestroyed() { return false } }
  const toolBoundaryTurn = projectedService.send({
    text: 'reasoning followed by a tool and then visible text',
    modelKey: 'test/model-tool-boundary',
    conversationId: 'projection-tool-boundary',
    webContents: toolBoundaryWebContents,
  })
  await waitFor(() => projectedService.isBusy('projection-tool-boundary'), { label: 'tool-boundary turn started' })
  const toolBoundarySessionId = projectedRuntime.created.find((item) => item.sessionId.endsWith('projection-tool-boundary')).sessionId
  projectedRuntime.push({ payload: { type: 'session/event', sessionId: toolBoundarySessionId, event: {
    type: 'assistant/chunk', data: { turn: 1, step: 1, chunk: { type: 'reasoning-delta', text: 'checking before the tool' } },
  } } })
  projectedRuntime.push({ payload: { type: 'session/event', sessionId: toolBoundarySessionId, event: {
    type: 'tool/call', data: { turn: 1, step: 1, callId: 'boundary-read', name: 'read', arguments: '{"file_path":"package.json"}' },
  } } })
  await waitFor(() => toolBoundaryEvents.some((event) => event.type === 'tool' && event.id === 'boundary-read' && event.status === 'running'),
    { label: 'tool-boundary read started' })
  const toolThinkingEndIndex = toolBoundaryEvents.findIndex((event) => event.type === 'thinking_end')
  const toolStartIndex = toolBoundaryEvents.findIndex((event) => event.type === 'tool' && event.id === 'boundary-read' && event.status === 'running')
  assert.ok(toolThinkingEndIndex >= 0, 'the tool boundary should close an active Think segment')
  assert.ok(toolThinkingEndIndex < toolStartIndex,
  'Think must stop before a tool starts, not remain presented as active through tool execution')
  projectedRuntime.push({ payload: { type: 'session/event', sessionId: toolBoundarySessionId, event: {
    type: 'tool/result', data: { message: {
      role: 'tool', source: { callId: 'boundary-read' }, content: [{ type: 'text', text: 'package metadata read' }],
    } },
  } } })
  await waitFor(() => toolBoundaryEvents.some((event) => event.type === 'tool' && event.id === 'boundary-read' && event.status === 'done'),
    { label: 'tool-boundary read completed' })
  projectedRuntime.push({ payload: { type: 'session/event', sessionId: toolBoundarySessionId, event: {
    type: 'assistant/chunk', data: { turn: 1, step: 2, chunk: { type: 'text-delta', text: 'I read the file.' } },
  } } })
  await waitFor(() => toolBoundaryEvents.some((event) => event.type === 'delta' && event.delta === 'I read the file.'),
    { label: 'assistant text appears after tool result' })
  assert.equal(toolBoundaryEvents.some((event) => event.type === 'done'), false,
    'the post-tool assistant text must still reach the UI before terminal completion')
  projectedRuntime.push({ payload: { type: 'session/event', sessionId: toolBoundarySessionId, event: {
    type: 'turn/end', data: { reason: { kind: 'completed' } },
  } } })
  await toolBoundaryTurn

  const messageOnlyEvents = []
  const messageOnlyWebContents = { send(_channel, event) { messageOnlyEvents.push(event) }, isDestroyed() { return false } }
  const messageOnlyTurn = projectedService.send({
    text: 'adapter without token chunks',
    modelKey: 'test/model-message-only',
    conversationId: 'projection-message-only',
    webContents: messageOnlyWebContents,
  })
  await waitFor(() => projectedService.isBusy('projection-message-only'), { label: 'message-only turn started' })
  const messageOnlySessionId = projectedRuntime.created.find((item) => item.sessionId.endsWith('projection-message-only')).sessionId
  projectedRuntime.push({ payload: { type: 'session/event', sessionId: messageOnlySessionId, event: {
    type: 'assistant/chunk', data: { turn: 1, step: 1, chunk: { type: 'reasoning-delta', text: 'reasoning before assembled answer' } },
  } } })
  projectedRuntime.push({ payload: { type: 'session/event', sessionId: messageOnlySessionId, event: {
    type: 'assistant/message', sourceEventSeqs: [],
    data: { turn: 1, step: 1, message: { role: 'assistant', content: [{ type: 'text', text: 'answer without chunks' }] } },
  } } })
  await waitFor(() => messageOnlyEvents.some((event) => event.type === 'delta' && event.full === 'answer without chunks'),
    { label: 'assembled assistant message streams before turn end' })
  assert.equal(messageOnlyEvents.some((event) => event.type === 'done'), false,
    'message-only adapters must publish visible text before terminal completion')
  projectedRuntime.push({ payload: { type: 'session/event', sessionId: messageOnlySessionId, event: {
    type: 'turn/end', data: { reason: { kind: 'completed' } },
  } } })
  const messageOnlyResult = await messageOnlyTurn
  assert.equal(messageOnlyResult.text, 'answer without chunks')

  const correctedEvents = []
  const correctedWebContents = { send(_channel, event) { correctedEvents.push(event) }, isDestroyed() { return false } }
  const correctedTurn = projectedService.send({
    text: 'reconcile streamed prefix',
    modelKey: 'test/model-corrected-message',
    conversationId: 'projection-corrected-message',
    webContents: correctedWebContents,
  })
  await waitFor(() => projectedService.isBusy('projection-corrected-message'), { label: 'corrected-message turn started' })
  const correctedSessionId = projectedRuntime.created.find((item) => item.sessionId.endsWith('projection-corrected-message')).sessionId
  projectedRuntime.push({ payload: { type: 'session/event', sessionId: correctedSessionId, event: {
    type: 'assistant/chunk', data: { turn: 1, step: 1, chunk: { type: 'text-delta', text: 'partial ' } },
  } } })
  await waitFor(() => correctedEvents.some((event) => event.type === 'delta'), { label: 'partial text delta emitted' })
  projectedRuntime.push({ payload: { type: 'session/event', sessionId: correctedSessionId, event: {
    type: 'assistant/message',
    data: { turn: 1, step: 1, message: { role: 'assistant', content: [{ type: 'text', text: 'partial answer' }] } },
  } } })
  await waitFor(() => correctedEvents.some((event) => event.type === 'delta' && event.full === 'partial answer'),
    { label: 'assembled message reconciles streamed prefix' })
  projectedRuntime.push({ payload: { type: 'session/event', sessionId: correctedSessionId, event: {
    type: 'turn/end', data: { reason: { kind: 'completed' } },
  } } })
  const correctedResult = await correctedTurn
  assert.equal(correctedResult.text, 'partial answer')
} finally {
  await projectedService.stop()
  await fs.rm(projectedHome, { recursive: true, force: true })
}

const service = createDshChatService({
  hostManager: runtime.hostManager,
  userDataPath: home,
  getWorkspacePath: () => home,
  profileStore,
  modelService,
  getPermissionMode: () => currentPermissionMode,
  logger: { debug(message, data) {
    if (message === '[prompt-pipeline] Host user-message payload bytes') promptByteMetrics.push(data)
  } },
})

try {
  const skillInput = '读取中文文件'
  const a = service.send({
    text: skillInput,
    modelKey: 'test/model-a',
    conversationId: 'conversation-A',
    skill: { name: 'review', baseDir: home, instructions: '必须检查边界条件并报告风险。' },
    webContents: scopedWebContents,
  })
  const b = service.send({ text: 'conversation B', modelKey: 'test/model-b', conversationId: 'conversation-B', agentPreset: 'code', webContents: scopedWebContents })
  const sendErrors = []
  a.catch((error) => sendErrors.push(error))
  b.catch((error) => sendErrors.push(error))
  // 必须等到两轮都注册进 running 之后再投喂 turn/end：
  // 事件是按会话 id 派发的，早于 running.set 到达的 turn/end 会被直接丢弃，
  // 之后既不会再有结束事件，顶层 await 就会永久挂起。
  await waitFor(() => service.isBusy('conversation-A') && service.isBusy('conversation-B'), { label: '两轮 send 都已注册为运行中' })
  assert.deepEqual(sendErrors, [])
  const skillPrompt = runtime.prompts.find((prompt) => prompt.sessionId === 'tw-conversation-A')?.content?.[0]?.text
  assert.match(skillPrompt, /必须检查边界条件并报告风险/)
  assert.match(skillPrompt, new RegExp(skillInput))
  const skillMetric = promptByteMetrics.find((item) => item.conversationId === 'conversation-A')
  assert.equal(skillMetric.inputUtf8Bytes, Buffer.byteLength(skillInput, 'utf8'))
  assert.equal(skillMetric.submittedUtf8Bytes, Buffer.byteLength(skillPrompt, 'utf8'))
  assert.equal(skillMetric.skillEnvelopeAddedUtf8Bytes,
    Buffer.byteLength(skillPrompt, 'utf8') - Buffer.byteLength(skillInput, 'utf8'))
  assert.equal(skillMetric.skillMode, 'filesystem')
  assert.equal(JSON.stringify(skillMetric).includes(skillInput), false, 'prompt byte telemetry must never contain prompt text')
  const plainMetric = promptByteMetrics.find((item) => item.conversationId === 'conversation-B')
  assert.equal(plainMetric.submittedUtf8Bytes, Buffer.byteLength('conversation B', 'utf8'))
  assert.equal(plainMetric.skillEnvelopeAddedUtf8Bytes, 0)
  assert.equal(service.isBusy('conversation-A'), true)
  assert.equal(service.isBusy('conversation-B'), true)
  assert.notEqual(runtime.created[0].sessionId, runtime.created[1].sessionId)
  assert.equal(runtime.created.find((item) => item.sessionId.endsWith('conversation-A'))?.agentPreset, 'standard')
  assert.equal(runtime.created.find((item) => item.sessionId.endsWith('conversation-B'))?.agentPreset, 'code', 'new sessions must honor the selected preset')
  assert.deepEqual(runtime.selected.map((item) => item.model), ['model-a', 'model-b'])
  assert.equal(runtime.permissionCommands.length, 2)
  assert.ok(runtime.permissionCommands.every((item) => item.content[0].text === '/permission workspace-write'))
  assert.ok(runtime.permissionCommands.every((item) => !runtime.prompts.some((prompt) => prompt === item)))

  const sessionA = runtime.created.find((item) => item.sessionId.endsWith('conversation-A')).sessionId
  const sessionB = runtime.created.find((item) => item.sessionId.endsWith('conversation-B')).sessionId
  runtime.push({ payload: { type: 'session/event', sessionId: sessionB, event: { type: 'assistant/chunk', data: { chunk: { type: 'text-delta', text: 'reply B' } } } } })
  runtime.push({ payload: { type: 'session/event', sessionId: sessionA, event: { type: 'assistant/chunk', data: { chunk: { type: 'text-delta', text: 'reply A' } } } } })
  runtime.push({ payload: { type: 'session/event', sessionId: sessionB, event: { type: 'turn/end', data: { reason: { kind: 'completed' } } } } })
  runtime.push({ payload: { type: 'session/event', sessionId: sessionA, event: { type: 'turn/end', data: { reason: { kind: 'completed' } } } } })
  const [resultA, resultB] = await Promise.all([a, b])
  assert.equal(resultA.text, 'reply A')
  assert.equal(resultB.text, 'reply B')
  assert.equal(service.isBusy('conversation-A'), false)
  assert.equal(service.isBusy('conversation-B'), false)

  const nativeSkillInput = '查找群消息'
  const nativeSkillTurn = service.send({
    text: nativeSkillInput,
    modelKey: 'test/model-a',
    conversationId: 'skill-native',
    skill: { name: 'dingtalk-chat', source: 'dsh', nativeInvocation: '/dingtalk-chat' },
    webContents: scopedWebContents,
  })
  await waitFor(() => service.isBusy('skill-native'), { label: 'DSH-native Skill 会话已注册为运行中' })
  const nativeSkillSession = runtime.created.find((item) => item.sessionId === 'tw-skill-native')
  const nativeSkillPrompt = runtime.prompts.find((prompt) => prompt.sessionId === nativeSkillSession.sessionId)?.content?.[0]?.text
  const expectedNativeSkillPrompt = `/dingtalk-chat\n${nativeSkillInput}`
  assert.equal(nativeSkillPrompt, expectedNativeSkillPrompt)
  const nativeSkillMetric = promptByteMetrics.find((item) => item.conversationId === 'skill-native')
  assert.equal(nativeSkillMetric.submittedUtf8Bytes, Buffer.byteLength(expectedNativeSkillPrompt, 'utf8'))
  assert.equal(nativeSkillMetric.skillMode, 'host-native')
  pushAssistantText(runtime, nativeSkillSession.sessionId)
  runtime.push({ payload: { type: 'session/event', sessionId: nativeSkillSession.sessionId, event: { type: 'turn/end', data: { reason: { kind: 'completed' } } } } })
  await nativeSkillTurn

  const planEnabled = await service.send({
    text: '/plan', modelKey: 'test/model-a', conversationId: 'plan-native', webContents: scopedWebContents,
  })
  const planDisabled = await service.send({
    text: '/plan off', modelKey: 'test/model-a', conversationId: 'plan-native', webContents: scopedWebContents,
  })
  assert.equal(planEnabled.command, true)
  assert.equal(planDisabled.command, true)
  assert.deepEqual(runtime.nativeCommands.map((input) => input.content[0].text), ['/plan', '/plan off'])
  assert.ok(runtime.nativeCommands.every((input) => input.commandOnly === true), 'Plan toggles must use Host command-only dispatch')
  assert.equal(runtime.prompts.some((input) => input.content?.[0]?.text === '/plan' || input.content?.[0]?.text === '/plan off'), false,
    'Plan toggles must not become normal model prompts')

  // 权限模式变更不需要显式通知：下一轮 ensurePermissionModeApplied 会比对
  // entry.lastAppliedPermissionMode 并自动下发 /permission（这才是生产路径）。
  currentPermissionMode = 'full'
  const fullPermissionTurn = service.send({
    text: 'permission change is active',
    modelKey: 'test/model-a',
    conversationId: 'conversation-A',
    webContents: scopedWebContents,
  })
  await waitFor(() => service.isBusy('conversation-A'), { label: 'full 模式会话已注册为运行中' })
  assert.ok(runtime.permissionCommands.some((input) => input.sessionId === sessionA
    && input.content[0].text === '/permission danger-full-access'))
  pushAssistantText(runtime, sessionA)
  runtime.push({ payload: { type: 'session/event', sessionId: sessionA, event: { type: 'turn/end', data: { reason: { kind: 'completed' } } } } })
  await fullPermissionTurn

  const activeWithQueue = service.send({
    text: 'keep running while accepting a queue',
    modelKey: 'test/model-a',
    conversationId: 'conversation-queued',
    webContents: scopedWebContents,
  })
  await waitFor(() => service.isBusy('conversation-queued'), { label: '排队测试会话已启动' })
  const queuedSession = runtime.created.find((item) => item.sessionId.endsWith('conversation-queued')).sessionId
  const steered = await service.send({
    text: 'steer without replacing the active lifecycle',
    modelKey: 'test/model-a',
    conversationId: 'conversation-queued',
    behavior: 'steer',
    webContents: scopedWebContents,
  })
  assert.equal(steered.accepted, true)
  assert.equal(service.isBusy('conversation-queued'), true)
  const queued = await service.send({
    text: 'run this after the active turn',
    modelKey: 'test/model-a',
    conversationId: 'conversation-queued',
    behavior: 'followUp',
    webContents: scopedWebContents,
  })
  assert.equal(queued.queued, true)
  assert.equal(service.isBusy('conversation-queued'), true)
  for (const [text, delivery] of [
    ['keep running while accepting a queue', 'new-turn'],
    ['steer without replacing the active lifecycle', 'steer'],
    ['run this after the active turn', 'queue'],
  ]) {
    const metric = promptByteMetrics.findLast((item) => item.conversationId === 'conversation-queued' && item.delivery === delivery)
    const payload = runtime.prompts.findLast((item) => item.content?.[0]?.text === text)
    assert.equal(metric.submittedUtf8Bytes, Buffer.byteLength(payload.content[0].text, 'utf8'), `${delivery} byte metric must match the exact Host payload`)
  }
  runtime.push({ payload: { type: 'session/event', sessionId: queuedSession, event: { type: 'step/start', time: Date.now(), data: { turn: 1, step: 3 } } } })
  runtime.push({ payload: { type: 'session/event', sessionId: queuedSession, event: {
    type: 'llm/retry',
    data: { turn: 1, step: 3, retry: 1, maxRetries: 2, delayMs: 750, failure: { code: 'TIMEOUT' } },
  } } })
  await waitFor(
    () => outputs.some((event) => event.type === 'retry' && event.phase === 'start' && event.attempt === 1),
    { label: '模型请求超时重试状态已发送到会话 UI' },
  )
  assert.equal(outputs.some((event) => event.type === 'activity' && /模型第\s*\d+\s*步/.test(event.message ?? '')), false,
    'internal model-step counters should not be sent as visible chat activity')
  const retryNotice = outputs.findLast((event) => event.type === 'retry' && event.phase === 'start')
  assert.equal(retryNotice.maxAttempts, 2)
  assert.equal(retryNotice.delayMs, 750)
  assert.match(retryNotice.message, /模型响应超时/)
  runtime.push({ payload: { type: 'session/event', sessionId: queuedSession, event: {
    type: 'llm/retry-started',
    data: { turn: 1, step: 3, retry: 1 },
  } } })
  await waitFor(
    () => outputs.some((event) => event.type === 'retry' && event.phase === 'end' && event.attempt === 1),
    { label: '模型重试启动后应清除等待提示' },
  )
  runtime.push({ payload: { type: 'session/event', sessionId: queuedSession, event: { type: 'assistant/chunk', data: { chunk: { type: 'text-delta', text: 'active reply' } } } } })
  runtime.push({ payload: { type: 'session/event', sessionId: queuedSession, event: { type: 'turn/end', data: { reason: { kind: 'completed' } } } } })
  const activeResult = await activeWithQueue
  assert.equal(activeResult.text, 'active reply')
  assert.equal(service.isBusy('conversation-queued'), true, 'queued DSH work remains busy after the first turn')
  const firstQueuedDone = outputs.findLast(event => event.type === 'done' && event.conversationId === 'conversation-queued')
  assert.equal(firstQueuedDone.continuing, true, 'a queued run must not be reported as fully finished')
  assert.equal(firstQueuedDone.turnId, activeResult.turnId, 'IPC result and stream must share a stable turn identity')
  runtime.push({ payload: { type: 'session/event', sessionId: queuedSession, event: { type: 'turn/start', time: Date.now(), data: { turn: 2 } } } })
  runtime.push({ payload: { type: 'session/event', sessionId: queuedSession, event: { type: 'assistant/chunk', data: { chunk: { type: 'text-delta', text: 'queued reply' } } } } })
  runtime.push({ payload: { type: 'session/event', sessionId: queuedSession, event: { type: 'turn/end', data: { reason: { kind: 'completed' } } } } })
  await waitFor(() => !service.isBusy('conversation-queued'), { label: '排队轮次全部完成后清理忙碌状态' })
  const finalQueuedDone = outputs.findLast(event => event.type === 'done' && event.conversationId === 'conversation-queued')
  assert.equal(finalQueuedDone.continuing, false)
  assert.notEqual(finalQueuedDone.turnId, firstQueuedDone.turnId, 'queued turns must not overwrite the previous completed answer')
  const queuedStarts = outputs.filter(event => event.type === 'start' && event.conversationId === 'conversation-queued')
  assert.equal(queuedStarts[0].turnId, firstQueuedDone.turnId)
  assert.equal(queuedStarts[1].turnId, finalQueuedDone.turnId)

  const unsupportedHome = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-dsh-permission-unavailable-'))
  const unsupportedRuntime = createMockRuntime({ permissionCommandSupported: false })
  const unsupportedService = createDshChatService({
    hostManager: unsupportedRuntime.hostManager,
    userDataPath: unsupportedHome,
    getWorkspacePath: () => unsupportedHome,
    profileStore,
    modelService,
  })
  try {
    await assert.rejects(
      unsupportedService.send({ text: 'must not run with unknown permissions', modelKey: 'test/model', conversationId: 'no-permission-command', webContents }),
      /未确认应用权限模式/,
    )
    assert.equal(unsupportedRuntime.prompts.length, 0, 'fail-closed permission setup must block user prompts')
  } finally {
    await unsupportedService.stop()
    await fs.rm(unsupportedHome, { recursive: true, force: true })
  }

  const mismatchHome = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-permission-mismatch-'))
  const mismatchRuntime = createMockRuntime({ permissionProjectionMismatch: true })
  const mismatchService = createDshChatService({
    hostManager: mismatchRuntime.hostManager,
    userDataPath: mismatchHome,
    getWorkspacePath: () => mismatchHome,
    profileStore,
    modelService,
  })
  try {
    await assert.rejects(
      mismatchService.send({ text: 'blocked despite command success', modelKey: 'test/model', conversationId: 'mismatch', webContents }),
      /权限投影未确认/,
    )
    assert.equal(mismatchRuntime.prompts.length, 0, 'command success without matching Host projection must block execution')
  } finally {
    await mismatchService.stop()
    await fs.rm(mismatchHome, { recursive: true, force: true })
  }

  const running = service.send({ text: 'wait-for-cancel', modelKey: 'test/model-c', conversationId: 'conversation-C', webContents: scopedWebContents })
  await waitFor(() => service.isBusy('conversation-C'), { label: 'conversation-C 已进入运行态' })
  assert.equal(await service.abort('conversation-C'), true)
  const cancelled = await running
  assert.equal(cancelled.cancelled, true)
  assert.equal(runtime.getCancelCount(), 1)
  assert.ok(
    outputs.some((event) => event.type === 'done'
      && event.conversationId === 'conversation-C'
      && event.interrupted === true),
    'cancelled DSH turns must be distinguishable from successful completion in the stream',
  )

  const taskTurnOutputStart = outputs.length
  const taskTurn = service.runAgentTurn({
    conversationId: 'conversation-parent',
    sessionKey: 'dag-session-1',
    text: 'run task',
    modelKey: 'test/model-task',
    webContents: scopedWebContents,
    cwd: home,
    agentPreset: 'code',
    taskId: 'T1',
  })
  await waitFor(() => service.isBusy('dag-session-1'), { label: 'DAG 任务会话已注册为运行中' })
  const taskSession = runtime.created.find((item) => item.sessionId === 'tw-dag-session-1')
  assert.equal(taskSession.agentPreset, 'code')
  runtime.push({ payload: { type: 'session/event', sessionId: taskSession.sessionId, event: { type: 'tool/call', time: Date.now(), data: { callId: 'task-call-1', name: 'read', arguments: '{"path":"README.md"}' } } } })
  runtime.push({ payload: { type: 'session/event', sessionId: taskSession.sessionId, event: { type: 'tool/result', data: { message: {
    source: { callId: 'task-call-1' },
    content: [{ type: 'tool-result', toolCallId: 'task-call-1', content: [{ type: 'text', text: 'file body' }] }],
  } } } } })
  runtime.push({ payload: { type: 'session/event', sessionId: taskSession.sessionId, event: { type: 'tool/call', data: {
    callId: 'task-call-edit', name: 'edit', arguments: '{"file_path":"README.md","old_string":"old line","new_string":"new line"}',
  } } } })
  runtime.push({ payload: { type: 'session/event', sessionId: taskSession.sessionId, event: { type: 'tool/result', data: {
    message: {
      source: { callId: 'task-call-edit' },
      content: [{ type: 'tool-result', toolCallId: 'task-call-edit', content: [{ type: 'text', text: 'file updated' }] }],
    },
    meta: { diffs: [{ path: 'README.md', oldText: 'keep\nold line\nend', newText: 'keep\nnew line\nend' }] },
  } } } })
  runtime.push({ payload: { type: 'session/event', sessionId: taskSession.sessionId, event: { type: 'tool/call', data: { callId: 'task-call-error', name: 'glob', arguments: '{"pattern":"*"}' } } } })
  runtime.push({ payload: { type: 'session/event', sessionId: taskSession.sessionId, event: { type: 'tool/result', data: { message: {
    content: [{ type: 'tool-result', toolCallId: 'task-call-error', isError: true, content: [{ type: 'text', text: 'SEARCH_RAW_OUTPUT_OVERFLOW token=hidden-fixture-secret' }] }],
  } } } } })
  runtime.push({ payload: { type: 'session/event', sessionId: taskSession.sessionId, event: { type: 'assistant/chunk', data: { chunk: { type: 'text-delta', text: 'task reply' } } } } })
  runtime.push({ payload: { type: 'session/event', sessionId: taskSession.sessionId, event: { type: 'turn/end', data: { reason: { kind: 'completed' } } } } })
  const taskResult = await taskTurn
  assert.equal(taskResult.text, 'task reply')
  assert.equal(outputs.slice(taskTurnOutputStart).some((event) => event.type === 'planner_phase'), false,
    'ordinary silent subagent turns must not emit planner-only phase events')
  assert.equal(outputs.find((event) => event.type === 'tool' && event.id === 'task-call-1' && event.status === 'done')?.resultSummary, '执行完成 · 1 个结果块，约 9 字符')
  const editTrace = outputs.find((event) => event.type === 'tool' && event.id === 'task-call-edit' && event.status === 'done')
  assert.deepEqual({ path: editTrace?.fileDiff?.path, added: editTrace?.fileDiff?.addedLines, deleted: editTrace?.fileDiff?.deletedLines }, {
    path: 'README.md', added: 1, deleted: 1,
  }, 'Host tool/result.meta diff metadata must reach the renderer trace')
  assert.deepEqual(taskResult.fileChanges, [{ path: 'README.md', addedLines: 1, deletedLines: 1 }],
    'file changes must be aggregated into the turn result for durable history')
  const toolFailure = outputs.find((event) => event.type === 'tool' && event.id === 'task-call-error' && event.status === 'error')
  assert.match(toolFailure?.resultSummary, /SEARCH_RAW_OUTPUT_OVERFLOW/)
  assert.equal(toolFailure.resultSummary.includes('hidden-fixture-secret'), false)

  const plannerProgressTurn = service.runAgentTurn({
    conversationId: 'conversation-parent',
    sessionKey: 'dag-planner-progress',
    text: 'plan a small DAG',
    modelKey: 'test/model-planner',
    webContents: scopedWebContents,
    cwd: home,
    agentPreset: 'taskweaver-planner',
    progressOnly: true,
  })
  await waitFor(() => service.isBusy('dag-planner-progress'), { label: 'Planner progress-only turn is registered' })
  const plannerProgressSession = runtime.created.find((item) => item.sessionId === 'tw-dag-planner-progress')
  runtime.push({ payload: { type: 'session/event', sessionId: plannerProgressSession.sessionId, event: {
    type: 'assistant/chunk', data: { chunk: { type: 'reasoning-delta', text: 'PRIVATE_PLANNER_REASONING' } },
  } } })
  runtime.push({ payload: { type: 'session/event', sessionId: plannerProgressSession.sessionId, event: {
    type: 'assistant/chunk', data: { chunk: { type: 'text-delta', text: '__UNVALIDATED_PLAN_JSON__' } },
  } } })
  runtime.push({ payload: { type: 'session/event', sessionId: plannerProgressSession.sessionId, event: {
    type: 'turn/end', data: { reason: { kind: 'completed' } },
  } } })
  const plannerProgressResult = await plannerProgressTurn
  assert.equal(plannerProgressResult.text, '__UNVALIDATED_PLAN_JSON__', 'silent planner result must remain available to the orchestrator')
  const plannerPhases = outputs.filter((event) => event.type === 'planner_phase'
    && event.conversationId === 'conversation-parent')
  assert.deepEqual(plannerPhases.map((event) => event.phase), ['reasoning', 'text'],
    'progress-only planner mode should emit coarse phase transitions')
  assert.equal(JSON.stringify(plannerPhases).includes('PRIVATE_PLANNER_REASONING'), false)
  assert.equal(JSON.stringify(plannerPhases).includes('__UNVALIDATED_PLAN_JSON__'), false)
  assert.equal(outputs.some((event) => event.type === 'delta' && event.delta === '__UNVALIDATED_PLAN_JSON__'), false,
    'progress-only planner output must never be projected as a user-visible partial answer')
  assert.equal(outputs.some((event) => event.type === 'thinking_delta' && event.delta === 'PRIVATE_PLANNER_REASONING'), false,
    'private planner reasoning must remain hidden')

  const batchedTaskTurn = service.runAgentTurn({
    conversationId: 'conversation-parent',
    sessionKey: 'dag-session-code-mode',
    text: 'read the project files in a batch',
    modelKey: 'test/model-task',
    webContents: scopedWebContents,
    cwd: home,
    agentPreset: 'taskweaver-readonly',
    taskId: 'T-code',
  })
  await waitFor(() => service.isBusy('dag-session-code-mode'), { label: 'Code Mode 子任务会话已注册为运行中' })
  const codeModeSession = runtime.created.find((item) => item.sessionId === 'tw-dag-session-code-mode')
  runtime.push({ payload: { type: 'session/event', sessionId: codeModeSession.sessionId, event: {
    type: 'tool/call', time: Date.now(), data: {
      turn: 3, step: 4, callId: 'task-call-code', name: 'run_code', arguments: '{"description":"read files"}',
    },
  } } })
  const nestedReadStartedAt = Date.now()
  runtime.push({ payload: { type: 'session/event', sessionId: codeModeSession.sessionId, event: {
    type: 'tool/code-dispatch-start', time: nestedReadStartedAt, data: {
      rootCallId: 'task-call-code', parentCallId: 'task-call-code', subCallId: 'task-call-code:code:1',
      name: 'read', arguments: { file_path: 'README.md' },
    },
  } } })
  runtime.push({ payload: { type: 'session/event', sessionId: codeModeSession.sessionId, event: {
    type: 'tool/code-dispatch', time: nestedReadStartedAt + 15, data: {
      rootCallId: 'task-call-code', parentCallId: 'task-call-code', subCallId: 'task-call-code:code:1',
      name: 'read', arguments: { file_path: 'README.md' }, isError: false,
      content: [{ type: 'text', text: 'README content' }],
    },
  } } })
  runtime.push({ payload: { type: 'session/event', sessionId: codeModeSession.sessionId, event: {
    type: 'tool/code-dispatch-start', time: nestedReadStartedAt + 16, data: {
      rootCallId: 'task-call-code', parentCallId: 'task-call-code', subCallId: 'task-call-code:code:2',
      name: 'write', arguments: { path: 'nested-update.md', content: 'new nested content' },
    },
  } } })
  runtime.push({ payload: { type: 'session/event', sessionId: codeModeSession.sessionId, event: {
    type: 'tool/code-dispatch', time: nestedReadStartedAt + 17, data: {
      rootCallId: 'task-call-code', parentCallId: 'task-call-code', subCallId: 'task-call-code:code:2',
      name: 'write', arguments: { path: 'nested-update.md', content: 'new nested content' }, isError: false,
      content: [{ type: 'text', text: 'Updated file' }],
    },
  } } })
  runtime.push({ payload: { type: 'session/event', sessionId: codeModeSession.sessionId, event: {
    type: 'tool/result', data: { message: {
      source: { callId: 'task-call-code' },
      content: [{ type: 'tool-result', toolCallId: 'task-call-code', content: [{ type: 'text', text: 'batch complete' }] }],
    } },
  } } })
  runtime.push({ payload: { type: 'session/event', sessionId: codeModeSession.sessionId, event: {
    type: 'assistant/chunk', data: { chunk: { type: 'text-delta', text: 'batch read complete' } },
  } } })
  runtime.push({ payload: { type: 'session/event', sessionId: codeModeSession.sessionId, event: {
    type: 'turn/end', data: { reason: { kind: 'completed' } },
  } } })
  const batchedTaskResult = await batchedTaskTurn
  assert.deepEqual(batchedTaskResult.fileChanges, [
    { path: 'nested-update.md' },
  ], 'code-dispatch writes without native diff metadata should be visible with unknown counts')
  const nestedReadStart = outputs.find((event) => event.type === 'tool'
    && event.id === 'task-call-code:code:1' && event.status === 'running')
  const nestedReadResult = outputs.find((event) => event.type === 'tool'
    && event.id === 'task-call-code:code:1' && event.status === 'done')
  assert.equal(nestedReadStart?.toolName, 'read', 'Code Mode subcalls must be visible as native tool events')
  assert.equal(nestedReadStart?.parentCallId, 'task-call-code', 'Code Mode events retain their parent tool call')
  assert.equal(nestedReadStart?.turn, 3, 'nested Code Mode calls inherit their Host turn')
  assert.equal(nestedReadStart?.step, 4, 'nested Code Mode calls inherit their Host step')
  assert.match(nestedReadStart?.inputSummary ?? '', /README\.md/)
  assert.equal(nestedReadResult?.toolName, 'read')
  assert.match(nestedReadResult?.resultSummary ?? '', /14 字符/)

  const failedTaskTurn = service.runAgentTurn({
    conversationId: 'conversation-parent',
    sessionKey: 'dag-session-failed',
    text: 'provider failure must propagate',
    modelKey: 'test/model-task',
    webContents: scopedWebContents,
    cwd: home,
    agentPreset: 'taskweaver-readonly',
    taskId: 'T-failed',
  })
  await waitFor(() => service.isBusy('dag-session-failed'), { label: '失败任务会话已注册为运行中' })
  const failedTaskSession = runtime.created.find((item) => item.sessionId === 'tw-dag-session-failed')
  runtime.push({ payload: { type: 'session/event', sessionId: failedTaskSession.sessionId, event: {
    type: 'turn/end',
    data: { reason: { kind: 'error', error: { code: 'INVALID_REQUEST', message: 'Provider error 404: model not found' } } },
  } } })
  await assert.rejects(failedTaskTurn, /Provider error 404: model not found/)
  assert.equal(service.isBusy('dag-session-failed'), false, 'failed turns must release their running-session entry')

  const promptFailureHome = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-dsh-prompt-rejection-'))
  const rejectedPromptRuntime = createMockRuntime({
    promptFailure: () => Object.assign(new Error('Provider rejected prompt (HTTP 402)'), { code: 'HTTP_402' }),
  })
  const rejectedPromptEvents = []
  const rejectedPromptService = createDshChatService({
    hostManager: rejectedPromptRuntime.hostManager,
    userDataPath: promptFailureHome,
    getWorkspacePath: () => promptFailureHome,
    profileStore,
    modelService,
  })
  try {
    const rejectedPrompt = rejectedPromptService.send({
      text: 'this request is rejected before the Agent can answer',
      modelKey: 'test/model-billing',
      conversationId: 'prompt-rejected',
      webContents: { send(_channel, event) { rejectedPromptEvents.push(event) }, isDestroyed() { return false } },
    })
    await assert.rejects(rejectedPrompt, (error) => error.code === 'HTTP_402')
    assert.equal(rejectedPromptService.isBusy('prompt-rejected'), false, 'an immediate prompt RPC failure must release the busy state')
    const lifecycle = rejectedPromptEvents.filter((event) => ['start', 'error', 'done'].includes(event.type))
    assert.deepEqual(lifecycle.map((event) => event.type), ['start', 'error'],
      'a prompt rejected before any Agent output must close the started lifecycle with an error, never a missing terminal or success')
    assert.equal(lifecycle[1].turnId, lifecycle[0].turnId, 'the terminal failure must refer to the started turn')
    assert.equal(lifecycle[1].message, 'Provider rejected prompt (HTTP 402)')
  } finally {
    await rejectedPromptService.stop()
    await fs.rm(promptFailureHome, { recursive: true, force: true })
  }

  const blockedTurn = service.send({
    text: 'this turn must not be reported as successful',
    modelKey: 'test/model-task',
    conversationId: 'conversation-blocked',
    webContents: scopedWebContents,
  })
  await waitFor(() => service.isBusy('conversation-blocked'), { label: '被工具策略阻止的会话已进入运行态' })
  const blockedSession = runtime.created.find((item) => item.sessionId === 'tw-conversation-blocked')
  runtime.push({ payload: { type: 'session/event', sessionId: blockedSession.sessionId, event: {
    type: 'tool/call', data: { callId: 'blocked-search', name: 'grep', arguments: '{"path":".","pattern":"different query"}' },
  } } })
  await waitFor(() => outputs.some((event) => event.type === 'tool' && event.id === 'blocked-search' && event.status === 'running'), {
    label: '被阻止的搜索调用已记录',
  })
  runtime.push({ payload: { type: 'session/event', sessionId: blockedSession.sessionId, event: {
    type: 'tool/result', data: { message: {
      source: { callId: 'blocked-search' },
      content: [{ type: 'tool-result', toolCallId: 'blocked-search', isError: true, content: [{
        type: 'text', text: 'Repeated filesystem-search cycle detected: scope . is latched.',
      }] }],
    } },
  } } })
  runtime.push({ payload: { type: 'session/event', sessionId: blockedSession.sessionId, event: {
    type: 'turn/end', data: { reason: { kind: 'blocked' } },
  } } })
  await assert.rejects(blockedTurn, (error) => error.code === 'AGENT_BLOCKED' && /重复的文件搜索循环/.test(error.message))
  const blockedNotice = outputs.find((event) => event.type === 'error' && event.conversationId === 'conversation-blocked')
  assert.match(blockedNotice?.message ?? '', /重复的文件搜索循环/)
  assert.equal(outputs.some((event) => event.type === 'done' && event.conversationId === 'conversation-blocked'), false,
    'a policy-blocked turn must not be projected as a successful completion')
  assert.equal(service.isBusy('conversation-blocked'), false, 'blocked turns must release their running-session entry')

  const emptyTurn = service.send({
    text: 'empty responses must be visible failures',
    modelKey: 'test/model-task',
    conversationId: 'conversation-empty',
    webContents: scopedWebContents,
  })
  await waitFor(() => service.isBusy('conversation-empty'), { label: '空响应测试会话已进入运行态' })
  const emptySession = runtime.created.find((item) => item.sessionId === 'tw-conversation-empty')
  runtime.push({ payload: { type: 'session/event', sessionId: emptySession.sessionId, event: {
    type: 'turn/end', data: { reason: { kind: 'completed' } },
  } } })
  await assert.rejects(emptyTurn, (error) => error.code === 'AGENT_EMPTY_RESPONSE' && /没有生成最终文本/.test(error.message))
  assert.equal(outputs.some((event) => event.type === 'done' && event.conversationId === 'conversation-empty'), false,
    'an empty completed turn must not be projected as a successful completion')
  assert.equal(outputs.some((event) => event.type === 'error' && event.conversationId === 'conversation-empty'), true)

  const taskAbortController = new AbortController()
  const taskAbortTurn = service.runAgentTurn({
    conversationId: 'conversation-parent',
    sessionKey: 'dag-abort-session',
    text: 'abort this task',
    modelKey: 'test/model-task',
    webContents: scopedWebContents,
    cwd: home,
    agentPreset: 'code',
    taskId: 'T2',
    signal: taskAbortController.signal,
  })
  await waitFor(() => service.isBusy('dag-abort-session'), { label: '可中止任务会话已注册为运行中' })
  taskAbortController.abort()
  await assert.rejects(taskAbortTurn, /任务已停止/)
  assert.equal(runtime.getCancelCount(), 2)

  const mapping = JSON.parse(await fs.readFile(path.join(home, 'taskweaver', 'dsh-session-map.json'), 'utf8'))
  assert.equal(mapping.sessions['conversation-A'].sessionId, 'tw-conversation-A')

  const repeatTurn = service.send({
    text: 'conversation A again',
    modelKey: 'test/model-a',
    conversationId: 'conversation-A',
    agentPreset: 'code',
    webContents: scopedWebContents,
  })
  await waitFor(() => service.isBusy('conversation-A'), { label: '重复会话已进入运行态' })
  assert.equal(runtime.created.filter((item) => item.sessionId === 'tw-conversation-A').at(-1)?.agentPreset, 'standard',
    'changing the new-session preference must not mutate the preset of an existing Host session')
  const selectCountBeforeRepeat = runtime.selected.length
  pushAssistantText(runtime, sessionA)
  runtime.push({ payload: { type: 'session/event', sessionId: sessionA, event: { type: 'turn/end', data: { reason: { kind: 'completed' } } } } })
  await repeatTurn
  assert.equal(runtime.selected.length, selectCountBeforeRepeat, 'same route should not call selectModel again')

  const reasoningHome = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-dsh-reasoning-'))
  const reasoningRuntime = createMockRuntime({
    modelsOmitReasoningOnRead: true,
    // Reproduce a real default-route shape: same provider/model, no explicit
    // effort. The selected Composer effort still has to be applied once.
    initialModelSelection: { provider: 'test', model: 'reason-model' },
  })
  let reasoningLevel = 'high'
  const reasoningProfile = { async getThinkingLevel() { return reasoningLevel } }
  const reasoningModelService = {
    async getDshModelConfig(modelKey) {
      return {
        provider: 'test',
        id: modelKey.split('/')[1],
        apiKey: 'secret',
        name: 'Test',
        contextWindow: 16_000,
        maxTokens: 2_000,
        active: true,
        reasoning: true,
        supportedThinkingLevels: ['low', 'medium', 'high'],
        defaultThinkingLevel: 'medium',
      }
    },
    async listProvidersAuth() {
      return [{ id: 'test', configured: true }]
    },
  }
  let reasoningService = createDshChatService({
    hostManager: reasoningRuntime.hostManager,
    userDataPath: reasoningHome,
    getWorkspacePath: () => reasoningHome,
    profileStore: reasoningProfile,
    modelService: reasoningModelService,
  })
  try {
    const reasoningConv = 'conversation-reasoning'
    const reasoningSession = `tw-${reasoningConv}`
    const firstReasoning = reasoningService.send({
      text: 'reasoning route first',
      modelKey: 'test/reason-model',
      conversationId: reasoningConv,
      agentPreset: 'standard',
      webContents: scopedWebContents,
    })
    await waitFor(() => reasoningService.isBusy(reasoningConv), { label: 'reasoning 会话首轮运行' })
    assert.equal(reasoningRuntime.selected.length, 1)
    assert.equal(reasoningRuntime.selected[0].reasoningEffort, 'high')
    pushAssistantText(reasoningRuntime, reasoningSession, 'ok')
    reasoningRuntime.push({ payload: { type: 'session/event', sessionId: reasoningSession, event: { type: 'turn/end', data: { reason: { kind: 'completed' } } } } })
    await firstReasoning
    const secondReasoning = reasoningService.send({
      text: 'reasoning route second',
      modelKey: 'test/reason-model',
      conversationId: reasoningConv,
      agentPreset: 'standard',
      webContents: scopedWebContents,
    })
    await waitFor(() => reasoningService.isBusy(reasoningConv), { label: 'reasoning 会话第二轮运行' })
    pushAssistantText(reasoningRuntime, reasoningSession, 'ok2')
    reasoningRuntime.push({ payload: { type: 'session/event', sessionId: reasoningSession, event: { type: 'turn/end', data: { reason: { kind: 'completed' } } } } })
    await secondReasoning
    assert.equal(reasoningRuntime.selected.length, 1,
      'Host 未回读 reasoningEffort 时，同会话第二轮不得重复 selectModel')

    await reasoningService.stop()
    reasoningService = createDshChatService({
      hostManager: reasoningRuntime.hostManager,
      userDataPath: reasoningHome,
      getWorkspacePath: () => reasoningHome,
      profileStore: reasoningProfile,
      modelService: reasoningModelService,
    })
    const afterRestart = reasoningService.send({
      text: 'reasoning route after restart',
      modelKey: 'test/reason-model',
      conversationId: reasoningConv,
      agentPreset: 'standard',
      webContents: scopedWebContents,
    })
    await waitFor(() => reasoningService.isBusy(reasoningConv), { label: 'reasoning 映射恢复后第三轮运行' })
    pushAssistantText(reasoningRuntime, reasoningSession, 'ok3')
    reasoningRuntime.push({ payload: { type: 'session/event', sessionId: reasoningSession, event: { type: 'turn/end', data: { reason: { kind: 'completed' } } } } })
    await afterRestart
    assert.equal(reasoningRuntime.selected.length, 1,
      'Host 不回读档位时，持久化的成功选择应避免应用重启后重复 selectModel')

    reasoningLevel = 'low'
    const changedEffort = reasoningService.send({
      text: 'reasoning route changed to low',
      modelKey: 'test/reason-model',
      conversationId: reasoningConv,
      agentPreset: 'standard',
      webContents: scopedWebContents,
    })
    await waitFor(() => reasoningService.isBusy(reasoningConv), { label: '推理档位变更后的第四轮运行' })
    assert.equal(reasoningRuntime.selected.length, 2, '更改 Composer 推理档位后应重新应用一次')
    assert.equal(reasoningRuntime.selected[1].reasoningEffort, 'low')
    pushAssistantText(reasoningRuntime, reasoningSession, 'ok4')
    reasoningRuntime.push({ payload: { type: 'session/event', sessionId: reasoningSession, event: { type: 'turn/end', data: { reason: { kind: 'completed' } } } } })
    await changedEffort
  } finally {
    await reasoningService.stop()
    await fs.rm(reasoningHome, { recursive: true, force: true })
  }

  await service.stop()

  const blankLegacyHome = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-composer-preset-blank-'))
  const blankLegacySessionId = 'tw-legacy-composer-blank'
  await fs.mkdir(path.join(blankLegacyHome, 'taskweaver'), { recursive: true })
  await fs.writeFile(path.join(blankLegacyHome, 'taskweaver', 'dsh-session-map.json'), JSON.stringify({
    version: 1,
    sessions: {
      'legacy-composer-blank': {
        sessionId: blankLegacySessionId,
        cwd: blankLegacyHome,
        agentPreset: 'code',
      },
    },
  }))
  const blankLegacyRuntime = createMockRuntime({ existingSessionPresets: { [blankLegacySessionId]: 'code' } })
  const blankLegacyService = createDshChatService({
    hostManager: blankLegacyRuntime.hostManager,
    userDataPath: blankLegacyHome,
    getWorkspacePath: () => blankLegacyHome,
    profileStore,
    modelService,
  })
  try {
    const blankLegacyTurn = blankLegacyService.send({
      text: 'quick Composer smoke',
      modelKey: 'opencodex/cursor/composer-2.5',
      conversationId: 'legacy-composer-blank',
      webContents,
    })
    await waitFor(() => blankLegacyService.isBusy('legacy-composer-blank'), { label: '空的旧 Composer 会话已完成安全预设切换' })
    assert.deepEqual(blankLegacyRuntime.presetSelections, [{ sessionId: blankLegacySessionId, agentPreset: 'standard' }])
    assert.equal(blankLegacyRuntime.created.at(-1)?.agentPreset, 'standard')
    pushAssistantText(blankLegacyRuntime, blankLegacySessionId, 'Composer standard ok')
    blankLegacyRuntime.push({ payload: {
      type: 'session/event', sessionId: blankLegacySessionId,
      event: { type: 'turn/end', data: { reason: { kind: 'completed' } } },
    } })
    await blankLegacyTurn
    const migratedMap = JSON.parse(await fs.readFile(path.join(blankLegacyHome, 'taskweaver', 'dsh-session-map.json'), 'utf8'))
    assert.equal(migratedMap.sessions['legacy-composer-blank'].agentPreset, 'standard',
      'blank Host sessions may be migrated and persisted after Host confirms the preset switch')
  } finally {
    await blankLegacyService.stop()
    await fs.rm(blankLegacyHome, { recursive: true, force: true })
  }

  const startedLegacyHome = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-composer-preset-locked-'))
  const startedLegacySessionId = 'tw-legacy-composer-started'
  await fs.mkdir(path.join(startedLegacyHome, 'taskweaver'), { recursive: true })
  await fs.writeFile(path.join(startedLegacyHome, 'taskweaver', 'dsh-session-map.json'), JSON.stringify({
    version: 1,
    sessions: {
      'legacy-composer-started': {
        sessionId: startedLegacySessionId,
        cwd: startedLegacyHome,
        agentPreset: 'code',
      },
    },
  }))
  const startedLegacyRuntime = createMockRuntime({
    existingSessionPresets: { [startedLegacySessionId]: 'code' },
    lockedPresetSessions: [startedLegacySessionId],
  })
  const startedLegacyService = createDshChatService({
    hostManager: startedLegacyRuntime.hostManager,
    userDataPath: startedLegacyHome,
    getWorkspacePath: () => startedLegacyHome,
    profileStore,
    modelService,
  })
  try {
    await assert.rejects(startedLegacyService.send({
      text: 'continue old Composer chat',
      modelKey: 'opencodex/cursor/composer-2.5',
      conversationId: 'legacy-composer-started',
      webContents,
    }), (error) => error.code === 'COMPOSER_PRESET_MIGRATION_REQUIRED'
      && /新建一个对话/.test(error.message)
      && /历史已保留/.test(error.message))
    assert.equal(startedLegacyRuntime.prompts.length, 0, 'a locked legacy Code session must not silently run Composer with incompatible tools')
    assert.deepEqual(startedLegacyRuntime.presetSelections, [{ sessionId: startedLegacySessionId, agentPreset: 'standard' }])
    const preservedMap = JSON.parse(await fs.readFile(path.join(startedLegacyHome, 'taskweaver', 'dsh-session-map.json'), 'utf8'))
    assert.equal(preservedMap.sessions['legacy-composer-started'].agentPreset, 'code',
      'a locked session must remain mapped to its real Host preset')
  } finally {
    await startedLegacyService.stop()
    await fs.rm(startedLegacyHome, { recursive: true, force: true })
  }

  const parallelHome = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-dsh-parallel-abort-'))
  const parallelRuntime = createMockRuntime()
  const parallelService = createDshChatService({
    hostManager: parallelRuntime.hostManager,
    userDataPath: parallelHome,
    getWorkspacePath: () => parallelHome,
    profileStore,
    modelService,
  })
  try {
    const runA = parallelService.send({ text: 'wait-for-cancel', modelKey: 'test/a', conversationId: 'iso-A', webContents })
    const runB = parallelService.send({ text: 'wait-for-cancel', modelKey: 'test/b', conversationId: 'iso-B', webContents })
    await waitFor(() => parallelService.isBusy('iso-A') && parallelService.isBusy('iso-B'), { label: '两个并行会话都已注册为运行中' })
    assert.equal(parallelService.isBusy('iso-A'), true)
    assert.equal(parallelService.isBusy('iso-B'), true)
    assert.equal(await parallelService.abort('iso-A'), true)
    await runA
    assert.equal(parallelService.isBusy('iso-A'), false)
    assert.equal(parallelService.isBusy('iso-B'), true)
    await parallelService.abort('iso-B')
    await runB
  } finally {
    await parallelService.stop()
    await fs.rm(parallelHome, { recursive: true, force: true })
  }

  const approvalHome = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-dsh-approval-'))
  const approvalRuntime = createMockRuntime()
  const approvalOutputs = []
  const userQuestionOutputs = []
  const approvalWebContents = {
    send(channel, payload) {
      if (channel === 'permission:prompt') approvalOutputs.push(payload)
      if (channel === 'user-question:prompt') userQuestionOutputs.push(payload)
    },
    isDestroyed() { return false },
  }
  const approvalService = createDshChatService({
    hostManager: approvalRuntime.hostManager,
    userDataPath: approvalHome,
    getWorkspacePath: () => approvalHome,
    profileStore,
    modelService,
    getPermissionMode: (conversationId) => (conversationId === 'conv-full' ? 'full' : 'ask'),
  })
  try {
    const fullTurn = approvalService.send({
      text: 'needs approval',
      modelKey: 'test/model-full',
      conversationId: 'conv-full',
      webContents: approvalWebContents,
    })
    await waitFor(() => approvalService.isBusy('conv-full'), { label: 'full 模式会话已进入运行态' })
    const sessionId = 'tw-conv-full'
    approvalRuntime.push({
      rpcId: 'rpc-full-1',
      payload: {
        type: 'approval/requested',
        sessionId,
        approvalId: 'appr-1',
        toolName: 'bash',
        reason: 'rm -rf /tmp/x',
      },
    })
    await waitFor(() => approvalOutputs.length === 1, { label: 'full 模式审批请求已上抛到 UI' })
    assert.equal(approvalOutputs.length, 1, 'unexpected DSH approval requests must fail closed in full mode too')
    assert.equal(approvalRuntime.approvalResponses.length, 0, 'approval must wait for an explicit UI decision')
    assert.equal(await approvalService.respondApproval(approvalOutputs[0].id, { action: 'deny' }), true)
    assert.equal(approvalRuntime.approvalResponses[0].rpcId, 'rpc-full-1')
    assert.deepEqual(approvalRuntime.approvalResponses[0].result.value, {
      sessionId,
      approvalId: 'appr-1',
      outcome: 'rejected',
    })
    pushAssistantText(approvalRuntime, sessionId)
    approvalRuntime.push({ payload: { type: 'session/event', sessionId, event: { type: 'turn/end', data: { reason: { kind: 'completed' } } } } })
    await fullTurn

    const askTurn = approvalService.send({
      text: 'ask mode',
      modelKey: 'test/model-ask',
      conversationId: 'conv-ask',
      webContents: approvalWebContents,
    })
    await waitFor(() => approvalService.isBusy('conv-ask'), { label: 'ask 模式会话已进入运行态' })
    const askSessionId = 'tw-conv-ask'
    approvalRuntime.push({
      rpcId: 'rpc-ask-9',
      payload: {
        type: 'approval/requested',
        sessionId: askSessionId,
        approvalId: 'appr-9',
        toolName: 'bash',
        reason: 'npm test',
      },
    })
    await waitFor(() => approvalOutputs.length === 2, { label: 'ask 模式审批请求已上抛到 UI' })
    assert.equal(approvalOutputs.length, 2)
    const promptId = approvalOutputs[1].id
    assert.match(promptId, /dsh-approval-tw-conv-ask-appr-9/)
    // Z Host replays an unanswered server request when a mux is reopened.
    // Its stable approval identity/rpcId must keep one UI prompt and one timer.
    approvalRuntime.push({
      rpcId: 'rpc-ask-9',
      payload: {
        type: 'approval/requested',
        sessionId: askSessionId,
        approvalId: 'appr-9',
        toolName: 'bash',
        reason: 'npm test',
      },
    })
    await sleep(20)
    assert.equal(approvalOutputs.length, 2, 'replayed pending approval must not open duplicate UI prompts')
    const responseCountBeforeInvalidDecision = approvalRuntime.approvalResponses.length
    assert.equal(await approvalService.respondApproval(promptId, { action: 'allow-always' }), false,
      'Host approval bridge must reject unsupported persistent grants')
    assert.equal(approvalRuntime.approvalResponses.length, responseCountBeforeInvalidDecision,
      'invalid decisions must leave the request pending instead of approving it')
    assert.equal(await approvalService.respondApproval(promptId, { action: 'allow-once' }), true)
    assert.equal(approvalRuntime.approvalResponses.at(-1).result.value.outcome, 'allowed-once')
    assert.equal(await approvalService.rejectPendingApprovals(), 0)
    pushAssistantText(approvalRuntime, askSessionId)
    approvalRuntime.push({ payload: { type: 'session/event', sessionId: askSessionId, event: { type: 'turn/end', data: { reason: { kind: 'completed' } } } } })
    await askTurn

    const questionTurn = approvalService.send({
      text: 'ask the user to select an option',
      modelKey: 'test/model-question',
      conversationId: 'conv-question',
      webContents: approvalWebContents,
    })
    await waitFor(() => approvalService.isBusy('conv-question'), { label: 'question session running' })
    const questionSessionId = 'tw-conv-question'
    const questionFrame = {
      rpcId: 'question-rpc-1',
      payload: {
        type: 'question/requested',
        sessionId: questionSessionId,
        questions: [{
          id: 'choice', header: 'Test', question: 'Choose one',
          options: [{ label: 'A' }, { label: 'B' }],
        }],
      },
    }
    approvalRuntime.push(questionFrame)
    await waitFor(() => userQuestionOutputs.length === 1, { label: 'user question forwarded to UI' })
    approvalRuntime.push(questionFrame)
    await sleep(20)
    assert.equal(userQuestionOutputs.length, 1, 'a replayed user question must not duplicate its prompt')
    assert.equal(await approvalService.answerUserQuestion('question-rpc-1', {
      answers: [{ id: 'choice', selected: ['B'] }],
    }), true)
    const questionReply = approvalRuntime.approvalResponses.at(-1)
    assert.equal(questionReply.rpcId, 'question-rpc-1')
    assert.deepEqual(questionReply.result.value, {
      sessionId: questionSessionId,
      answer: { answers: [{ id: 'choice', selected: ['B'] }] },
    })
    assert.equal(await approvalService.answerUserQuestion('question-rpc-1', {
      answers: [{ id: 'choice', selected: ['A'] }],
    }), false, 'a settled question cannot be answered twice')
    pushAssistantText(approvalRuntime, questionSessionId)
    approvalRuntime.push({ payload: { type: 'session/event', sessionId: questionSessionId, event: { type: 'turn/end', data: { reason: { kind: 'completed' } } } } })
    await questionTurn

    const planReviewTurn = approvalService.send({
      text: 'review this plan',
      modelKey: 'test/model-question',
      conversationId: 'conv-question',
      webContents: approvalWebContents,
    })
    await waitFor(() => approvalService.isBusy('conv-question'), { label: 'plan review session running' })
    const planReviewFrame = {
      rpcId: 'question-rpc-plan-review',
      payload: {
        type: 'question/requested',
        sessionId: questionSessionId,
        questions: [{
          id: 'plan-review',
          question: 'Approve this plan and leave plan mode?',
          detail: '# Plan\n\n1. Inspect\n2. Implement',
          options: [{ label: 'Approve' }, { label: 'Keep planning' }],
          intent: { kind: 'plan-review', approve: 'Approve' },
        }],
      },
    }
    approvalRuntime.push(planReviewFrame)
    await waitFor(() => userQuestionOutputs.length === 2, { label: 'plan review forwarded to UI' })
    assert.deepEqual(userQuestionOutputs.at(-1).questions[0].intent, { kind: 'plan-review', approve: 'Approve' },
      'the presentation intent must reach the renderer intact')
    assert.equal(await approvalService.cancelUserQuestion('question-rpc-plan-review'), true)
    const cancelReply = approvalRuntime.approvalResponses.at(-1)
    assert.equal(cancelReply.rpcId, 'question-rpc-plan-review')
    assert.deepEqual(cancelReply.result, {
      ok: false,
      error: {
        code: 'cancelled',
        message: 'the user dismissed the question to speak instead',
        details: {},
      },
    }, 'discussion must cancel the Host review request rather than submit an approval option')
    assert.equal(await approvalService.cancelUserQuestion('question-rpc-plan-review'), false,
      'a dismissed plan review cannot be cancelled twice')
    pushAssistantText(approvalRuntime, questionSessionId)
    approvalRuntime.push({ payload: { type: 'session/event', sessionId: questionSessionId, event: { type: 'turn/end', data: { reason: { kind: 'completed' } } } } })
    await planReviewTurn
  } finally {
    await approvalService.stop()
    await fs.rm(approvalHome, { recursive: true, force: true })
  }

  console.log('DSH chat bridge smoke passed: mapping, model selection, approvals, isolated streams, and cancellation.')
} finally {
  await fs.rm(home, { recursive: true, force: true })
}
