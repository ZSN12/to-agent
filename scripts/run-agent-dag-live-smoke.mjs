import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createZHostManager } from '../electron/agent/z-host/index.mjs'
import { createDshChatService } from '../electron/backend/dsh-chat-service.mjs'
import { createModelService } from '../electron/backend/model-service.mjs'
import { createOrchestrationService, summarizeExecutionEvidence } from '../electron/backend/orchestration-service.mjs'
import { createProfileStore } from '../electron/backend/profile-store.mjs'
import { resolveTaskWeaverModelsPath } from '../electron/backend/taskweaver-models-path.mjs'
import { ensureModelsJsonSyncedToDshHost } from '../electron/backend/sync-models-json-to-host.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const modelKey = 'xiaomi/mimo-v2.6-flash'
const realPlanner = process.env.TASKWEAVER_LIVE_REAL_PLANNER === '1'
const thinkingOverride = process.env.TASKWEAVER_LIVE_THINKING ?? null
if (thinkingOverride && !['low', 'medium', 'high', 'default'].includes(thinkingOverride)) {
  throw new Error('TASKWEAVER_LIVE_THINKING must be low, medium, high, or default')
}
const userData = path.join(os.homedir(), 'Library', 'Application Support', 'taskweaver-desktop')
const runtimeRoot = process.argv.includes('--installed')
  ? '/Applications/TaskWeaver.app/Contents/Resources/taskweaver-z-runtime'
  : path.join(root, 'vendor', 'taskweaver-z-runtime')
const reportDir = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-live-dag-'))
const conversationId = `live-dag-${crypto.randomUUID()}`
let hostManager
let modelService
let chat
let orchestration
let startedAt = 0
let heartbeat
let interrupted = false
const tasks = []
const events = []
const durations = new Map()

function record(event) {
  const elapsedMs = Date.now() - startedAt
  if (event.type === 'tasks') tasks.splice(0, tasks.length, ...event.tasks)
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
  await fs.mkdir(path.join(reportDir, 'dsh'), { recursive: true })
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
  const isolatedModelsPath = resolveTaskWeaverModelsPath(reportDir)
  await fs.mkdir(path.dirname(isolatedModelsPath), { recursive: true })
  await fs.writeFile(isolatedModelsPath, `${JSON.stringify(modelsDoc, null, 2)}\n`, { mode: 0o600 })
  try {
    await fs.copyFile(
      path.join(userData, 'taskweaver-model-profiles.json'),
      path.join(reportDir, 'taskweaver-model-profiles.json'),
    )
    await fs.chmod(path.join(reportDir, 'taskweaver-model-profiles.json'), 0o600)
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
  const plannerCreated = await api.sessions.create({ sessionId: plannerSessionId, cwd: root, agentPreset: 'taskweaver-planner' })
  if (!plannerCreated.result?.ok) throw new Error(plannerCreated.result?.error?.message || 'Could not create isolated planner lineage session')

  const dshRuntime = {
    getSessionId(sessionKey) {
      if (isPlannerSession(sessionKey)) return plannerCreated.result.value.sessionId || plannerSessionId
      return chat.getSessionId(sessionKey)
    },
    async runAgentTurn(payload) {
      if (isPlannerSession(payload.sessionKey)) {
        if (realPlanner) {
          const result = await chat.runAgentTurn(payload)
          let plan
          try {
            plan = JSON.parse(String(result?.text ?? '').replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, ''))
          } catch {
            throw new Error('MiMo planner did not return valid JSON')
          }
          if (!Array.isArray(plan?.tasks) || plan.tasks.length < 1 || plan.tasks.some((task) => !['research', 'review'].includes(task.taskType))) {
            throw new Error('MiMo planner proposed a non-read-only or empty plan; refused to execute it')
          }
          return result
        }
        // Keep the execution plan deterministic so a real provider can never
        // accidentally turn this read-only smoke into an implementation task.
        return {
          text: JSON.stringify({ tasks: [
            { id: 'T1', title: '梳理应用启动入口', taskType: 'research', role: '项目入口研究', description: '只读研究：直接读取 package.json、electron/main.cjs、src/main.tsx，说明应用入口及前后端职责边界。三个文件并发读取，限于相关片段；不要先 glob 搜索。列出实际读取路径和结论依据。', dependsOn: [] },
            { id: 'T2', title: '梳理 Agent 请求链路', taskType: 'research', role: 'Agent 链路研究', description: '只读研究：直接读取 electron/backend/register-ipc.mjs、electron/backend/dsh-chat-service.mjs、electron/agent/z-host/index.mjs、electron/agent/z-host/z-api-client.mjs，说明消息如何到达 Agent Host。四个文件并发读取，只返回相关片段；不要先 glob 搜索。列出实际读取路径和结论依据。', dependsOn: [] },
          ] }),
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
    dshRuntime,
  })

  startedAt = Date.now()
  console.log(JSON.stringify({ status: 'starting', reportDir, runtimeRoot, modelKey, thinkingOverride: thinkingOverride ?? 'profile-default', workspace: root, taskCount: realPlanner ? 'MiMo-planned' : 2, realPlanner }))
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
    text: '只读分析当前毕设代码的应用启动入口和 Agent 请求链路，要求两项独立研究并行完成后交叉汇总。不得修改文件。',
    primaryModelKey: modelKey,
    conversationId,
    webContents,
    workspacePath: root,
  })

  const histories = []
  for (const task of tasks) {
    const sessionId = chat.getSessionId(task.dshSessionKey)
    if (!sessionId) {
      histories.push({ id: task.id, sessionId: null, preset: null, calls: [], turnEnds: 0, blockedBeforeStart: task.status === 'review' })
      continue
    }
    const history = await api.sessions.history({ sessionId })
    if (!history.result?.ok) throw new Error(`${task.id} native history unavailable`)
    const entries = history.result.value.events.map((row) => row.event)
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
    histories.push({ id: task.id, sessionId, preset, calls, turnEnds: entries.filter((entry) => entry.type === 'turn/end').length })
  }

  const readonlyTasks = histories.filter((item) => ['research', 'review'].includes(tasks.find((task) => task.id === item.id)?.taskType))
  for (const task of histories) {
    if (!task.sessionId) continue
    if (task.preset !== 'taskweaver-readonly') throw new Error(`${task.id} did not use taskweaver-readonly (got ${task.preset})`)
    const names = task.calls.map((call) => call.name)
    const nestedNames = task.calls.filter((call) => call.kind === 'code-dispatch').map((call) => call.name)
    const outerNames = task.calls.filter((call) => call.kind === 'native').map((call) => call.name)
    if (outerNames.some((name) => ['write', 'edit', 'bash'].includes(name))
      || nestedNames.some((name) => !['read', 'grep', 'glob', 'find', 'ls'].includes(name))) {
      throw new Error(`${task.id} invoked a mutating, shell, or non-filesystem tool`)
    }
    if (outerNames.includes('run_code') && nestedNames.length === 0) {
      throw new Error(`${task.id} used run_code without auditable read-only subcalls`)
    }
  }
  for (const task of readonlyTasks) {
    if (!task.sessionId) continue
    const names = task.calls.map((call) => call.name)
    if (!names.some((name) => ['read', 'grep', 'glob', 'find', 'ls'].includes(name))) {
      throw new Error(`${task.id} did not use any filesystem inspection tool`)
    }
    const taskState = tasks.find((item) => item.id === task.id)
    if (taskState?.status === 'done' && !names.includes('read')) {
      throw new Error(`${task.id} was marked done without a native-history read tool call`)
    }
  }
  const inspectionTools = new Set(['read', 'glob', 'grep', 'find', 'ls'])
  const overBudget = tasks.filter((task) =>
    (task.messages.at(-1)?.executionEvidence?.observedToolCalls ?? [])
      .filter((call) => inspectionTools.has(call.toolName)).length > 6)
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
  const allTasksDone = tasks.length >= 2 && tasks.length <= 5 && tasks.every((task) => task.status === 'done') && outcome.failedTaskIds.length === 0
  const safelyEvidenceGated = realPlanner
    && tasks.some((task) => ['research', 'review'].includes(task.taskType)
      && task.status === 'review'
      && /Host 未记录到成功的文件读取/.test(task.error ?? ''))
    && tasks.every((task) => task.status === 'done' || task.status === 'review')
    && tasks.filter((task) => !chat.getSessionId(task.dshSessionKey)).every((task) => task.status === 'review')
  if (!allTasksDone && !safelyEvidenceGated) {
    throw new Error(`DAG neither completed nor safely stopped on missing read evidence (failed=${outcome.failedTaskIds.join(',')})`)
  }
  const actualTaskSessions = histories.filter(({ sessionId }) => sessionId).map(({ sessionId }) => sessionId)
  if (new Set(actualTaskSessions).size !== actualTaskSessions.length) throw new Error('DAG task sessions were not independent')

  const report = {
    modelKey,
    thinkingOverride: thinkingOverride ?? 'profile-default',
    runtimeRoot,
    conversationId,
    elapsedMs: Date.now() - startedAt,
    realPlanner,
    plannerSessionId,
    tasks: tasks.map(({ id, title, taskType, status, modelKey: routedModel, usage, messages }) => ({
      id,
      title,
      taskType,
      status,
      modelKey: routedModel,
      usage,
      resultText: messages.at(-1)?.text ?? '',
      executionEvidence: messages.at(-1)?.executionEvidence ?? null,
      evidenceAssessment: tasks.find((task) => task.id === id)?.executionEvidenceSummary ?? null,
    })),
    taskHistories: histories,
    events,
    synthesis: outcome.assistant,
    checks: {
      readOnlyPresets: true,
      filesystemToolsUsed: true,
      noMutationTools: true,
      toolEvidenceCaptured: tasks.filter((task) => chat.getSessionId(task.dshSessionKey)).every((task) => task.messages.at(-1)?.executionEvidence?.source === 'z-host-tool-events'),
      focusedInspectionBudget: tasks.every((task) => (task.messages.at(-1)?.executionEvidence?.observedToolCalls ?? []).filter((call) => ['read', 'glob', 'grep', 'find', 'ls'].includes(call.toolName)).length <= 6),
      evidenceAssessmentConsistent: tasks.filter((task) => task.messages.at(-1)?.executionEvidence?.source === 'z-host-tool-events').every((task) => JSON.stringify(task.executionEvidenceSummary) === JSON.stringify(summarizeExecutionEvidence(task.messages.at(-1)?.executionEvidence))),
      modelConsistent: tasks.every((task) => task.modelKey === modelKey),
      distinctSessions: new Set(actualTaskSessions).size === actualTaskSessions.length,
      allTasksDone,
      evidenceGateTriggered: safelyEvidenceGated,
    },
    efficiencyWarnings: overBudget.length
      ? [`Focused read-only inspection guidance exceeded six calls: ${overBudget.map((task) => `${task.id} (${(task.messages.at(-1)?.executionEvidence?.observedToolCalls ?? []).filter((call) => inspectionTools.has(call.toolName)).length})`).join(', ')}. This is reported separately from correctness and safety.`]
      : [],
  }
  await fs.writeFile(path.join(reportDir, 'report.json'), JSON.stringify(report, null, 2), { mode: 0o600 })
  console.log(JSON.stringify({ status: report.checks.allTasksDone ? (overBudget.length ? 'completed-with-efficiency-warning' : 'completed') : 'evidence-gated', reportPath: path.join(reportDir, 'report.json'), elapsedMs: report.elapsedMs, tasks: report.tasks.map(({ id, status, modelKey }) => ({ id, status, modelKey })), histories: histories.map(({ id, preset, calls, blockedBeforeStart }) => ({ id, preset, tools: calls.map((call) => call.name), blockedBeforeStart })), efficiencyWarnings: report.efficiencyWarnings, synthesis: outcome.assistant.text }))
} catch (error) {
  await fs.writeFile(path.join(reportDir, 'failure.json'), JSON.stringify({
    modelKey,
    realPlanner,
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
    await modelService?.dispose()
    for (const file of ['.credentials.yaml', 'settings.yaml']) {
      await fs.unlink(path.join(reportDir, 'dsh', file)).catch((error) => { if (error.code !== 'ENOENT') throw error })
    }
  }
  if (interrupted) process.exitCode = 130
}
