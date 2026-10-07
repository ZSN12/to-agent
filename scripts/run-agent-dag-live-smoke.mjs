import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import { createHash } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const modelKey = 'xiaomi/mimo-v2.6-flash'
const livePlannerRequestText = '要求两项彼此独立研究任务并行完成，且不得修改文件或运行命令。T1 只读 package.json，核实 Electron 主进程入口字段及开发启动脚本；T2 只读 electron/backend/dsh-session-model.mjs，核实 sessionModelMatches 在 Host 未回报 reasoningEffort 时如何判定匹配。两项都只回答对应问题，列出实际文件行号，不做目录发现，不扩展范围。'
const fixedPlan = { tasks: [
  { id: 'T1', title: '梳理应用启动入口', taskType: 'research', role: '项目入口研究', description: '只读研究且范围仅限 package.json、electron/main.cjs、src/main.tsx。仅确认 Electron 的 main 入口、主进程窗口/后端启动边界和 React 渲染入口；不要推断 preload 或 IPC 内部实现，也不要读取其他文件。直接读取这三个已知文件，不做目录发现；每个文件最多读取一次，用文件名和相关行号支持结论，完成后立即汇报。', scopePaths: ['package.json', 'electron/main.cjs', 'src/main.tsx'], dependsOn: [] },
  { id: 'T2', title: '梳理 Agent 请求链路', taskType: 'research', role: 'Agent 链路研究', description: '只读研究且范围仅限 src/features/app/useAppBackend.ts、electron/preload.cjs、electron/backend/register-ipc.mjs、electron/backend/dsh-chat-service.mjs。所有工具路径参数必须使用工作区相对路径，禁止使用 /Users/... 绝对路径。按调用链核实：useAppBackend.ts 的 bridge.chat.send；preload.cjs 的 chat.send → invoke("chat:send")；register-ipc.mjs 的 chat:send handler → executeChatRequest → executeSingleAgent/chat.send，并核对本文件中的 chat 实例由 createDshChatService(...) 创建；dsh-chat-service.mjs 的 send → 新 turn 的 api.sessions.prompt。每个文件各做一次窄 grep，使用精确搜索项：useAppBackend 只搜 bridge.chat.send；preload 只搜 chat:send，禁止把通用 invoke( 放进 pattern；register-ipc 一次组合搜索 chat:send、executeChatRequest、executeSingleAgent、createDshChatService、chat.send；服务文件一次组合搜索 async function send 与 api.sessions.prompt。然后 read：register-ipc 中 helper 与 handler 用一个连续范围覆盖、绑定位置单独读；服务 send 与新 turn prompt 尽量一次连续范围覆盖，不要拆分相邻范围；useAppBackend/preload 各读一次。不要依赖或猜测行号，不要用同义词二次搜索，不要重读重叠或已经覆盖的范围。grep 命中可支持符号与行号，read 用于确认调用关系。输出四行“文件/函数 → 下一跳”，附实际行号，并指出 createDshChatService 绑定证据。不要搜索 queue、turn lifecycle、权限、审批、响应投影或 Host 旁支；验收项证实后立即汇报。', scopePaths: ['src/features/app/useAppBackend.ts', 'electron/preload.cjs', 'electron/backend/register-ipc.mjs', 'electron/backend/dsh-chat-service.mjs'], dependsOn: [] },
] }
const fixedChainTask = fixedPlan.tasks.find((task) => task.id === 'T2')
fixedChainTask.description = fixedChainTask.description.replace(
  '服务 send 与新 turn prompt 尽量一次连续范围覆盖，不要拆分相邻范围',
  'dsh-chat-service.mjs 必须恰好一次 read：根据当前 grep 输出的 send/prompt 行号选一个连续范围，覆盖 send 至新 turn sessions.prompt，并将 limit 设到足够大；禁止拆成相邻 read',
)
const hashPlan = (plan) => createHash('sha256').update(JSON.stringify(plan)).digest('hex')
const fixedPlanHash = hashPlan(fixedPlan)
const READ_ONLY_TOOL_ALLOWLIST = new Set(['read', 'grep', 'glob', 'find', 'ls', 'run_code'])
const KNOWN_TOOL_EVENT_TYPES = new Set(['tool/call', 'tool/result', 'tool/code-dispatch-start', 'tool/code-dispatch'])
const READONLY_PRESET_RELATIVE_PATH = 'config/agent-presets/taskweaver-readonly/agent.cordis.yml'

function inspectReadonlyPresetIntegrity(sourceContent, runtimeContent) {
  if (typeof sourceContent !== 'string' || typeof runtimeContent !== 'string') {
    return { status: 'failed', sourceSha256: null, runtimeSha256: null, reason: 'preset content missing' }
  }
  const sourceSha256 = createHash('sha256').update(sourceContent).digest('hex')
  const runtimeSha256 = createHash('sha256').update(runtimeContent).digest('hex')
  return {
    status: sourceSha256 === runtimeSha256 ? 'verified' : 'failed',
    sourceSha256,
    runtimeSha256,
    reason: sourceSha256 === runtimeSha256 ? null : 'source and deployed preset differ',
  }
}

function inspectReadonlyPresetSessions(tasks, histories) {
  const readonlyTaskIds = tasks.filter((task) => ['research', 'review'].includes(task.taskType)).map((task) => task.id)
  const byTaskId = new Map(histories.map((history) => [history.id, history]))
  const mismatches = readonlyTaskIds.filter((id) => {
    const history = byTaskId.get(id)
    return !history?.sessionId || history.preset !== 'taskweaver-readonly'
  })
  return {
    status: readonlyTaskIds.length > 0 && mismatches.length === 0 ? 'verified' : 'failed',
    readonlyTaskIds,
    mismatches,
  }
}

function inspectChildRequestHeaders(events, plannedModelKey, expectedReasoningEffort = null) {
  const separator = typeof plannedModelKey === 'string' ? plannedModelKey.indexOf('/') : -1
  const expectedRoute = separator > 0 && separator < plannedModelKey.length - 1
    ? { provider: plannedModelKey.slice(0, separator), model: plannedModelKey.slice(separator + 1) }
    : null
  const normalized = (value) => typeof value === 'string' && value.trim() ? value.trim().toLowerCase() : null
  const headers = events.filter((event) => event?.type === 'request/header').map((event) => {
    const config = event.data?.header?.config
    return {
      seq: Number.isInteger(event.seq) ? event.seq : null,
      time: typeof event.time === 'number' || typeof event.time === 'string' ? event.time : null,
      reason: typeof event.data?.reason === 'string' ? event.data.reason : null,
      provider: typeof config?.provider === 'string' ? config.provider : null,
      model: typeof config?.model === 'string' ? config.model : null,
      reasoningEffort: typeof config?.reasoningEffort === 'string' ? config.reasoningEffort : null,
    }
  })
  const reasons = []
  const mismatches = []
  if (!expectedRoute) reasons.push('task route metadata is not a provider/model key')
  if (!headers.length) reasons.push('native Host history contains no request/header event')
  for (const [index, header] of headers.entries()) {
    if (!header.provider || !header.model) {
      reasons.push(`request/header ${index + 1} does not expose provider and model`)
    } else if (expectedRoute && (normalized(header.provider) !== normalized(expectedRoute.provider)
      || normalized(header.model) !== normalized(expectedRoute.model))) {
      mismatches.push(`request/header ${index + 1} route ${header.provider}/${header.model} does not match ${plannedModelKey}`)
    }
    if (!header.reasoningEffort) reasons.push(`request/header ${index + 1} does not expose reasoningEffort`)
    else if (expectedReasoningEffort && normalized(header.reasoningEffort) !== normalized(expectedReasoningEffort)) {
      mismatches.push(`request/header ${index + 1} reasoningEffort ${header.reasoningEffort} does not match ${expectedReasoningEffort}`)
    }
  }
  return {
    status: mismatches.length ? 'failed' : reasons.length ? 'unverified' : 'verified',
    source: 'native-session-history:request/header',
    expected: { modelKey: plannedModelKey ?? null, ...(expectedRoute ?? {}), reasoningEffort: expectedReasoningEffort },
    observed: headers,
    reasons: [...reasons, ...mismatches],
  }
}

function stableJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`
}

function auditReadOnlyToolEvents(events) {
  const issues = []
  const toolEvents = events.filter((event) => typeof event?.type === 'string' && event.type.startsWith('tool/'))
  for (const event of toolEvents) if (!KNOWN_TOOL_EVENT_TYPES.has(event.type)) issues.push(`unrecognized native tool event type: ${event.type}`)

  const nativeCalls = toolEvents.filter((event) => event.type === 'tool/call').map((event) => ({
    callId: typeof event.data?.callId === 'string' ? event.data.callId : null,
    name: typeof event.data?.name === 'string' ? event.data.name : null,
  }))
  const nestedStarts = toolEvents.filter((event) => event.type === 'tool/code-dispatch-start').map((event) => event.data ?? {})
  const nestedSettles = toolEvents.filter((event) => event.type === 'tool/code-dispatch').map((event) => event.data ?? {})
  const nativeCallIds = new Set()
  for (const call of nativeCalls) {
    if (!call.callId) issues.push('native tool/call has no callId')
    else if (nativeCallIds.has(call.callId)) issues.push(`duplicate native callId: ${call.callId}`)
    else nativeCallIds.add(call.callId)
    if (!READ_ONLY_TOOL_ALLOWLIST.has(call.name)) issues.push(`native tool is not allowlisted: ${call.name ?? '(missing name)'}`)
  }

  const wrapperIds = new Set([
    ...nativeCalls.filter((call) => call.name === 'run_code').map((call) => call.callId),
    ...nestedStarts.filter((call) => call.name === 'run_code').map((call) => call.subCallId),
  ].filter(Boolean))
  const startsById = new Map()
  const settlesById = new Map()
  for (const start of nestedStarts) {
    if (typeof start.subCallId !== 'string' || !start.subCallId) {
      issues.push('nested tool dispatch start has no subCallId')
      continue
    }
    const starts = startsById.get(start.subCallId) ?? []
    starts.push(start)
    startsById.set(start.subCallId, starts)
    if (!READ_ONLY_TOOL_ALLOWLIST.has(start.name)) issues.push(`nested tool is not allowlisted: ${start.name ?? '(missing name)'}`)
    if (!nativeCallIds.has(start.rootCallId) || !nativeCalls.some((call) => call.callId === start.rootCallId && call.name === 'run_code')) {
      issues.push(`nested dispatch has no matching top-level run_code: ${start.subCallId}`)
    }
    if (!wrapperIds.has(start.parentCallId)) issues.push(`nested dispatch parent is not an observed run_code call: ${start.subCallId}`)
  }
  for (const settle of nestedSettles) {
    if (typeof settle.subCallId !== 'string' || !settle.subCallId) {
      issues.push('nested tool dispatch result has no subCallId')
      continue
    }
    const settles = settlesById.get(settle.subCallId) ?? []
    settles.push(settle)
    settlesById.set(settle.subCallId, settles)
    if (!READ_ONLY_TOOL_ALLOWLIST.has(settle.name)) issues.push(`settled nested tool is not allowlisted: ${settle.name ?? '(missing name)'}`)
  }
  for (const [subCallId, starts] of startsById) {
    const settles = settlesById.get(subCallId) ?? []
    if (starts.length !== 1) issues.push(`nested dispatch start is duplicated: ${subCallId}`)
    if (settles.length !== 1) issues.push(`nested dispatch does not have exactly one settle event: ${subCallId}`)
    if (starts.length === 1 && settles.length === 1) {
      for (const key of ['rootCallId', 'parentCallId', 'subCallId', 'name']) {
        if (starts[0][key] !== settles[0][key]) issues.push(`nested dispatch ${subCallId} changed ${key} before settle`)
      }
      if (stableJson(starts[0].arguments) !== stableJson(settles[0].arguments)) issues.push(`nested dispatch ${subCallId} changed arguments before settle`)
    }
  }
  for (const subCallId of settlesById.keys()) if (!startsById.has(subCallId)) issues.push(`nested settle has no matching start: ${subCallId}`)
  for (const wrapperId of wrapperIds) {
    if (!nestedStarts.some((start) => start.parentCallId === wrapperId)) issues.push(`run_code has no auditable nested calls: ${wrapperId}`)
  }
  if (nativeCalls.length === 0 && nestedStarts.length === 0) issues.push('native history contains no auditable tool calls')

  return {
    status: issues.length ? 'failed' : 'verified',
    allowlist: [...READ_ONLY_TOOL_ALLOWLIST],
    observed: [
      ...nativeCalls.map((call) => ({ kind: 'native', ...call })),
      ...nestedStarts.map((call) => ({ kind: 'code-dispatch', callId: call.subCallId ?? null, parentCallId: call.parentCallId ?? null, name: call.name ?? null, settled: (settlesById.get(call.subCallId) ?? []).length === 1 })),
    ],
    issues,
  }
}

function auditFixedT2ToolDiscipline(calls) {
  const issues = []
  const parsedCalls = calls.map((call, index) => {
    let args = call.arguments
    if (typeof args === 'string') {
      try { args = JSON.parse(args) } catch {
        issues.push(`tool call ${index + 1}: arguments are invalid JSON`)
        args = null
      }
    }
    if (!args || typeof args !== 'object' || Array.isArray(args)) {
      issues.push(`tool call ${index + 1}: arguments must be an object`)
      args = {}
    }
    if (!['grep', 'read'].includes(call.name)) issues.push(`tool call ${index + 1}: unexpected tool ${call.name ?? '(missing name)'}`)
    return { name: call.name, args }
  })
  const expectedSearches = new Map([
    ['src/features/app/useAppBackend.ts', 'bridge\\.chat\\.send'],
    ['electron/preload.cjs', 'chat:send'],
    ['electron/backend/register-ipc.mjs', 'chat:send|executeChatRequest|executeSingleAgent|createDshChatService|chat\\.send'],
    ['electron/backend/dsh-chat-service.mjs', 'async function send|api\\.sessions\\.prompt'],
  ])
  const expectedReadCounts = new Map([
    ['src/features/app/useAppBackend.ts', 1],
    ['electron/preload.cjs', 1],
    ['electron/backend/register-ipc.mjs', 2],
    ['electron/backend/dsh-chat-service.mjs', 1],
  ])
  const requiredReadAnchors = [
    ['src/features/app/useAppBackend.ts', 'bridge.chat.send', /bridge\.chat\.send/],
    ['electron/preload.cjs', 'chat:send bridge', /invoke\(['"]chat:send['"]/],
    ['electron/backend/register-ipc.mjs', 'createDshChatService binding', /const chat = createDshChatService\(/],
    ['electron/backend/register-ipc.mjs', 'executeSingleAgent helper', /const executeSingleAgent = async/],
    ['electron/backend/register-ipc.mjs', 'executeChatRequest helper', /const executeChatRequest = async/],
    ['electron/backend/register-ipc.mjs', 'chat:send handler', /ipcHandle\(ipcMain, ['"]chat:send['"]/],
    ['electron/backend/register-ipc.mjs', 'handler-to-helper call', /result = await executeChatRequest\(/],
    ['electron/backend/dsh-chat-service.mjs', 'send entry', /async function send\(\{/],
    ['electron/backend/dsh-chat-service.mjs', 'new-turn sessions.prompt', /const reply = rpcValue\(await api\.sessions\.prompt\(/],
  ]
  const sourceLinesByPath = new Map()
  for (const [filePath] of requiredReadAnchors) {
    if (sourceLinesByPath.has(filePath)) continue
    const absolutePath = path.resolve(root, filePath)
    if (!absolutePath.startsWith(`${root}${path.sep}`)) throw new Error(`fixed T2 anchor escaped workspace: ${filePath}`)
    sourceLinesByPath.set(filePath, fsSync.readFileSync(absolutePath, 'utf8').split(/\r?\n/))
  }
  const expectedPaths = new Set(expectedSearches.keys())
  const searches = parsedCalls.filter((call) => call.name === 'grep')
  for (const [expectedPath, expectedPattern] of expectedSearches) {
    const matching = searches.filter((call) => call.args.path === expectedPath)
    if (matching.length !== 1) issues.push(`${expectedPath}: expected one scoped grep, observed ${matching.length}`)
    if (matching.some((call) => call.args.pattern !== expectedPattern)) issues.push(`${expectedPath}: grep pattern differs from the fixed narrow pattern`)
  }
  for (const call of searches) if (!expectedPaths.has(call.args.path)) issues.push(`grep used an unexpected or out-of-scope path: ${call.args.path ?? '(missing path)'}`)
  const preloadPatterns = searches
    .filter((call) => call.args.path === 'electron/preload.cjs')
    .map((call) => String(call.args.pattern ?? ''))
  if (preloadPatterns.some((pattern) => /invoke/i.test(pattern))) issues.push('electron/preload.cjs: search must not include generic invoke')
  const reads = parsedCalls.filter((call) => call.name === 'read')
  const readsByPath = new Map()
  for (const call of reads) {
    const filePath = call.args.file_path
    if (!expectedPaths.has(filePath)) issues.push(`read used an unexpected or out-of-scope path: ${filePath ?? '(missing file_path)'}`)
    const matching = readsByPath.get(filePath) ?? []
    matching.push(call)
    readsByPath.set(filePath, matching)
    if (!Number.isInteger(call.args.offset) || call.args.offset < 1) issues.push(`${filePath ?? 'read'}: offset must be a positive integer`)
    if (!Number.isInteger(call.args.limit) || call.args.limit < 1) issues.push(`${filePath ?? 'read'}: limit must be a positive integer`)
  }
  for (const [expectedPath, expectedCount] of expectedReadCounts) {
    const matching = readsByPath.get(expectedPath) ?? []
    if (matching.length !== expectedCount) issues.push(`${expectedPath}: expected ${expectedCount} read(s), observed ${matching.length}`)
  }
  for (const [filePath, matching] of readsByPath) {
    if (matching.length > 1 && matching.every((call) => Number.isInteger(call.args.offset) && Number.isInteger(call.args.limit))) {
      const ranges = matching.map((call) => ({ start: call.args.offset, end: call.args.offset + call.args.limit })).sort((a, b) => a.start - b.start)
      if (ranges.some((range, index) => index > 0 && range.start < ranges[index - 1].end)) issues.push(`${filePath}: read ranges overlap`)
    }
  }
  for (const [filePath, label, pattern] of requiredReadAnchors) {
    const lines = sourceLinesByPath.get(filePath)
    const lineNumber = lines.findIndex((line) => pattern.test(line)) + 1
    if (lineNumber < 1) {
      issues.push(`${filePath}: required source anchor not found (${label})`)
      continue
    }
    const matchingReads = (readsByPath.get(filePath) ?? []).filter((call) =>
      Number.isInteger(call.args.offset) && Number.isInteger(call.args.limit)
      && call.args.offset <= lineNumber && lineNumber < call.args.offset + call.args.limit)
    if (matchingReads.length !== 1) issues.push(`${filePath}: ${label} line ${lineNumber} must be covered by exactly one read, observed ${matchingReads.length}`)
  }
  const serviceRead = readsByPath.get('electron/backend/dsh-chat-service.mjs') ?? []
  const expectedSearchPaths = [...expectedSearches.keys()]
  return {
    status: issues.length ? 'failed' : 'verified',
    expectedSearchPaths,
    expectedReadCounts: Object.fromEntries(expectedReadCounts),
    observedGrepCount: searches.length,
    observedReadCount: reads.length,
    preloadPatterns,
    serviceReadCount: serviceRead.length,
    issues,
  }
}

function runOfflineEvidenceSelfTest() {
  const assertCase = (condition, message) => { if (!condition) throw new Error(`offline evidence test failed: ${message}`) }
  assertCase(inspectReadonlyPresetIntegrity('same preset', 'same preset').status === 'verified', 'matching source/deploy read-only preset must verify')
  assertCase(inspectReadonlyPresetIntegrity('source preset', 'different deploy preset').status === 'failed', 'source/deploy read-only preset drift must fail')
  assertCase(inspectReadonlyPresetIntegrity(null, 'runtime preset').status === 'failed', 'missing read-only preset content must fail')
  assertCase(inspectReadonlyPresetSessions([{ id: 'T1', taskType: 'research' }], [{ id: 'T1', sessionId: 's1', preset: 'taskweaver-readonly' }]).status === 'verified', 'loaded read-only preset must be checked from Host session metadata')
  assertCase(inspectReadonlyPresetSessions([{ id: 'T1', taskType: 'research' }], [{ id: 'T1', sessionId: 's1', preset: 'code' }]).status === 'failed', 'wrong Host session preset must fail')
  assertCase(inspectReadonlyPresetSessions([{ id: 'T1', taskType: 'research' }], []).status === 'failed', 'missing Host task session must fail read-only preset verification')
  const fixedChainTask = fixedPlan.tasks.find((task) => task.id === 'T2')
  assertCase(Boolean(fixedChainTask), 'fixed DAG fixture must include the call-chain task')
  assertCase(!/(?:约第\s*\d+\s*行|around line\s+\d+)/i.test(fixedChainTask.description), 'fixed DAG fixture must not embed stale approximate line numbers')
  assertCase(['bridge.chat.send', 'invoke("chat:send")', 'executeChatRequest', 'createDshChatService', 'api.sessions.prompt'].every((symbol) => fixedChainTask.description.includes(symbol)), 'fixed DAG fixture must name stable call-chain symbols and adapter binding')
  assertCase(/preload 只搜 chat:send[\s\S]*禁止把通用 invoke\(/.test(fixedChainTask.description), 'fixed DAG fixture must avoid broad invoke searches in preload')
  assertCase(/dsh-chat-service\.mjs 必须恰好一次 read[\s\S]*禁止拆成相邻 read/.test(fixedChainTask.description), 'fixed DAG fixture must require one contiguous service read')
  const exactSearches = [
    ['src/features/app/useAppBackend.ts', 'bridge\\.chat\\.send'],
    ['electron/preload.cjs', 'chat:send'],
    ['electron/backend/register-ipc.mjs', 'chat:send|executeChatRequest|executeSingleAgent|createDshChatService|chat\\.send'],
    ['electron/backend/dsh-chat-service.mjs', 'async function send|api\\.sessions\\.prompt'],
  ].map(([path, pattern]) => ({ name: 'grep', arguments: JSON.stringify({ path, pattern }) }))
  const readCoveringAnchors = (filePath, patterns, padding = 4) => {
    const absolutePath = path.resolve(root, filePath)
    if (!absolutePath.startsWith(`${root}${path.sep}`)) throw new Error(`fixed T2 fixture escaped workspace: ${filePath}`)
    const lines = fsSync.readFileSync(absolutePath, 'utf8').split(/\r?\n/)
    const lineNumbers = patterns.map((pattern) => lines.findIndex((line) => pattern.test(line)) + 1)
    assertCase(lineNumbers.every((lineNumber) => lineNumber > 0), `fixed T2 fixture anchors exist in ${filePath}`)
    const offset = Math.max(1, Math.min(...lineNumbers) - padding)
    const endLine = Math.max(...lineNumbers) + padding
    return {
      name: 'read',
      arguments: JSON.stringify({ file_path: filePath, offset, limit: endLine - offset + 1 }),
    }
  }
  const expectedReads = [
    readCoveringAnchors('src/features/app/useAppBackend.ts', [/bridge\.chat\.send/]),
    readCoveringAnchors('electron/preload.cjs', [/invoke\(['"]chat:send['"]/]),
    readCoveringAnchors('electron/backend/register-ipc.mjs', [/const chat = createDshChatService\(/]),
    readCoveringAnchors('electron/backend/register-ipc.mjs', [
      /const executeSingleAgent = async/,
      /const executeChatRequest = async/,
      /ipcHandle\(ipcMain, ['"]chat:send['"]/,
      /result = await executeChatRequest\(/,
    ], 6),
    readCoveringAnchors('electron/backend/dsh-chat-service.mjs', [
      /async function send\(\{/,
      /const reply = rpcValue\(await api\.sessions\.prompt\(/,
    ], 6),
  ]
  const compliantCalls = [...exactSearches, ...expectedReads]
  const serviceRead = expectedReads.at(-1)
  assertCase(auditFixedT2ToolDiscipline(compliantCalls).status === 'verified', 'fixed T2 exact searches and scoped reads pass')
  assertCase(auditFixedT2ToolDiscipline([...compliantCalls, serviceRead]).status === 'failed', 'fixed T2 flags adjacent service rereads')
  const actualAdjacentServiceReads = [
    { name: 'read', arguments: JSON.stringify({ file_path: 'electron/backend/dsh-chat-service.mjs', offset: 1437, limit: 70 }) },
    { name: 'read', arguments: JSON.stringify({ file_path: 'electron/backend/dsh-chat-service.mjs', offset: 1507, limit: 104 }) },
  ]
  assertCase(auditFixedT2ToolDiscipline([...exactSearches, ...expectedReads.slice(0, -1), ...actualAdjacentServiceReads]).status === 'failed', 'fixed T2 rechecks the exact adjacent service ranges from the 9C1Byp report')
  const broadPreloadSearches = exactSearches.map((call) => call.arguments.includes('electron/preload.cjs')
    ? { ...call, arguments: JSON.stringify({ path: 'electron/preload.cjs', pattern: 'chat:send|invoke\\(' }) }
    : call)
  assertCase(auditFixedT2ToolDiscipline([...broadPreloadSearches, ...expectedReads]).status === 'failed', 'fixed T2 flags broad preload invoke search')
  const outOfScopeCalls = [...compliantCalls,
    { name: 'grep', arguments: JSON.stringify({ path: '/etc/passwd', pattern: 'password' }) },
    { name: 'read', arguments: JSON.stringify({ file_path: '/etc/passwd', offset: 1, limit: 10 }) },
  ]
  assertCase(auditFixedT2ToolDiscipline(outOfScopeCalls).status === 'failed', 'fixed T2 flags extra out-of-scope search and read')
  const broadRegisterSearches = exactSearches.map((call) => call.arguments.includes('register-ipc.mjs')
    ? { ...call, arguments: JSON.stringify({ path: 'electron/backend/register-ipc.mjs', pattern: '.*' }) }
    : call)
  assertCase(auditFixedT2ToolDiscipline([...broadRegisterSearches, ...expectedReads]).status === 'failed', 'fixed T2 flags broad register search')
  const shortReads = expectedReads.map((call) => call === serviceRead
    ? { ...call, arguments: JSON.stringify({ file_path: 'electron/backend/dsh-chat-service.mjs', offset: 1, limit: 1 }) }
    : call)
  assertCase(auditFixedT2ToolDiscipline([...exactSearches, ...shortReads]).status === 'failed', 'fixed T2 flags insufficient service read range')
  assertCase(auditFixedT2ToolDiscipline([...compliantCalls, { name: 'grep', arguments: '{not-json' }]).status === 'failed', 'fixed T2 flags malformed arguments')
  const event = (type, data, seq) => ({ type, data, seq, time: seq * 10 })
  const header = (provider, model, reasoningEffort) => event('request/header', {
    header: { config: { provider, model, ...(reasoningEffort ? { reasoningEffort } : {}) } },
  }, 1)
  assertCase(inspectChildRequestHeaders([header('xiaomi', 'mimo-v2.6-flash', 'medium')], 'xiaomi/mimo-v2.6-flash', 'medium').status === 'verified', 'matching route and effort verify')
  assertCase(inspectChildRequestHeaders([], 'xiaomi/mimo-v2.6-flash', 'medium').status === 'unverified', 'missing host header remains unverified')
  assertCase(inspectChildRequestHeaders([header('xiaomi', 'mimo-v2.6-flash', null)], 'xiaomi/mimo-v2.6-flash', 'medium').status === 'unverified', 'missing reasoning effort is not inferred')
  assertCase(inspectChildRequestHeaders([header('other', 'different', 'high')], 'xiaomi/mimo-v2.6-flash', 'medium').status === 'failed', 'route and effort mismatch fail')

  const wrapper = event('tool/call', { callId: 'outer', name: 'run_code', arguments: '{}' }, 2)
  const nested = (type, name, seq) => event(type, {
    rootCallId: 'outer', parentCallId: 'outer', subCallId: 'outer:code:1', name, arguments: { path: 'package.json' },
  }, seq)
  assertCase(auditReadOnlyToolEvents([wrapper, nested('tool/code-dispatch-start', 'read', 3), nested('tool/code-dispatch', 'read', 4)]).status === 'verified', 'run_code read dispatch verifies')
  assertCase(auditReadOnlyToolEvents(['read', 'grep', 'glob', 'find', 'ls'].map((name, index) => event('tool/call', { callId: `direct-${index}`, name }, 5 + index))).status === 'verified', 'direct allowlisted tools verify')
  assertCase(auditReadOnlyToolEvents([event('tool/call', { callId: 'bad', name: 'bash' }, 10)]).status === 'failed', 'unknown top-level tool fails')
  assertCase(auditReadOnlyToolEvents([wrapper, nested('tool/code-dispatch-start', 'write', 11), nested('tool/code-dispatch', 'write', 12)]).status === 'failed', 'unknown nested tool fails')
  assertCase(auditReadOnlyToolEvents([wrapper]).status === 'failed', 'opaque run_code fails without nested evidence')
  assertCase(auditReadOnlyToolEvents([wrapper, nested('tool/code-dispatch-start', 'read', 13)]).status === 'failed', 'unsettled nested dispatch fails')
  assertCase(auditReadOnlyToolEvents([event('tool/unknown', {}, 14)]).status === 'failed', 'unknown tool event type fails')
  const innerWrapper = event('tool/code-dispatch-start', { rootCallId: 'outer', parentCallId: 'outer', subCallId: 'inner', name: 'run_code', arguments: '{}' }, 15)
  const innerSettle = event('tool/code-dispatch', { ...innerWrapper.data }, 16)
  const leaf = (type, seq) => event(type, { rootCallId: 'outer', parentCallId: 'inner', subCallId: 'inner:code:1', name: 'read', arguments: { path: 'package.json' } }, seq)
  assertCase(auditReadOnlyToolEvents([wrapper, innerWrapper, innerSettle, leaf('tool/code-dispatch-start', 17), leaf('tool/code-dispatch', 18)]).status === 'verified', 'nested run_code is accepted with audited descendants')
  return { requestHeaderCases: 4, fixedToolDisciplineCases: 8, toolAuditCases: 8, readonlyPresetCases: 6 }
}

const cliUsage = `Usage: node scripts/run-agent-dag-live-smoke.mjs [options]

Options:
  --real-planner       Ask MiMo to create the DAG plan (otherwise use the fixed safe plan)
  --frozen-plan <path> Replay a previously captured Planner plan without another Planner request
  --serial-fixed-plan  Force DAG execution concurrency=1 for paired benchmarking
  --thinking <level>   Override reasoning profile: low, medium, high, or default
  --self-test-evidence Run focused offline checks for native route/tool evidence
  --installed          Use the runtime bundled in /Applications/TaskWeaver.app
  -h, --help           Show this help without starting a Host or calling a model

Environment:
  TASKWEAVER_LIVE_REAL_PLANNER=1  Equivalent to --real-planner
  TASKWEAVER_LIVE_THINKING=<level> Default reasoning override when --thinking is omitted
  TASKWEAVER_Z_RUNTIME=<path>     Runtime deployment to test
`

const cliArgs = process.argv.slice(2)
let cliThinkingOverride = null
let frozenPlanPath = null
for (let index = 0; index < cliArgs.length; index += 1) {
  const arg = cliArgs[index]
  if (arg === '--thinking') {
    const value = cliArgs[index + 1]
    if (!value || value.startsWith('--')) throw new Error('--thinking requires a profile value')
    cliThinkingOverride = value
    index += 1
  } else if (arg === '--frozen-plan') {
    const value = cliArgs[index + 1]
    if (!value || value.startsWith('--')) throw new Error('--frozen-plan requires a JSON file path')
    frozenPlanPath = path.resolve(value)
    index += 1
  } else if (arg.startsWith('--thinking=')) {
    cliThinkingOverride = arg.slice('--thinking='.length)
  } else if (!['--real-planner', '--serial-fixed-plan', '--installed', '--self-test-evidence', '-h', '--help'].includes(arg)) {
    throw new Error(`Unknown option: ${arg}\n\n${cliUsage}`)
  }
}

if (cliArgs.includes('-h') || cliArgs.includes('--help')) {
  process.stdout.write(cliUsage)
  process.exit(0)
}

const realPlanner = process.env.TASKWEAVER_LIVE_REAL_PLANNER === '1' || cliArgs.includes('--real-planner')
const serialFixedPlan = cliArgs.includes('--serial-fixed-plan')
if (realPlanner && frozenPlanPath) throw new Error('--real-planner and --frozen-plan are mutually exclusive')
const thinkingOverride = cliThinkingOverride ?? process.env.TASKWEAVER_LIVE_THINKING ?? null
if (thinkingOverride && !['low', 'medium', 'high', 'default'].includes(thinkingOverride)) {
  throw new Error('TASKWEAVER_LIVE_THINKING must be low, medium, high, or default')
}
if (cliArgs.includes('--self-test-evidence')) {
  process.stdout.write(`${JSON.stringify({ status: 'passed', ...runOfflineEvidenceSelfTest() })}\n`)
  process.exit(0)
}

// Keep help and offline evidence checks independent of app/runtime dependencies.
const [
  { createZHostManager },
  { createDshChatService },
  { createModelService },
  { createOrchestrationService, summarizeExecutionEvidence },
  { createProfileStore },
  { resolveTaskWeaverModelsPath },
  { ensureModelsJsonSyncedToDshHost },
] = await Promise.all([
  import('../electron/agent/z-host/index.mjs'),
  import('../electron/backend/dsh-chat-service.mjs'),
  import('../electron/backend/model-service.mjs'),
  import('../electron/backend/orchestration-service.mjs'),
  import('../electron/backend/profile-store.mjs'),
  import('../electron/backend/taskweaver-models-path.mjs'),
  import('../electron/backend/sync-models-json-to-host.mjs'),
])
const loadedFrozenPlan = frozenPlanPath ? JSON.parse(await fs.readFile(frozenPlanPath, 'utf8')) : null
if (loadedFrozenPlan && (!Array.isArray(loadedFrozenPlan.tasks) || loadedFrozenPlan.tasks.length === 0)) {
  throw new Error('--frozen-plan must contain a non-empty tasks array')
}
const plannerMode = realPlanner ? 'live' : loadedFrozenPlan ? 'frozen-replay' : 'fixed-fixture'
const userData = path.join(os.homedir(), 'Library', 'Application Support', 'taskweaver-desktop')
const runtimeOverride = process.env.TASKWEAVER_Z_RUNTIME?.trim()
const runtimeRoot = runtimeOverride
  ? path.resolve(runtimeOverride)
  : cliArgs.includes('--installed')
    ? '/Applications/TaskWeaver.app/Contents/Resources/taskweaver-z-runtime'
    : path.join(root, 'vendor', 'taskweaver-z-runtime')
const sourceReadonlyPresetPath = path.join(root, 'vendor', 'z-runtime', 'apps', 'cli', 'config', 'agent-presets', 'taskweaver-readonly', 'agent.cordis.yml')
const runtimeReadonlyPresetPath = path.join(runtimeRoot, READONLY_PRESET_RELATIVE_PATH)
const reportDir = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-live-dag-'))
const frozenPlanArtifactPath = path.join(reportDir, 'frozen-plan.json')
const isolatedModelsPath = resolveTaskWeaverModelsPath(reportDir)
const isolatedModelProfilesPath = path.join(reportDir, 'taskweaver-model-profiles.json')
const conversationId = `live-dag-${crypto.randomUUID()}`
let hostManager
let modelService
let chat
let orchestration
let startedAt = 0
let orchestrationFinishedAt = 0
let heartbeat
let interrupted = false
let readonlyPresetIntegrity = { status: 'not-checked', sourceSha256: null, runtimeSha256: null, reason: null }
const tasks = []
const events = []
const taskHistories = []
const taskTimings = new Map()
const plannerRuns = []
let plannerPlan = loadedFrozenPlan ?? (!realPlanner ? fixedPlan : null)

function parsePlannerJson(text) {
  const withoutFence = String(text ?? '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  const start = withoutFence.indexOf('{')
  const end = withoutFence.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('planner response has no JSON object')
  const plan = JSON.parse(withoutFence.slice(start, end + 1))
  if (!Array.isArray(plan.tasks)) throw new Error('planner JSON has no tasks array')
  return plan
}

async function hashWorkspaceSnapshot(plan) {
  const ignoredDirectories = new Set(['.git', 'node_modules', 'vendor', 'dist', 'build', 'release', 'coverage'])
  const paths = new Set([
    'electron/backend/dag-scheduler.mjs',
    'electron/backend/orchestration-service.mjs',
    'electron/backend/dsh-chat-service.mjs',
    'electron/backend/dsh-permission-map.mjs',
    'electron/backend/task-profile.mjs',
    ...(plan?.tasks ?? []).flatMap((task) => Array.isArray(task.scopePaths) ? task.scopePaths : []),
  ])
  const filePaths = new Set()
  async function collect(relativePath) {
    const absolutePath = path.resolve(root, relativePath)
    if (!absolutePath.startsWith(`${root}${path.sep}`)) throw new Error(`Snapshot path escaped workspace: ${relativePath}`)
    let stat
    try { stat = await fs.lstat(absolutePath) } catch (error) {
      if (error.code === 'ENOENT') return
      throw error
    }
    if (stat.isSymbolicLink()) return
    if (stat.isFile()) {
      filePaths.add(relativePath.replaceAll(path.sep, '/'))
      return
    }
    if (!stat.isDirectory()) return
    for (const entry of await fs.readdir(absolutePath, { withFileTypes: true })) {
      if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue
      await collect(path.relative(root, path.join(absolutePath, entry.name)))
    }
  }
  for (const relativePath of paths) await collect(relativePath)
  const presetPath = 'vendor/z-runtime/apps/cli/config/agent-presets/taskweaver-readonly/agent.cordis.yml'
  try {
    if ((await fs.stat(path.join(root, presetPath))).isFile()) filePaths.add(presetPath)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }

  const runtimeFiles = ['package.json', 'taskweaver-runtime-meta.json']
  for (const file of runtimeFiles) {
    try {
      if ((await fs.stat(path.join(runtimeRoot, file))).isFile()) filePaths.add(path.relative(root, path.join(runtimeRoot, file)).replaceAll(path.sep, '/'))
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
  }
  try {
    for (const entry of await fs.readdir(path.join(runtimeRoot, 'lib'), { withFileTypes: true })) {
      if (entry.isFile()) filePaths.add(path.relative(root, path.join(runtimeRoot, 'lib', entry.name)).replaceAll(path.sep, '/'))
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }

  const hash = createHash('sha256')
  for (const relativePath of [...filePaths].sort()) {
    const absolutePath = path.isAbsolute(relativePath) ? relativePath : path.join(root, relativePath)
    hash.update(relativePath).update('\0').update(await fs.readFile(absolutePath)).update('\0')
  }
  return { sha256: hash.digest('hex'), fileCount: filePaths.size }
}

function record(event) {
  const elapsedMs = Date.now() - startedAt
  if (event.type === 'tasks') {
    tasks.splice(0, tasks.length, ...event.tasks)
    const taskStates = event.tasks.map(({ id, status }) => ({ id, status }))
    events.push({ elapsedMs, type: 'tasks', tasks: taskStates })
    for (const { id, status } of taskStates) {
      const timing = taskTimings.get(id) ?? { startedAtMs: null, finishedAtMs: null }
      if (status === 'running' && timing.startedAtMs === null) timing.startedAtMs = elapsedMs
      if (['done', 'review', 'cancelled'].includes(status) && timing.finishedAtMs === null) timing.finishedAtMs = elapsedMs
      taskTimings.set(id, timing)
    }
  }
  if (event.type === 'tool') {
    const toolEvent = {
      elapsedMs,
      type: 'tool',
      id: event.id ?? null,
      taskId: event.taskId ?? null,
      toolName: event.toolName,
      status: event.status,
      inputSummary: event.inputSummary ?? null,
      resultSummary: event.resultSummary ?? null,
      durationMs: event.durationMs ?? null,
    }
    events.push(toolEvent)
    console.log(JSON.stringify({ elapsedMs, taskId: event.taskId ?? null, tool: event.toolName, status: event.status, input: event.inputSummary ?? null, durationMs: event.durationMs ?? null }))
  } else if (event.type === 'progress') {
    events.push({ elapsedMs, type: 'progress', text: event.text })
    console.log(JSON.stringify({ elapsedMs, progress: event.text }))
  }
}

process.on('SIGINT', () => {
  interrupted = true
  void orchestration?.abort(conversationId).catch((error) => {
    console.warn(JSON.stringify({ status: 'abort-unconfirmed', message: error instanceof Error ? error.message : String(error) }))
  })
})

try {
  const [sourcePresetContent, runtimePresetContent] = await Promise.all([
    fs.readFile(sourceReadonlyPresetPath, 'utf8').catch(() => null),
    fs.readFile(runtimeReadonlyPresetPath, 'utf8').catch(() => null),
  ])
  readonlyPresetIntegrity = inspectReadonlyPresetIntegrity(sourcePresetContent, runtimePresetContent)
  if (readonlyPresetIntegrity.status !== 'verified') {
    throw new Error(`read-only preset source/deploy integrity check failed: ${readonlyPresetIntegrity.reason}`)
  }
  await fs.mkdir(path.join(reportDir, 'dsh'), { recursive: true })
  const initialReplayablePlan = loadedFrozenPlan ?? (!realPlanner ? fixedPlan : null)
  if (initialReplayablePlan) {
    await fs.writeFile(frozenPlanArtifactPath, `${JSON.stringify(initialReplayablePlan, null, 2)}\n`, { mode: 0o600 })
  }
  for (const file of ['settings.yaml', '.credentials.yaml']) {
    try {
      const destination = path.join(reportDir, 'dsh', file)
      await fs.copyFile(path.join(userData, 'dsh', file), destination)
      await fs.chmod(destination, 0o600)
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
  }

  const modelsDoc = JSON.parse(await fs.readFile(resolveTaskWeaverModelsPath(userData), 'utf8'))
  const modelsDocForSync = structuredClone(modelsDoc)
  for (const provider of Object.values(modelsDoc.providers ?? {})) {
    if (provider && typeof provider === 'object') delete provider.apiKey
  }
  await fs.mkdir(path.dirname(isolatedModelsPath), { recursive: true })
  await fs.writeFile(isolatedModelsPath, `${JSON.stringify(modelsDoc, null, 2)}\n`, { mode: 0o600 })
  try {
    await fs.copyFile(
      path.join(userData, 'taskweaver-model-profiles.json'),
      isolatedModelProfilesPath,
    )
    await fs.chmod(isolatedModelProfilesPath, 0o600)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }

  hostManager = createZHostManager({ runtimeRoot, userDataPath: reportDir, executable: process.execPath })
  let { api } = await hostManager.start()
  const sync = await ensureModelsJsonSyncedToDshHost({ hostManager, userDataPath: reportDir, modelsDocOverride: modelsDocForSync })
  if (sync.synced) ({ api } = await hostManager.start())

  const profileStore = createProfileStore(userData)
  if (thinkingOverride) {
    // Test-only in-memory override. Never writes the user's model profile.
    profileStore.getThinkingLevel = async () => thinkingOverride === 'default' ? null : thinkingOverride
  }
  modelService = createModelService({
    profileStore,
    priceRegistryPath: path.join(root, 'pricing', 'registry.json'),
    dshHostManager: hostManager,
    userDataPath: reportDir,
    dshRuntimeRoot: runtimeRoot,
  })
  const fullCatalog = await modelService.listCatalog()
  const model = fullCatalog.models.find((candidate) => candidate.key === modelKey)
  if (!model?.available || model.routeRegistered === false) throw new Error(`${modelKey} is not currently routable`)
  if (model.profile?.enabledForAllocation !== true) throw new Error(`${modelKey} is not enabled for subtask allocation`)
  const singleModelCatalog = { ...fullCatalog, models: [model] }

  chat = createDshChatService({
    hostManager,
    userDataPath: reportDir,
    modelService,
    profileStore,
    getWorkspacePath: () => root,
    getPermissionMode: () => 'ask',
  })
  const plannerSessionId = `live-dag-planner-${crypto.randomUUID()}`
  const isPlannerSession = (sessionKey) => String(sessionKey ?? '').endsWith('-planner') || String(sessionKey ?? '').endsWith('-planner-retry')
  const plannerCreated = realPlanner ? null : await api.sessions.create({ sessionId: plannerSessionId, cwd: root, agentPreset: 'taskweaver-planner' })
  if (!realPlanner && !plannerCreated?.result?.ok) throw new Error(plannerCreated?.result?.error?.message || 'Could not create isolated planner lineage session')

  const dshRuntime = {
    getSessionId(sessionKey) {
      if (isPlannerSession(sessionKey)) {
        return chat.getSessionId(sessionKey) || plannerCreated?.result?.value?.sessionId || null
      }
      return chat.getSessionId(sessionKey)
    },
    async runAgentTurn(payload) {
      if (isPlannerSession(payload.sessionKey)) {
        if (realPlanner) {
          const plannerStartedAt = Date.now()
          const result = await chat.runAgentTurn(payload)
          const responseText = String(result?.text ?? '')
          plannerRuns.push({
            sessionKey: payload.sessionKey,
            wallTimeMs: Date.now() - plannerStartedAt,
            text: responseText.slice(0, 12_000),
            truncated: responseText.length > 12_000,
            usage: result?.usage ?? null,
          })
          let plan
          try {
            plan = parsePlannerJson(responseText)
          } catch (error) {
            throw new Error(`MiMo planner did not return valid JSON: ${error instanceof Error ? error.message : String(error)}`)
          }
          if (plan.tasks.length < 1 || plan.tasks.some((task) => !['research', 'review'].includes(task.taskType))) {
            throw new Error('MiMo planner proposed a non-read-only or empty plan; refused to execute it')
          }
          plannerPlan = plan
          await fs.writeFile(frozenPlanArtifactPath, `${JSON.stringify(plan, null, 2)}\n`, { mode: 0o600 })
          return result
        }
        // Replay an explicitly frozen live plan, or the deterministic fixture.
        return {
          text: JSON.stringify(loadedFrozenPlan ?? fixedPlan),
          usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0, elapsedMs: 0 },
        }
      }
      return chat.runAgentTurn(payload)
    },
  }

  const webContents = { isDestroyed: () => false, send: (_channel, event) => record(event) }
  orchestration = createOrchestrationService({
    modelService: { listCatalog: async () => singleModelCatalog },
    profileStore,
    appState: { setTasks: async (next) => tasks.splice(0, tasks.length, ...next) },
    getWorkspacePath: () => root,
    getWorkspaceTrusted: () => false,
    agentDataPath: path.join(reportDir, 'agent-data'),
    userDataPath: reportDir,
    getAppPreferences: async () => ({ worktreeIsolation: false, subtaskUpgradeMax: 0 }),
    maxSubtaskConcurrency: serialFixedPlan ? 1 : null,
    dshRuntime,
  })

  startedAt = Date.now()
  console.log(JSON.stringify({ status: 'starting', reportDir, runtimeRoot, readonlyPresetIntegrity, modelKey, thinkingOverride: thinkingOverride ?? 'profile-default', workspace: root, taskCount: realPlanner ? 'MiMo-planned' : (loadedFrozenPlan ?? fixedPlan).tasks.length, realPlanner, plannerMode, executionConcurrency: serialFixedPlan ? 1 : 'default' }))
  heartbeat = setInterval(() => {
    const activeTasks = tasks.filter(({ status }) => status === 'running')
    console.log(JSON.stringify({ status: 'running', elapsedMs: Date.now() - startedAt, taskStates: tasks.map(({ id, status }) => ({ id, status })) }))
    for (const task of activeTasks) {
      const sessionId = chat.getSessionId(task.dshSessionKey)
      if (!sessionId) continue
      void api.sessions.history({ sessionId, maxMessages: 40 }).then((history) => {
        const rows = history.result?.value?.events ?? []
        const events = rows.map((row) => row.event).filter(Boolean)
        const latest = events.at(-1)
        console.log(JSON.stringify({
          status: 'agent-heartbeat', taskId: task.id, elapsedMs: Date.now() - startedAt,
          eventCount: events.length, lastSeq: latest?.seq ?? null, lastEvent: latest?.type ?? null,
          assistantChunks: events.filter((event) => event.type === 'assistant/chunk').length,
          toolCalls: events.filter((event) => event.type === 'tool/call').length,
          turnEnds: events.filter((event) => event.type === 'turn/end').length,
        }))
      }).catch((error) => {
        console.log(JSON.stringify({ status: 'agent-heartbeat-error', taskId: task.id, message: error instanceof Error ? error.message : String(error) }))
      })
    }
  }, 20_000)
  const outcome = await orchestration.planAndExecute({
    text: realPlanner || loadedFrozenPlan ? livePlannerRequestText : '只读分析当前毕设代码的应用启动入口和 Agent 请求链路，要求两项独立研究并行完成后交叉汇总。不得修改文件。',
    primaryModelKey: modelKey,
    conversationId,
    webContents,
    workspacePath: root,
  })
  orchestrationFinishedAt = Date.now()

  let plannerHostEvidence = null
  const livePlannerSessionId = realPlanner
    ? chat.getSessionId(plannerRuns.at(-1)?.sessionKey)
    : null
  const plannerHostSessionId = livePlannerSessionId || plannerCreated?.result?.value?.sessionId || null
  if (realPlanner) {
    if (!livePlannerSessionId) throw new Error('Live Planner session key was not mapped to its actual Host session')
    const plannerHistory = await api.sessions.history({ sessionId: livePlannerSessionId })
    if (!plannerHistory.result?.ok) throw new Error('Live Planner Host history unavailable; cannot verify a real model turn')
    const plannerEvents = (plannerHistory.result.value.events ?? []).map((row) => row.event).filter(Boolean)
    plannerHostEvidence = {
      sessionId: livePlannerSessionId,
      turnStarts: plannerEvents.filter((event) => event.type === 'turn/start').length,
      turnEnds: plannerEvents.filter((event) => event.type === 'turn/end').length,
      modelSteps: plannerEvents.filter((event) => event.type === 'step/start').length,
      assistantChunks: plannerEvents.filter((event) => event.type === 'assistant/chunk').length,
      requestHeaders: plannerEvents.filter((event) => event.type === 'request/header').map((event) => {
        const config = event.data?.header?.config ?? {}
        return {
          seq: event.seq ?? null,
          provider: typeof config.provider === 'string' ? config.provider : null,
          model: typeof config.model === 'string' ? config.model : null,
          reasoningEffort: typeof config.reasoningEffort === 'string' ? config.reasoningEffort : null,
        }
      }),
    }
    if (plannerHostEvidence.turnStarts < 1 || plannerHostEvidence.turnEnds < 1
      || plannerHostEvidence.modelSteps < 1 || plannerHostEvidence.assistantChunks < 1) {
      throw new Error('Planner request was not proven by Host turn/step/output events')
    }
  }

  const histories = taskHistories
  histories.length = 0
  for (const task of tasks) {
    const sessionId = chat.getSessionId(task.dshSessionKey)
    if (!sessionId) {
      histories.push({
        id: task.id,
        sessionId: null,
        preset: null,
        calls: [],
        turns: [],
        turnEnds: 0,
        blockedBeforeStart: task.status === 'review',
        requestEvidence: inspectChildRequestHeaders([], task.modelKey, thinkingOverride && thinkingOverride !== 'default' ? thinkingOverride : null),
        readOnlyToolAudit: auditReadOnlyToolEvents([]),
      })
      continue
    }
    const history = await api.sessions.history({ sessionId })
    if (!history.result?.ok) throw new Error(`${task.id} native history unavailable`)
    const entries = history.result.value.events.map((row) => row.event)
    const turns = []
    let openTurn = null
    for (const entry of entries) {
      if (entry.type === 'turn/start') openTurn = { startedAt: entry.time }
      if (entry.type === 'turn/end' && openTurn) {
        turns.push({ ...openTurn, finishedAt: entry.time, reason: entry.data?.reason?.kind ?? null })
        openTurn = null
      }
    }
    const calls = entries.filter((entry) => entry.type === 'tool/call').map((entry) => ({
      callId: entry.data?.callId,
      name: entry.data?.name,
      arguments: entry.data?.arguments,
      kind: 'native',
    })).concat(entries.filter((entry) => entry.type === 'tool/code-dispatch-start').map((entry) => ({
      callId: entry.data?.subCallId,
      parentCallId: entry.data?.parentCallId,
      name: entry.data?.name,
      arguments: entry.data?.arguments,
      kind: 'code-dispatch',
    })))
    const preset = (await api.sessions.list({})).result?.value?.items?.find((item) => item.sessionId === sessionId)?.agentPreset
    histories.push({
      id: task.id,
      sessionId,
      preset,
      calls,
      turns,
      turnEnds: entries.filter((entry) => entry.type === 'turn/end').length,
      requestEvidence: inspectChildRequestHeaders(entries, task.modelKey, thinkingOverride && thinkingOverride !== 'default' ? thinkingOverride : null),
      readOnlyToolAudit: auditReadOnlyToolEvents(entries),
    })
  }

  const readonlyTasks = histories.filter((item) => ['research', 'review'].includes(tasks.find((task) => task.id === item.id)?.taskType))
  const readonlyPresetSessionEvidence = inspectReadonlyPresetSessions(tasks, histories)
  for (const task of histories) {
    if (!task.sessionId) continue
    if (task.preset !== 'taskweaver-readonly') throw new Error(`${task.id} did not use taskweaver-readonly (got ${task.preset})`)
    if (task.readOnlyToolAudit.status !== 'verified') continue
    const nestedNames = task.readOnlyToolAudit.observed.filter((call) => call.kind === 'code-dispatch').map((call) => call.name)
    const outerNames = task.readOnlyToolAudit.observed.filter((call) => call.kind === 'native').map((call) => call.name)
    if (outerNames.some((name) => !READ_ONLY_TOOL_ALLOWLIST.has(name))
      || nestedNames.some((name) => !READ_ONLY_TOOL_ALLOWLIST.has(name))) {
      throw new Error(`${task.id} native tool audit contradicted the positive read-only allowlist`)
    }
  }
  for (const task of readonlyTasks) {
    if (!task.sessionId) continue
    const names = task.readOnlyToolAudit.observed.map((call) => call.name)
    if (!names.some((name) => ['read', 'grep', 'glob', 'find', 'ls'].includes(name))) {
      throw new Error(`${task.id} did not use any filesystem inspection tool`)
    }
    const taskState = tasks.find((item) => item.id === task.id)
    if (taskState?.status === 'done' && !names.includes('read')) {
      throw new Error(`${task.id} was marked done without a native-history read tool call`)
    }
  }
  for (const task of tasks) {
    const evidence = task.messages.at(-1)?.executionEvidence
    if (evidence?.source === 'z-host-tool-events'
      && JSON.stringify(task.executionEvidenceSummary) !== JSON.stringify(summarizeExecutionEvidence(evidence))) {
      throw new Error(`${task.id} evidence summary does not match its Host-observed tool events`)
    }
    if (['research', 'review'].includes(task.taskType) && task.status === 'done' && !(task.executionEvidenceSummary?.successfulReadCount > 0)) {
      throw new Error(`${task.id} was marked done without a Host-observed successful read`)
    }
  }
  const allTasksReturnedText = tasks.every((task) => task.status === 'done'
    && typeof task.messages.at(-1)?.text === 'string'
    && task.messages.at(-1).text.trim().length > 0
    && !task.messages.at(-1).text.includes('（Agent 未返回文本）'))
  const allTasksDone = tasks.length >= 2 && tasks.length <= 5
    && tasks.every((task) => task.status === 'done')
    && outcome.failedTaskIds.length === 0
    && allTasksReturnedText
  const safeStopReason = /Host 未记录到成功的文件读取|Host 拒绝了 \d+ 次超出只读子任务范围|重复的文件搜索循环|Z Agent 本轮被工具或安全策略阻止|Z Agent 本轮结束但没有生成最终文本/
  const safelyStopped = tasks.some((task) => ['research', 'review'].includes(task.taskType)
      && task.status === 'review'
      && safeStopReason.test(task.error ?? ''))
    && tasks.every((task) => task.status === 'done' || task.status === 'review')
    && tasks.filter((task) => !chat.getSessionId(task.dshSessionKey)).every((task) => task.status === 'review')
  if (!allTasksDone && !safelyStopped) {
    throw new Error(`DAG neither completed nor safely stopped on missing evidence or an Agent guard (failed=${outcome.failedTaskIds.join(',')})`)
  }
  const actualTaskSessions = histories.filter(({ sessionId }) => sessionId).map(({ sessionId }) => sessionId)
  if (new Set(actualTaskSessions).size !== actualTaskSessions.length) throw new Error('DAG task sessions were not independent')
  const historiesWithSessions = histories.filter((history) => history.sessionId)
  const childHostRouteEvidenceVerified = historiesWithSessions.length > 0
    && historiesWithSessions.every((history) => history.requestEvidence?.status === 'verified')
  const readOnlyToolCallsVerified = historiesWithSessions.length > 0
    && historiesWithSessions.every((history) => history.readOnlyToolAudit?.status === 'verified')
  const fixedT2History = histories.find((history) => history.id === 'T2')
  const fixedT2ToolDiscipline = plannerMode === 'fixed-fixture'
    ? auditFixedT2ToolDiscipline(fixedT2History?.calls ?? [])
    : { status: 'not-applicable', expectedSearchPaths: [], expectedReadCounts: {}, observedGrepCount: null, observedReadCount: null, preloadPatterns: [], serviceReadCount: null, issues: [] }
  const resolvedPlannerPlan = plannerPlan ?? loadedFrozenPlan ?? fixedPlan
  const plannerPlanHash = hashPlan(resolvedPlannerPlan)
  const livePlannerSourceVerified = plannerRuns.length > 0 && plannerHostEvidence?.turnStarts > 0 && plannerPlanHash.length === 64
  const fixedPlannerFixtureVerified = plannerRuns.length === 0 && plannerPlanHash === fixedPlanHash
  const frozenPlannerReplayVerified = plannerRuns.length === 0 && Boolean(loadedFrozenPlan) && plannerPlanHash === hashPlan(loadedFrozenPlan)
  const plannerSourceStatus = realPlanner ? (livePlannerSourceVerified ? 'verified' : 'failed') : 'not-applicable'
  const fixedPlannerFixtureStatus = plannerMode === 'fixed-fixture' ? (fixedPlannerFixtureVerified ? 'verified' : 'failed') : 'not-applicable'
  const fixedPlanToolDisciplineStatus = plannerMode === 'fixed-fixture' ? fixedT2ToolDiscipline.status : 'not-applicable'
  const frozenPlannerReplayStatus = plannerMode === 'frozen-replay' ? (frozenPlannerReplayVerified ? 'verified' : 'failed') : 'not-applicable'
  const taskRouteMetadataConsistent = tasks.every((task) => task.modelKey === modelKey)
  const verificationFailures = [
    ...(readonlyPresetIntegrity.status === 'verified' ? [] : ['source and deployed read-only preset hashes do not match']),
    ...(readonlyPresetSessionEvidence.status === 'verified' ? [] : [`research/review tasks did not load taskweaver-readonly in distinct Host sessions: ${readonlyPresetSessionEvidence.mismatches.join(', ') || 'no read-only tasks'}`]),
    ...(taskRouteMetadataConsistent ? [] : ['task route metadata does not match the smoke test model']),
    ...(plannerSourceStatus !== 'failed' ? [] : ['live Planner source was not proven by Host events and captured plan hash']),
    ...(fixedPlannerFixtureStatus !== 'failed' ? [] : ['fixed Planner fixture hash or absence of Planner run was not verified']),
    ...(fixedPlanToolDisciplineStatus !== 'failed' ? [] : [`fixed T2 tool-discipline audit failed (${fixedT2ToolDiscipline.issues.join('; ')})`]),
    ...(frozenPlannerReplayStatus !== 'failed' ? [] : ['frozen Planner replay hash or absence of a new Planner run was not verified']),
    ...historiesWithSessions.flatMap((history) => [
      ...(history.requestEvidence?.status === 'verified' ? [] : [`${history.id}: Host route evidence ${history.requestEvidence?.status ?? 'unverified'} (${(history.requestEvidence?.reasons ?? []).join('; ') || 'no evidence'})`]),
      ...(history.readOnlyToolAudit?.status === 'verified' ? [] : [`${history.id}: read-only tool audit ${history.readOnlyToolAudit?.status ?? 'unverified'} (${(history.readOnlyToolAudit?.issues ?? []).join('; ') || 'no evidence'})`]),
    ]),
  ]
  const timedTasks = [...taskTimings.entries()]
    .filter(([, timing]) => timing.startedAtMs !== null && timing.finishedAtMs !== null)
    .map(([id, timing]) => ({ id, ...timing }))
  const parallelOverlapMs = timedTasks.reduce((maximum, task, index) => Math.max(maximum,
    ...timedTasks.slice(index + 1).map((other) => Math.max(0,
      Math.min(task.finishedAtMs, other.finishedAtMs) - Math.max(task.startedAtMs, other.startedAtMs)))), 0)
  const parallelOverlapVerified = parallelOverlapMs > 0
  const taskTurns = histories.flatMap((history) => history.turns.map((turn) => ({ taskId: history.id, ...turn })))
  const concurrentAgentTurnOverlapMs = taskTurns.reduce((maximum, turn, index) => Math.max(maximum,
    ...taskTurns.slice(index + 1)
      .filter((other) => other.taskId !== turn.taskId)
      .map((other) => Math.max(0, Math.min(turn.finishedAt, other.finishedAt) - Math.max(turn.startedAt, other.startedAt)))), 0)
  const concurrentAgentTurnsVerified = concurrentAgentTurnOverlapMs > 0
  if (allTasksDone && !serialFixedPlan && !concurrentAgentTurnsVerified) {
    throw new Error('DAG tasks completed, but their persisted Agent turn intervals do not prove concurrent execution')
  }
  if (allTasksDone && serialFixedPlan && concurrentAgentTurnsVerified) {
    throw new Error('Serial benchmark run unexpectedly contains overlapping Agent turn intervals')
  }

  const elapsedMs = orchestrationFinishedAt - startedAt
  const plannerWallMs = plannerRuns.reduce((sum, plannerRun) => sum + (plannerRun.wallTimeMs ?? 0), 0)
  const taskStartTimes = timedTasks.map((task) => task.startedAtMs)
  const taskFinishTimes = timedTasks.map((task) => task.finishedAtMs)
  const taskExecutionWallMs = taskStartTimes.length ? Math.max(...taskFinishTimes) - Math.min(...taskStartTimes) : null
  const lastTaskFinishMs = taskFinishTimes.length ? Math.max(...taskFinishTimes) : null
  const plannerOutputProgressAtMs = events.find((event) => event.type === 'progress'
    && /Planner 正在整理任务计划/.test(event.text ?? ''))?.elapsedMs ?? null
  const synthesisStartedAtMs = events.findLast((event) => event.type === 'progress' && /正在汇总执行结果/.test(event.text ?? ''))?.elapsedMs ?? null
  const postTaskWallMs = lastTaskFinishMs === null ? null : Math.max(0, elapsedMs - lastTaskFinishMs)
  const workspaceSnapshot = await hashWorkspaceSnapshot(resolvedPlannerPlan)
  if (realPlanner && !plannerPlan) throw new Error('Live Planner output was not captured for reproducible replay')
  if (loadedFrozenPlan && plannerPlanHash !== hashPlan(loadedFrozenPlan)) throw new Error('Frozen Planner plan hash changed during replay')

  const report = {
    modelKey,
    thinkingOverride: thinkingOverride ?? 'profile-default',
    runtimeRoot,
    readonlyPresetIntegrity,
    readonlyPresetSessionEvidence,
    conversationId,
    elapsedMs,
    realPlanner,
    plannerMode,
    plannerPlanHash,
    plannerRequestHash: createHash('sha256').update(realPlanner || loadedFrozenPlan ? livePlannerRequestText : '只读分析当前毕设代码的应用启动入口和 Agent 请求链路，要求两项独立研究并行完成后交叉汇总。不得修改文件。').digest('hex'),
    workspaceSnapshotHash: workspaceSnapshot.sha256,
    workspaceSnapshotFileCount: workspaceSnapshot.fileCount,
    plannerArtifactPath: frozenPlanArtifactPath,
    plannerReplaySourcePath: frozenPlanPath,
    plannerInvocationCount: plannerRuns.length,
    plannerWallMs,
    plannerOutputProgressAtMs,
    plannerHostEvidence,
    executionConcurrency: serialFixedPlan ? 1 : 'default',
    taskExecutionWallMs,
    synthesisStartedAtMs,
    postTaskWallMs,
    plannerRuns,
    plannerSessionId: plannerHostSessionId,
    tasks: tasks.map(({ id, title, taskType, status, modelKey: routedModel, usage, messages, scopePaths }) => ({
      id,
      title,
      taskType,
      status,
      // task.modelKey is orchestration metadata; native request/header is the observed Host route.
      modelKey: routedModel,
      plannedModelKey: routedModel,
      routeSource: 'orchestration-task-metadata',
      scopePaths: Array.isArray(scopePaths) ? scopePaths : [],
      usage,
      resultText: messages.at(-1)?.text ?? '',
      executionEvidence: messages.at(-1)?.executionEvidence ?? null,
      evidenceAssessment: tasks.find((task) => task.id === id)?.executionEvidenceSummary ?? null,
      hostRequestEvidence: histories.find((history) => history.id === id)?.requestEvidence ?? null,
      readOnlyToolAudit: histories.find((history) => history.id === id)?.readOnlyToolAudit ?? null,
    })),
    taskHistories: histories,
    events,
    taskTimings: Object.fromEntries(taskTimings),
    parallelOverlapMs,
    concurrentAgentTurnOverlapMs,
    synthesis: outcome.assistant,
    modelVisibleToolSchemaEvidence: {
      status: 'not-asserted',
      reason: 'This smoke verifies observed native tool calls only; it does not claim which tool schema was visible to the model.',
    },
    fixedT2ToolDiscipline,
    checks: {
      readOnlyPresetBundleVerified: readonlyPresetIntegrity.status === 'verified',
      readOnlyPresetSessionsVerified: readonlyPresetSessionEvidence.status === 'verified',
      readOnlyPresets: readonlyPresetIntegrity.status === 'verified' && readonlyPresetSessionEvidence.status === 'verified',
      filesystemReadToolCallsObserved: histories.some((history) => history.readOnlyToolAudit?.observed?.some((call) => call.name !== 'run_code' && READ_ONLY_TOOL_ALLOWLIST.has(call.name))),
      noToolsOutsideAllowlist: readOnlyToolCallsVerified,
      toolEvidenceCaptured: tasks.filter((task) => chat.getSessionId(task.dshSessionKey)).every((task) => task.messages.at(-1)?.executionEvidence?.source === 'z-host-tool-events'),
      evidenceAssessmentConsistent: tasks.filter((task) => task.messages.at(-1)?.executionEvidence?.source === 'z-host-tool-events').every((task) => JSON.stringify(task.executionEvidenceSummary) === JSON.stringify(summarizeExecutionEvidence(task.messages.at(-1)?.executionEvidence))),
      taskRouteMetadataConsistent,
      childHostRouteEvidenceVerified,
      readOnlyToolCallsVerified,
      distinctSessions: new Set(actualTaskSessions).size === actualTaskSessions.length,
      parallelOverlapVerified,
      concurrentAgentTurnsVerified,
      plannerSourceStatus,
      plannerSourceVerified: realPlanner ? livePlannerSourceVerified : null,
      plannerPhaseProgressVerified: !realPlanner || plannerOutputProgressAtMs !== null,
      fixedPlannerFixtureStatus,
      fixedPlannerFixtureVerified: plannerMode === 'fixed-fixture' ? fixedPlannerFixtureVerified : null,
      fixedPlanToolDisciplineStatus,
      fixedPlanToolDisciplineVerified: plannerMode === 'fixed-fixture' ? fixedT2ToolDiscipline.status === 'verified' : null,
      frozenPlannerReplayStatus,
      frozenPlannerReplayVerified: plannerMode === 'frozen-replay' ? frozenPlannerReplayVerified : null,
      serialNoOverlapVerified: !serialFixedPlan || !concurrentAgentTurnsVerified,
      allTasksDone,
      allTasksReturnedText,
      safelyStopped,
    },
  }
  await fs.writeFile(path.join(reportDir, 'report.json'), JSON.stringify(report, null, 2), { mode: 0o600 })
  const checksPassed = report.checks.allTasksDone && taskRouteMetadataConsistent
    && childHostRouteEvidenceVerified && readOnlyToolCallsVerified
    && report.checks.readOnlyPresets
    && plannerSourceStatus !== 'failed'
    && fixedPlannerFixtureStatus !== 'failed'
    && fixedPlanToolDisciplineStatus !== 'failed'
    && frozenPlannerReplayStatus !== 'failed'
    && report.checks.plannerPhaseProgressVerified
  const status = checksPassed ? 'completed' : verificationFailures.length ? 'verification-failed' : report.checks.safelyStopped ? 'evidence-gated' : 'incomplete'
  console.log(JSON.stringify({ status, reportPath: path.join(reportDir, 'report.json'), elapsedMs: report.elapsedMs, plannerOutputProgressAtMs, parallelOverlapMs, parallelOverlapVerified, concurrentAgentTurnOverlapMs, concurrentAgentTurnsVerified, tasks: report.tasks.map(({ id, status, plannedModelKey, hostRequestEvidence, readOnlyToolAudit }) => ({ id, status, plannedModelKey, hostRequestEvidenceStatus: hostRequestEvidence?.status ?? 'unverified', readOnlyToolAuditStatus: readOnlyToolAudit?.status ?? 'unverified' })), verificationFailures, synthesis: outcome.assistant.text }))
  if (!checksPassed) process.exitCode = 1
} catch (error) {
  await fs.writeFile(path.join(reportDir, 'failure.json'), JSON.stringify({
    modelKey,
    realPlanner,
    readonlyPresetIntegrity,
    plannerRuns,
    taskHistories,
    conversationId,
    elapsedMs: startedAt ? Date.now() - startedAt : null,
    interrupted,
    error: error.message,
    tasks,
    events,
  }, null, 2), { mode: 0o600 })
  console.error(JSON.stringify({ status: 'failed', reportDir, error: error.message }))
  process.exitCode = 1
} finally {
  clearInterval(heartbeat)
  try {
    await chat?.stop()
    if (!chat) await hostManager?.stop()
  } finally {
    try {
      await modelService?.dispose()
    } finally {
      for (const file of ['.credentials.yaml', 'settings.yaml']) {
        await fs.unlink(path.join(reportDir, 'dsh', file)).catch((error) => { if (error.code !== 'ENOENT') throw error })
      }
      for (const file of [isolatedModelsPath, isolatedModelProfilesPath]) {
        await fs.unlink(file).catch((error) => { if (error.code !== 'ENOENT') throw error })
      }
    }
  }
  if (interrupted) process.exitCode = 130
}
