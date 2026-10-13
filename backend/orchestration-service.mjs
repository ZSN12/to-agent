import fs from 'node:fs/promises'
import path from 'node:path'
import { applySkillInstructions } from './skill-prompt.mjs'
import { clockLabelZh } from './message-factory.mjs'
import { createMemoryStore } from './memory-store.mjs'
import { RunStore } from './orchestration/run-store.mjs'
import { TraceStore } from './orchestration/trace-store.mjs'

export {
  buildPlannerRetryPrompt,
  PlannerFallbackError,
  resolveOrchestrationAgentPreset,
  createPlannerProgressRelay,
  requiresReadOnlyPlan,
  validatePlanForRequest,
  completeReadOnlyPlanScopes,
  collectPlannerPathHints,
  plannerRejectionGuidance,
} from './orchestration/planner.mjs'

export { summarizeExecutionEvidence, assessSubtaskCompletion } from './orchestration/evidence.mjs'

import {
  resolveOrchestrationAgentPreset,
  READ_ONLY_TASK_TYPES,
  layoutTasks,
  messageId,
} from './orchestration/planner.mjs'

import { summarizeExecutionEvidence } from './orchestration/evidence.mjs'
import { createPlanAndExecute } from './orchestration/plan-and-execute.mjs'
import { createRunReplay } from './orchestration/run-replay.mjs'
import { resolveTaskWorktreeDir } from './worktree-service.mjs'

function nowLabel() {
  return clockLabelZh()
}

function sendChatStreamIfAvailable(webContents, payload) {
  if (!webContents || typeof webContents.send !== 'function' || webContents.isDestroyed?.()) return false
  try {
    webContents.send('chat:stream', payload)
    return true
  } catch {
    return false
  }
}

export function createOrchestrationService({
  modelService,
  appState,
  getWorkspacePath,
  agentDataPath,
  userDataPath,
  getAppPreferences,
  permissionService = null,
  dshRuntime = null,
  maxSubtaskConcurrency = null,
}) {
  /** @type {Map<string, { inFlight: boolean, abortController: AbortController | null }>} */
  const runs = new Map()
  const memory = createMemoryStore({ agentDataPath })
  const runStore = new RunStore({ agentDataPath })
  const traceStore = new TraceStore({ agentDataPath })
  const pendingApprovals = new Map()

  runStore.recoverIncompleteRuns().then(async () => {
    if (typeof appState.setTasksForConversation !== 'function') return
    for (const conversationId of await runStore.listConversationIds()) {
      const latestRun = (await runStore.listRuns(conversationId))[0]
      if (latestRun?.status !== 'interrupted' || !Array.isArray(latestRun.tasks) || latestRun.tasks.length === 0) continue
      const current = appState.getConversationState
        ? await appState.getConversationState(conversationId)
        : null
      const currentRunId = current?.tasks?.find((task) => task.runId)?.runId
      if (currentRunId && currentRunId !== latestRun.runId) continue
      await appState.setTasksForConversation(conversationId, latestRun.tasks)
    }
  }).catch(console.error)

  async function runPrompt({
    modelKey,
    text,
    sessionFile,
    noTools = false,
    taskType,
    skill,
    webContents,
    taskId,
    cwdOverride,
    signal,
    conversationId,
    sessionKey,
    parentSessionId,
    permissionMode,
    writeScopes,
    attachments,
    documents,
    outputSchema,
    onActivity,
  }) {
    const cwd = cwdOverride || (await getWorkspacePath(conversationId))
    if (!cwd) throw new Error('请先设置工作区目录')
    if (!dshRuntime) throw new Error('多 Agent 编排需要 Z Runtime')
    if (!conversationId) throw new Error('Z 子任务缺少所属对话')
    const agentPreset = resolveOrchestrationAgentPreset({ noTools, taskType })
    const observedToolCalls = new Map()
    let omittedToolCalls = 0
    let scopeDeniedToolCalls = 0
    const tracedWebContents = taskId ? {
      isDestroyed: () => webContents?.isDestroyed?.() ?? false,
      send(channel, payload) {
        if (channel === 'chat:stream' && payload?.type === 'tool' && payload.taskId === taskId) {
          const id = String(payload.id ?? `${payload.toolName ?? 'tool'}-${observedToolCalls.size}`)
          const previous = observedToolCalls.get(id) ?? {}
          if (payload.status === 'error' && /TaskWeaver read-only scope denied|声明的 writeScopes 之外/i.test(String(payload.resultSummary ?? ''))) {
            scopeDeniedToolCalls += 1
          }
          if (previous.toolName || observedToolCalls.size < 30) {
            observedToolCalls.set(id, {
              toolName: String(payload.toolName ?? previous.toolName ?? 'tool').slice(0, 80),
              status: String(payload.status ?? previous.status ?? 'unknown').slice(0, 24),
              inputSummary: String(payload.inputSummary ?? previous.inputSummary ?? '').slice(0, 400),
              resultSummary: String(payload.resultSummary ?? previous.resultSummary ?? '').slice(0, 400),
              ...(typeof payload.commandSummary === 'string' || typeof previous.commandSummary === 'string'
                ? { commandSummary: String(payload.commandSummary ?? previous.commandSummary).slice(0, 400) }
                : {}),
              ...(payload.commandOutcome && typeof payload.commandOutcome === 'object'
                ? {
                  commandOutcome: {
                    exitCode: Number.isInteger(payload.commandOutcome.exitCode) ? payload.commandOutcome.exitCode : null,
                    ...(typeof payload.commandOutcome.signal === 'string' ? { signal: payload.commandOutcome.signal.slice(0, 32) } : {}),
                    background: payload.commandOutcome.background === true,
                    timedOut: payload.commandOutcome.timedOut === true,
                    sandboxDenied: payload.commandOutcome.sandboxDenied === true,
                  },
                }
                : previous.commandOutcome ? { commandOutcome: previous.commandOutcome } : {}),
              durationMs: Number.isFinite(payload.durationMs) ? payload.durationMs : previous.durationMs ?? null,
            })
          } else if (payload.status === 'running') {
            omittedToolCalls += 1
          }
        }
        if (!payload?.taskId || payload.taskId === taskId) onActivity?.(payload)
        if (channel === 'chat:stream') sendChatStreamIfAvailable(webContents, payload)
      },
    } : webContents
    let result
    try {
      const runTurn = () => dshRuntime.runAgentTurn({
        conversationId,
        sessionKey: sessionKey || `tw-orchestration-${conversationId}-${path.basename(sessionFile, path.extname(sessionFile))}`,
        modelKey,
        text: applySkillInstructions(text, skill),
        webContents: tracedWebContents,
        cwd,
        agentPreset,
        parentSessionId,
        taskId,
        signal,
        progressOnly: noTools,
        permissionMode: READ_ONLY_TASK_TYPES.has(taskType) ? 'readonly' : permissionMode,
        attachments,
        documents,
        ...(outputSchema === undefined ? {} : { outputSchema }),
      })
      const scopedPermissionMode = READ_ONLY_TASK_TYPES.has(taskType) ? 'readonly' : (permissionMode ?? 'ask')
      result = permissionService?.withExecution
        ? await permissionService.withExecution(scopedPermissionMode, webContents, runTurn, {
          conversationId,
          workspacePath: cwd,
          taskId,
          ...(Array.isArray(writeScopes) ? { writeScopes } : {}),
        })
        : await runTurn()
    } catch (error) {
      if (taskId && error && typeof error === 'object') {
        error.executionEvidence = {
          source: 'z-host-tool-events',
          observedToolCalls: [...observedToolCalls.values()],
          omittedToolCalls,
          scopeDeniedToolCalls,
        }
      }
      throw error
    }
    if (!taskId) return result
    return {
      ...result,
      executionEvidence: {
        source: 'z-host-tool-events',
        observedToolCalls: [...observedToolCalls.values()],
        omittedToolCalls,
        scopeDeniedToolCalls,
      },
    }
  }

  async function publishTasks(tasks, webContents, conversationId) {
    const normalized = layoutTasks(tasks)
    if (conversationId && appState.setTasksForConversation) {
      await appState.setTasksForConversation(conversationId, normalized)
    } else {
      await appState.setTasks(normalized)
    }
    sendChatStreamIfAvailable(webContents, { type: 'tasks', tasks: normalized, conversationId })
  }

  function getRun(conversationId) {
    return runs.get(conversationId)
  }

  function isBusy(conversationId = null) {
    if (conversationId) return Boolean(getRun(conversationId)?.inFlight)
    for (const run of runs.values()) {
      if (run.inFlight) return true
    }
    return false
  }

  const planAndExecute = createPlanAndExecute({
    runs,
    memory,
    runPrompt,
    publishTasks,
    modelService,
    getWorkspacePath,
    agentDataPath,
    userDataPath,
    getAppPreferences,
    dshRuntime,
    maxSubtaskConcurrency,
    sendChatStreamIfAvailable,
    nowLabel,
    runStore,
    traceStore,
    pendingApprovals,
  })

  async function sendTaskMessage({ taskId, text, conversationId, webContents, workspacePath }) {
    if (!conversationId) throw new Error('当前对话标识无效')
    if (getRun(conversationId)?.inFlight) throw new Error('该对话的多 Agent 任务仍在执行，暂不能向子任务发送消息')
    const abortController = new AbortController()
    const run = { inFlight: true, abortController }
    runs.set(conversationId, run)
    try {
    const state = conversationId && appState.getConversationState
      ? await appState.getConversationState(conversationId)
      : await appState.getState()
    const tasks = state.tasks
    const task = tasks.find((item) => item.id === taskId)
    if (!task) throw new Error('找不到该子任务')
    const workspaceRoot = state.workspacePath || workspacePath
    if (!workspaceRoot) throw new Error('当前会话没有已保存的工作区，无法继续子任务')
    const execCwd = task.execCwd || workspaceRoot
    if (task.worktreeIsolated === true) {
      if (!task.runId || !userDataPath) throw new Error('该隔离子任务缺少 runId 或应用数据目录，无法安全恢复其 worktree 环境')
      const expectedWorktree = resolveTaskWorktreeDir(userDataPath, workspaceRoot, conversationId, task.id, task.runId)
      if (path.resolve(execCwd) !== path.resolve(expectedWorktree)) {
        throw new Error('子任务执行目录与已登记的 worktree 不一致，已拒绝在其他目录继续')
      }
      try {
        await fs.access(execCwd)
      } catch {
        throw new Error('该子任务的 worktree 已被删除；请重新运行 DAG 后再追问')
      }
    }
    const user = { id: messageId(), author: 'user', name: '你', time: nowLabel(), text }
    const runDirectory = task.runId
      ? path.join(agentDataPath, 'orchestration', conversationId, task.runId)
      : path.join(agentDataPath, 'orchestration', conversationId)
    const childFile = path.join(runDirectory, `${taskId}.jsonl`)
    let prompt = text
    try {
      await fs.access(childFile)
    } catch {
      const originalRequest = state.messages.find((message) => message.author === 'user')?.text ?? ''
      prompt = `用户原始请求：${originalRequest}\n当前子任务：${task.title}\n任务目标：${task.description}\n\n用户补充指令：\n${text}`
    }
    const result = await runPrompt({
      modelKey: task.modelKey,
      text: prompt,
      sessionFile: childFile,
      taskType: task.taskType,
      webContents,
      taskId,
      signal: abortController.signal,
      conversationId,
      cwdOverride: execCwd,
      writeScopes: Array.isArray(task.writeScopes) ? task.writeScopes : undefined,
      permissionMode: task.permissionMode,
      sessionKey: task.dshSessionKey || `tw-orchestration-${conversationId}-${task.runId || 'legacy'}-${taskId}`,
    })
    const assistant = {
      id: messageId(),
      author: 'agent',
      name: task.role,
      time: nowLabel(),
      text: result.text || '（Agent 未返回文本）',
      modelKey: task.modelKey,
      usage: result.usage,
      executionEvidence: result.executionEvidence ?? null,
      executionEvidenceSummary: summarizeExecutionEvidence(result.executionEvidence),
    }
    const updated = tasks.map((item) => item.id === taskId ? {
      ...item,
      executionEvidenceSummary: assistant.executionEvidenceSummary,
      messages: [...item.messages, user, assistant],
    } : item)
    await publishTasks(updated, webContents, conversationId)
    return { user, assistant }
    } finally {
      run.inFlight = false
      run.abortController = null
      if (runs.get(conversationId) === run) runs.delete(conversationId)
    }
  }

  async function abort(conversationId = null) {
    const targets = conversationId
      ? [runs.get(conversationId)].filter(Boolean)
      : [...runs.values()]
    if (!targets.length) return false
    let stopped = false
    for (const run of targets) {
      if (!run.inFlight || !run.abortController) continue
      run.pauseControl?.resume()
      run.abortController.abort()
      stopped = true
    }
    return stopped
  }

  function listRunningConversationIds() {
    const ids = []
    for (const [id, run] of runs) {
      if (run.inFlight) ids.push(id)
    }
    return ids
  }

  function cancelTask(conversationId, taskId) {
    const run = getRun(conversationId)
    const status = run?.taskStatuses?.get(taskId)
    const controller = run?.taskAbortControllers?.get(taskId)
    if (!run?.inFlight || !controller || !['queued', 'running'].includes(status) || controller.signal.aborted) return false
    controller.abort()
    return true
  }

  async function pauseRun(conversationId, runId) {
    const run = getRun(conversationId)
    if (!run?.inFlight || run.runId !== runId || !run.schedulerActive || run.status !== 'running' || !run.pauseControl?.pause()) return false
    run.status = 'paused'
    await run.onPauseChange?.(true)
    return true
  }

  async function resumeRun(conversationId, runId) {
    const run = getRun(conversationId)
    if (!run?.inFlight || run.runId !== runId || !run.schedulerActive || run.status !== 'paused' || !run.pauseControl?.resume()) return false
    run.status = 'running'
    await run.onPauseChange?.(false)
    return true
  }

  async function listRuns(conversationId) {
    if (typeof conversationId !== 'string' || !conversationId) return []
    const runs = await runStore.listRuns(conversationId)
    return runs.slice(0, 20).map((run) => ({
      runId: run.runId,
      conversationId: run.conversationId ?? conversationId,
      createdAt: run.createdAt ?? '',
      updatedAt: run.updatedAt,
      status: run.status,
      tasks: Array.isArray(run.tasks) ? run.tasks : [],
    }))
  }

  async function replayRun({ conversationId, runId, taskId = null, webContents, workspacePath, permissionMode, workspaceTrusted = false }) {
    if (!conversationId || !runId) throw new Error('运行记录恢复请求无效')
    if (runs.get(conversationId)?.inFlight) throw new Error('该对话已有 DAG 正在执行，暂不能恢复运行记录')
    const source = await runStore.loadRun(conversationId, runId)
    if (!source || source.runId !== runId || source.conversationId !== conversationId) {
      throw new Error('找不到该会话的运行记录')
    }
    if (!source.originalText || !source.primaryModelKey) {
      throw new Error('此运行记录缺少原始请求或主模型信息，无法安全恢复；请重新发起任务')
    }
    if (source.workspacePath && workspacePath && path.resolve(source.workspacePath) !== path.resolve(workspacePath)) {
      throw new Error('当前会话工作区与运行记录中的工作区不同，已拒绝恢复')
    }
    const mode = taskId ? 'rerun' : 'checkpoint'
    const replay = createRunReplay(source, { mode, taskId })
    return planAndExecute({
      text: source.originalText,
      rawText: source.originalText,
      primaryModelKey: source.primaryModelKey,
      conversationId,
      webContents,
      workspacePath: source.workspacePath || workspacePath || await getWorkspacePath(conversationId),
      permissionMode: permissionMode || source.permissionMode || 'ask',
      workspaceTrusted: workspaceTrusted === true,
      dagPlanApprovalOverride: 'never',
      replay: { ...replay, source, mode },
    })
  }

  async function resumeRunFromCheckpoint(options) {
    return replayRun(options)
  }

  async function rerunTaskFromRun(options) {
    if (!options?.taskId) throw new Error('重跑节点 ID 无效')
    return replayRun(options)
  }

  function approvePlan(conversationId, runId, changes = {}) {
    const pending = pendingApprovals.get(runId)
    if (!pending || pending.conversationId !== conversationId) return { approved: false, error: '找不到当前会话待审批的 DAG 计划' }
    try {
      const tasks = pending.validate(changes)
      pending.resolve(tasks)
      pendingApprovals.delete(runId)
      return { approved: true }
    } catch (error) {
      return { approved: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  function rejectPlan(conversationId, runId) {
    const pending = pendingApprovals.get(runId)
    if (!pending || pending.conversationId !== conversationId) return false
    pending.reject(new Error('用户已拒绝执行该计划'))
    pendingApprovals.delete(runId)
    return true
  }

  return { planAndExecute, sendTaskMessage, abort, cancelTask, pauseRun, resumeRun, listRuns, resumeRunFromCheckpoint, rerunTaskFromRun, isBusy, listRunningConversationIds, approvePlan, rejectPlan }
}
