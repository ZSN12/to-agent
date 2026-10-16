import fs from 'node:fs/promises'
import { writeSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createZApiClient, createZHostManager } from '../../backend/agent/z-host/index.mjs'
import { createDshChatService } from '../../backend/dsh-chat-service.mjs'
import { createOrchestrationService } from '../../backend/orchestration-service.mjs'
import { createModelService } from '../../backend/model-service.mjs'
import { createProfileStore } from '../../backend/profile-store.mjs'
import { createAppStateStore } from '../../backend/app-state-store.mjs'
import { createAppPreferencesStore } from '../../backend/app-preferences.mjs'
import { createPermissionService } from '../../backend/permission-service.mjs'
import { resolveTaskWeaverModelsPath } from '../../backend/taskweaver-models-path.mjs'
import { ensureModelsJsonSyncedToDshHost } from '../../backend/sync-models-json-to-host.mjs'
import { setOcxRuntimeContext } from '../../backend/opencodex-binary.mjs'
import { resolvePermissionPrompt } from '../../backend/permission-prompt-bridge.mjs'
import { summarizeHostStepTimings } from '../host-step-timings.mjs'
import { assembleWorkspaceContext } from '../../backend/context-assembler.mjs'
import { parseHeadlessTaskTimeout } from '../headless-run-options.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
function isInsideRoot(candidate) {
  const relative = path.relative(root, path.resolve(candidate))
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}
const installedAppRoot = process.env.TASKWEAVER_APP_PATH || '/Applications/TaskWeaver.app'
const installedResourcesPath = path.join(installedAppRoot, 'Contents', 'Resources')
const arg = (name) => {
  const index = process.argv.indexOf(name)
  const value = process.argv[index + 1]
  if (index < 0 || !value || value.startsWith('--')) throw new Error(`Missing value for ${name}`)
  return value
}
const installed = process.argv.includes('--installed')
const isolated = installed || process.argv.includes('--local')
const fixture = process.argv.includes('--fixture')
const taskTimeoutMs = parseHeadlessTaskTimeout(process.argv.slice(2))
let workspacePath = process.argv.includes('--workspace') ? path.resolve(arg('--workspace')) : root
setOcxRuntimeContext(installed ? {
  appPath: path.join(installedResourcesPath, 'app.asar'),
  resourcesPath: installedResourcesPath,
  isPackaged: true,
} : isolated ? {
  appPath: root,
  isPackaged: false,
} : null)
if (!fixture && !isolated && !process.argv.includes('--base-url')) throw new Error('Pass --installed, --local, or the URL of an existing Z Host with --base-url')
const thinkingOverride = process.argv.includes('--thinking') ? arg('--thinking') : null
const textOverride = process.argv.includes('--text') ? arg('--text') : null
const permissionMode = process.argv.includes('--permission-mode') ? arg('--permission-mode') : 'ask'
if (!['readonly', 'ask', 'on-risk'].includes(permissionMode)) {
  throw new Error('--permission-mode must be readonly, ask, or on-risk')
}
const opencodexBaseUrlOverride = process.argv.includes('--opencodex-base-url') ? arg('--opencodex-base-url') : null
if (opencodexBaseUrlOverride) {
  const url = new URL(opencodexBaseUrlOverride)
  if (!['127.0.0.1', 'localhost', '::1'].includes(url.hostname) || !url.port) {
    throw new Error('--opencodex-base-url must be an explicit loopback URL with a port')
  }
}
const contextBudgetOverride = process.argv.includes('--context-budget') ? Number(arg('--context-budget')) : null
const reportDirOverride = process.argv.includes('--report-dir') ? path.resolve(arg('--report-dir')) : null
const agentPreset = process.argv.includes('--preset') ? arg('--preset') : 'taskweaver-readonly'
if (!['standard', 'code', 'minimal', 'cordis', 'tw-default', 'taskweaver-code', 'taskweaver-readonly', 'taskweaver-optimized'].includes(agentPreset)) {
  throw new Error('--preset must be standard, code, minimal, cordis, tw-default, taskweaver-code, taskweaver-readonly, or taskweaver-optimized')
}
const evaluationMode = process.argv.includes('--evaluation-mode') ? arg('--evaluation-mode') : null
if (evaluationMode && !['single', 'dag-fixed', 'dag-routed'].includes(evaluationMode)) {
  throw new Error('--evaluation-mode must be single, dag-fixed, or dag-routed')
}
const evaluationSecure = process.argv.includes('--eval-secure')
if (evaluationSecure && !evaluationMode) throw new Error('--eval-secure requires --evaluation-mode')
if (evaluationSecure && !reportDirOverride) throw new Error('--eval-secure requires an explicit per-run --report-dir')
const idleTimeoutOverride = process.argv.includes('--idle-timeout') ? Number(arg('--idle-timeout')) : null
if (thinkingOverride && !['default', 'off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'].includes(thinkingOverride)) {
  throw new Error('--thinking must be default, off, minimal, low, medium, high, xhigh, or max')
}
if (idleTimeoutOverride !== null && (!Number.isInteger(idleTimeoutOverride) || idleTimeoutOverride < 1_000 || idleTimeoutOverride > 300_000)) {
  throw new Error('--idle-timeout must be an integer from 1000 to 300000 milliseconds')
}
if (contextBudgetOverride !== null && (!Number.isInteger(contextBudgetOverride) || contextBudgetOverride < 1024 || contextBudgetOverride > 1024 * 1024)) {
  throw new Error('--context-budget must be an integer from 1024 to 1048576 bytes')
}
if (fixture) {
  if (!textOverride) throw new Error('--fixture requires --text')
  const startedAt = Date.now()
  const rows = [
    {
      status: 'starting',
      fixture: true,
      reportDir: null,
      modelKey: 'fixture',
      agentPreset,
      conversationId: 'headless-fixture',
      startedAt,
      permissionMode,
    },
    {
      elapsedMs: 1,
      tool: 'read',
      status: 'done',
      input: 'fixture input',
      result: 'fixture result',
    },
    {
      status: 'completed',
      fixture: true,
      reportPath: null,
      agentPreset,
      elapsedMs: 1,
      firstThinkingMs: 0,
      firstTextMs: 1,
      reasoningChars: 0,
      toolCalls: [],
      nestedToolCalls: [],
      permissionMode,
      requestAttemptEstimate: 1,
      requestHeaderSnapshots: 1,
      steps: 1,
      text: 'Headless fixture completed.',
    },
  ]
  writeSync(1, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`)
  process.exit(0)
}
const userData = process.env.TASKWEAVER_USER_DATA
  ? path.resolve(process.env.TASKWEAVER_USER_DATA)
  : path.join(os.homedir(), 'Library', 'Application Support', 'taskweaver-desktop')
if (evaluationSecure && !process.env.TASKWEAVER_USER_DATA) {
  throw new Error('secure evaluation requires an explicit dedicated TASKWEAVER_USER_DATA directory')
}
if (evaluationSecure && isInsideRoot(userData)) throw new Error('secure evaluation user data must be outside the repository')
if (evaluationSecure && isInsideRoot(reportDirOverride)) throw new Error('secure evaluation reports must be outside the repository')
if (evaluationSecure && isInsideRoot(await fs.realpath(userData))) {
  throw new Error('secure evaluation user data resolves inside the repository')
}
const runtimeRoot = process.env.TASKWEAVER_RUNTIME
  ? path.resolve(process.env.TASKWEAVER_RUNTIME)
  : installed ? path.join(installedResourcesPath, 'taskweaver-z-runtime') : path.join(root, 'vendor', 'taskweaver-z-runtime')
const reportDir = reportDirOverride ?? await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-live-read-'))
await fs.mkdir(reportDir, { recursive: true, mode: 0o700 })
if (reportDirOverride && (await fs.readdir(reportDir)).length > 0) {
  throw new Error('--report-dir must be a new or empty directory')
}
if (evaluationSecure && isInsideRoot(await fs.realpath(reportDir))) throw new Error('secure evaluation reports resolve inside the repository')
await fs.chmod(reportDir, 0o700)
let api
let hostManager
let modelService
let chat
let heartbeat
let modelsDocForSync
let metrics = {}
let terminationSignal = null
let signalCleanup = null
let resolveSignalInterruption
const signalInterruption = new Promise((resolve) => { resolveSignalInterruption = resolve })
const signalHandlers = new Map()

function throwIfInterrupted() {
  if (!terminationSignal) return
  const error = new Error(`收到 ${terminationSignal}，本轮任务已取消`)
  error.signal = terminationSignal
  throw error
}

function onProcessSignal(signal) {
  if (terminationSignal) return
  terminationSignal = signal
  resolveSignalInterruption({ kind: 'signal', signal })
  const shutdown = chat ? chat.stop() : hostManager?.stop()
  signalCleanup = Promise.resolve(shutdown).catch((error) => {
    console.error(`收到 ${signal} 后停止 Host 失败：${error instanceof Error ? error.message : String(error)}`)
  })
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  const handler = () => onProcessSignal(signal)
  signalHandlers.set(signal, handler)
  process.on(signal, handler)
}

try {
  throwIfInterrupted()
  workspacePath = await fs.realpath(workspacePath)
  const workspaceStat = await fs.stat(workspacePath)
  if (!workspaceStat.isDirectory() || workspacePath === path.parse(workspacePath).root) {
    throw new Error('--workspace must point to an existing non-root directory')
  }
  if (isolated) {
    // Reuse opaque settings/credential files without displaying their contents;
    // no old profile bundle or conversation history enters the clean test home.
    await fs.mkdir(path.join(reportDir, 'dsh'), { recursive: true })
    for (const file of (evaluationSecure ? ['settings.yaml'] : ['settings.yaml', '.credentials.yaml'])) {
      try {
        const dest = path.join(reportDir, 'dsh', file)
        await fs.copyFile(path.join(userData, 'dsh', file), dest)
        await fs.chmod(dest, 0o600)
      }
      catch (error) { if (error.code !== 'ENOENT') throw error }
    }
    // Reproduce app startup's provider-profile sync without copying plaintext
    // model API keys into the report directory. Synced credentials already
    // live in the copied Z credential file.
    try {
      const sourceModelsDoc = JSON.parse(await fs.readFile(resolveTaskWeaverModelsPath(userData), 'utf8'))
      if (evaluationSecure && Object.values(sourceModelsDoc.providers ?? {}).some((provider) =>
        provider && typeof provider === 'object' && typeof provider.apiKey === 'string' && provider.apiKey.trim())) {
        throw new Error('secure evaluation model configuration must not store provider API keys; pass credentials through environment variables')
      }
      modelsDocForSync = structuredClone(sourceModelsDoc)
      const modelsDoc = structuredClone(sourceModelsDoc)
      if (evaluationSecure) {
        for (const provider of Object.values(modelsDocForSync.providers ?? {})) {
          if (provider && typeof provider === 'object') delete provider.apiKey
        }
      }
      if (opencodexBaseUrlOverride) {
        if (!modelsDoc.providers?.opencodex || !modelsDocForSync.providers?.opencodex) {
          throw new Error('Cannot override OpenCodex URL: opencodex provider is missing from models.json')
        }
        modelsDoc.providers.opencodex.baseUrl = opencodexBaseUrlOverride.replace(/\/+$/, '')
        modelsDocForSync.providers.opencodex.baseUrl = opencodexBaseUrlOverride.replace(/\/+$/, '')
      }
      for (const provider of Object.values(modelsDoc.providers ?? {})) {
        if (!provider || typeof provider !== 'object') continue
        delete provider.apiKey
        if (idleTimeoutOverride !== null) provider.streamIdleTimeoutMs = idleTimeoutOverride
      }
      if (idleTimeoutOverride !== null) {
        for (const provider of Object.values(modelsDocForSync.providers ?? {})) {
          if (provider && typeof provider === 'object') provider.streamIdleTimeoutMs = idleTimeoutOverride
        }
      }
      const isolatedModelsPath = resolveTaskWeaverModelsPath(reportDir)
      await fs.mkdir(path.dirname(isolatedModelsPath), { recursive: true })
      await fs.writeFile(isolatedModelsPath, `${JSON.stringify(modelsDoc, null, 2)}\n`, { mode: 0o600 })
    } catch (error) { if (error.code !== 'ENOENT') throw error }
    hostManager = createZHostManager({
      runtimeRoot,
      userDataPath: reportDir,
      home: reportDir,
      environment: { ...process.env, TASKWEAVER_HOME: path.join(reportDir, 'dsh') },
    })
    throwIfInterrupted()
    ;({ api } = await hostManager.start())
    throwIfInterrupted()
    const sync = await ensureModelsJsonSyncedToDshHost({
      hostManager,
      userDataPath: reportDir,
      modelsDocOverride: modelsDocForSync,
    })
    if (sync.synced) ({ api } = await hostManager.start())
  } else {
    api = await createZApiClient({ runtimeRoot, baseUrl: arg('--base-url') })
    hostManager = { start: async () => ({ api }), stop: async () => {} }
  }
  throwIfInterrupted()
  const profileStore = createProfileStore(userData)
  if (thinkingOverride) profileStore.getThinkingLevel = async () => thinkingOverride === 'default' ? null : thinkingOverride
  const modelKey = process.argv.includes('--model') ? arg('--model') : await profileStore.getActiveModelKey()
  if (!modelKey) throw new Error('No selected model')
  modelService = createModelService({
    profileStore,
    priceRegistryPath: path.join(root, 'pricing', 'registry.json'),
    dshHostManager: hostManager,
    userDataPath: isolated ? reportDir : userData,
    dshRuntimeRoot: runtimeRoot,
  })
  const conversationId = `read-smoke-${crypto.randomUUID()}`
  const startedAt = Date.now()
  const userText = textOverride || '读一下当前毕设文件夹里的代码，简要说明这个项目做什么、主要模块怎么连接，并列出你实际读取的文件。只阅读，不要修改文件。'
  const assembledContext = contextBudgetOverride === null
    ? null
    : await assembleWorkspaceContext(userText, workspacePath, { maxInjectionBytes: contextBudgetOverride })
  const promptText = assembledContext?.prompt ?? userText
  const evaluationPrompt = evaluationMode === null
    ? promptText
    : `${promptText}\n\n【评测运行约束】${evaluationMode === 'single'
      ? '本轮评测固定为单 Agent，请直接完成任务，不调用 orchestrate。'
      : '本轮评测固定走 TaskWeaver DAG，请调用 orchestrate，把完整目标、验收标准和限制交给编排器；不要通过其他子 Agent 机制拆分。'}`
  metrics = {
    modelKey,
    agentPreset,
    permissionMode,
    ...(thinkingOverride ? { thinkingOverride } : {}),
    ...(opencodexBaseUrlOverride ? { opencodexBaseUrlOverride } : {}),
    ...(idleTimeoutOverride !== null ? { idleTimeoutOverride } : {}),
    ...(contextBudgetOverride !== null ? {
      contextBudgetBytes: contextBudgetOverride,
      contextInjectedBytes: assembledContext.injectedBytes,
      contextTruncated: assembledContext.contextTruncated,
      contextReferences: assembledContext.references,
      userTextBytes: Buffer.byteLength(userText, 'utf8'),
    } : {}),
    conversationId, cwd: workspacePath, runtimeRoot, startedAt,
    taskTimeoutMs,
    firstThinkingMs: null, firstTextMs: null, reasoningChars: 0, toolEvents: [], permissionEvents: [], retries: [],
  }
  chat = createDshChatService({
    hostManager, userDataPath: reportDir, modelService, profileStore,
    getWorkspacePath: () => workspacePath, getPermissionMode: () => permissionMode,
  })
  let orchestration = null
  const orchestrationRuns = []
  if (evaluationMode === 'dag-fixed' || evaluationMode === 'dag-routed') {
    const appState = createAppStateStore(reportDir, workspacePath)
    const appPreferences = createAppPreferencesStore(reportDir)
    const permissionService = createPermissionService({
      dialog: { showMessageBox: async () => ({ response: 1 }) },
      getParentWindow: () => null,
      getWorkspacePath: async () => workspacePath,
      getWorkspaceTrusted: async () => true,
    })
    let orchestrationModelService = modelService
    if (evaluationMode === 'dag-fixed') {
      orchestrationModelService = {
        async listCatalog() {
          const catalog = await modelService.listCatalog()
          const selected = catalog.models.find((model) => model.key === modelKey)
          if (!selected) throw new Error(`fixed DAG model is missing from the model catalog: ${modelKey}`)
          return {
            ...catalog,
            models: [{
              ...selected,
              routeRegistered: selected.routeRegistered !== false,
              profile: { ...selected.profile, tier: 'strong', enabledForAllocation: true },
            }],
          }
        },
      }
    }
    orchestration = createOrchestrationService({
      modelService: orchestrationModelService,
      appState,
      getWorkspacePath: async () => workspacePath,
      agentDataPath: path.join(reportDir, 'taskweaver-agent'),
      userDataPath: reportDir,
      getAppPreferences: async () => ({
        ...await appPreferences.get(),
        worktreeIsolation: true,
        dagPlanApproval: 'never',
        dagCrossProviderReview: false,
        maxSubtaskConcurrency: 2,
        dagBudgetUsd: Number(process.env.TASKWEAVER_EVAL_DAG_BUDGET_USD) || 1,
        dagBudgetTokens: Number(process.env.TASKWEAVER_EVAL_DAG_BUDGET_TOKENS) || 200_000,
      }),
      dshRuntime: chat,
      permissionService,
      maxSubtaskConcurrency: 2,
    })
    chat.setOrchestrationHandler(async ({ conversationId: dagConversationId, goal, taskContext, readOnly, context, webContents, signal }) => {
      const outcome = await orchestration.planAndExecute({
        text: context.text,
        rawText: context.rawText,
        contextLayers: [
          ...(Array.isArray(context.promptContextLayers) ? context.promptContextLayers : []),
          ...(typeof taskContext === 'string' && taskContext.trim()
            ? [{ id: 'primary-agent-known-context', text: taskContext.trim() }]
            : []),
          { id: 'primary-agent-dag-goal', text: goal },
        ],
        primaryModelKey: context.primaryModelKey,
        conversationId: dagConversationId,
        webContents,
        workspacePath,
        permissionMode: readOnly === true ? 'readonly' : permissionMode,
        forceReadOnly: readOnly === true,
        workspaceTrusted: true,
        dagPlanApprovalOverride: 'never',
        signal,
      })
      orchestrationRuns.push({
        runId: outcome.runId ?? null,
        failedTaskIds: Array.isArray(outcome.failedTaskIds) ? outcome.failedTaskIds : [],
        usage: outcome.assistant?.usage ?? null,
        tasks: (outcome.tasks ?? []).map((task) => ({
          id: task.id,
          taskType: task.taskType,
          modelKey: task.modelKey ?? null,
          status: task.status ?? task.runStatus ?? null,
          toolCallCount: task.executionEvidence?.observedToolCalls?.length ?? 0,
        })),
      })
      return outcome
    })
  }
  const webContents = {
    isDestroyed: () => false,
    send(channel, event) {
      const elapsedMs = Date.now() - startedAt
      if (channel === 'permission:prompt') {
        metrics.permissionEvents.push({
          elapsedMs,
          tool: event.tool,
          reason: event.reason,
          decision: 'denied-no-ui',
        })
        resolvePermissionPrompt(event.id, { action: 'deny' })
        return
      }
      if (event.type === 'thinking_delta') {
        metrics.firstThinkingMs ??= elapsedMs
        metrics.reasoningChars += event.delta?.length ?? 0
      }
      if (event.type === 'delta') metrics.firstTextMs ??= elapsedMs
      if (event.type === 'tool') {
        metrics.toolEvents.push({ elapsedMs, ...event })
        console.log(JSON.stringify({ elapsedMs, tool: event.toolName, status: event.status, input: event.inputSummary, result: event.resultSummary }))
      }
      if (event.type === 'retry') metrics.retries.push({ elapsedMs, ...event })
    },
  }
  console.log(JSON.stringify({ status: 'starting', reportDir, ...metrics }))
  heartbeat = setInterval(() => console.log(JSON.stringify({ status: 'running', elapsedMs: Date.now() - startedAt, reasoningChars: metrics.reasoningChars, toolCalls: metrics.toolEvents.filter(e => e.status === 'running').length, firstTextMs: metrics.firstTextMs })), 20_000)
  let taskDeadlineTimer
  const taskDeadline = new Promise((resolve) => {
    taskDeadlineTimer = setTimeout(() => resolve({ kind: 'timeout' }), taskTimeoutMs)
  })
  const task = (async () => {
    const result = await chat.send({
      conversationId, modelKey, webContents, cwdOverride: workspacePath, agentPreset,
      text: evaluationPrompt,
      ...(evaluationMode ? {
        orchestrationContext: {
          text: evaluationPrompt,
          rawText: userText,
          promptContextLayers: [],
          primaryModelKey: modelKey,
          workspacePath,
          workspaceTrusted: true,
          permissionMode,
          dagPlanApprovalOverride: 'never',
          allowed: evaluationMode !== 'single',
        },
      } : {}),
    })
    const sessionId = chat.getSessionId(conversationId)
    const reply = await api.sessions.history({ sessionId })
    const history = reply.result?.value?.events?.map(row => row.event) ?? []
    const requestHeaders = history.filter(e => e.type === 'request/header').map((event) => {
      const config = event.data?.header?.config ?? {}
      return {
        seq: Number.isInteger(event.seq) ? event.seq : null,
        reason: typeof event.data?.reason === 'string' ? event.data.reason : null,
        ...(typeof config.provider === 'string' ? { provider: config.provider } : {}),
        ...(typeof config.model === 'string' ? { model: config.model } : {}),
        ...(typeof config.reasoningEffort === 'string' ? { reasoningEffort: config.reasoningEffort } : {}),
      }
    })
    const report = {
      ...metrics,
      elapsedMs: Date.now() - startedAt,
      sessionId,
      result,
      requestHeaderSnapshots: history.filter(e => e.type === 'request/header').length,
      steps: history.filter(e => e.type === 'step/start').length,
      retryScheduledCount: history.filter(e => e.type === 'llm/retry').length,
      retryStartedCount: history.filter(e => e.type === 'llm/retry-started').length,
      // Deliberately retain only route/effort metadata. Never persist the full
      // request/header snapshot, which contains system text and tool schemas.
      requestHeaders,
      ...(evaluationMode ? { evaluationMode, orchestrationRuns } : {}),
      requestAttemptEstimate: history.filter(e => e.type === 'step/start').length
        + history.filter(e => e.type === 'llm/retry-started').length,
      hostStepTimings: summarizeHostStepTimings(history, startedAt),
      toolCalls: history.filter(e => e.type === 'tool/call').map(e => ({ name: e.data?.name, arguments: e.data?.arguments })),
      nestedToolCalls: history.filter(e => e.type === 'tool/code-dispatch-start').map(e => ({ name: e.data?.name, arguments: e.data?.arguments })),
      turnEnd: history.findLast(e => e.type === 'turn/end')?.data,
    }
    await fs.writeFile(path.join(reportDir, 'report.json'), JSON.stringify(report, null, 2))
    console.log(JSON.stringify({ status: 'completed', reportPath: path.join(reportDir, 'report.json'), agentPreset, elapsedMs: report.elapsedMs, firstThinkingMs: report.firstThinkingMs, firstTextMs: report.firstTextMs, reasoningChars: report.reasoningChars, toolCalls: report.toolCalls, nestedToolCalls: report.nestedToolCalls, requestAttemptEstimate: report.requestAttemptEstimate, requestHeaderSnapshots: report.requestHeaderSnapshots, requestHeaders: report.requestHeaders, steps: report.steps, text: result.text }))
  })()
  const taskOutcome = await Promise.race([
    task.then(() => ({ kind: 'completed' }), (error) => ({ kind: 'error', error })),
    taskDeadline,
    signalInterruption,
  ])
  clearTimeout(taskDeadlineTimer)
  if (taskOutcome.kind === 'timeout') {
    const error = new Error(`本轮任务超过总时限 ${taskTimeoutMs} 毫秒`)
    error.code = 'TASK_TIMEOUT'
    let abortGraceTimer
    try {
      await Promise.race([
        chat.abort(conversationId).catch(() => {}),
        new Promise((resolve) => { abortGraceTimer = setTimeout(resolve, 2_000) }),
      ])
    } finally {
      clearTimeout(abortGraceTimer)
    }
    throw error
  }
  if (taskOutcome.kind === 'signal') {
    const error = new Error(`收到 ${taskOutcome.signal}，本轮任务已取消`)
    error.signal = taskOutcome.signal
    throw error
  }
  if (taskOutcome.kind === 'error') throw taskOutcome.error
} catch (error) {
  await fs.writeFile(path.join(reportDir, 'failure.json'), JSON.stringify({ ...metrics, elapsedMs: metrics.startedAt ? Date.now() - metrics.startedAt : null, error: error.message, sessionId: chat?.getSessionId(metrics.conversationId) }, null, 2))
  console.error(JSON.stringify({ status: 'failed', reportDir, error: error.message }))
  const exitSignal = error.signal ?? terminationSignal
  process.exitCode = error.code === 'TASK_TIMEOUT' ? 124
    : exitSignal === 'SIGINT' ? 130
      : exitSignal === 'SIGTERM' ? 143
        : 1
} finally {
  clearInterval(heartbeat)
  try {
    try {
      if (signalCleanup) await signalCleanup
      if (chat) await chat.stop()
      else await hostManager?.stop()
    } finally {
      try { await modelService?.dispose() }
      finally {
        if (isolated) {
          for (const file of ['.credentials.yaml', 'settings.yaml']) {
            await fs.unlink(path.join(reportDir, 'dsh', file)).catch(error => { if (error.code !== 'ENOENT') throw error })
          }
        }
      }
    }
  } finally {
    for (const [signal, handler] of signalHandlers) process.removeListener(signal, handler)
  }
}
