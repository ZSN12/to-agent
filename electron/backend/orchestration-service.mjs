import fs from 'node:fs/promises'
import path from 'node:path'
import { applySkillInstructions } from './skill-prompt.mjs'
import { clockLabelZh } from './message-factory.mjs'
import { createMemoryStore } from './memory-store.mjs'
import { RunStore } from './orchestration/run-store.mjs'

export {
  PlannerFallbackError,
  resolveOrchestrationAgentPreset,
  createPlannerProgressRelay,
  requiresReadOnlyPlan,
  validatePlanForRequest,
  completeReadOnlyPlanScopes,
  collectPlannerPathHints,
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
  const pendingApprovals = new Map()

  runStore.recoverIncompleteRuns().catch(console.error)

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
              durationMs: Number.isFinite(payload.durationMs) ? payload.durationMs : previous.durationMs ?? null,
            })
          } else if (payload.status === 'running') {
            omittedToolCalls += 1
          }
        }
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
    const user = { id: messageId(), author: 'user', name: '你', time: nowLabel(), text }
    const childFile = path.join(agentDataPath, 'orchestration', conversationId, `${taskId}.jsonl`)
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
      cwdOverride: workspacePath || state.workspacePath || (await getWorkspacePath(conversationId)),
      sessionKey: task.dshSessionKey || `tw-orchestration-${conversationId}-${taskId}`,
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

  function approvePlan(conversationId, runId) {
    const pending = pendingApprovals.get(runId)
    if (pending) {
      pending.resolve()
      pendingApprovals.delete(runId)
      return true
    }
    return false
  }

  function rejectPlan(conversationId, runId) {
    const pending = pendingApprovals.get(runId)
    if (pending) {
      pending.reject(new Error('用户已拒绝执行该计划'))
      pendingApprovals.delete(runId)
      return true
    }
    return false
  }

  return { planAndExecute, sendTaskMessage, abort, cancelTask, isBusy, listRunningConversationIds, approvePlan, rejectPlan }
}
