import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  createDshChatService,
  formatLegacyHistoryContext,
  LEGACY_CONTEXT_VERSION,
} from '../electron/backend/dsh-chat-service.mjs'
import { applySkillInstructions } from '../electron/backend/skill-prompt.mjs'

const modelService = {
  async getDshModelConfig(modelKey) {
    return { provider: 'test', id: modelKey.split('/')[1], apiKey: 'secret-for-test-only', name: 'Test', contextWindow: 16_000, maxTokens: 2_000, active: true }
  },
  async listProvidersAuth() {
    return [{ id: 'test', configured: true }]
  },
}
const profileStore = { async getThinkingLevel() { return 'high' } }
const webContents = { send() {}, isDestroyed() { return false } }

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
        return { result: { ok: true, value: { selected: input } } }
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
  const b = service.send({ text: 'conversation B', modelKey: 'test/model-b', conversationId: 'conversation-B', webContents: scopedWebContents })
  const sendErrors = []
  a.catch((error) => sendErrors.push(error))
  b.catch((error) => sendErrors.push(error))
  await new Promise((resolve) => setTimeout(resolve, 100))
  assert.deepEqual(sendErrors, [])
  const skillPrompt = runtime.prompts.find((prompt) => prompt.sessionId === 'tw-conversation-A')?.content?.[0]?.text
  assert.match(skillPrompt, /必须检查边界条件并报告风险/)
  assert.match(skillPrompt, /conversation A/)
  assert.equal(service.isBusy('conversation-A'), true)
  assert.equal(service.isBusy('conversation-B'), true)
  assert.notEqual(runtime.created[0].sessionId, runtime.created[1].sessionId)
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

  currentPermissionMode = 'full'
  await service.syncPermissionMode('conversation-A', 'full')
  const fullPermissionTurn = service.send({
    text: 'permission change is active',
    modelKey: 'test/model-a',
    conversationId: 'conversation-A',
    webContents: scopedWebContents,
  })
  await new Promise((resolve) => setTimeout(resolve, 10))
  assert.equal(runtime.permissionCommands[2].content[0].text, '/permission danger-full-access')
  runtime.push({ payload: { type: 'session/event', sessionId: sessionA, event: { type: 'turn/end', data: { reason: { kind: 'completed' } } } } })
  await fullPermissionTurn

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
  await new Promise((resolve) => setTimeout(resolve, 10))
  assert.equal(await service.abort('conversation-C'), true)
  const cancelled = await running
  assert.equal(cancelled.cancelled, true)
  assert.equal(runtime.getCancelCount(), 1)

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
  await new Promise((resolve) => setTimeout(resolve, 10))
  const taskSession = runtime.created.find((item) => item.sessionId === 'tw-dag-session-1')
  assert.equal(taskSession.agentPreset, 'code')
  runtime.push({ payload: { type: 'session/event', sessionId: taskSession.sessionId, event: { type: 'tool/call', time: Date.now(), data: { callId: 'task-call-1', name: 'read', arguments: '{"path":"README.md"}' } } } })
  runtime.push({ payload: { type: 'session/event', sessionId: taskSession.sessionId, event: { type: 'assistant/chunk', data: { chunk: { type: 'text-delta', text: 'task reply' } } } } })
  runtime.push({ payload: { type: 'session/event', sessionId: taskSession.sessionId, event: { type: 'turn/end', data: { reason: { kind: 'completed' } } } } })
  const taskResult = await taskTurn
  assert.equal(taskResult.text, 'task reply')

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
  await new Promise((resolve) => setTimeout(resolve, 15))
  taskAbortController.abort()
  await assert.rejects(taskAbortTurn, /任务已停止/)
  assert.equal(runtime.getCancelCount(), 2)

  const mapping = JSON.parse(await fs.readFile(path.join(home, 'taskweaver', 'dsh-session-map.json'), 'utf8'))
  assert.equal(mapping.sessions['conversation-A'].sessionId, 'tw-conversation-A')
  assert.equal(mapping.sessions['conversation-A'].legacyContextVersion, LEGACY_CONTEXT_VERSION)
  assert.ok(mapping.sessions['conversation-A'].migratedAt)

  await service.stop()

  const legacyHome = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-dsh-legacy-'))
  const legacyRuntime = createMockRuntime()
  const legacyService = createDshChatService({
    hostManager: legacyRuntime.hostManager,
    userDataPath: legacyHome,
    getWorkspacePath: () => legacyHome,
    profileStore,
    modelService,
    getLegacyTranscript: async () => ([
      { author: 'user', time: '09:00', text: '旧线程里的问题' },
      { author: 'agent', time: '09:01', text: '旧线程里的回答', thinking: '先想再答' },
    ]),
  })
  try {
    const legacyBlock = formatLegacyHistoryContext([
      { author: 'user', text: 'hello' },
      { author: 'agent', text: 'world' },
    ])
    assert.match(legacyBlock, /TASKWEAVER_LEGACY_HISTORY_CONTEXT/)
    assert.match(legacyBlock, /hello/)
    const migrateTurn = legacyService.send({
      text: 'first after migration',
      modelKey: 'test/model-legacy',
      conversationId: 'legacy-conv',
      webContents,
      legacyTranscript: [
        { author: 'user', time: '09:00', text: '旧线程里的问题' },
        { author: 'agent', time: '09:01', text: '旧线程里的回答', thinking: '先想再答' },
      ],
    })
    await new Promise((resolve) => setTimeout(resolve, 20))
    assert.equal(legacyRuntime.prompts.length, 1)
    assert.match(legacyRuntime.prompts[0].content[0].text, /旧线程里的问题/)
    assert.doesNotMatch(legacyRuntime.prompts[0].content[0].text, /first after migration/)
    legacyRuntime.push({ payload: { type: 'session/event', sessionId: 'tw-legacy-conv', event: { type: 'turn/end', data: { reason: { kind: 'completed' } } } } })
    await new Promise((resolve) => setTimeout(resolve, 20))
    assert.equal(legacyRuntime.prompts.length, 2)
    assert.match(legacyRuntime.prompts[1].content[0].text, /first after migration/)
    legacyRuntime.push({ payload: { type: 'session/event', sessionId: 'tw-legacy-conv', event: { type: 'assistant/chunk', data: { chunk: { type: 'text-delta', text: 'ok' } } } } })
    legacyRuntime.push({ payload: { type: 'session/event', sessionId: 'tw-legacy-conv', event: { type: 'turn/end', data: { reason: { kind: 'completed' } } } } })
    await migrateTurn
    const legacyMap = JSON.parse(await fs.readFile(path.join(legacyHome, 'taskweaver', 'dsh-session-map.json'), 'utf8'))
    assert.equal(legacyMap.sessions['legacy-conv'].legacyContextVersion, LEGACY_CONTEXT_VERSION)
    assert.ok(legacyMap.sessions['legacy-conv'].migratedAt)
    const second = legacyService.send({
      text: 'second message',
      modelKey: 'test/model-legacy',
      conversationId: 'legacy-conv',
      webContents,
    })
    await new Promise((resolve) => setTimeout(resolve, 10))
    assert.equal(legacyRuntime.prompts.length, 3)
    assert.equal(legacyRuntime.prompts[2].content[0].text, 'second message')
    legacyRuntime.push({ payload: { type: 'session/event', sessionId: 'tw-legacy-conv', event: { type: 'turn/end', data: { reason: { kind: 'completed' } } } } })
    await second
  } finally {
    await legacyService.stop()
    await fs.rm(legacyHome, { recursive: true, force: true })
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
    await new Promise((resolve) => setTimeout(resolve, 15))
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
  const approvalWebContents = {
    send(channel, payload) {
      if (channel === 'permission:prompt') approvalOutputs.push(payload)
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
    await new Promise((resolve) => setTimeout(resolve, 15))
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
    await new Promise((resolve) => setTimeout(resolve, 30))
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
    await new Promise((resolve) => setTimeout(resolve, 15))
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
    await new Promise((resolve) => setTimeout(resolve, 30))
    assert.equal(approvalOutputs.length, 2)
    const promptId = approvalOutputs[1].id
    assert.match(promptId, /dsh-approval-tw-conv-ask-appr-9/)
    assert.equal(await approvalService.respondApproval(promptId, { action: 'deny' }), true)
    assert.equal(approvalRuntime.approvalResponses.at(-1).result.value.outcome, 'rejected')
    assert.equal(await approvalService.rejectPendingApprovals(), 0)
    approvalRuntime.push({ payload: { type: 'session/event', sessionId: askSessionId, event: { type: 'turn/end', data: { reason: { kind: 'completed' } } } } })
    await askTurn
  } finally {
    await approvalService.stop()
    await fs.rm(approvalHome, { recursive: true, force: true })
  }

  console.log('DSH chat bridge smoke passed: mapping, migration, approvals, isolated streams, and cancellation.')
} finally {
  await fs.rm(home, { recursive: true, force: true })
}
