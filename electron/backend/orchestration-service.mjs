import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { applySkillInstructions, resolveSkillForSubtask } from './skill-prompt.mjs'
import { detectVerificationCommands } from './verification-policy.mjs'
import { executeDag, validateAndOrderTasks } from './dag-scheduler.mjs'
import { selectModelForTask, shouldUpgradeFailedTask } from './orchestration-policy.mjs'
import { buildRoutingOptions } from './routing-portfolio-service.mjs'
import { runWithSubtaskRetries } from './subtask-retry.mjs'

export class PlannerFallbackError extends Error {
  constructor(message, { partialUsage } = {}) {
    super(message)
    this.name = 'PlannerFallbackError'
    this.code = 'PLANNER_FALLBACK'
    this.partialUsage = partialUsage ?? null
  }
}
import { getTaskProfile } from './task-profile.mjs'
import { createMemoryStore, buildMemoryPromptSections } from './memory-store.mjs'
import { createTaskWorktree } from './worktree-service.mjs'

const TASK_TYPES = new Set(['research', 'implementation', 'test', 'review'])
const TYPE_LABELS = {
  research: '调研',
  implementation: '实现',
  test: '测试',
  review: '审查',
}
const TIER_LABELS = { cheap: 'low', balanced: 'balanced', strong: 'high' }

/** @typedef {'research' | 'implementation' | 'test' | 'review'} OrchestrationTaskType */

/**
 * Map DAG subtask types (and planner/synthesis turns) to DSH agent presets.
 * @param {{ noTools?: boolean, taskType?: OrchestrationTaskType }} options
 */
export function resolveOrchestrationAgentPreset({ noTools = false, taskType } = {}) {
  if (noTools) return 'taskweaver-planner'
  switch (taskType) {
    case 'research':
    case 'review':
      return 'taskweaver-readonly'
    case 'test':
    case 'implementation':
      return 'taskweaver-code'
    default:
      return 'taskweaver-code'
  }
}

function nowLabel() {
  return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function messageId() {
  return `m-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function parsePlan(text) {
  const withoutFence = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  const start = withoutFence.indexOf('{')
  const end = withoutFence.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('Planner 未返回有效的 JSON 任务计划')
  let parsed
  try {
    parsed = JSON.parse(withoutFence.slice(start, end + 1))
  } catch {
    throw new Error('Planner 返回的任务计划 JSON 无法解析')
  }
  if (!Array.isArray(parsed.tasks)) throw new Error('Planner 返回的任务计划缺少 tasks 数组')
  return parsed.tasks.map((task) => ({
    ...task,
    taskType: TASK_TYPES.has(task.taskType) ? task.taskType : 'implementation',
    dependsOn: Array.isArray(task.dependsOn) ? task.dependsOn : [],
    reasons: Array.isArray(task.reasons) ? task.reasons : [],
  }))
}

function layoutTasks(tasks) {
  const columns = 3
  return tasks.map((task, index) => ({
    ...task,
    x: 4 + (index % columns) * 33,
    y: 5 + Math.floor(index / columns) * 34,
  }))
}

function combineUsage(usages) {
  const sum = (key) => usages.reduce((total, usage) => total + (usage?.[key] ?? 0), 0)
  const elapsedMs = sum('elapsedMs')
  const outputTokens = sum('outputTokens')
  const latest = [...usages].reverse().find(Boolean)
  return {
    inputTokens: sum('inputTokens'),
    outputTokens,
    cacheReadTokens: sum('cacheReadTokens'),
    cacheWriteTokens: sum('cacheWriteTokens'),
    costUsd: sum('costUsd'),
    elapsedMs,
    tokensPerSecond: elapsedMs ? Math.round((outputTokens * 1000) / elapsedMs) : 0,
    contextTokens: latest?.contextTokens ?? null,
    contextWindow: latest?.contextWindow ?? null,
    contextPercent: latest?.contextPercent ?? null,
  }
}

export function createOrchestrationService({
  modelService,
  profileStore,
  appState,
  mcpService,
  getWorkspacePath,
  getWorkspaceTrusted = () => false,
  agentDataPath,
  builtInSkillsPath,
  builtInExtensionsPath,
  builtInExtensionsPaths,
  userDataPath,
  getAppPreferences,
  webSearchService,
  dshRuntime = null,
}) {
  /** @type {Map<string, { inFlight: boolean, abortController: AbortController | null }>} */
  const runs = new Map()
  const memory = createMemoryStore({ agentDataPath })

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
  }) {
    const cwd = cwdOverride || getWorkspacePath()
    if (!cwd) throw new Error('请先设置工作区目录')
    if (!dshRuntime) throw new Error('多 Agent 编排需要 DSH 运行时')
    if (!conversationId) throw new Error('DSH 子任务缺少所属对话')
    const agentPreset = resolveOrchestrationAgentPreset({ noTools, taskType })
    return dshRuntime.runAgentTurn({
      conversationId,
      sessionKey: sessionKey || `tw-orchestration-${conversationId}-${path.basename(sessionFile, path.extname(sessionFile))}`,
      modelKey,
      text: applySkillInstructions(text, skill),
      webContents,
      cwd,
      agentPreset,
      taskId,
      signal,
    })
  }

  async function publishTasks(tasks, webContents, conversationId) {
    const normalized = layoutTasks(tasks)
    if (conversationId && appState.setTasksForConversation) {
      await appState.setTasksForConversation(conversationId, normalized)
    } else {
      await appState.setTasks(normalized)
    }
    if (!webContents.isDestroyed()) webContents.send('chat:stream', { type: 'tasks', tasks: normalized, conversationId })
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

  async function planAndExecute({ text, primaryModelKey, conversationId, webContents, skill, workspacePath }) {
    if (!conversationId) throw new Error('当前对话标识无效')
    if (getRun(conversationId)?.inFlight) throw new Error('该对话的上一条多 Agent 任务仍在处理中')
    const abortController = new AbortController()
    const run = { inFlight: true, abortController }
    runs.set(conversationId, run)
    const runId = crypto.randomUUID()
    try {
      if (!webContents.isDestroyed()) webContents.send('chat:stream', { type: 'progress', text: '正在分析任务并生成 DAG…', conversationId })
      const cwd = workspacePath || getWorkspacePath()
      await memory.init(conversationId, cwd, text)
      const plannerFile = path.join(agentDataPath, 'orchestration', conversationId, 'planner.jsonl')
      const plannerPrompt = [
        '你是 TaskWeaver 的多智能体高级任务规划器 (Planner Agent)。负责将软件工程需求拆分为协作子任务的有向无环图 (DAG)。你不执行代码，不能调用工具。',
        '协作子任务职责规范：',
        '1. research (调研 Agent): 负责先期探索工作区架构、定位受影响的文件与符号，输出结构化方案，无写权限。',
        '2. implementation (编码 Agent): 依赖 research，负责具体的代码编写与精准修改，严格遵循代码规范。',
        '3. test (测试验证 Agent): 依赖 implementation，负责运行构建/单元测试命令，验证修改结果。',
        '4. review (审查 Agent): 依赖 implementation，负责审查代码 Diff、潜在边界问题与安全性。',
        '请根据任务规模拆分为 2 到 5 个职责明确的子任务；有先后依赖的务必在 dependsOn 中声明前置任务 id。',
        '只输出纯 JSON，不加 Markdown 代码块。格式：{"tasks":[{"id":"T1","title":"短标题","taskType":"research|implementation|test|review","role":"职责名","description":"目标与验收标准","dependsOn":[],"reasons":["规划原因"]}]}',
        `工作区：${cwd}`,
        `用户原始请求：\n${text}`,
      ].join('\n\n')
      const plannerSuffixRetry = '\n\n上次输出无法解析。请只输出一个 JSON 对象，不要 Markdown 代码块，不要任何解释文字。'
      let planResult
      let planned
      try {
        planResult = await runPrompt({
          modelKey: primaryModelKey,
          text: plannerPrompt,
          sessionFile: plannerFile,
          noTools: true,
          skill,
          signal: abortController.signal,
          conversationId,
          cwdOverride: cwd,
          sessionKey: `tw-orchestration-${conversationId}-${runId}-planner`,
        })
        planned = validateAndOrderTasks(parsePlan(planResult.text))
      } catch (firstError) {
        try {
          planResult = await runPrompt({
            modelKey: primaryModelKey,
            text: plannerPrompt + plannerSuffixRetry,
            sessionFile: plannerFile,
            noTools: true,
            skill,
            signal: abortController.signal,
            conversationId,
            cwdOverride: cwd,
            sessionKey: `tw-orchestration-${conversationId}-${runId}-planner-retry`,
          })
          planned = validateAndOrderTasks(parsePlan(planResult.text))
        } catch (secondError) {
          const message = secondError instanceof Error ? secondError.message : String(secondError)
          throw new PlannerFallbackError(message, { partialUsage: planResult?.usage ?? null })
        }
      }
      const usage = [planResult.usage]
      const routingOptions = await buildRoutingOptions({ userDataPath })
      const catalog = await modelService.listCatalog()
      const routeOpts = { ...routingOptions }
      const selected = await Promise.all(planned.map(async (task) => {
        const routing = selectModelForTask(task.taskType, catalog, primaryModelKey, routeOpts)
        if (!routing.model) throw new Error(`子任务 ${task.id} 没有可用模型`)
        const profile = routing.model.profile
        const message = {
          id: `${task.id}-plan`,
          author: 'orchestrator',
          name: 'TaskWeaver',
          time: nowLabel(),
          text: `已创建子任务：${task.description}`,
        }
        return {
          ...task,
          role: task.role || TYPE_LABELS[task.taskType],
          modelKey: routing.model.key,
          model: routing.displayName || routing.model.name,
          tier: TIER_LABELS[profile?.tier ?? 'balanced'],
          status: 'queued',
          statusLabel: '排队中',
          duration: '',
          detail: task.description,
          confidence: routing.confidence ? `${Math.round(routing.confidence * 100)}%` : '',
          reasons: [...task.reasons, routing.reason],
          messages: [message],
          routeReason: routing.reason,
          routeDecision: {
            strategy: routing.strategy,
            displayName: routing.displayName,
            reasons: routing.reasons,
            confidence: routing.confidence,
            estimatedCost: routing.estimatedCost,
          },
          toolProfile: getTaskProfile(task.taskType).id,
          dshSessionKey: `tw-orchestration-${conversationId}-${runId}-${task.id}`,
        }
      }))
      let tasks = layoutTasks(selected)
      await publishTasks(tasks, webContents, conversationId)

      const prefs = getAppPreferences ? await getAppPreferences() : { worktreeIsolation: false }
      const worktreeTaskIds = []

      const execution = await executeDag(tasks, {
        signal: abortController.signal,
        onTaskChange: async (changed, meta) => {
          if (changed.status === 'running' && !webContents.isDestroyed()) {
            webContents.send('chat:stream', { type: 'progress', text: `正在执行 ${changed.id} · ${changed.title}（${changed.model}）…`, conversationId })
          }
          tasks = tasks.map((task) => {
            if (task.id !== changed.id) return task
            if (meta?.result) {
              const upgradedTo = meta.result.upgradedTo
              const upgradeNote = meta.result.upgradeReason
                ? `\n\n（经过 ${meta.result.upgradeAttempts ?? 1} 次模型升级重试，最终使用 ${meta.result.upgradedDisplayName ?? changed.model}：${meta.result.upgradeReason}）`
                : ''
              return {
                ...changed,
                worktreeIsolated: meta.result.worktreeIsolated === true || task.worktreeIsolated,
                ...(upgradedTo
                  ? {
                    modelKey: upgradedTo,
                    model: meta.result.upgradedDisplayName ?? changed.model,
                    routeReason: meta.result.upgradeReason ?? changed.routeReason,
                  }
                  : {}),
                messages: [...task.messages, {
                  id: `${changed.id}-assistant`,
                  author: 'agent',
                  name: changed.role,
                  time: nowLabel(),
                  text: (meta.result.text || '（Agent 未返回文本）') + upgradeNote,
                  modelKey: upgradedTo ?? changed.modelKey,
                  usage: meta.result.usage,
                }],
              }
            }
            return { ...task, ...changed }
          })
          await publishTasks(tasks, webContents, conversationId)
        },
        execute: async (task, dependencyResults) => {
          const prefs = getAppPreferences ? await getAppPreferences() : {}
          const childFile = path.join(agentDataPath, 'orchestration', conversationId, `${task.id}.jsonl`)
          const projectMemory = await memory.load(conversationId)
          const memoryBlock = buildMemoryPromptSections(projectMemory, task, dependencyResults)
          const workspaceRoot = cwd
          let execCwd = workspaceRoot
          let worktreeNote = ''
          if (
            prefs.worktreeIsolation &&
            userDataPath &&
            workspaceRoot &&
            (task.taskType === 'implementation' || task.taskType === 'test')
          ) {
            try {
              const wt = await createTaskWorktree({
                workspacePath: workspaceRoot,
                conversationId,
                taskId: task.id,
                userDataPath,
              })
              execCwd = wt.path
              worktreeTaskIds.push(task.id)
              worktreeNote = wt.reused
                ? '\n\n（在已有 git worktree 中执行，未自动合并到主工作区。）'
                : '\n\n（在独立 git worktree 中执行，未自动合并到主工作区。）'
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error)
              worktreeNote = `\n\n（worktree 创建失败，回退主工作区：${message}）`
            }
          }
          const profile = getTaskProfile(task.taskType)
          const subtaskSkill = resolveSkillForSubtask(skill, task.taskType)
          const buildPrompt = () => {
            const parts = [
              profile.preamble,
              memoryBlock,
              `当前子任务 ${task.id}：${task.title}\n${task.description}`,
              `职责：${task.role}。任务类型：${task.taskType}。工具档：${profile.id}。`,
              execCwd !== workspaceRoot ? `执行目录（隔离 worktree）：${execCwd}` : '',
            ]
            if (task.taskType === 'test' && workspaceRoot) {
              const policy = detectVerificationCommands(workspaceRoot)
              const cmd = policy?.primaryCommand || policy?.testCommand
              if (cmd) {
                parts.push(`【推荐验证命令】优先运行：\`${cmd}\`（若不适配本子任务可说明原因后选用其他命令）。`)
              }
            }
            parts.push('完成后简要说明做了什么、修改了哪些文件、验证结果和仍存在的问题。不要声称未实际执行的验证已经通过。')
            return parts.filter(Boolean).join('\n\n')
          }

          const runSubtask = async (modelKey) => runPrompt({
            modelKey,
            text: buildPrompt(),
            sessionFile: childFile,
            taskType: task.taskType,
            skill: subtaskSkill,
            webContents,
            taskId: task.id,
            cwdOverride: execCwd,
            signal: abortController.signal,
            conversationId,
            sessionKey: task.dshSessionKey,
          })

          const subtaskUpgradeMax = Math.max(0, Math.min(3, Number(prefs.subtaskUpgradeMax ?? 1) || 0))
          const execution = await runWithSubtaskRetries({
            initialModelKey: task.modelKey,
            maxRetries: subtaskUpgradeMax,
            canRetry: shouldUpgradeFailedTask(task.taskType),
            signal: abortController.signal,
            run: runSubtask,
            chooseModel: async ({ excludeModelKeys }) => {
              const freshCatalog = await modelService.listCatalog()
              const upgrade = selectModelForTask(task.taskType, freshCatalog, primaryModelKey, {
                ...routeOpts,
                excludeModelKeys,
              })
              if (!upgrade.model) return null
              return {
                modelKey: upgrade.model.key,
                displayName: upgrade.displayName || upgrade.model.name,
                reason: upgrade.reason,
              }
            },
            onRetry: async ({ displayName, attempt, maxRetries }) => {
              if (!webContents.isDestroyed()) {
                webContents.send('chat:stream', {
                  type: 'progress',
                  text: `子任务 ${task.id} 失败，正在尝试模型升级重试（${attempt}/${maxRetries}：${displayName}）…`,
                  conversationId,
                })
              }
            },
          })
          const { result } = execution
          const modelKey = execution.modelKey
          if (execution.attempts > 0) {
            result.upgradedFrom = task.modelKey
            result.upgradedTo = modelKey
            result.upgradedDisplayName = execution.candidate.displayName
            result.upgradeReason = execution.candidate.reason
            result.upgradeAttempts = execution.attempts
          }

          if (worktreeNote && result.text) result.text += worktreeNote
          result.worktreeIsolated = execCwd !== workspaceRoot
          usage.push(result.usage)
          await memory.recordTaskResult(conversationId, { ...task, statusLabel: '已完成', modelKey }, result)
          return result
        },
      })

      if (worktreeTaskIds.length && !webContents.isDestroyed()) {
        webContents.send('chat:stream', {
          type: 'progress',
          text: `已在独立 worktree 完成 ${worktreeTaskIds.length} 个子任务（${worktreeTaskIds.join('、')}）。可在 DAG 子任务面板或设置 → 路由与扩展 中查看差异并合并到主工作区。`,
          conversationId,
        })
      }

      if (execution.cancelled) {
        return {
          assistant: { text: '多 Agent 任务已停止；已完成的子任务进度保留。', usage: combineUsage(usage), cancelled: true },
          tasks,
          failedTaskIds: [...execution.failed],
        }
      }

      const outcomes = tasks.map((task) => ({
        id: task.id,
        title: task.title,
        status: task.statusLabel,
        result: task.messages.at(-1)?.text ?? '（任务未生成结果）',
      }))
      const projectMemory = await memory.load(conversationId)
      const synthesis = [
        '请根据下列子任务执行结果，面向用户总结本次工作的最终进展。不要再次执行工具，不要重复改代码。',
        '明确区分已完成、受阻和未完成的工作，并列出真实验证结果。若某子任务失败或被依赖阻塞，要明确说明。',
        projectMemory?.rolling_summary ? `【项目进展摘要】\n${projectMemory.rolling_summary}` : '',
        `用户原始请求：\n${text}`,
        `子任务结果：\n${JSON.stringify(outcomes, null, 2)}`,
      ].filter(Boolean).join('\n\n')
      if (!webContents.isDestroyed()) webContents.send('chat:stream', { type: 'progress', text: '子任务已结束，正在汇总执行结果…', conversationId })
      const synthesizeFn = async (prompt) => {
        if (!dshRuntime) throw new Error('多 Agent 编排需要 DSH 运行时')
        return dshRuntime.runAgentTurn({
          conversationId,
          sessionKey: `tw-orchestration-${conversationId}-${runId}-synthesis`,
          modelKey: primaryModelKey,
          text: applySkillInstructions(prompt, skill),
          webContents,
          cwd,
          agentPreset: resolveOrchestrationAgentPreset({ noTools: true }),
          signal: abortController.signal,
        })
      }
      const assistant = await synthesizeFn(synthesis)
      usage.push(assistant.usage)
      return {
        assistant: { ...assistant, usage: combineUsage(usage) },
        tasks,
        failedTaskIds: [...execution.failed],
      }
    } finally {
      run.inFlight = false
      run.abortController = null
      if (runs.get(conversationId) === run) runs.delete(conversationId)
    }
  }

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
      cwdOverride: workspacePath || state.workspacePath || getWorkspacePath(),
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
    }
    const updated = tasks.map((item) => item.id === taskId ? { ...item, messages: [...item.messages, user, assistant] } : item)
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

  return { planAndExecute, sendTaskMessage, abort, isBusy, listRunningConversationIds }
}
