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

assert.equal(
  applySkillInstructions('用户任务', { name: 'dingtalk-chat', nativeInvocation: '/dingtalk-chat', source: 'dsh' }),
  '/dingtalk-chat\n用户任务',
)

function createMockRuntime({ permissionCommandSupported = true } = {}) {
  const waiters = []
  const frames = []
  const created = []
  const selected = []
  const prompts = []
  const permissionCommands = []
  const approvalResponses = []
  const sessionModels = new Map()
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
          const next = await Promise.race([
            new Promise((resolve) => { waiters.push(resolve) }),
            new Promise((resolve) => signal.addEventListener('abort', () => resolve({ done: true }), { once: true })),
          ])
          if (signal.aborted) return
          if (!next.done) yield next.value
        }
      },
    },
    sessions: {
      async create({ sessionId, cwd, agentPreset }) {
        created.push({ sessionId, cwd, agentPreset })
        return { result: { ok: true, value: { sessionId, agentPreset } } }
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
        return {
          result: {
            ok: true,
            value: {
              current: sessionModels.get(sessionId) ?? null,
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
          return { result: { ok: true, value: { accepted: true, command: { kind: 'success', text: input.content[0].text } } } }
        }
        prompts.push(input)
        return { result: { ok: true, value: { accepted: true } } }
      },
      async cancel({ sessionId }) {
        cancelCount += 1
        push({ payload: { type: 'session/event', sessionId, event: { type: 'turn/end', data: { reason: { kind: 'aborted' } } } } })
        return { result: { ok: true, value: { cancelled: true } } }
      },
      async updateQueue() { return { result: { ok: true, value: { accepted: true } } } },
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
    permissionCommands,
    created,
    selected,
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
let currentPermissionMode = 'ask'
const scopedWebContents = { send(_channel, event) { outputs.push(event) }, isDestroyed() { return false } }
const service = createDshChatService({
  hostManager: runtime.hostManager,
  userDataPath: home,
  getWorkspacePath: () => home,
  profileStore,
  modelService,
  getPermissionMode: () => currentPermissionMode,
})

try {
  const a = service.send({
    text: 'conversation A',
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
  assert.match(skillPrompt, /conversation A/)
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
  assert.equal(runtime.permissionCommands[2].content[0].text, '/permission danger-full-access')
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
  runtime.push({ payload: { type: 'session/event', sessionId: queuedSession, event: { type: 'step/start', time: Date.now(), data: { turn: 1, step: 3 } } } })
  await waitFor(
    () => outputs.some((event) => event.type === 'activity' && event.phase === 'llm' && event.message === '模型第 3 步'),
    { label: '模型步骤状态已发送到会话 UI' },
  )
  runtime.push({ payload: { type: 'session/event', sessionId: queuedSession, event: {
    type: 'llm/retry',
    data: { turn: 1, step: 3, retry: 1, maxRetries: 2, delayMs: 750, failure: { code: 'TIMEOUT' } },
  } } })
  await waitFor(
    () => outputs.some((event) => event.type === 'retry' && event.phase === 'start' && event.attempt === 1),
    { label: '模型请求超时重试状态已发送到会话 UI' },
  )
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
  runtime.push({ payload: { type: 'session/event', sessionId: taskSession.sessionId, event: { type: 'tool/call', data: { callId: 'task-call-error', name: 'glob', arguments: '{"pattern":"*"}' } } } })
  runtime.push({ payload: { type: 'session/event', sessionId: taskSession.sessionId, event: { type: 'tool/result', data: { message: {
    content: [{ type: 'tool-result', toolCallId: 'task-call-error', isError: true, content: [{ type: 'text', text: 'SEARCH_RAW_OUTPUT_OVERFLOW token=hidden-fixture-secret' }] }],
  } } } } })
  runtime.push({ payload: { type: 'session/event', sessionId: taskSession.sessionId, event: { type: 'assistant/chunk', data: { chunk: { type: 'text-delta', text: 'task reply' } } } } })
  runtime.push({ payload: { type: 'session/event', sessionId: taskSession.sessionId, event: { type: 'turn/end', data: { reason: { kind: 'completed' } } } } })
  const taskResult = await taskTurn
  assert.equal(taskResult.text, 'task reply')
  assert.equal(outputs.find((event) => event.type === 'tool' && event.id === 'task-call-1' && event.status === 'done')?.resultSummary, '执行完成 · 1 个结果块，约 9 字符')
  const toolFailure = outputs.find((event) => event.type === 'tool' && event.id === 'task-call-error' && event.status === 'error')
  assert.match(toolFailure?.resultSummary, /SEARCH_RAW_OUTPUT_OVERFLOW/)
  assert.equal(toolFailure.resultSummary.includes('hidden-fixture-secret'), false)

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
    type: 'tool/call', time: Date.now(), data: { callId: 'task-call-code', name: 'run_code', arguments: '{"description":"read files"}' },
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
  await batchedTaskTurn
  const nestedReadStart = outputs.find((event) => event.type === 'tool'
    && event.id === 'task-call-code:code:1' && event.status === 'running')
  const nestedReadResult = outputs.find((event) => event.type === 'tool'
    && event.id === 'task-call-code:code:1' && event.status === 'done')
  assert.equal(nestedReadStart?.toolName, 'read', 'Code Mode subcalls must be visible as native tool events')
  assert.equal(nestedReadStart?.parentCallId, 'task-call-code', 'Code Mode events retain their parent tool call')
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
  runtime.push({ payload: { type: 'session/event', sessionId: sessionA, event: { type: 'turn/end', data: { reason: { kind: 'completed' } } } } })
  await repeatTurn
  assert.equal(runtime.selected.length, selectCountBeforeRepeat, 'same route should not call selectModel again')

  await service.stop()

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
    assert.equal(await approvalService.respondApproval(promptId, { action: 'deny' }), true)
    assert.equal(approvalRuntime.approvalResponses.at(-1).result.value.outcome, 'rejected')
    assert.equal(await approvalService.rejectPendingApprovals(), 0)
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
    approvalRuntime.push({ payload: { type: 'session/event', sessionId: questionSessionId, event: { type: 'turn/end', data: { reason: { kind: 'completed' } } } } })
    await questionTurn
  } finally {
    await approvalService.stop()
    await fs.rm(approvalHome, { recursive: true, force: true })
  }

  console.log('DSH chat bridge smoke passed: mapping, model selection, approvals, isolated streams, and cancellation.')
} finally {
  await fs.rm(home, { recursive: true, force: true })
}
