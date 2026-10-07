import fs from 'node:fs/promises'
import { createHash, randomInt, randomUUID } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createZHostManager } from '../electron/agent/z-host/index.mjs'
import { createDshChatService } from '../electron/backend/dsh-chat-service.mjs'
import { dshPermissionPresetForMode } from '../electron/backend/dsh-permission-map.mjs'
import { createModelService } from '../electron/backend/model-service.mjs'
import { createProfileStore } from '../electron/backend/profile-store.mjs'
import { resolveTaskWeaverModelsPath } from '../electron/backend/taskweaver-models-path.mjs'
import { ensureModelsJsonSyncedToDshHost } from '../electron/backend/sync-models-json-to-host.mjs'
import { summarizeHostStepTimings } from './host-step-timings.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const userData = path.join(os.homedir(), 'Library', 'Application Support', 'taskweaver-desktop')
const runtimeRoot = process.env.TASKWEAVER_Z_RUNTIME
  ? path.resolve(process.env.TASKWEAVER_Z_RUNTIME)
  : path.join(root, 'vendor', 'taskweaver-z-runtime')
const permissionMode = 'readonly'
const agentPreset = 'taskweaver-benchmark-readonly'
const selectedModelKey = 'xiaomi/mimo-v2.6-flash'
const userText = '只读 package.json，说明 Electron 主进程入口是什么、开发模式怎样启动主进程和前端。只根据该文件回答，引用行号；不要读取其它文件，不要使用外部来源，不要执行命令或修改文件。'
const requestedThinking = 'medium'
const rounds = process.argv.includes('--rounds')
  ? Number(process.argv[process.argv.indexOf('--rounds') + 1])
  : 1
if (!Number.isInteger(rounds) || rounds < 1 || rounds > 10) throw new Error('--rounds must be an integer from 1 to 10')
const SAMPLE_TIMEOUT_MS = 5 * 60_000
const reportDir = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-agent-path-pair-'))
const hostHome = path.join(reportDir, 'host-home')
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const hash = (value) => createHash('sha256').update(value).digest('hex')
const benchmarkPreset = `- id: persona
  name: '@z/dsh-persona'
  config:
    text: >-
      You are a read-only local-code benchmark agent. Use only the assigned workspace file and cite exact line numbers.
      Do not use external sources, disclose workspace contents, or perform any mutation.
- id: agent-instructions
  name: '@z/dsh-agent-instructions'
  config:
    maxBytes: 65536
- id: tool-fs
  name: '@z/dsh-tool-fs'
  config:
    mutations: false
    readLimit: 600
- id: tool-presentation
  name: '@z/dsh-agent-tool-presentation'
  config:
    mode: native
`
const benchmarkPresetHash = hash(benchmarkPreset)
const safeHostEnvironment = Object.fromEntries([
  'PATH', 'HOME', 'TMPDIR', 'TMP', 'TEMP', 'LANG', 'LC_ALL', 'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY',
  'http_proxy', 'https_proxy', 'no_proxy', 'SSL_CERT_FILE', 'SSL_CERT_DIR', 'NODE_EXTRA_CA_CERTS',
].flatMap((key) => typeof process.env[key] === 'string' ? [[key, process.env[key]]] : []))
const unwrap = (reply, label) => {
  if (reply?.result?.ok !== true) throw new Error(`${label}: ${reply?.result?.error?.message ?? 'Host request failed'}`)
  return reply.result.value
}
const eventRows = (history) => history?.result?.value?.events?.map((row) => row.event) ?? []
const textFromContent = (content) => Array.isArray(content)
  ? content.map((block) => typeof block?.text === 'string' ? block.text : '').join('')
  : ''
const extractAssistantText = (events, turn) => events
  .filter((event) => event.type === 'assistant/message' && event.data?.turn === turn)
  .map((event) => textFromContent(event.data?.message?.content))
  .join('')
const extractUserText = (event) => textFromContent(event?.data?.content)
const routeEvidence = (events, startTime, endTime, expectedRoute, expectedEffort) => {
  const observed = events.filter((event) => event.type === 'request/header'
    && event.time >= startTime && event.time <= endTime)
    .map((event) => {
      const config = event.data?.header?.config ?? {}
      return { provider: config.provider ?? null, model: config.model ?? null, reasoningEffort: config.reasoningEffort ?? null }
    })
  const reasons = []
  if (!observed.length) reasons.push('no native request/header event in the measured turn')
  for (const route of observed) {
    if (route.provider !== expectedRoute.provider || route.model !== expectedRoute.model) reasons.push('observed provider/model differs from the selected route')
    if ((route.reasoningEffort ?? null) !== (expectedEffort ?? null)) reasons.push('observed reasoningEffort differs from the requested effort')
  }
  return { status: reasons.length ? 'failed' : 'verified', expected: { ...expectedRoute, reasoningEffort: expectedEffort }, observed, reasons }
}

let hostManager
let modelService
let chat
let heartbeat
let modelDocForSync
let selectedEffort
let modelConfig
let currentSample = null
const samples = []
let interrupted = false
let api

const onSignal = (signal) => {
  interrupted = true
  process.exitCode = signal === 'SIGINT' ? 130 : 143
  const sessionId = currentSample?.sessionId
    ?? (currentSample?.conversationId ? chat?.getSessionId(currentSample.conversationId) : null)
  if (sessionId && api) void api.sessions.cancel({ sessionId, clearPendingUserInput: true }).catch(() => {})
  void hostManager?.stop().catch(() => {})
}
process.once('SIGINT', onSignal)
process.once('SIGTERM', onSignal)

async function getHistory(api, sessionId) {
  const reply = await api.sessions.history({ sessionId })
  unwrap(reply, 'read session history')
  return reply
}

function withSampleTimeout(promise, { sessionId, conversationId }) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(async () => {
      const activeSessionId = sessionId ?? (conversationId ? chat?.getSessionId(conversationId) : null)
      if (activeSessionId && api) {
        await Promise.race([
          api.sessions.cancel({ sessionId: activeSessionId, clearPendingUserInput: true }).catch(() => {}),
          delay(3_000),
        ])
      }
      const error = new Error(`sample exceeded ${SAMPLE_TIMEOUT_MS}ms; session cancellation requested`)
      error.code = 'SMOKE_SAMPLE_TIMEOUT'
      reject(error)
    }, SAMPLE_TIMEOUT_MS)
    timer.unref?.()
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

function summarizeIpcMetrics(metrics) {
  if (!metrics) return null
  return {
    firstThinkingMs: metrics.firstThinkingMs,
    firstTextMs: metrics.firstTextMs,
    reasoningChars: metrics.reasoningChars,
    toolEventCount: metrics.toolEvents.length,
    toolNames: [...new Set(metrics.toolEvents.map((event) => event.toolName).filter(Boolean))],
    retryCount: metrics.retries.length,
    lifecycleStartAt: metrics.lifecycleStartAt,
  }
}

function summarizeRun({ id, pathKind, sessionId, startedAt, promptStartedAt, finishedAt, historyReply, preset, permissionPreset, cwd, resultText, ipcMetrics = null }) {
  const events = eventRows(historyReply)
  const lastTurnEnd = events.findLast((event) => event.type === 'turn/end')
  const turn = lastTurnEnd?.data?.turn ?? null
  const turnStart = events.find((event) => event.type === 'turn/start' && event.data?.turn === turn)
  const turnStartAt = turnStart?.time ?? promptStartedAt
  const turnEndAt = lastTurnEnd?.time ?? finishedAt
  const measuredEvents = events.filter((event) => event.data?.turn === turn)
  const headers = routeEvidence(events, turnStartAt, turnEndAt, {
    provider: modelConfig.provider,
    model: modelConfig.id,
  }, selectedEffort)
  const toolCalls = measuredEvents.filter((event) => event.type === 'tool/call').map((event) => ({
    name: event.data?.name ?? null,
    arguments: event.data?.arguments ?? null,
  }))
  // The filesystem plugin always exposes image inspection alongside text read;
  // it is read-only and is not called by this package.json-only task.
  const allowedToolNames = new Set(['read', 'read_image'])
  const safeToolsOnly = toolCalls.every((call) => allowedToolNames.has(call.name))
  const requestToolNames = [...new Set(events
    .filter((event) => event.type === 'request/header' && event.time >= turnStartAt && event.time <= turnEndAt)
    .flatMap((event) => event.data?.header?.tools ?? [])
    .map((tool) => tool?.name ?? tool?.function?.name)
    .filter((name) => typeof name === 'string'))].sort()
  const expectedToolsOnly = requestToolNames.length > 0 && requestToolNames.every((name) => allowedToolNames.has(name))
  const firstText = measuredEvents.find((event) => event.type === 'assistant/chunk' && event.data?.chunk?.type === 'text-delta')
  const firstThinking = measuredEvents.find((event) => event.type === 'assistant/chunk' && event.data?.chunk?.type === 'reasoning-delta')
  const assistantEvents = measuredEvents.filter((event) => event.type === 'assistant/message')
  const usage = assistantEvents.reduce((total, event) => {
    const usage = event.data?.usage ?? event.data?.message?.usage ?? {}
    total.inputTokens += Number(usage.inputTokens ?? usage.input ?? 0) || 0
    total.outputTokens += Number(usage.outputTokens ?? usage.output ?? 0) || 0
    total.cacheReadTokens += Number(usage.cacheReadTokens ?? usage.cacheRead ?? 0) || 0
    total.cacheWriteTokens += Number(usage.cacheWriteTokens ?? usage.cacheWrite ?? 0) || 0
    return total
  }, { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 })
  const finalText = typeof resultText === 'string' ? resultText : extractAssistantText(events, turn)
  const turnEndReason = lastTurnEnd?.data?.reason?.kind ?? null
  const submittedUserMessage = events.findLast((event) => event.type === 'user/message'
    && extractUserText(event) === userText)
  const exactAssignedFileOnly = toolCalls.length > 0 && toolCalls.every((call) => {
    if (call.name !== 'read') return false
    try {
      const args = JSON.parse(call.arguments ?? '{}')
      const requestedPath = args.file_path ?? args.path
      return typeof requestedPath === 'string'
        && path.resolve(root, requestedPath) === path.resolve(root, 'package.json')
    } catch { return false }
  })
  const outputQuality = finalText.includes('electron/main.cjs')
    && finalText.includes('dev:web')
    && finalText.includes('dev:electron')
    && /(?:package\.json:|L\d+|第\s*\d+\s*行)/i.test(finalText)
  return {
    id,
    pathKind,
    sessionId,
    agentPreset: preset ?? null,
    permissionPreset: permissionPreset ?? null,
    cwd: cwd ?? null,
    elapsedMs: finishedAt - startedAt,
    setupMs: promptStartedAt - startedAt,
    hostTurnMs: turnStartAt && turnEndAt ? Math.max(0, turnEndAt - turnStartAt) : null,
    firstThinkingMs: firstThinking && turnStartAt ? Math.max(0, firstThinking.time - turnStartAt) : null,
    firstTextMs: firstText && turnStartAt ? Math.max(0, firstText.time - turnStartAt) : null,
    firstTextFromSampleMs: firstText ? Math.max(0, firstText.time - startedAt) : null,
    steps: measuredEvents.filter((event) => event.type === 'step/start').length,
    retryScheduledCount: measuredEvents.filter((event) => event.type === 'llm/retry').length,
    retryStartedCount: measuredEvents.filter((event) => event.type === 'llm/retry-started').length,
    requestHeaders: headers,
    hostStepTimings: summarizeHostStepTimings(events, turnStartAt),
    toolCalls: toolCalls.map((call) => {
      let args = {}
      try { args = JSON.parse(call.arguments ?? '{}') } catch { /* omit malformed arguments */ }
      const safeArgs = Object.fromEntries(['file_path', 'path', 'offset', 'limit']
        .filter((key) => typeof args[key] === 'string' || Number.isFinite(args[key]))
        .map((key) => [key, args[key]]))
      return { name: call.name, arguments: safeArgs }
    }),
    exposedTools: requestToolNames,
    usage,
    userMessageMatchesPrompt: Boolean(submittedUserMessage),
    answerCharCount: finalText.length,
    answerSha256: hash(finalText),
    turnEndReason,
    checks: {
      routeVerified: headers.status === 'verified',
      agentPresetVerified: preset === agentPreset,
      readonlyPermissionVerified: permissionPreset === dshPermissionPresetForMode(permissionMode),
      workspaceVerified: cwd === root,
      completedNormally: turnEndReason === 'completed',
      toolSurfaceRestricted: expectedToolsOnly,
      packageReadObserved: exactAssignedFileOnly,
      noMutationTools: safeToolsOnly && exactAssignedFileOnly,
      answerQuality: outputQuality,
      submittedPromptMatches: Boolean(submittedUserMessage),
    },
    ...(ipcMetrics ? { ipcMetrics } : {}),
  }
}

try {
  await fs.mkdir(path.join(hostHome, 'dsh', '.agent-presets', agentPreset), { recursive: true, mode: 0o700 })
  const userPresetPath = path.join(hostHome, 'dsh', '.agent-presets', agentPreset, 'agent.cordis.yml')
  await fs.writeFile(userPresetPath, benchmarkPreset, { mode: 0o600 })
  for (const file of ['settings.yaml', '.credentials.yaml']) {
    try {
      const destination = path.join(hostHome, 'dsh', file)
      await fs.copyFile(path.join(userData, 'dsh', file), destination)
      await fs.chmod(destination, 0o600)
    } catch (error) { if (error.code !== 'ENOENT') throw error }
  }
  try {
    const sourceModels = JSON.parse(await fs.readFile(resolveTaskWeaverModelsPath(userData), 'utf8'))
    modelDocForSync = structuredClone(sourceModels)
    const sanitized = structuredClone(sourceModels)
    const selectedProvider = selectedModelKey.split('/')[0]
    for (const [providerId, provider] of Object.entries(modelDocForSync.providers ?? {})) {
      if (providerId !== selectedProvider && provider && typeof provider === 'object') delete provider.apiKey
    }
    for (const provider of Object.values(sanitized.providers ?? {})) {
      if (provider && typeof provider === 'object') delete provider.apiKey
    }
    const isolatedModelsPath = resolveTaskWeaverModelsPath(hostHome)
    await fs.mkdir(path.dirname(isolatedModelsPath), { recursive: true })
    await fs.writeFile(isolatedModelsPath, `${JSON.stringify(sanitized, null, 2)}\n`, { mode: 0o600 })
  } catch (error) { if (error.code !== 'ENOENT') throw error }

  hostManager = createZHostManager({ runtimeRoot, userDataPath: hostHome, executable: process.execPath, environment: safeHostEnvironment })
  let started = await hostManager.start()
  api = started.api
  const sync = await ensureModelsJsonSyncedToDshHost({ hostManager, userDataPath: hostHome, modelsDocOverride: modelDocForSync })
  if (sync.synced) ({ api } = await hostManager.start())

  const profileStore = createProfileStore(userData)
  profileStore.getThinkingLevel = async () => requestedThinking
  modelService = createModelService({
    profileStore,
    priceRegistryPath: path.join(root, 'pricing', 'registry.json'),
    dshHostManager: hostManager,
    userDataPath: hostHome,
    dshRuntimeRoot: runtimeRoot,
  })
  modelConfig = await modelService.getDshModelConfig(selectedModelKey)
  const providerDirectory = unwrap(await api.llm.providers({}), 'read provider directory')
  const provider = providerDirectory.providers?.find((item) => item.provider === modelConfig.provider)
  if (!provider?.active) throw new Error(`Host provider is not active: ${modelConfig.provider}`)
  const configuredAuth = await modelService.listProvidersAuth()
  if (!configuredAuth.some((item) => item.id === modelConfig.provider && item.configured)) {
    throw new Error(`Provider credentials are unavailable for ${modelConfig.provider}`)
  }
  const requestedEffort = await profileStore.getThinkingLevel?.(selectedModelKey) ?? null
  const supportedEfforts = modelConfig.supportedThinkingLevels
  selectedEffort = modelConfig.reasoning === false
    ? null
    : requestedEffort && Array.isArray(supportedEfforts) && !supportedEfforts.includes(requestedEffort)
      ? (supportedEfforts.includes(modelConfig.defaultThinkingLevel) ? modelConfig.defaultThinkingLevel : null)
      : requestedEffort

  chat = createDshChatService({
    hostManager,
    userDataPath: hostHome,
    modelService,
    profileStore,
    getWorkspacePath: () => root,
    getPermissionMode: () => permissionMode,
  })
  const snapshotPath = path.join(root, 'package.json')
  const [writtenPreset, snapshotBytes] = await Promise.all([fs.readFile(userPresetPath), fs.readFile(snapshotPath)])
  if (hash(writtenPreset) !== benchmarkPresetHash) throw new Error('Temporary benchmark preset does not match its reviewed contents')
  const presetReadback = unwrap(await api.agentPresets.read({ agentPreset }), 'read temporary benchmark preset')
  if (presetReadback.content !== benchmarkPreset || presetReadback.trust !== 'user') {
    throw new Error('Host did not load the exact temporary read-only benchmark preset')
  }
  if (/tool-web|tool-bash|tool-skill|tool-fs-search|mutations:\s*true/.test(presetReadback.content)) {
    throw new Error('Temporary benchmark preset unexpectedly exposes non-read tools, network, shell, skills, or mutations')
  }
  const snapshotHash = hash(snapshotBytes)
  const promptHash = hash(userText)
  const orderByRound = Array.from({ length: rounds }, () => randomInt(2) === 0
    ? ['taskweaver-service', 'host-native']
    : ['host-native', 'taskweaver-service'])
  console.log(JSON.stringify({
    status: 'starting', reportDir, runtimeRoot, cwd: root, rounds, orderByRound,
    modelKey: selectedModelKey, thinking: selectedEffort, agentPreset, permissionMode,
    promptSha256: promptHash, userTextBytes: Buffer.byteLength(userText, 'utf8'),
    packageJsonSha256: snapshotHash, benchmarkPresetSha256: benchmarkPresetHash,
    hostPid: hostManager.pid ?? null,
  }))
  heartbeat = setInterval(() => console.log(JSON.stringify({
    status: 'running',
    completedSamples: samples.length,
    currentSample: currentSample ? { id: currentSample.id, pathKind: currentSample.pathKind, elapsedMs: Date.now() - currentSample.startedAt } : null,
  })), 20_000)

  for (let round = 1; round <= rounds; round += 1) {
    for (const pathKind of orderByRound[round - 1]) {
      const livePackageHash = hash(await fs.readFile(snapshotPath))
      if (livePackageHash !== snapshotHash) throw new Error('package.json changed during the paired run; refusing a mismatched comparison')
      const id = `round-${round}-${pathKind}`
      currentSample = { id, pathKind, startedAt: Date.now() }
      const startedAt = Date.now()
      let promptStartedAt = startedAt
      let sessionId = null
      let permissionPreset = null
      let preset = null
      let resultText = ''
      let ipcMetrics = null
      try {
        if (pathKind === 'taskweaver-service') {
          const conversationId = `path-pair-${randomUUID()}`
          currentSample.conversationId = conversationId
          ipcMetrics = { firstThinkingMs: null, firstTextMs: null, reasoningChars: 0, toolEvents: [], retries: [], lifecycleStartAt: null }
          const webContents = {
            isDestroyed: () => false,
            send(_channel, event) {
              const now = Date.now()
              if (event.type === 'start') ipcMetrics.lifecycleStartAt ??= event.startedAt ?? now
              if (event.type === 'thinking_delta') {
                ipcMetrics.firstThinkingMs ??= now - startedAt
                ipcMetrics.reasoningChars += event.delta?.length ?? 0
              }
              if (event.type === 'delta') ipcMetrics.firstTextMs ??= now - startedAt
              if (event.type === 'tool' || event.type === 'retry') {
                ;(event.type === 'tool' ? ipcMetrics.toolEvents : ipcMetrics.retries).push({ elapsedMs: now - startedAt, ...event })
              }
            },
          }
          promptStartedAt = Date.now()
          const result = await withSampleTimeout(chat.send({
            conversationId,
            modelKey: selectedModelKey,
            webContents,
            cwdOverride: root,
            agentPreset,
            text: userText,
          }), { conversationId })
          resultText = result?.text ?? ''
          sessionId = chat.getSessionId(conversationId)
          currentSample.sessionId = sessionId
          promptStartedAt = ipcMetrics.lifecycleStartAt ?? promptStartedAt
          if (!sessionId) throw new Error('TaskWeaver service completed without a Host session ID')
          const historyReply = await getHistory(api, sessionId)
          const sessions = unwrap(await api.sessions.list({}), 'list Host sessions')
          const session = sessions.items?.find((item) => item.sessionId === sessionId)
          preset = session?.agentPreset ?? null
          const cwd = session?.cwd ?? null
          const permissions = historyReply.result?.value?.projections?.values?.permissions?.currentValue ?? null
          permissionPreset = permissions
          samples.push(summarizeRun({ id, pathKind, sessionId, startedAt, promptStartedAt, finishedAt: Date.now(), historyReply, preset, permissionPreset, cwd, resultText, ipcMetrics: summarizeIpcMetrics(ipcMetrics) }))
        } else {
          sessionId = `path-pair-native-${randomUUID()}`
          currentSample.sessionId = sessionId
          unwrap(await api.sessions.create({ sessionId, cwd: root, agentPreset }), 'create native Host session')
          const command = unwrap(await api.sessions.prompt({
            sessionId,
            mode: 'queue',
            content: [{ type: 'text', text: `/permission ${dshPermissionPresetForMode(permissionMode)}` }],
            clientTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          }), 'apply native Host permission')
          if (command.command?.kind !== 'success') throw new Error('Host did not confirm read-only permission')
          let permissionHistory = await getHistory(api, sessionId)
          permissionPreset = permissionHistory.result?.value?.projections?.values?.permissions?.currentValue ?? null
          if (permissionPreset !== dshPermissionPresetForMode(permissionMode)) throw new Error('Host permission projection does not match read-only mode')
          const selection = unwrap(await api.sessions.selectModel({
            sessionId,
            provider: modelConfig.provider,
            model: modelConfig.id,
            ...(selectedEffort ? { reasoningEffort: selectedEffort } : {}),
          }), 'select native Host model')
          void selection
          permissionHistory = await getHistory(api, sessionId)
          const baselineSeq = eventRows(permissionHistory).reduce((max, event) => Math.max(max, event.seq ?? -1), -1)
          promptStartedAt = Date.now()
          const directTurn = (async () => {
            unwrap(await api.sessions.prompt({
            sessionId,
            mode: 'queue',
            content: [{ type: 'text', text: userText }],
            clientTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            }), 'send direct Host prompt')
            while (true) {
              if (interrupted) throw new Error('benchmark interrupted by signal')
              const historyReply = await getHistory(api, sessionId)
              const events = eventRows(historyReply)
              if (events.some((event) => event.type === 'turn/end' && event.seq > baselineSeq)) return historyReply
              await delay(250)
            }
          })()
          const historyReply = await withSampleTimeout(directTurn, { sessionId })
          const sessions = unwrap(await api.sessions.list({}), 'list Host sessions')
          const session = sessions.items?.find((item) => item.sessionId === sessionId)
          preset = session?.agentPreset ?? null
          const cwd = session?.cwd ?? null
          samples.push(summarizeRun({ id, pathKind, sessionId, startedAt, promptStartedAt, finishedAt: Date.now(), historyReply, preset, permissionPreset, cwd }))
        }
        const sample = samples.at(-1)
        console.log(JSON.stringify({ status: 'sample-completed', id, pathKind, elapsedMs: sample.elapsedMs, hostTurnMs: sample.hostTurnMs, firstTextMs: sample.firstTextMs, steps: sample.steps, toolCalls: sample.toolCalls, checks: sample.checks }))
      } catch (error) {
        const failure = { id, pathKind, status: 'failed', elapsedMs: Date.now() - startedAt, sessionId, error: error instanceof Error ? error.message : String(error) }
        samples.push(failure)
        console.error(JSON.stringify(failure))
        if (error?.code === 'SMOKE_SAMPLE_TIMEOUT' || interrupted) throw error
      } finally {
        currentSample = null
      }
    }
  }

  const completedPairs = Array.from({ length: rounds }, (_, index) => {
    const pair = samples.filter((sample) => sample.id.startsWith(`round-${index + 1}-`))
    return {
      round: index + 1,
      order: orderByRound[index],
      samples: pair.map((sample) => sample.id),
      bothVerified: pair.length === 2 && pair.every((sample) => Object.values(sample.checks ?? {}).every(Boolean)),
    }
  })
  const checksPassed = !interrupted && samples.length === rounds * 2
    && samples.every((sample) => sample.status !== 'failed'
      && Object.values(sample.checks).every(Boolean))
  const report = {
    status: checksPassed ? (rounds < 5 ? 'pilot-completed' : 'paired-samples-collected') : 'verification-failed',
    inference: rounds < 5 ? 'pilot only; do not infer a performance winner' : 'paired observations; report descriptive statistics only',
    comparisonScope: 'chat.send service adapter versus native Host API; does not exercise the full register-ipc prompt pipeline',
    modelKey: selectedModelKey,
    provider: modelConfig.provider,
    model: modelConfig.id,
    reasoningEffort: selectedEffort,
    agentPreset,
    permissionMode,
    promptSha256: promptHash,
    userTextBytes: Buffer.byteLength(userText, 'utf8'),
    cwd: root,
    packageJsonSha256: snapshotHash,
    runtimeRoot,
    benchmarkPresetSha256: benchmarkPresetHash,
    hostPid: hostManager.pid ?? null,
    rounds,
    orderByRound,
    completedPairs,
    samples,
  }
  const reportPath = path.join(reportDir, 'report.json')
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2), { mode: 0o600 })
  console.log(JSON.stringify({ status: report.status, reportPath, rounds, orderByRound, samples: samples.map((sample) => ({ id: sample.id, status: sample.status ?? (Object.values(sample.checks ?? {}).every(Boolean) ? 'verified' : 'verification-failed'), pathKind: sample.pathKind, elapsedMs: sample.elapsedMs, hostTurnMs: sample.hostTurnMs, firstTextMs: sample.firstTextMs, steps: sample.steps, toolCallCount: sample.toolCalls?.length ?? null, checks: sample.checks ?? null })) }))
  if (!checksPassed) process.exitCode = 1
} catch (error) {
  await fs.writeFile(path.join(reportDir, 'failure.json'), JSON.stringify({
    modelKey: selectedModelKey ?? null,
    thinking: selectedEffort ?? null,
    reportDir,
    runtimeRoot,
    samples,
    error: error instanceof Error ? error.message : String(error),
  }, null, 2), { mode: 0o600 })
  console.error(JSON.stringify({ status: 'failed', reportDir, error: error instanceof Error ? error.message : String(error) }))
  process.exitCode = 1
} finally {
  clearInterval(heartbeat)
  process.removeListener('SIGINT', onSignal)
  process.removeListener('SIGTERM', onSignal)
  try {
    if (chat) await chat.stop()
  } finally {
    await hostManager?.stop()
    try { await modelService?.dispose() }
    finally { await fs.rm(hostHome, { recursive: true, force: true }) }
  }
}
