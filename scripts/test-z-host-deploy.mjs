import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { createServer } from 'node:http'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createZHostManager } from '../electron/agent/z-host/index.mjs'
import { resolveTaskWeaverRuntimeRoot } from '../electron/agent/z-host/index.mjs'
import { createDshChatService } from '../electron/backend/dsh-chat-service.mjs'
import { createOrchestrationService } from '../electron/backend/orchestration-service.mjs'
import { piProviderBlockToDshProfile } from '../electron/backend/pi-models-to-dsh-profile.mjs'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runtimeRoot = resolveTaskWeaverRuntimeRoot({
  appPath: projectRoot,
  resourcesPath: null,
  isPackaged: false,
  env: process.env,
})
const testHome = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-dsh-deploy-'))
const mockApiKey = 'taskweaver-readonly-smoke-key'
const appDefaults = piProviderBlockToDshProfile('test-provider', { models: [{ id: 'test-model' }] })
assert.equal(appDefaults.streamIdleTimeoutMs, 300_000, 'TaskWeaver-synced providers should match the Z Runtime five-minute stream-idle default')
assert.deepEqual(appDefaults.retryPolicy, {
  mode: 'normal',
  maxRetries: 1,
  retryableCodes: ['EMPTY_RESPONSE', 'RATE_LIMIT', 'SERVER', 'TRANSPORT'],
}, 'TaskWeaver-synced providers should avoid replaying a partial response after a long idle timeout')
const providerOverrides = piProviderBlockToDshProfile('test-provider', {
  streamIdleTimeoutMs: 240_000,
  retryPolicy: { mode: 'normal', maxRetries: 3 },
})
assert.equal(providerOverrides.streamIdleTimeoutMs, 240_000, 'explicit provider timeout must override the app default')
assert.deepEqual(providerOverrides.retryPolicy, { mode: 'normal', maxRetries: 3 }, 'explicit provider retry policy must override the app default')
const mockRequests = []
const repeatReadRequests = []
const readWindowRequests = []
const inspectionBudgetRequests = []
const stalledRequests = []
const dagPairRequests = []
const dagPairBodies = []
const dagPairToolCalls = new Set()
let dagReviewReadRequested = false
const dagTitleRequests = []
let dagPairReleased = false
let dagInFlight = 0
let dagMaxInFlight = 0
const mockLlm = createServer((request, response) => {
  let body = ''
  request.on('data', (chunk) => { body += chunk.toString('utf8') })
  request.on('end', () => {
    const parsedBody = JSON.parse(body)
    mockRequests.push({ path: request.url, authorization: request.headers.authorization, body: parsedBody })
    const serialized = JSON.stringify(parsedBody)
    const dagMatch = serialized.match(/当前子任务 (T1|T2|T3)：/)
    const respond = (content) => {
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      response.end([
        `data: ${JSON.stringify({ choices: [{ delta: { role: 'assistant', content }, index: 0, finish_reason: null }] })}\n\n`,
        'data: {"choices":[{"delta":{},"index":0,"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":2}}\n\n',
        'data: [DONE]\n\n',
      ].join(''))
    }
    const respondWithReadCall = (callId, args) => {
      const codeMode = (parsedBody.tools ?? []).some((tool) => (tool.function?.name ?? tool.name) === 'run_code')
      const functionName = codeMode ? 'run_code' : 'read'
      const functionArgs = codeMode
        ? {
            description: `Read ${args.file_path}`,
            code: `const result = await tools.read(${JSON.stringify(args)}); console.log(result);`,
          }
        : args
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      response.end([
        `data: ${JSON.stringify({ choices: [{ delta: { role: 'assistant', tool_calls: [{ index: 0, id: callId, type: 'function', function: { name: functionName, arguments: JSON.stringify(functionArgs) } }] }, index: 0, finish_reason: null }] })}\n\n`,
        'data: {"choices":[{"delta":{},"index":0,"finish_reason":"tool_calls"}]}\n\n',
        'data: [DONE]\n\n',
      ].join(''))
    }
    if (serialized.includes('[STALL_TIMEOUT]')) {
      stalledRequests.push(parsedBody)
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      response.write(': stream-open\n\n')
      return
    }
    if (serialized.includes('[REPEAT_READ_GUARD]')) {
      repeatReadRequests.push(parsedBody)
      if (repeatReadRequests.length >= 13) {
        respond('read-repeat-guard-ok')
      } else {
        respondWithReadCall(`repeat-read-${repeatReadRequests.length}`, { file_path: 'package.json', limit: 2 })
      }
      return
    }
    if (serialized.includes('[READ_WINDOW]') && serialized.includes('Create a concise title for an AI coding-assistant session')) {
      respond('Bounded read check')
      return
    }
    if (serialized.includes('[READ_WINDOW]')) {
      readWindowRequests.push(parsedBody)
      if (readWindowRequests.length === 1) {
        respondWithReadCall('read-window-check', { file_path: 'long.txt' })
      } else {
        respond('read-window-ok')
      }
      return
    }
    if (serialized.includes('[INSPECTION_BUDGET]')) {
      inspectionBudgetRequests.push(parsedBody)
      const messages = JSON.stringify(parsedBody.messages)
      if (messages.includes('6 repository-inspection/tool calls') || inspectionBudgetRequests.length > 14) {
        respond('inspection-budget-ok')
      } else {
        const paths = [
          'package.json',
          'electron/backend/dsh-chat-service.mjs',
          'src/App.tsx',
          'electron/main.cjs',
          'electron/backend/model-service.mjs',
          'electron/backend/task-profile.mjs',
          'electron/backend/orchestration-service.mjs',
          'electron/backend/context-assembler.mjs',
          'electron/backend/mcp-service.mjs',
          'electron/backend/usage-store.mjs',
          'electron/backend/memory-store.mjs',
          'electron/backend/skill-service.mjs',
          'electron/backend/workspace-service.mjs',
          'electron/backend/register-ipc.mjs',
        ]
        const index = inspectionBudgetRequests.length - 1
        respondWithReadCall(`inspection-read-${index}`, { file_path: paths[index], limit: 1 })
      }
      return
    }
    if (serialized.includes('Create a concise title for an AI coding-assistant session')) {
      if (/当前子任务 T[123]：/.test(serialized)) dagTitleRequests.push(parsedBody)
      respond('Read-only research')
      return
    }
    if (serialized.includes('多智能体高级任务规划器 (Planner Agent)')) {
      respond(JSON.stringify({
        tasks: [
          { id: 'T1', title: '独立只读任务一', taskType: 'research', description: '并发读取并总结模块一', dependsOn: [] },
          { id: 'T2', title: '独立只读任务二', taskType: 'research', description: '并发读取并总结模块二', dependsOn: [] },
          { id: 'T3', title: '依赖汇总任务', taskType: 'review', description: '等待前两项完成后汇总', dependsOn: ['T1', 'T2'] },
        ],
      }))
      return
    }
    if (!dagMatch) {
      respond(serialized.includes('子任务结果：') ? 'full-orchestration-ok' : 'readonly-smoke-ok')
      return
    }
    const taskId = dagMatch[1]
    if ((taskId === 'T1' || taskId === 'T2') && !dagPairToolCalls.has(taskId)) {
      dagPairToolCalls.add(taskId)
      dagInFlight += 1
      dagMaxInFlight = Math.max(dagMaxInFlight, dagInFlight)
      dagPairBodies.push(parsedBody)
      dagPairRequests.push({ taskId, respondWithReadCall })
      if (dagPairRequests.length === 2) {
        dagPairReleased = true
        for (const pending of dagPairRequests.splice(0)) {
          dagInFlight -= 1
          pending.respondWithReadCall(`dag-read-${pending.taskId}`, {
            file_path: pending.taskId === 'T1' ? 'package.json' : 'electron/backend/dsh-chat-service.mjs',
            limit: 3,
          })
        }
      }
      return
    }
    if (taskId === 'T3' && !dagReviewReadRequested) {
      dagReviewReadRequested = true
      respondWithReadCall('dag-read-T3', { file_path: 'electron/main.cjs', limit: 3 })
      return
    }
    respond(`completed-${taskId}`)
  })
})
await new Promise((resolve) => mockLlm.listen(0, '127.0.0.1', resolve))
const mockLlmAddress = mockLlm.address()
assert.ok(mockLlmAddress && typeof mockLlmAddress !== 'string')
const mockLlmBaseUrl = `http://127.0.0.1:${mockLlmAddress.port}/v1`
const readonlyPresetPath = path.join(runtimeRoot, 'config', 'agent-presets', 'taskweaver-readonly', 'agent.cordis.yml')
const readonlyPreset = await fs.readFile(readonlyPresetPath, 'utf8')
assert.match(readonlyPreset, /name: '@z\/dsh-tool-fs'[\s\S]*?mutations: false[\s\S]*?readLimit: 600/, 'deployed readonly preset must mount capped filesystem reads with mutations disabled')
assert.doesNotMatch(readonlyPreset, /name: '@z\/dsh-tool-bash'/, 'deployed readonly preset must not expose shell execution')
assert.match(readonlyPreset, /at most six[\s\S]*?read\/glob\/grep\/find\/ls calls total/, 'deployed readonly preset must include the focused inspection budget')
assert.match(readonlyPreset, /inspectionThresholds: \[4, 6\]/, 'deployed readonly preset must include its agent-scoped synthesis reminders')
assert.match(readonlyPreset, /excludeDirectories:.*node_modules/, 'deployed readonly discovery must exclude dependencies by default')
const codePresetPath = path.join(runtimeRoot, 'config', 'agent-presets', 'taskweaver-code', 'agent.cordis.yml')
const codePreset = await fs.readFile(codePresetPath, 'utf8')
assert.match(codePreset, /name: '@z\/dsh-tool-fs'[\s\S]*?readLimit: 600/, 'deployed code preset must cap each filesystem read')
const mainCodePreset = await fs.readFile(path.join(runtimeRoot, 'config', 'agent-presets', 'code', 'agent.cordis.yml'), 'utf8')
assert.match(mainCodePreset, /name: '@z\/dsh-tool-fs'[\s\S]*?readLimit: 600/, 'deployed primary code preset must use the bounded filesystem reader')
const runtimePackagesDir = await fs.stat(path.join(runtimeRoot, 'runtime-packages')).then(() => 'runtime-packages', () => 'node_modules')
const deployedSearchPlugin = await fs.readFile(path.join(runtimeRoot, runtimePackagesDir, '@z/dsh-tool-fs-search/lib/index.js'), 'utf8')
assert.match(deployedSearchPlugin, /excludeDirectories/, 'deployed search plugin must include the current config, not a stale precompiled version')
const deployedRuntimePatch = await fs.readFile(path.join(runtimeRoot, runtimePackagesDir, '@z/dsh-base/cordis.patch.yml'), 'utf8')
assert.match(deployedRuntimePatch, /inspectionTools:\s*\[read, glob, grep, run_code\][\s\S]*inspectionThresholds:\s*\[6, 10\]/, 'deployed base patch must enable the cumulative inspection reminder')
const mcpPatchPath = path.join(testHome, 'mcp-smoke.cordis.patch.yml')
const mcpFixturePath = path.join(projectRoot, 'scripts', 'fixtures', 'mcp-echo-server.mjs')
await fs.writeFile(mcpPatchPath, [
  '- insert:',
  '    - id: taskweaver-mcp-smoke',
  "      name: '@z/dsh-mcp-client'",
  '      config:',
  '        serverName: smoke',
  '        transport: stdio',
  `        command: ${JSON.stringify(process.execPath)}`,
  `        args: [${JSON.stringify(mcpFixturePath)}]`,
  '        env: {}',
  `        cwd: ${JSON.stringify(projectRoot)}`,
  '        failOnStartupError: true',
  '',
].join('\n'))
const manager = createZHostManager({
  runtimeRoot,
  userDataPath: testHome,
  executable: process.execPath,
  environment: { ...process.env, TASKWEAVER_READONLY_SMOKE_KEY: mockApiKey },
  getMcpRuntimeIntegration: async () => ({ patchPath: mcpPatchPath, environment: {} }),
  startTimeoutMs: 90_000,
})
let deployedChatService = null

function portFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.once('error', () => resolve(false))
    server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)))
  })
}

try {
  const { api, baseUrl } = await manager.start()
  assert.match(baseUrl, /^http:\/\/127\.0\.0\.1:\d+$/)
  const port = Number(new URL(baseUrl).port)
  assert.ok(await portFree(port) === false, 'Host 应占用端口')

  const host = await api.host.describe({})
  assert.equal(host.result.ok, true)

  const sessionId = `taskweaver-deploy-${crypto.randomUUID()}`
  const created = await api.sessions.create({
    sessionId,
    cwd: projectRoot,
    agentPreset: 'taskweaver-planner',
  })
  assert.equal(created.result.ok, true)

  for (const agentPreset of ['taskweaver-readonly', 'taskweaver-code']) {
    const presetSessionId = `taskweaver-${agentPreset}-${crypto.randomUUID()}`
    const presetCreated = await api.sessions.create({
      sessionId: presetSessionId,
      cwd: projectRoot,
      agentPreset,
    })
    assert.equal(
      presetCreated.result.ok,
      true,
      `${agentPreset} preset should load in the deployed Host: ${presetCreated.result.error?.message ?? 'unknown error'}`,
    )
  }

  const route = 'taskweaver-readonly-smoke'
  const deployedProviderProfile = {
    ...appDefaults,
    api: 'openai-completions',
    baseURL: mockLlmBaseUrl,
    apiKeyEnv: 'TASKWEAVER_READONLY_SMOKE_KEY',
    models: [{ id: 'mock-readonly', contextWindow: 8192, maxTokens: 256 }],
  }
  const configured = await api.settings.update({
    ns: 'llm-pi-ai',
    patch: {
      providers: {
        [route]: deployedProviderProfile,
      },
    },
  })
  assert.equal(configured.result.ok, true, configured.result.error?.message ?? 'mock provider settings rejected')
  const readonlySessionId = `taskweaver-readonly-${crypto.randomUUID()}`
  const readonlyCreated = await api.sessions.create({
    sessionId: readonlySessionId,
    cwd: projectRoot,
    agentPreset: 'taskweaver-readonly',
  })
  assert.equal(readonlyCreated.result.ok, true)
  const selected = await api.sessions.selectModel({
    sessionId: readonlySessionId,
    provider: route,
    model: 'mock-readonly',
  })
  assert.equal(selected.result.ok, true, selected.result.error?.message ?? 'selecting mock model failed')
  const prompt = await api.sessions.prompt({
    sessionId: readonlySessionId,
    mode: 'queue',
    content: [{ type: 'text', text: 'Reply with the short acknowledgement.' }],
  })
  assert.equal(prompt.result.ok, true, prompt.result.error?.message ?? 'readonly smoke prompt rejected')

  let readonlyHistory
  const historyDeadline = Date.now() + 15_000
  do {
    const historyResult = await api.sessions.history({ sessionId: readonlySessionId })
    assert.equal(historyResult.result.ok, true)
    readonlyHistory = historyResult.result.value.events.map((row) => row.event)
    if (readonlyHistory.some((event) => event.type === 'turn/end')) break
    await new Promise((resolve) => setTimeout(resolve, 25))
  } while (Date.now() < historyDeadline)
  assert.ok(readonlyHistory.some((event) => event.type === 'turn/end'), 'mock-backed readonly turn should finish')
  const requestHeader = readonlyHistory.find((event) => event.type === 'request/header')
  assert.ok(requestHeader, 'readonly turn should durably record the actual model request header')
  const exposedTools = requestHeader.data.header.tools.map((tool) => tool.name)
  assert.deepEqual(exposedTools, ['run_code'], 'readonly Code Mode should expose only the safe transport to the model')
  for (const forbidden of ['write', 'edit', 'bash']) {
    assert.ok(!exposedTools.includes(forbidden), `readonly model request must not expose ${forbidden}: ${exposedTools.join(', ')}`)
  }
  assert.ok(mockRequests.length >= 1, 'the controlled model request should reach the local mock provider')
  const requestsWithTools = mockRequests.filter((request) => Array.isArray(request.body.tools))
  assert.ok(requestsWithTools.length >= 1, 'a model request with the deployed tool catalog should reach the mock provider')
  const readonlyWireRequest = requestsWithTools.find((request) => JSON.stringify(request.body).includes('Reply with the short acknowledgement.'))
  assert.ok(readonlyWireRequest, 'the deployed read-only turn should reach the model provider')
  const readonlySdkPrompt = JSON.stringify(readonlyWireRequest.body.messages)
  assert.match(readonlySdkPrompt, /read:/, 'the read-only Code Mode SDK must expose the read capability')
  assert.match(readonlySdkPrompt, /grep:/, 'the read-only Code Mode SDK must expose symbol search')
  assert.match(readonlySdkPrompt, /Defaults to 600\./, 'the actual deployed read-only SDK must advertise its 600-line read window')
  for (const forbidden of ['write:', 'edit:', 'bash:']) {
    assert.ok(!readonlySdkPrompt.includes(forbidden), `the read-only Code Mode SDK must not expose ${forbidden}`)
  }
  assert.match(
    JSON.stringify(readonlyWireRequest.body.messages),
    /at most six\s+read\/glob\/grep\/find\/ls calls total/,
    'the deployed read-only persona effort guidance must be present in the actual model request, not only in its YAML source',
  )
  for (const request of requestsWithTools) {
    assert.equal(request.path, '/v1/chat/completions')
    assert.equal(request.authorization, `Bearer ${mockApiKey}`)
    const wireTools = request.body.tools.map((tool) => tool.function?.name ?? tool.name)
    assert.deepEqual(wireTools, exposedTools, 'the deployed read-only registry must match the exact tools sent to the model')
  }

  // A stalled SSE stream should fail once without replaying a partially
  // generated/billable turn. Use a short test timeout but the production retry
  // policy generated by piProviderBlockToDshProfile.
  const stalledRoute = 'taskweaver-stalled-smoke'
  const stalledConfigured = await api.settings.update({
    ns: 'llm-pi-ai',
    patch: { providers: { [stalledRoute]: {
      ...deployedProviderProfile,
      streamIdleTimeoutMs: 100,
      retryPolicy: appDefaults.retryPolicy,
      models: [{ id: 'mock-stalled', contextWindow: 8192, maxTokens: 256 }],
    } } },
  })
  assert.equal(stalledConfigured.result.ok, true, stalledConfigured.result.error?.message ?? 'stalled provider settings rejected')
  const stalledSessionId = `taskweaver-stalled-${crypto.randomUUID()}`
  const stalledCreated = await api.sessions.create({ sessionId: stalledSessionId, cwd: projectRoot, agentPreset: 'taskweaver-readonly' })
  assert.equal(stalledCreated.result.ok, true)
  const stalledSelection = await api.sessions.selectModel({ sessionId: stalledSessionId, provider: stalledRoute, model: 'mock-stalled' })
  assert.equal(stalledSelection.result.ok, true, stalledSelection.result.error?.message ?? 'selecting stalled model failed')
  const stalledPrompt = await api.sessions.prompt({
    sessionId: stalledSessionId,
    mode: 'queue',
    content: [{ type: 'text', text: '[STALL_TIMEOUT] This test provider will leave the SSE stream open.' }],
  })
  assert.equal(stalledPrompt.result.ok, true, stalledPrompt.result.error?.message ?? 'stalled prompt rejected')
  let stalledHistory = []
  const stalledDeadline = Date.now() + 5_000
  do {
    const result = await api.sessions.history({ sessionId: stalledSessionId })
    assert.equal(result.result.ok, true)
    stalledHistory = result.result.value.events.map((row) => row.event)
    if (stalledHistory.some((event) => event.type === 'turn/end')) break
    await new Promise((resolve) => setTimeout(resolve, 25))
  } while (Date.now() < stalledDeadline)
  assert.ok(stalledHistory.some((event) => event.type === 'turn/end'), 'stalled SSE turn should settle within the short test deadline')
  assert.equal(
    stalledRequests.filter((body) => Array.isArray(body.tools)).length,
    1,
    `a stream idle timeout must not replay the model turn; request count=${stalledRequests.length}; retry count=${stalledHistory.filter((event) => event.type === 'llm/retry').length}`,
  )
  assert.equal(stalledHistory.filter((event) => event.type === 'llm/retry').length, 0, 'TIMEOUT is excluded from automatic retries by default')

  deployedChatService = createDshChatService({
    hostManager: manager,
    userDataPath: path.join(testHome, 'agent-chat'),
    getWorkspacePath: () => projectRoot,
    profileStore: { getThinkingLevel: async () => null },
    modelService: {
      getDshModelConfig: async () => ({
        provider: route,
        id: 'mock-readonly',
        name: 'Mock Readonly',
        contextWindow: 8192,
        maxTokens: 256,
      }),
      listProvidersAuth: async () => [{ id: route, configured: true }],
    },
  })
  const focusedConversationId = `taskweaver-focused-turn-${crypto.randomUUID()}`
  const focusedTurn = await deployedChatService.runAgentTurn({
    conversationId: focusedConversationId,
    sessionKey: `${focusedConversationId}-main`,
    text: 'Reply briefly to confirm the focused code question is ready.',
    modelKey: `${route}/mock-readonly`,
    webContents: { send() {}, isDestroyed: () => false },
    cwd: projectRoot,
  })
  assert.equal(focusedTurn.text, 'readonly-smoke-ok')
  const focusedRequest = mockRequests.find((request) => JSON.stringify(request.body).includes('focused code question is ready'))
  assert.ok(focusedRequest, 'the production main-chat bridge should send its focused turn to the provider')
  const focusedSessionId = deployedChatService.getSessionId(`${focusedConversationId}-main`)
  const focusedHistory = await api.sessions.history({ sessionId: focusedSessionId })
  assert.equal(focusedHistory.result.ok, true)
  const focusedHeader = focusedHistory.result.value.events.map((row) => row.event).find((event) => event.type === 'request/header')
  assert.ok(focusedHeader, 'default main-chat turn must persist its model request header')
  const focusedToolNames = focusedHeader.data.header.tools.map((tool) => tool.name)
  assert.ok(focusedToolNames.includes('read'), `new main-chat sessions should use DSH Web's standard native tool preset: ${focusedToolNames.join(', ')}`)
  assert.ok(!focusedToolNames.includes('run_code'), 'new main-chat sessions should not implicitly switch to Code Mode')
  const focusedSessionMap = JSON.parse(await fs.readFile(
    path.join(testHome, 'agent-chat', 'taskweaver', 'dsh-session-map.json'), 'utf8'))
  assert.equal(focusedSessionMap.sessions[`${focusedConversationId}-main`]?.agentPreset, 'standard',
    'the bridge should persist DSH Web standard as the main-chat default')
  assert.match(
    JSON.stringify(focusedRequest.body.messages),
    /at most five inspection\/tool calls/,
    'the primary code-agent effort guidance must reach the actual model request through DshChatService',
  )

  const readWindowWorkspace = path.join(testHome, 'read-window-workspace')
  await fs.mkdir(readWindowWorkspace, { recursive: true })
  await fs.writeFile(path.join(readWindowWorkspace, 'long.txt'), Array.from({ length: 1000 }, (_, index) => `line-${index + 1}`).join('\n'))
  const readWindowConversationId = `taskweaver-read-window-${crypto.randomUUID()}`
  const readWindowTurn = await deployedChatService.runAgentTurn({
    conversationId: readWindowConversationId,
    sessionKey: `${readWindowConversationId}-main`,
    text: '[READ_WINDOW] Read the long file once and summarize it.',
    modelKey: `${route}/mock-readonly`,
    webContents: { send() {}, isDestroyed: () => false },
    cwd: readWindowWorkspace,
    agentPreset: 'taskweaver-code',
  })
  assert.equal(readWindowTurn.text, 'read-window-ok')
  assert.equal(readWindowRequests.length, 2, 'the code preset should perform one bounded read before synthesizing')
  const readWindowToolResult = JSON.stringify(readWindowRequests[1].messages)
  assert.match(readWindowToolResult, /Showing lines 1-600 of 1000/, 'the deployed code preset must cap a default read at 600 lines')
  assert.match(readWindowToolResult, /line-600/)
  assert.doesNotMatch(readWindowToolResult, /line-601/, 'the capped read must not send lines beyond its configured window')

  const repeatGuardConversationId = `taskweaver-repeat-read-guard-${crypto.randomUUID()}`
  const repeatGuardTurn = await deployedChatService.runAgentTurn({
    conversationId: repeatGuardConversationId,
    sessionKey: `${repeatGuardConversationId}-main`,
    text: '[REPEAT_READ_GUARD] Read package.json over and over, then report what it contains.',
    modelKey: `${route}/mock-readonly`,
    webContents: { send() {}, isDestroyed: () => false },
    cwd: projectRoot,
    agentPreset: 'taskweaver-code',
  })
  assert.equal(repeatGuardTurn.text, 'read-repeat-guard-ok')
  assert.equal(repeatReadRequests.length, 13, 'the mock model should continue despite reminders so periodic nudges after the final threshold are exercised')
  assert.ok(
    JSON.stringify(repeatReadRequests[4].messages).includes('same file several times'),
    'the deployed base repeat guard must tell the model to stop rereading and synthesize its findings',
  )
  assert.ok(
    JSON.stringify(repeatReadRequests[9].messages).includes('consecutive_reads: 8'),
    'the deployed guard should keep nudging at the configured highest repeated-read threshold',
  )
  assert.ok(
    JSON.stringify(repeatReadRequests[12].messages).includes('consecutive_reads: 11'),
    'the deployed guard must not go silent after its last configured threshold',
  )

  const inspectionBudgetConversationId = `taskweaver-inspection-budget-${crypto.randomUUID()}`
  const inspectionBudgetTurn = await deployedChatService.runAgentTurn({
    conversationId: inspectionBudgetConversationId,
    sessionKey: `${inspectionBudgetConversationId}-main`,
    text: '[INSPECTION_BUDGET] Briefly explain this repository architecture. Do not modify files.',
    modelKey: `${route}/mock-readonly`,
    webContents: { send() {}, isDestroyed: () => false },
    cwd: projectRoot,
    agentPreset: 'taskweaver-readonly',
  })
  assert.equal(inspectionBudgetTurn.text, 'inspection-budget-ok')
  assert.ok(
    inspectionBudgetRequests.some((body) => JSON.stringify(body.messages).includes('6 repository-inspection/tool calls')),
    'after six different inspection calls the deployed Host must inject a synthesis reminder into the next model input',
  )
  const inspectionSessionId = deployedChatService.getSessionId(`${inspectionBudgetConversationId}-main`)
  assert.ok(inspectionSessionId, 'inspection-budget turn must have a native Z session')
  const inspectionHistory = await api.sessions.history({ sessionId: inspectionSessionId })
  assert.equal(inspectionHistory.result.ok, true)
  const inspectionCalls = inspectionHistory.result.value.events.map((row) => row.event)
    .filter((event) => event.type === 'tool/code-dispatch-start' && ['read', 'glob', 'grep', 'find', 'ls'].includes(event.data?.name))
  assert.ok(inspectionCalls.length >= 3 && inspectionCalls.length <= 6,
    `Code Mode should surface bounded inner inspection calls before its synthesis reminder (observed ${inspectionCalls.length})`)

  const dagConversationId = `taskweaver-deployed-dag-${crypto.randomUUID()}`
  const dagWebContents = { send() {}, isDestroyed: () => false }
  const orchestrationTasks = []
  const orchestration = createOrchestrationService({
    modelService: {
      listCatalog: async () => ({ models: [{
        key: `${route}/mock-readonly`,
        name: 'Mock Readonly',
        available: true,
        routeRegistered: true,
        profile: { tier: 'cheap', enabledForAllocation: true },
        costPerMillion: { input: 0, output: 0 },
      }] }),
    },
    profileStore: { getThinkingLevel: async () => null },
    appState: { setTasks: async (tasks) => { orchestrationTasks.splice(0, orchestrationTasks.length, ...tasks) } },
    getWorkspacePath: () => projectRoot,
    agentDataPath: path.join(testHome, 'orchestration-agent-data'),
    userDataPath: path.join(testHome, 'orchestration-user-data'),
    getAppPreferences: async () => ({ worktreeIsolation: false, subtaskUpgradeMax: 0 }),
    dshRuntime: deployedChatService,
  })
  const dag = await orchestration.planAndExecute({
    text: '使用多智能体并行完成两项只读调研，再汇总结果。',
    primaryModelKey: `${route}/mock-readonly`,
    conversationId: dagConversationId,
    webContents: dagWebContents,
    workspacePath: projectRoot,
  })
  assert.equal(dag.failedTaskIds.length, 0, `deployed orchestration DAG should complete without failed tasks: ${dag.failedTaskIds.join(', ')}`)
  assert.deepEqual(orchestrationTasks.map((task) => task.id).sort(), ['T1', 'T2', 'T3'])
  assert.ok(orchestrationTasks.every((task) => task.status === 'done'), 'full orchestration should persist each DAG task as completed')
  assert.ok(['T1', 'T2'].every((id) => {
    const task = orchestrationTasks.find((item) => item.id === id)
    return task?.executionEvidenceSummary?.successfulReadCount > 0
  }), 'research tasks must have Host-observed successful reads before they can complete')
  assert.ok(orchestrationTasks.find((task) => task.id === 'T3')?.executionEvidenceSummary?.successfulReadCount > 0,
    'review tasks must have Host-observed successful reads before they can complete')
  assert.equal(dag.assistant.text, 'full-orchestration-ok', 'the synthesis turn should complete after all dependent tasks')
  assert.equal(dagMaxInFlight, 2, `independent DAG turns should overlap at the model endpoint (observed ${dagMaxInFlight})`)
  assert.equal(dagPairReleased, true, 'the model endpoint should observe both independent turns concurrently')
  assert.equal(dagPairRequests.length, 0, 'both concurrent model requests should be released and settled')
  assert.equal(
    dagPairBodies.length,
    2,
    `exactly the two independent research tasks should form the concurrent model-call wave (received ${dagPairBodies.map((body) => JSON.stringify(body.messages).match(/当前子任务 (T1|T2|T3)：/)?.[1] ?? '?').join(', ')})`,
  )
  for (const body of dagPairBodies) {
    const tools = (body.tools ?? []).map((tool) => tool.function?.name ?? tool.name)
    assert.deepEqual(tools, ['run_code'], `each concurrent research task should use the safe batched Code Mode transport: ${tools.join(', ')}`)
    const sdkPrompt = JSON.stringify(body.messages)
    assert.match(sdkPrompt, /read:/, 'each concurrent task should expose filesystem reads through the Code Mode SDK')
    assert.match(sdkPrompt, /grep:/, 'each concurrent task should expose symbol search through the Code Mode SDK')
    for (const forbidden of ['write:', 'edit:', 'bash:']) {
      assert.ok(!sdkPrompt.includes(forbidden), `concurrent read-only SDK must not expose ${forbidden}`)
    }
  }
  const deployedSessionMap = JSON.parse(await fs.readFile(
    path.join(testHome, 'agent-chat', 'taskweaver', 'dsh-session-map.json'),
    'utf8',
  ))
  const dagSessionEntries = ['T1', 'T2', 'T3'].map((id) => {
    const match = Object.entries(deployedSessionMap.sessions).find(([sessionKey]) =>
      sessionKey.startsWith(`tw-orchestration-${dagConversationId}-`) && sessionKey.endsWith(`-${id}`))
    return match?.[1]
  })
  assert.ok(dagSessionEntries.every((entry) => entry?.sessionId), 'orchestration should persist an independent Host session for each DAG task')
  assert.equal(new Set(dagSessionEntries.map((entry) => entry.sessionId)).size, 3, 'DAG task sessions must not alias one another')
  assert.ok(dagSessionEntries.every((entry) => entry.agentPreset === 'taskweaver-readonly'), 'research/review tasks must retain the deployed read-only preset')
  const plannerEntry = Object.entries(deployedSessionMap.sessions).find(([sessionKey]) =>
    sessionKey.startsWith(`tw-orchestration-${dagConversationId}-`) && /-planner(?:-retry)?$/.test(sessionKey))?.[1]
  assert.ok(plannerEntry?.sessionId, 'the planner Host session should be persisted')
  assert.ok(dagSessionEntries.every((entry) => entry.parentSessionId === plannerEntry.sessionId), 'each DAG task session should retain Planner lineage')
  assert.equal(dagTitleRequests.length, 0, 'DAG child sessions must not spend model calls generating root-session titles')
  const listedSessions = await api.sessions.list({})
  assert.equal(listedSessions.result.ok, true)
  for (const entry of dagSessionEntries) {
    assert.equal(
      listedSessions.result.value.items.find((item) => item.sessionId === entry.sessionId)?.parentSessionId,
      plannerEntry.sessionId,
      'the deployed Host session.list projection should expose the persisted Planner lineage',
    )
  }

  const history = await api.sessions.history({ sessionId })
  assert.equal(history.result.ok, true)

  const models = await api.sessions.models({ sessionId })
  assert.equal(models.result.ok, true)

  const controller = new AbortController()
  const stream = api.events.mux({}, controller.signal)[Symbol.asyncIterator]()
  const first = await Promise.race([
    stream.next(),
    new Promise((_, reject) => setTimeout(() => reject(new Error('mux timeout')), 8_000)),
  ])
  controller.abort()
  await stream.return?.()
  assert.equal(first.value?.payload?.type, 'session/subscribed')

  const beforeRestart = await api.sessions.history({ sessionId: readonlySessionId })
  assert.equal(beforeRestart.result.ok, true)
  const persistedEvents = beforeRestart.result.value.events.map(row => row.event)
  assert.ok(persistedEvents.some(event => event.type === 'assistant/message'))
  assert.ok(persistedEvents.some(event => event.type === 'turn/end'))

  await deployedChatService.stop()
  deployedChatService = null
  await manager.stop()
  assert.ok(await portFree(port), '停止后端口应释放')
  const { api: restoredApi } = await manager.start()
  const restoredHistory = await restoredApi.sessions.history({ sessionId: readonlySessionId })
  assert.equal(restoredHistory.result.ok, true, 'native session history must reopen after Host restart')
  assert.deepEqual(restoredHistory.result.value.events.map(row => row.event), persistedEvents,
    'all native prompt/tool/assistant/turn-end events must survive Host restart unchanged')
  const restoredSessionMap = JSON.parse(await fs.readFile(
    path.join(testHome, 'agent-chat', 'taskweaver', 'dsh-session-map.json'), 'utf8'))
  assert.deepEqual(restoredSessionMap, deployedSessionMap, 'Host restart must not discard task/session identity mapping')
  console.log(`Z Host deployed runtime + native MCP + read-only model-tool + concurrent DAG + native history restart smoke passed (${runtimeRoot})`)
} finally {
  await deployedChatService?.stop().catch(() => {})
  await manager.stop().catch(() => {})
  await new Promise((resolve) => mockLlm.close(resolve))
  await fs.rm(testHome, { recursive: true, force: true })
}
