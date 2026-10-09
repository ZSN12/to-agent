import fs from 'node:fs/promises'
import { writeSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createZApiClient, createZHostManager } from '../electron/agent/z-host/index.mjs'
import { createDshChatService } from '../electron/backend/dsh-chat-service.mjs'
import { createModelService } from '../electron/backend/model-service.mjs'
import { createProfileStore } from '../electron/backend/profile-store.mjs'
import { resolveTaskWeaverModelsPath } from '../electron/backend/taskweaver-models-path.mjs'
import { ensureModelsJsonSyncedToDshHost } from '../electron/backend/sync-models-json-to-host.mjs'
import { setOcxRuntimeContext } from '../electron/backend/opencodex-binary.mjs'
import { summarizeHostStepTimings } from './host-step-timings.mjs'
import { assembleWorkspaceContext } from '../electron/backend/context-assembler.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
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
const opencodexBaseUrlOverride = process.argv.includes('--opencodex-base-url') ? arg('--opencodex-base-url') : null
if (opencodexBaseUrlOverride) {
  const url = new URL(opencodexBaseUrlOverride)
  if (!['127.0.0.1', 'localhost', '::1'].includes(url.hostname) || !url.port) {
    throw new Error('--opencodex-base-url must be an explicit loopback URL with a port')
  }
}
const contextBudgetOverride = process.argv.includes('--context-budget') ? Number(arg('--context-budget')) : null
const agentPreset = process.argv.includes('--preset') ? arg('--preset') : 'taskweaver-readonly'
if (!['standard', 'code', 'minimal', 'cordis', 'taskweaver-code', 'taskweaver-readonly', 'taskweaver-optimized'].includes(agentPreset)) {
  throw new Error('--preset must be standard, code, minimal, cordis, taskweaver-code, taskweaver-readonly, or taskweaver-optimized')
}
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
const runtimeRoot = process.env.TASKWEAVER_Z_RUNTIME
  ? path.resolve(process.env.TASKWEAVER_Z_RUNTIME)
  : installed ? path.join(installedResourcesPath, 'taskweaver-z-runtime') : path.join(root, 'vendor', 'taskweaver-z-runtime')
const reportDir = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-live-read-'))
let api
let hostManager
let modelService
let chat
let heartbeat
let modelsDocForSync
let metrics = {}

try {
  workspacePath = await fs.realpath(workspacePath)
  const workspaceStat = await fs.stat(workspacePath)
  if (!workspaceStat.isDirectory() || workspacePath === path.parse(workspacePath).root) {
    throw new Error('--workspace must point to an existing non-root directory')
  }
  if (isolated) {
    // Reuse opaque settings/credential files without displaying their contents;
    // no old profile bundle or conversation history enters the clean test home.
    await fs.mkdir(path.join(reportDir, 'dsh'), { recursive: true })
    for (const file of ['settings.yaml', '.credentials.yaml']) {
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
      modelsDocForSync = structuredClone(sourceModelsDoc)
      const modelsDoc = structuredClone(sourceModelsDoc)
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
    hostManager = createZHostManager({ runtimeRoot, userDataPath: reportDir, executable: process.execPath })
    ;({ api } = await hostManager.start())
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
  metrics = {
    modelKey,
    agentPreset,
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
    firstThinkingMs: null, firstTextMs: null, reasoningChars: 0, toolEvents: [], retries: [],
  }
  chat = createDshChatService({
    hostManager, userDataPath: reportDir, modelService, profileStore,
    getWorkspacePath: () => workspacePath, getPermissionMode: () => 'ask',
  })
  const webContents = {
    isDestroyed: () => false,
    send(_channel, event) {
      const elapsedMs = Date.now() - startedAt
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
  const result = await chat.send({
    conversationId, modelKey, webContents, cwdOverride: workspacePath, agentPreset,
    text: promptText,
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
    requestAttemptEstimate: history.filter(e => e.type === 'step/start').length
      + history.filter(e => e.type === 'llm/retry-started').length,
    hostStepTimings: summarizeHostStepTimings(history, startedAt),
    toolCalls: history.filter(e => e.type === 'tool/call').map(e => ({ name: e.data?.name, arguments: e.data?.arguments })),
    nestedToolCalls: history.filter(e => e.type === 'tool/code-dispatch-start').map(e => ({ name: e.data?.name, arguments: e.data?.arguments })),
    turnEnd: history.findLast(e => e.type === 'turn/end')?.data,
  }
  await fs.writeFile(path.join(reportDir, 'report.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ status: 'completed', reportPath: path.join(reportDir, 'report.json'), agentPreset, elapsedMs: report.elapsedMs, firstThinkingMs: report.firstThinkingMs, firstTextMs: report.firstTextMs, reasoningChars: report.reasoningChars, toolCalls: report.toolCalls, nestedToolCalls: report.nestedToolCalls, requestAttemptEstimate: report.requestAttemptEstimate, requestHeaderSnapshots: report.requestHeaderSnapshots, requestHeaders: report.requestHeaders, steps: report.steps, text: result.text }))
} catch (error) {
  await fs.writeFile(path.join(reportDir, 'failure.json'), JSON.stringify({ ...metrics, elapsedMs: metrics.startedAt ? Date.now() - metrics.startedAt : null, error: error.message, sessionId: chat?.getSessionId(metrics.conversationId) }, null, 2))
  console.error(JSON.stringify({ status: 'failed', reportDir, error: error.message }))
  process.exitCode = 1
} finally {
  clearInterval(heartbeat)
  try {
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
}
