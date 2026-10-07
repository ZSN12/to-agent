import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
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
import { createMcpService } from '../electron/backend/mcp-service.mjs'
import { piProviderBlockToDshProfile } from '../electron/backend/pi-models-to-dsh-profile.mjs'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const explicitRuntimeOverride = typeof process.env.TASKWEAVER_Z_RUNTIME === 'string'
  && process.env.TASKWEAVER_Z_RUNTIME.trim().length > 0
const runtimeSource = explicitRuntimeOverride ? 'explicit-override' : 'repository-bundle'
const expectedRuntimeRoot = explicitRuntimeOverride
  ? path.resolve(process.env.TASKWEAVER_Z_RUNTIME.trim())
  : path.resolve(projectRoot, 'vendor', 'taskweaver-z-runtime')
const runtimeRoot = resolveTaskWeaverRuntimeRoot({
  appPath: projectRoot,
  resourcesPath: null,
  isPackaged: false,
  env: process.env,
})
assert.equal(runtimeRoot, expectedRuntimeRoot, explicitRuntimeOverride
  ? 'deployment smoke must preserve the explicit TASKWEAVER_Z_RUNTIME override'
  : 'deployment smoke without an override must exercise the repository-bundled Z runtime')
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
  retryPolicy: { mode: 'normal', maxRetries: 9 },
})
assert.equal(providerOverrides.streamIdleTimeoutMs, 240_000, 'explicit provider timeout must override the app default')
assert.deepEqual(providerOverrides.retryPolicy, {
  mode: 'normal',
  maxRetries: 3,
  retryableCodes: ['EMPTY_RESPONSE', 'RATE_LIMIT', 'SERVER', 'TRANSPORT'],
}, 'explicit provider retry policy must stay finite and cap at three retries')
const alwaysRetryProvider = piProviderBlockToDshProfile('test-provider', {
  retryPolicy: { mode: 'always', backoff: { initialDelayMs: 100, maxDelayMs: 500 } },
})
assert.deepEqual(alwaysRetryProvider.retryPolicy, {
  mode: 'normal',
  maxRetries: 1,
  retryableCodes: ['EMPTY_RESPONSE', 'RATE_LIMIT', 'SERVER', 'TRANSPORT'],
  backoff: { initialDelayMs: 100, maxDelayMs: 500 },
}, 'unbounded provider retry mode must normalize to a bounded one-retry policy')
const mockRequests = []
const repeatReadRequests = []
let repeatReadCallCount = 0
const alwaysRetryRequests = []
const searchScopeCycleRequests = []
const readWindowRequests = []
const mcpSmokeRequests = []
const cancelAfterToolRequests = []
const cancelAfterToolDebugRequests = []
let cancelAfterToolResultObserved = false
let cancelAfterToolStreamClosed = false
let mcpMainResultObserved = false
let mcpReadonlyGuardObserved = false
let mcpFailureObserved = false
let mcpFailureCallCount = 0
let mcpDagCodeCallRequested = false
let mcpDagCodeResultObserved = false
let mcpDagCodeToolNames = []
const stalledRequests = []
const dagPairRequests = []
const dagPairBodies = []
const dagPairToolCalls = new Set()
let dagReviewReadRequested = false
const dagTitleRequests = []
let dagPairReleased = false
let dagInFlight = 0
let dagMaxInFlight = 0
let readonlyScopeDeniedReadRequested = false
let readonlyScopeLiteralGlobRequested = false
let readonlyScopeConversationActive = false
const mockLlm = createServer((request, response) => {
  let body = ''
  request.on('data', (chunk) => { body += chunk.toString('utf8') })
  request.on('end', () => {
    const parsedBody = JSON.parse(body)
    mockRequests.push({ path: request.url, authorization: request.headers.authorization, body: parsedBody })
    const serialized = JSON.stringify(parsedBody)
    const isTitleRequest = serialized.includes('Create a concise title for an AI coding-assistant session')
    const dagMatch = serialized.match(/当前子任务 (T1|T2|T3)：/)
    const latestUserMessage = (parsedBody.messages ?? []).filter(message => message.role === 'user')
      .reverse()
      .find(message => !String(message.content ?? '').startsWith('Current runtime context.'))
    if (serialized.includes('[CANCEL_AFTER_TOOL]')) {
      const messages = parsedBody.messages ?? []
      cancelAfterToolDebugRequests.push({
        isTitleRequest,
        latestUser: latestUserMessage?.content,
        tools: (parsedBody.tools ?? []).map(tool => tool.function?.name ?? tool.name),
        tail: messages.slice(-4).map(message => ({
          role: message.role,
          name: message.name,
          content: String(message.content ?? '').slice(0, 300),
        })),
      })
    }
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
    const respondWithTextAndReadCall = (callId, content, args) => {
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      response.end([
        `data: ${JSON.stringify({ choices: [{ delta: { role: 'assistant', content }, index: 0, finish_reason: null }] })}\n\n`,
        `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: callId, type: 'function', function: { name: 'read', arguments: JSON.stringify(args) } }] }, index: 0, finish_reason: null }] })}\n\n`,
        'data: {"choices":[{"delta":{},"index":0,"finish_reason":"tool_calls"}] }\n\n',
        'data: [DONE]\n\n',
      ].join(''))
    }
    const respondWithToolCall = (callId, name, args) => {
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      response.end([
        `data: ${JSON.stringify({ choices: [{ delta: { role: 'assistant', tool_calls: [{ index: 0, id: callId, type: 'function', function: { name, arguments: JSON.stringify(args) } }] }, index: 0, finish_reason: null }] })}\n\n`,
        'data: {"choices":[{"delta":{},"index":0,"finish_reason":"tool_calls"}]}\n\n',
        'data: [DONE]\n\n',
      ].join(''))
    }
    const cancelAfterToolTurn = !isTitleRequest
      && JSON.stringify(latestUserMessage ?? {}).includes('[CANCEL_AFTER_TOOL]')
    if (cancelAfterToolTurn) {
      cancelAfterToolRequests.push(parsedBody)
      const readToolResult = (parsedBody.messages ?? []).some((message) =>
        message.role === 'tool'
        && typeof message.content === 'string'
        && message.content.includes('<path>')
        && message.content.includes('/package.json</path>'))
      if (!readToolResult) {
        const toolNames = (parsedBody.tools ?? []).map((tool) => tool.function?.name ?? tool.name)
        if (toolNames.includes('read')) {
          respondWithTextAndReadCall('cancel-after-tool-read', 'I read the requested file. ', {
            file_path: 'package.json',
            limit: 3,
          })
        } else {
          respond('cancel-after-tool-read-not-advertised')
        }
      } else {
        cancelAfterToolResultObserved = true
        response.writeHead(200, { 'content-type': 'text/event-stream' })
        response.write(': waiting-after-successful-tool-result\n\n')
        response.once('close', () => { cancelAfterToolStreamClosed = true })
      }
      return
    }
    if (serialized.includes('[STALL_TIMEOUT]')) {
      stalledRequests.push(parsedBody)
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      response.write(': stream-open\n\n')
      return
    }
    if (serialized.includes('[RETRY_ALWAYS_CAP]')
      && !serialized.includes('Create a concise title for an AI coding-assistant session')) {
      alwaysRetryRequests.push(parsedBody)
      response.writeHead(429, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ error: { message: 'synthetic rate limit for retry-cap smoke' } }))
      return
    }
    if (serialized.includes('[SEARCH_SCOPE_LATCH]') && !serialized.includes('Create a concise title for an AI coding-assistant session')) {
      const cycle = [
        { name: 'glob', args: { path: '.', pattern: 'src/**/*.ts' } },
        { name: 'grep', args: { path: '.', pattern: 'sessions\\.prompt' } },
        { name: 'glob', args: { path: '.', pattern: 'electron/**/*.mjs' } }, // distinct searches at the same scope remain available
        { name: 'grep', args: { path: '.', pattern: 'executeSingleAgent' } },
        { name: 'glob', args: { path: '.', pattern: 'src/**/*.ts' } },
        { name: 'grep', args: { path: '.', pattern: 'sessions\\.prompt' } },
        { name: 'glob', args: { path: '.', pattern: 'src/**/*.ts' } },
        { name: 'grep', args: { path: '.', pattern: 'sessions\\.prompt' } },
        { name: 'glob', args: { path: '.', pattern: 'src/**/*.ts' } }, // exact tool/scope/query cycle repeats; must be denied
        { name: 'grep', args: { path: 'src', pattern: 'main' } }, // one retry can switch scope
        { name: 'glob', args: { path: '.', pattern: 'a-different-root-pattern' } }, // same-scope retry is denied, then stop
        { text: 'must-not-be-requested-after-retry-limit' },
      ]
      const step = cycle[searchScopeCycleRequests.length]
      searchScopeCycleRequests.push(parsedBody)
      if (step?.name) respondWithToolCall(`search-scope-latch-${searchScopeCycleRequests.length}`, step.name, step.args)
      else respond(step?.text ?? 'search-scope-latch-unexpected-extra-request')
      return
    }
    if (serialized.includes('[REPEAT_READ_GUARD]')) {
      repeatReadRequests.push(parsedBody)
      if (repeatReadRequests.length >= 22) {
        respond('read-repeat-guard-ok')
      } else if (repeatReadRequests.length % 2 === 1) {
        repeatReadCallCount += 1
        respondWithReadCall(`repeat-read-${repeatReadCallCount}`, { file_path: 'package.json', offset: repeatReadCallCount, limit: 2 })
      } else {
        respondWithToolCall(`repeat-search-${repeatReadRequests.length}`, 'grep', {
          path: '.',
          pattern: `repeat-read-interleave-${repeatReadRequests.length}`,
        })
      }
      return
    }
    const mcpScenario = serialized.includes('[MCP_MAIN_SMOKE]')
      ? 'main'
      : serialized.includes('[MCP_READONLY_SMOKE]') ? 'readonly'
        : serialized.includes('[MCP_FAILURE_SMOKE]') ? 'failure' : null
    if (mcpScenario && isTitleRequest) {
      respond('MCP echo smoke')
      return
    }
    if (mcpScenario === 'main') {
      const toolNames = (parsedBody.tools ?? []).map((tool) => tool.function?.name ?? tool.name)
      mcpSmokeRequests.push({ scenario: mcpScenario, toolNames })
      const hasMcpToolResult = (parsedBody.messages ?? []).some((message) =>
        message.role === 'tool' && JSON.stringify(message).includes('mcp-main-marker'))
      if (hasMcpToolResult) {
        mcpMainResultObserved = true
        respond('mcp-main-ok')
      } else {
        const toolName = toolNames.find((name) => name === 'mcp__smoke__echo')
        if (!toolName) respond('mcp-main-tool-not-advertised')
        else respondWithToolCall('mcp-main-tool-call', toolName, { text: 'mcp-main-marker' })
      }
      return
    }
    if (mcpScenario === 'readonly') {
      const toolNames = (parsedBody.tools ?? []).map((tool) => tool.function?.name ?? tool.name)
      mcpSmokeRequests.push({ scenario: mcpScenario, toolNames })
      const hasReadonlyDenial = (parsedBody.messages ?? []).some((message) =>
        message.role === 'tool' && JSON.stringify(message).includes('MCP tools are unavailable to read-only and planner agents'))
      if (hasReadonlyDenial) {
        mcpReadonlyGuardObserved = true
        respond('mcp-readonly-blocked')
      } else {
        const toolName = toolNames.find((name) => name === 'mcp__smoke__echo')
        if (!toolName) respond('mcp-readonly-tool-not-advertised')
        else respondWithToolCall('mcp-readonly-tool-call', toolName, { text: 'mcp-readonly-must-not-execute' })
      }
      return
    }
    if (mcpScenario === 'failure') {
      const toolNames = (parsedBody.tools ?? []).map((tool) => tool.function?.name ?? tool.name)
      mcpSmokeRequests.push({ scenario: mcpScenario, toolNames })
      const hasMcpFailure = (parsedBody.messages ?? []).some((message) =>
        message.role === 'tool' && JSON.stringify(message).includes('synthetic MCP tool failure'))
      if (hasMcpFailure) {
        mcpFailureObserved = true
        respond('mcp-failure-observed')
      } else if (mcpFailureCallCount === 0) {
        mcpFailureCallCount += 1
        const toolName = toolNames.find((name) => name === 'mcp__smoke__echo')
        if (!toolName) respond('mcp-failure-tool-not-advertised')
        else respondWithToolCall('mcp-failure-tool-call', toolName, { text: 'mcp-fail-marker' })
      } else {
        respond('mcp-failure-result-not-observed')
      }
      return
    }
    if (dagMatch?.[1] === 'T1' && serialized.includes('[MCP_DAG_CODE]')) {
      const toolNames = (parsedBody.tools ?? []).map((tool) => tool.function?.name ?? tool.name)
      mcpDagCodeToolNames = toolNames
      const hasMcpToolResult = (parsedBody.messages ?? []).some((message) =>
        message.role === 'tool' && JSON.stringify(message).includes('mcp-dag-code-marker'))
      if (hasMcpToolResult) {
        mcpDagCodeResultObserved = true
        respond('mcp-dag-code-ok')
      } else if (toolNames.includes('mcp__smoke__echo')) {
        mcpDagCodeCallRequested = true
        respondWithToolCall('mcp-dag-code-call', 'mcp__smoke__echo', { text: 'mcp-dag-code-marker' })
      } else {
        respond('mcp-dag-code-tool-not-advertised')
      }
      return
    }
    if (dagMatch?.[1] === 'T2' && serialized.includes('[MCP_DAG_SMOKE]')) {
      respond('mcp-dag-secondary-ok')
      return
    }
    if (!dagMatch && serialized.includes('[MCP_DAG_SMOKE]') && serialized.includes('子任务结果：')) {
      respond('mcp-dag-synthesis-ok')
      return
    }
    if (!isTitleRequest && serialized.includes('[READONLY_SCOPE_DENY]')) readonlyScopeConversationActive = true
    if (!isTitleRequest && readonlyScopeConversationActive) {
      if (!readonlyScopeDeniedReadRequested) {
        readonlyScopeDeniedReadRequested = true
        respondWithReadCall('readonly-scope-denied', { file_path: 'electron/main.cjs' })
      } else if (!readonlyScopeLiteralGlobRequested) {
        readonlyScopeLiteralGlobRequested = true
        respondWithToolCall('readonly-scope-literal-glob', 'glob', { pattern: 'package.json' })
      } else {
        readonlyScopeConversationActive = false
        respond('readonly-scope-boundary-ok')
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
    if (serialized.includes('Create a concise title for an AI coding-assistant session')) {
      if (/当前子任务 T[123]：/.test(serialized)) dagTitleRequests.push(parsedBody)
      respond('Read-only research')
      return
    }
    if (serialized.includes('多智能体高级任务规划器 (Planner Agent)')) {
      if (serialized.includes('[MCP_DAG_SMOKE]')) {
        respond(JSON.stringify({
          tasks: [
            { id: 'T1', title: '实现子任务调用 MCP', taskType: 'implementation', description: '[MCP_DAG_CODE] 调用 mcp__smoke__echo，参数 text 必须为 mcp-dag-code-marker；确认返回结果并汇报。不要修改工作区文件。', dependsOn: [] },
            { id: 'T2', title: '独立实现子任务', taskType: 'implementation', description: '确认代码子 Agent 可独立完成简短的无文件改动验证，并汇报。不要修改工作区文件。', dependsOn: [] },
          ],
        }))
        return
      }
      respond(JSON.stringify({
        tasks: [
          { id: 'T1', title: '独立只读任务一', taskType: 'research', description: '并发读取并总结模块一', scopePaths: ['package.json'], dependsOn: [] },
          { id: 'T2', title: '独立只读任务二', taskType: 'research', description: '并发读取并总结模块二', scopePaths: ['electron/backend/dsh-chat-service.mjs'], dependsOn: [] },
          { id: 'T3', title: '依赖汇总任务', taskType: 'review', description: '等待前两项完成后汇总', scopePaths: ['electron/main.cjs'], dependsOn: ['T1', 'T2'] },
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
const readonlyPresetSourcePath = path.join(projectRoot, 'vendor', 'z-runtime', 'apps', 'cli', 'config', 'agent-presets', 'taskweaver-readonly', 'agent.cordis.yml')
const [readonlyPresetBytes, readonlyPresetSourceBytes] = await Promise.all([
  fs.readFile(readonlyPresetPath),
  fs.readFile(readonlyPresetSourcePath),
])
const readonlyPresetHash = createHash('sha256').update(readonlyPresetBytes).digest('hex')
const readonlyPresetSourceHash = createHash('sha256').update(readonlyPresetSourceBytes).digest('hex')
assert.equal(readonlyPresetHash, readonlyPresetSourceHash,
  `deployed taskweaver-readonly preset must match its source (deployed=${readonlyPresetHash}, source=${readonlyPresetSourceHash})`)
const readonlyPreset = readonlyPresetBytes.toString('utf8')
assert.match(readonlyPreset, /name: '@z\/dsh-tool-fs'[\s\S]*?mutations: false[\s\S]*?readLimit: 600/, 'deployed readonly preset must mount capped filesystem reads with mutations disabled')
assert.doesNotMatch(readonlyPreset, /name: '@z\/dsh-tool-bash'/, 'deployed readonly preset must not expose shell execution')
assert.doesNotMatch(readonlyPreset, /inspection(?:Tools|Thresholds|Limit)/, 'deployed readonly preset must not configure a cumulative inspection budget')
assert.doesNotMatch(readonlyPreset, /(?:at most|hard ceiling of) (?:five|six|twelve).*calls? per task/i, 'deployed readonly preset must not cap total inspections')
assert.match(readonlyPreset, /excludeDirectories:.*node_modules/, 'deployed readonly discovery must exclude dependencies by default')
assert.match(readonlyPreset, /excludeDirectories:.*vendor/, 'deployed readonly discovery must exclude third-party trees by default')
assert.match(readonlyPreset, /Large-source-file workflow[\s\S]*do not begin by reading a whole large file[\s\S]*offset and limit/i,
  'deployed readonly persona must prefer a narrow symbol search and bounded source ranges over whole-file reads')
assert.match(readonlyPreset, /Approximate line numbers[\s\S]*?hints, not authoritative anchors[\s\S]*?one narrow search/i,
  'deployed readonly persona must verify approximate line hints before reading')
assert.match(readonlyPreset, /several requested symbols[\s\S]*?one contiguous range covering nearby\/adjacent hops/i,
  'deployed readonly persona must combine nearby symbol reads')
assert.match(readonlyPreset, /literal[\s\S]*scope[\s\S]*do not call glob\/ls[\s\S]*read it directly/i,
  'deployed readonly persona must not spend a search call confirming an already-named literal file path')
const codePresetPath = path.join(runtimeRoot, 'config', 'agent-presets', 'taskweaver-code', 'agent.cordis.yml')
const codePreset = await fs.readFile(codePresetPath, 'utf8')
assert.match(codePreset, /name: '@z\/dsh-tool-fs'[\s\S]*?readLimit: 600/, 'deployed code preset must cap each filesystem read')
const mainCodePreset = await fs.readFile(path.join(runtimeRoot, 'config', 'agent-presets', 'code', 'agent.cordis.yml'), 'utf8')
assert.match(mainCodePreset, /name: '@z\/dsh-tool-fs'[\s\S]*?readLimit: 600/, 'deployed primary code preset must use the bounded filesystem reader')
assert.match(mainCodePreset, /only tool you may call directly is `run_code`[\s\S]*?inside a `run_code` program/, 'deployed primary Code Mode preset must explicitly direct native capabilities through run_code')
const runtimePackagesDir = await fs.stat(path.join(runtimeRoot, 'runtime-packages')).then(() => 'runtime-packages', () => 'node_modules')
const deployedSearchPlugin = await fs.readFile(path.join(runtimeRoot, runtimePackagesDir, '@z/dsh-tool-fs-search/lib/index.js'), 'utf8')
assert.match(deployedSearchPlugin, /excludeDirectories/, 'deployed search plugin must include the current config, not a stale precompiled version')
const deployedRepeatGuard = await fs.readFile(path.join(runtimeRoot, runtimePackagesDir, '@z/dsh-repeat-tool-reminder/lib/index.js'), 'utf8')
assert.match(deployedRepeatGuard, /taskweaver-readonly-scope-v1/, 'deployed repeat guard must understand the per-subtask read-only scope marker')
assert.match(deployedRepeatGuard, /read-only scope denied/, 'deployed repeat guard must enforce the read-only path boundary before tool execution')
const deployedRuntimePatch = await fs.readFile(path.join(runtimeRoot, runtimePackagesDir, '@z/dsh-base/cordis.patch.yml'), 'utf8')
assert.doesNotMatch(deployedRuntimePatch, /inspection(?:Tools|Thresholds|Limit)/, 'deployed base patch must not configure a cumulative inspection budget')
const mcpFixturePath = path.join(projectRoot, 'scripts', 'fixtures', 'mcp-echo-server.mjs')
const mcpSmokeLogPath = path.join(testHome, 'mcp-tool-calls.log')
const testSafeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: value => Buffer.from(`test-encrypted:${value}`, 'utf8'),
  decryptString: value => {
    const decoded = Buffer.from(value).toString('utf8')
    assert.ok(decoded.startsWith('test-encrypted:'), 'test safe-storage shim must only decode its own ciphertext')
    return decoded.slice('test-encrypted:'.length)
  },
}
const mcpService = createMcpService({ userData: testHome, safeStorage: testSafeStorage })
await mcpService.saveServer({
  id: 'smoke',
  transport: 'stdio',
  command: process.execPath,
  args: [mcpFixturePath],
  env: { TASKWEAVER_MCP_SMOKE_LOG: mcpSmokeLogPath },
  enabled: true,
})
const initialMcpIntegration = await mcpService.prepareRuntimeIntegration()
assert.equal(initialMcpIntegration.patchPath, path.join(testHome, 'dsh', 'taskweaver-mcp.cordis.patch.yml'))
const generatedMcpPatch = await fs.readFile(initialMcpIntegration.patchPath, 'utf8')
assert.match(generatedMcpPatch, /@z\/dsh-mcp-client/)
assert.doesNotMatch(generatedMcpPatch, new RegExp(mcpSmokeLogPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
  'MCP environment values must be passed through the Host environment instead of inlined in its patch')
assert.ok(Object.values(initialMcpIntegration.environment).includes(mcpSmokeLogPath),
  'the generated Host environment must contain the fixture-only MCP configuration value')
const manager = createZHostManager({
  runtimeRoot,
  userDataPath: testHome,
  executable: process.execPath,
  environment: { ...process.env, TASKWEAVER_READONLY_SMOKE_KEY: mockApiKey },
  getMcpRuntimeIntegration: async () => mcpService.prepareRuntimeIntegration(),
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
  assert.ok(exposedTools.includes('read') && exposedTools.includes('grep'), `readonly native tools should be directly exposed: ${exposedTools.join(', ')}`)
  assert.ok(!exposedTools.includes('run_code'), 'readonly preset should not wrap native tools in Code Mode')
  for (const forbidden of ['write', 'edit', 'bash']) {
    assert.ok(!exposedTools.includes(forbidden), `readonly model request must not expose ${forbidden}: ${exposedTools.join(', ')}`)
  }
  assert.ok(mockRequests.length >= 1, 'the controlled model request should reach the local mock provider')
  const requestsWithTools = mockRequests.filter((request) => Array.isArray(request.body.tools))
  assert.ok(requestsWithTools.length >= 1, 'a model request with the deployed tool catalog should reach the mock provider')
  const readonlyWireRequest = requestsWithTools.find((request) => JSON.stringify(request.body).includes('Reply with the short acknowledgement.'))
  assert.ok(readonlyWireRequest, 'the deployed read-only turn should reach the model provider')
  const readonlyWireTools = readonlyWireRequest.body.tools.map((tool) => tool.function?.name ?? tool.name)
  assert.ok(readonlyWireTools.includes('read') && readonlyWireTools.includes('grep'), 'the provider request must expose native read and search tools')
  assert.ok(!readonlyWireTools.includes('run_code'), 'the provider request must not require a Code Mode wrapper for read-only tasks')
  for (const forbidden of ['write', 'edit', 'bash']) {
    assert.ok(!readonlyWireTools.includes(forbidden), `the read-only provider request must not expose ${forbidden}`)
  }
  assert.doesNotMatch(JSON.stringify(readonlyWireRequest.body.messages), /(?:at most|hard ceiling of) (?:five|six|twelve).*calls? per task/i,
    'the deployed read-only persona must not cap the total number of inspection calls')
  for (const request of requestsWithTools) {
    assert.equal(request.path, '/v1/chat/completions')
    assert.equal(request.authorization, `Bearer ${mockApiKey}`)
    const wireTools = request.body.tools.map((tool) => tool.function?.name ?? tool.name)
    assert.deepEqual(wireTools, exposedTools, 'the deployed read-only registry must match the exact tools sent to the model')
  }

  const searchCycleSessionId = `taskweaver-search-scope-latch-${crypto.randomUUID()}`
  const searchCycleCreated = await api.sessions.create({
    sessionId: searchCycleSessionId,
    cwd: projectRoot,
    agentPreset: 'taskweaver-readonly',
  })
  assert.equal(searchCycleCreated.result.ok, true)
  const searchCycleSelection = await api.sessions.selectModel({
    sessionId: searchCycleSessionId,
    provider: route,
    model: 'mock-readonly',
  })
  assert.equal(searchCycleSelection.result.ok, true)
  const searchCyclePrompt = await api.sessions.prompt({
    sessionId: searchCycleSessionId,
    mode: 'queue',
    content: [{ type: 'text', text: '[SEARCH_SCOPE_LATCH] Search twice, then answer.' }],
  })
  assert.equal(searchCyclePrompt.result.ok, true)
  let searchCycleHistory = []
  const searchCycleDeadline = Date.now() + 15_000
  do {
    const historyResult = await api.sessions.history({ sessionId: searchCycleSessionId })
    assert.equal(historyResult.result.ok, true)
    searchCycleHistory = historyResult.result.value.events.map((row) => row.event)
    if (searchCycleHistory.some((event) => event.type === 'turn/end')) break
    await new Promise((resolve) => setTimeout(resolve, 25))
  } while (Date.now() < searchCycleDeadline)
  assert.ok(searchCycleHistory.some((event) => event.type === 'turn/end'), 'deployed repeated-search guard turn should settle')
  assert.equal(searchScopeCycleRequests.length, 11, 'distinct searches run; an exact cycle gets one correction turn, then no further model request')
  const searchCycleDenials = searchCycleHistory.filter((event) => event.type === 'tool/result'
    && JSON.stringify(event.data).includes('Repeated filesystem-search cycle'))
  const searchScopeLatchDenials = searchCycleHistory.filter((event) => event.type === 'tool/result'
    && JSON.stringify(event.data).includes('Filesystem search at scope . was disabled'))
  assert.equal(searchCycleDenials.length, 1, 'the deployed Host must deny a repeated same-tool/same-scope/same-query cycle')
  assert.equal(searchScopeLatchDenials.length, 1, 'after a true cycle, the deployed Host must deny another attempt at that scope')
  const searchCycleTurnEnd = searchCycleHistory.findLast((event) => event.type === 'turn/end')
  assert.equal(searchCycleTurnEnd?.data.reason?.kind, 'blocked', 'a second attempt to search the blocked scope must end the turn without another model call')

  // The planner's read-only scope must be enforced by the deployed Host, not
  // merely included in the child prompt. A model-requested out-of-scope read
  // should be denied before the filesystem tool executes.
  const readonlyScopeSessionId = `taskweaver-readonly-scope-${crypto.randomUUID()}`
  const readonlyScopeCreated = await api.sessions.create({
    sessionId: readonlyScopeSessionId,
    cwd: projectRoot,
    agentPreset: 'taskweaver-readonly',
  })
  assert.equal(readonlyScopeCreated.result.ok, true)
  const readonlyScopeSelection = await api.sessions.selectModel({
    sessionId: readonlyScopeSessionId,
    provider: route,
    model: 'mock-readonly',
  })
  assert.equal(readonlyScopeSelection.result.ok, true)
  const readonlyScopeMarker = '<taskweaver-readonly-scope-v1>{"paths":["package.json"]}</taskweaver-readonly-scope-v1>'
  const readonlyScopePrompt = await api.sessions.prompt({
    sessionId: readonlyScopeSessionId,
    mode: 'queue',
    content: [{ type: 'text', text: `[READONLY_SCOPE_DENY] Try reading electron/main.cjs, then report the tool result.\n${readonlyScopeMarker}` }],
  })
  assert.equal(readonlyScopePrompt.result.ok, true)
  let readonlyScopeHistory = []
  const readonlyScopeDeadline = Date.now() + 15_000
  do {
    const result = await api.sessions.history({ sessionId: readonlyScopeSessionId })
    assert.equal(result.result.ok, true)
    readonlyScopeHistory = result.result.value.events.map((row) => row.event)
    if (readonlyScopeHistory.some((event) => event.type === 'turn/end')) break
    await new Promise((resolve) => setTimeout(resolve, 25))
  } while (Date.now() < readonlyScopeDeadline)
  assert.ok(readonlyScopeHistory.some((event) => event.type === 'turn/end'), 'deployed read-only scope turn should settle')
  assert.equal(readonlyScopeDeniedReadRequested, true, 'the mock model should request an out-of-scope read')
  assert.ok(readonlyScopeHistory.some((event) => event.type === 'tool/result'
    && JSON.stringify(event.data).includes('TaskWeaver read-only scope denied read at electron/main.cjs before execution')),
  'the deployed Host must deny an out-of-scope file read before it reaches the filesystem')
  assert.equal(readonlyScopeLiteralGlobRequested, true, 'the mock model should request a literal glob for the assigned file')
  const literalGlobCall = readonlyScopeHistory.find((event) => event.type === 'tool/call'
    && event.data.name === 'glob'
    && JSON.parse(event.data.arguments).pattern === 'package.json')
  assert.ok(literalGlobCall, `the mock model should emit a literal glob call for the assigned file; observed=${JSON.stringify(readonlyScopeHistory.filter((event) => ['assistant/message', 'tool/call', 'tool/result', 'turn/end'].includes(event.type)).map((event) => ({ type: event.type, data: event.data })))}; providerRequests=${JSON.stringify(mockRequests.filter((request) => JSON.stringify(request.body).includes('READONLY_SCOPE_DENY') || JSON.stringify(request.body).includes('readonly-scope')) .map((request) => ({ messageTail: request.body.messages?.slice(-3), tools: request.body.tools?.map((tool) => tool.function?.name ?? tool.name) })))}`)
  const literalGlobResult = readonlyScopeHistory.find((event) => event.type === 'tool/result'
    && event.data.message?.source?.callId === literalGlobCall.data.callId)
  assert.ok(literalGlobResult, 'the deployed Host should return a result for the exact in-scope glob call')
  assert.notEqual(literalGlobResult.data.message.content?.[0]?.isError, true,
    'the deployed Host must execute an exact authorized file glob instead of denying it as a broad workspace search')

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

  // The shared Host supports `always` for DSH profiles, but the embedded
  // TaskWeaver launcher must centrally clamp even native imported policies.
  const retryCapRoute = 'taskweaver-always-retry-cap-smoke'
  const retryCapConfigured = await api.settings.update({
    ns: 'llm-pi-ai',
    patch: { providers: { [retryCapRoute]: {
      ...deployedProviderProfile,
      retryPolicy: { mode: 'always', backoff: { initialDelayMs: 1, maxDelayMs: 1, jitterRatio: 0 } },
      models: [{ id: 'mock-retry-cap', contextWindow: 8192, maxTokens: 256 }],
    } } },
  })
  assert.equal(retryCapConfigured.result.ok, true, retryCapConfigured.result.error?.message ?? 'always retry provider settings rejected')
  const retryCapSessionId = `taskweaver-retry-cap-${crypto.randomUUID()}`
  const retryCapCreated = await api.sessions.create({ sessionId: retryCapSessionId, cwd: projectRoot, agentPreset: 'taskweaver-readonly' })
  assert.equal(retryCapCreated.result.ok, true)
  const retryCapSelection = await api.sessions.selectModel({ sessionId: retryCapSessionId, provider: retryCapRoute, model: 'mock-retry-cap' })
  assert.equal(retryCapSelection.result.ok, true, retryCapSelection.result.error?.message ?? 'selecting retry-cap model failed')
  const retryCapPrompt = await api.sessions.prompt({
    sessionId: retryCapSessionId,
    mode: 'queue',
    content: [{ type: 'text', text: '[RETRY_ALWAYS_CAP] This provider always returns a rate limit.' }],
  })
  assert.equal(retryCapPrompt.result.ok, true, retryCapPrompt.result.error?.message ?? 'retry-cap prompt rejected')
  let retryCapHistory = []
  const retryCapDeadline = Date.now() + 10_000
  do {
    const result = await api.sessions.history({ sessionId: retryCapSessionId })
    assert.equal(result.result.ok, true)
    retryCapHistory = result.result.value.events.map((row) => row.event)
    if (retryCapHistory.some((event) => event.type === 'turn/end')) break
    await new Promise((resolve) => setTimeout(resolve, 25))
  } while (Date.now() < retryCapDeadline)
  assert.ok(retryCapHistory.some((event) => event.type === 'turn/end'), 'bounded always-policy turn should settle')
  assert.equal(alwaysRetryRequests.length, 2, 'TaskWeaver must make only the initial request plus one retry for an always provider policy')
  const cappedRetryEvents = retryCapHistory.filter((event) => event.type === 'llm/retry')
  assert.equal(cappedRetryEvents.length, 1, 'TaskWeaver must persist exactly one retry event for an always provider policy')
  assert.deepEqual(
    { mode: cappedRetryEvents[0]?.data.mode, retry: cappedRetryEvents[0]?.data.retry, maxRetries: cappedRetryEvents[0]?.data.maxRetries },
    { mode: 'normal', retry: 1, maxRetries: 1 },
    'TaskWeaver retry events must record the finite policy actually enforced by the embedded Host',
  )

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
  const cancelAfterToolConversationId = `taskweaver-cancel-after-tool-${crypto.randomUUID()}`
  const cancelAfterToolEvents = []
  const cancelAfterToolWebContents = {
    send(channel, event) {
      if (channel === 'chat:stream') cancelAfterToolEvents.push(event)
    },
    isDestroyed: () => false,
  }
  const cancelAfterToolPending = deployedChatService.send({
    conversationId: cancelAfterToolConversationId,
    text: '[CANCEL_AFTER_TOOL] Read package.json, then summarize it.',
    modelKey: `${route}/mock-readonly`,
    webContents: cancelAfterToolWebContents,
    cwdOverride: projectRoot,
    agentPreset: 'taskweaver-readonly',
  })
  let cancelAfterToolRunError = null
  cancelAfterToolPending.catch(error => { cancelAfterToolRunError = error })
  const cancelAfterToolDeadline = Date.now() + 15_000
  while (
    !(cancelAfterToolResultObserved && cancelAfterToolEvents.some(event => event.type === 'tool'
      && event.toolName === 'read' && event.status === 'done'))
    && Date.now() < cancelAfterToolDeadline
  ) {
    await new Promise(resolve => setTimeout(resolve, 25))
  }
  assert.equal(cancelAfterToolResultObserved, true,
    `the mock provider must receive the completed file-read result before cancellation; matched=${cancelAfterToolRequests.length}; stream=${JSON.stringify(cancelAfterToolEvents)}; error=${cancelAfterToolRunError?.message ?? ''}; provider=${JSON.stringify(cancelAfterToolDebugRequests)}`)
  assert.ok(cancelAfterToolEvents.some(event => event.type === 'tool'
    && event.toolName === 'read' && event.status === 'done'), 'the UI stream must observe a completed read before cancellation')
  assert.equal(deployedChatService.isBusy(cancelAfterToolConversationId), true,
    'the turn should remain active while the provider is stalled after the successful read')
  const cancelAfterToolAccepted = await deployedChatService.abort(cancelAfterToolConversationId)
  assert.equal(cancelAfterToolAccepted, true, 'Stop must be accepted after a successful tool call')
  const cancelledAfterToolTurn = await Promise.race([
    cancelAfterToolPending,
    new Promise((_, reject) => setTimeout(() => reject(new Error('cancel-after-tool terminal timeout')), 10_000)),
  ])
  assert.equal(cancelledAfterToolTurn.cancelled, true, 'cancelling after a tool result must produce an interrupted terminal')
  assert.equal(deployedChatService.isBusy(cancelAfterToolConversationId), false, 'cancellation must release the conversation busy state')
  const cancelAfterToolDone = cancelAfterToolEvents.findLast(event => event.type === 'done')
  assert.equal(cancelAfterToolDone?.interrupted, true, 'the user-facing terminal event must mark the turn interrupted')
  assert.ok(cancelAfterToolDone?.full?.includes('I read the requested file.'),
    'visible text generated before the tool call must survive Stop')
  let cancelAfterToolHistory = []
  const cancelAfterToolSessionId = deployedChatService.getSessionId(cancelAfterToolConversationId)
  const cancelAfterToolHistoryDeadline = Date.now() + 5_000
  do {
    const historyResult = await api.sessions.history({ sessionId: cancelAfterToolSessionId })
    assert.equal(historyResult.result.ok, true)
    cancelAfterToolHistory = historyResult.result.value.events.map(row => row.event)
    if (cancelAfterToolHistory.some(event => event.type === 'turn/end'
      && event.data.reason?.kind === 'aborted')) break
    await new Promise(resolve => setTimeout(resolve, 25))
  } while (Date.now() < cancelAfterToolHistoryDeadline)
  const cancelAfterToolReadCall = cancelAfterToolHistory.find(event => event.type === 'tool/call'
    && event.data.name === 'read'
    && JSON.parse(event.data.arguments).file_path === 'package.json')
  assert.ok(cancelAfterToolReadCall, 'Host history must retain the successful tool invocation that preceded Stop')
  const cancelAfterToolReadResult = cancelAfterToolHistory.find(event => event.type === 'tool/result'
    && event.data.message?.source?.callId === cancelAfterToolReadCall.data.callId)
  assert.ok(cancelAfterToolReadResult, 'Host history must retain the read result that preceded Stop')
  assert.notEqual(cancelAfterToolReadResult.data.message.content?.[0]?.isError, true,
    'the preserved read result must be a successful tool result, not just an attempted call')
  assert.equal(cancelAfterToolHistory.findLast(event => event.type === 'turn/end')?.data.reason?.kind, 'aborted',
    'the native Host log must end the cancelled post-tool turn as aborted')
  const cancelAfterToolStreamCloseDeadline = Date.now() + 2_000
  while (!cancelAfterToolStreamClosed && Date.now() < cancelAfterToolStreamCloseDeadline) {
    await new Promise(resolve => setTimeout(resolve, 25))
  }
  assert.equal(cancelAfterToolStreamClosed, true, 'Stop must close the provider stream left open after the tool result')
  assert.equal(cancelAfterToolRequests.length, 2, 'the aborted post-tool model request must not be replayed')
  const cancelRecovery = await deployedChatService.send({
    conversationId: cancelAfterToolConversationId,
    text: '[CANCEL_AFTER_TOOL_RECOVERY] Reply only with RECOVERED.',
    modelKey: `${route}/mock-readonly`,
    webContents: cancelAfterToolWebContents,
    cwdOverride: projectRoot,
    agentPreset: 'taskweaver-readonly',
  })
  assert.equal(cancelRecovery.cancelled, false)
  assert.equal(cancelRecovery.text, 'readonly-smoke-ok', 'the same conversation must accept a fresh turn after post-tool cancellation')

  const mcpMainConversationId = `taskweaver-mcp-main-${crypto.randomUUID()}`
  const mcpMainTurn = await deployedChatService.runAgentTurn({
    conversationId: mcpMainConversationId,
    sessionKey: `${mcpMainConversationId}-main`,
    text: '[MCP_MAIN_SMOKE] Call the echo tool with mcp-main-marker and report its result.',
    modelKey: `${route}/mock-readonly`,
    webContents: { send() {}, isDestroyed: () => false },
    cwd: projectRoot,
  })
  assert.equal(mcpMainTurn.text, 'mcp-main-ok')
  assert.ok(mcpSmokeRequests.some((row) => row.scenario === 'main' && row.toolNames.includes('mcp__smoke__echo')),
    'the main Agent provider request must include the configured MCP tool schema')
  assert.equal(mcpMainResultObserved, true, 'the model must receive the real MCP fixture result before completing')
  const mcpReadonlyConversationId = `taskweaver-mcp-readonly-${crypto.randomUUID()}`
  const mcpReadonlyTurn = await deployedChatService.runAgentTurn({
    conversationId: mcpReadonlyConversationId,
    sessionKey: `${mcpReadonlyConversationId}-child`,
    text: '[MCP_READONLY_SMOKE] Attempt the echo tool with mcp-readonly-must-not-execute.',
    modelKey: `${route}/mock-readonly`,
    webContents: { send() {}, isDestroyed: () => false },
    cwd: projectRoot,
    agentPreset: 'taskweaver-readonly',
  })
  assert.equal(mcpReadonlyTurn.text, 'mcp-readonly-blocked')
  assert.equal(mcpReadonlyGuardObserved, true, 'the Host MCP executor must return a denial to a read-only sub-agent')
  const mcpFailureConversationId = 'taskweaver-mcp-failure-' + crypto.randomUUID()
  const mcpFailureTurn = await deployedChatService.runAgentTurn({
    conversationId: mcpFailureConversationId,
    sessionKey: mcpFailureConversationId + '-main',
    text: '[MCP_FAILURE_SMOKE] Call the MCP tool that returns isError=true and report the failure.',
    modelKey: route + '/mock-readonly',
    webContents: { send() {}, isDestroyed: () => false },
    cwd: projectRoot,
  })
  assert.equal(mcpFailureTurn.text, 'mcp-failure-observed', 'the model should receive an MCP tool failure and complete with a clear response')
  assert.equal(mcpFailureObserved, true, 'the MCP tool error must be returned to the model instead of treated as success')
  const mcpCallLog = await fs.readFile(mcpSmokeLogPath, 'utf8')
  assert.deepEqual(mcpCallLog.trim().split('\n'), ['mcp-main-marker', 'mcp-fail-marker'],
    'the main Agent may invoke the server; the read-only sub-agent must not invoke it')

  const mcpDagConversationId = `taskweaver-mcp-dag-${crypto.randomUUID()}`
  const mcpDagTasks = []
  const mcpDagOrchestration = createOrchestrationService({
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
    appState: { setTasks: async (tasks) => { mcpDagTasks.splice(0, mcpDagTasks.length, ...tasks) } },
    getWorkspacePath: () => projectRoot,
    agentDataPath: path.join(testHome, 'mcp-dag-agent-data'),
    userDataPath: path.join(testHome, 'mcp-dag-user-data'),
    getAppPreferences: async () => ({ worktreeIsolation: false, subtaskUpgradeMax: 0 }),
    dshRuntime: deployedChatService,
  })
  const mcpDag = await mcpDagOrchestration.planAndExecute({
    text: '[MCP_DAG_SMOKE] Use a code implementation child agent to call the configured local MCP echo tool, then report the observed result.',
    primaryModelKey: `${route}/mock-readonly`,
    conversationId: mcpDagConversationId,
    webContents: { send() {}, isDestroyed: () => false },
    workspacePath: projectRoot,
  })
  assert.deepEqual(mcpDag.failedTaskIds, [], `MCP implementation-child DAG should complete: ${mcpDag.failedTaskIds.join(', ')}`)
  assert.equal(mcpDag.assistant.text, 'mcp-dag-synthesis-ok')
  assert.equal(mcpDagCodeCallRequested, true, 'the implementation child must request the configured MCP tool')
  assert.equal(mcpDagCodeResultObserved, true, 'the Host-returned MCP result must reach the implementation child before it completes')
  assert.ok(mcpDagCodeToolNames.includes('mcp__smoke__echo'), 'the implementation child must receive the configured MCP tool schema')
  assert.ok(mcpDagTasks.every((task) => task.status === 'done'), 'each MCP smoke DAG task should complete')
  const mcpDagSessionMap = JSON.parse(await fs.readFile(
    path.join(testHome, 'agent-chat', 'taskweaver', 'dsh-session-map.json'),
    'utf8',
  ))
  const mcpDagEntries = ['T1', 'T2'].map((id) => Object.entries(mcpDagSessionMap.sessions).find(([sessionKey]) =>
    sessionKey.startsWith(`tw-orchestration-${mcpDagConversationId}-`) && sessionKey.endsWith(`-${id}`))?.[1])
  assert.ok(mcpDagEntries.every((entry) => entry?.agentPreset === 'taskweaver-code'),
    'implementation DAG children must persist the TaskWeaver Code Mode preset')
  const mcpCallLogAfterDag = await fs.readFile(mcpSmokeLogPath, 'utf8')
  assert.deepEqual(mcpCallLogAfterDag.trim().split('\n'), ['mcp-main-marker', 'mcp-fail-marker', 'mcp-dag-code-marker'],
    'the configured MCP server must observe exactly one successful call from the implementation DAG child')
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
    /focused code question is ready/,
    'the primary model request should contain the focused user turn',
  )
  assert.doesNotMatch(JSON.stringify(focusedRequest.body.messages), /(?:at most|more than) five inspection\/tool calls/,
    'the primary persona must not impose a total tool-call cap')
  assert.match(JSON.stringify(focusedRequest.body.messages), /exact file path, read that file directly without searching/i,
    'the deployed standard persona should read a user-named file directly instead of adding a discovery call')

  const instructionWorkspace = path.join(testHome, 'project-with-agent-instructions')
  await fs.mkdir(path.join(instructionWorkspace, '.git'), { recursive: true })
  await fs.writeFile(path.join(instructionWorkspace, 'AGENTS.md'),
    'PROJECT-INSTRUCTION-SENTINEL-9b0f: include this exact marker when asked to confirm project instructions.\n')
  const instructionConversationId = 'taskweaver-project-instructions-' + crypto.randomUUID()
  const instructionTurn = await deployedChatService.runAgentTurn({
    conversationId: instructionConversationId,
    sessionKey: instructionConversationId + '-main',
    text: '[PROJECT_INSTRUCTIONS_SMOKE] Briefly acknowledge the project instruction context.',
    modelKey: route + '/mock-readonly',
    webContents: { send() {}, isDestroyed: () => false },
    cwd: instructionWorkspace,
  })
  assert.equal(instructionTurn.text, 'readonly-smoke-ok')
  const instructionRequest = mockRequests.find((request) => {
    const serialized = JSON.stringify(request.body)
    return serialized.includes('[PROJECT_INSTRUCTIONS_SMOKE]')
      && !serialized.includes('Create a concise title for an AI coding-assistant session')
  })
  assert.ok(instructionRequest, 'the project-instruction smoke must reach the deployed model provider')
  assert.ok(JSON.stringify(instructionRequest.body.messages).includes('PROJECT-INSTRUCTION-SENTINEL-9b0f'),
    'the deployed Host must inject the actual project AGENTS.md content into the model request')
  const instructionSessionId = deployedChatService.getSessionId(instructionConversationId + '-main')
  const instructionHistory = await api.sessions.history({ sessionId: instructionSessionId })
  assert.equal(instructionHistory.result.ok, true)
  const instructionSourceEvent = instructionHistory.result.value.events
    .map((row) => row.event)
    .find((event) => event.type === 'user/message'
      && event.data.source?.kind === 'agent-instructions'
      && event.data.source?.baseline === true)
  assert.ok(instructionSourceEvent, 'the Host history must preserve typed provenance for the loaded instruction baseline')
  assert.ok(instructionSourceEvent.data.source.changes.some((change) => change.path.endsWith('AGENTS.md')),
    'the Host provenance must identify the loaded AGENTS.md source path')

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
  assert.equal(repeatReadCallCount, 11, 'the mock model should continue reading across interleaved searches so repeated-read reminders remain advisory')
  assert.equal(repeatReadRequests.length, 22, 'the mock model should continue despite reminders so periodic nudges after the final threshold are exercised')
  assert.ok(
    repeatReadRequests.some((request) => JSON.stringify(request.messages).includes('same file several times')),
    'the deployed base repeat guard must remind after same-file reads even when searches are interleaved',
  )
  assert.ok(
    repeatReadRequests.some((request) => JSON.stringify(request.messages).includes('package.json')),
    'the deployed first same-file reminder must name the file to disambiguate its advice',
  )
  assert.ok(
    repeatReadRequests.some((request) => JSON.stringify(request.messages).includes('reads_of_file: 5')),
    'the deployed guard should include a per-file read count in the detailed reminder',
  )
  assert.ok(
    repeatReadRequests.some((request) => JSON.stringify(request.messages).includes('reads_of_file: 8')),
    'the deployed guard should keep nudging at the configured highest repeated-read threshold',
  )
  assert.ok(
    repeatReadRequests.some((request) => JSON.stringify(request.messages).includes('reads_of_file: 11')),
    'the deployed guard must not go silent after its last configured threshold',
  )

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
    assert.ok(JSON.stringify(body.messages).includes('不要用 glob/ls 再确认是否存在，直接 read'),
      'each read-only child prompt should direct the model to read an already-named file instead of globbing it')
    assert.ok(tools.includes('read') && tools.includes('grep'), `each concurrent research task should receive native read/search tools: ${tools.join(', ')}`)
    assert.ok(!tools.includes('run_code'), 'concurrent read-only tasks should not need a Code Mode wrapper')
    for (const forbidden of ['write', 'edit', 'bash']) {
      assert.ok(!tools.includes(forbidden), `concurrent read-only tools must not expose ${forbidden}`)
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
  console.log(`Z Host deployed runtime + native MCP + implementation-DAG MCP call + read-only model-tool + concurrent DAG + native history restart smoke passed (runtimeSource=${runtimeSource}, runtimeRoot=${runtimeRoot})`)
} finally {
  await deployedChatService?.stop().catch(() => {})
  await manager.stop().catch(() => {})
  await mcpService.stopAll().catch(() => {})
  await new Promise((resolve) => mockLlm.close(resolve))
  await fs.rm(testHome, { recursive: true, force: true })
}
