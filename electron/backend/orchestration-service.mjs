import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { applySkillInstructions, resolveSkillForSubtask } from './skill-prompt.mjs'
import { detectVerificationCommands } from './verification-policy.mjs'
import { executeDag, validateAndOrderTasks } from './dag-scheduler.mjs'
import { selectModelForTask, shouldUpgradeFailedTask } from './orchestration-policy.mjs'
import { buildRoutingOptions } from './routing-portfolio-service.mjs'
import { runWithSubtaskRetries } from './subtask-retry.mjs'
import { scoreTextRelevance } from './text-relevance.mjs'

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
const READ_ONLY_TASK_TYPES = new Set(['research', 'review'])
const PLANNER_INDEX_IGNORES = new Set([
  '.git', '.svn', '.hg', 'node_modules', 'dist', 'build', 'release', '.next', '.nuxt',
  '.turbo', '.cache', 'coverage', 'target', 'out',
])
const PLANNER_SOURCE_DIR_PRIORITY = new Map([
  ['electron', 0], ['src', 1], ['app', 2], ['server', 3], ['backend', 4],
  ['lib', 5], ['packages', 6], ['scripts', 7], ['tests', 8], ['vendor', 9], ['docs', 10],
])
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

export function requiresReadOnlyPlan(text) {
  const clean = String(text ?? '')
  return /只读|不得\s*(?:修改|写入|创建|删除)|不(?:要|得|可)\s*(?:修改|写入|创建|删除)|禁止\s*(?:修改|写入|创建|删除)|仅(?:做|进行)?\s*(?:分析|阅读|检查|审查)/i.test(clean)
}

function explicitParallelResearchCount(text) {
  const request = String(text ?? '')
  const match = request.match(/(?:要求|需要|请|要)?\s*(两|二|三|四|五|[2-5])\s*(?:项|个)\s*(?:彼此)?独立(?:的)?(?:并行)?(?:研究|调研)(?:任务)?(?:并行)?/i)
  if (!match) return null
  const count = { 两: 2, 二: 2, 三: 3, 四: 4, 五: 5 }[match[1]] ?? Number(match[1])
  return Number.isInteger(count) ? count : null
}

export function validatePlanForRequest(tasks, requestText) {
  if (requiresReadOnlyPlan(requestText)) {
    const unsafe = tasks.filter((task) => !READ_ONLY_TASK_TYPES.has(task.taskType))
    if (unsafe.length) {
      throw new Error(`只读请求包含非只读子任务类型：${unsafe.map((task) => `${task.id}=${task.taskType}`).join(', ')}；只允许 research/review`)
    }
  }
  const requestedResearchCount = explicitParallelResearchCount(requestText)
  if (requestedResearchCount !== null) {
    const researchTasks = tasks.filter((task) => task.taskType === 'research')
    if (researchTasks.length !== requestedResearchCount
      || tasks.length !== requestedResearchCount
      || researchTasks.some((task) => task.dependsOn?.length)) {
      throw new Error(
        `并行研究任务数量不匹配：用户明确要求 ${requestedResearchCount} 项相互独立的研究任务，计划却包含 ${researchTasks.length} 项 research、共 ${tasks.length} 个节点，或研究任务存在依赖；最终交叉汇总由编排器负责，不应额外创建汇总节点。`,
      )
    }
  }
  return tasks
}

/** Build a bounded paths-only workspace hint for planning; never reads file contents or follows symlinks. */
export async function collectPlannerPathHints(workspacePath, query, { maxVisited = 1200, limit = 90 } = {}) {
  const root = await fs.realpath(workspacePath)
  const visitLimit = Math.max(100, Math.min(5000, Number(maxVisited) || 1200))
  const outputLimit = Math.max(10, Math.min(160, Number(limit) || 90))
  const queue = [{ absolute: root, relative: '', depth: 0 }]
  const files = []
  const directories = []
  let visitedEntries = 0

  while (queue.length && visitedEntries < visitLimit) {
    const current = queue.shift()
    let entries
    try {
      entries = await fs.readdir(current.absolute, { withFileTypes: true })
    } catch {
      continue
    }
    entries.sort((a, b) => {
      const aPriority = PLANNER_SOURCE_DIR_PRIORITY.get(a.name.toLocaleLowerCase()) ?? 50
      const bPriority = PLANNER_SOURCE_DIR_PRIORITY.get(b.name.toLocaleLowerCase()) ?? 50
      return aPriority - bPriority || a.name.localeCompare(b.name)
    })

    for (const entry of entries) {
      if (visitedEntries++ >= visitLimit) break
      if (entry.name.startsWith('.') || PLANNER_INDEX_IGNORES.has(entry.name) || entry.isSymbolicLink()) continue
      const relative = current.relative ? `${current.relative}/${entry.name}` : entry.name
      const absolute = path.join(current.absolute, entry.name)
      if (entry.isDirectory()) {
        directories.push(relative)
        if (current.depth < 3) queue.push({ absolute, relative, depth: current.depth + 1 })
      } else if (entry.isFile()) {
        files.push(relative)
      }
    }
  }

  const rankPath = (candidate) => {
    const depth = candidate.split('/').length
    const rootFileBonus = depth === 1 ? 3 : 0
    const rootManifestBonus = depth === 1 && /^(package\.json|pnpm-lock\.yaml|package-lock\.json|tsconfig\.json|README(?:\.md)?)$/i.test(candidate) ? 12 : 0
    const codePathBonus = /(^|\/)(main|index|app|server|register-ipc|dsh-chat-service|orchestration-service)(\.[^.]+)?$/i.test(candidate) ? 5 : 0
    const sourceExtensionBonus = /\.(c|m)?(js|jsx|ts|tsx|mjs|cjs|json|py|go|rs)$/i.test(candidate) ? 1 : 0
    return scoreTextRelevance(query, '', { pathText: candidate }) + rootFileBonus + rootManifestBonus + codePathBonus + sourceExtensionBonus
  }
  const rankedFiles = files
    .map((candidate) => ({ candidate, score: rankPath(candidate) }))
    .sort((a, b) => b.score - a.score || a.candidate.localeCompare(b.candidate))
  const preferredDirectories = directories
    .filter((candidate) => candidate.split('/').length <= 2)
    .sort((a, b) => rankPath(b) - rankPath(a) || a.localeCompare(b))
  const selected = []
  for (const candidate of [...rankedFiles.map(({ candidate }) => candidate), ...preferredDirectories]) {
    if (!selected.includes(candidate)) selected.push(candidate)
    if (selected.length >= outputLimit) break
  }
  return {
    paths: selected,
    visitedEntries,
    truncated: queue.length > 0 || visitedEntries >= visitLimit || files.length + preferredDirectories.length > selected.length,
  }
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

export function summarizeExecutionEvidence(evidence) {
  const calls = Array.isArray(evidence?.observedToolCalls) ? evidence.observedToolCalls : []
  const successful = calls.filter((call) => call.status === 'done')
  const reads = successful.filter((call) => call.toolName === 'read').length
  const searches = successful.filter((call) => ['glob', 'grep', 'find', 'ls'].includes(call.toolName)).length
  const failed = calls.filter((call) => ['error', 'failed', 'blocked', 'cancelled'].includes(call.status)).length
  const running = calls.filter((call) => call.status === 'running').length
  const parts = []
  if (reads) parts.push(`读取 ${reads}`)
  if (searches) parts.push(`搜索 ${searches}`)
  if (failed) parts.push(`失败 ${failed}`)
  if (running) parts.push(`未结束 ${running}`)
  if (evidence?.omittedToolCalls) parts.push(`另有 ${evidence.omittedToolCalls} 次未纳入明细`)
  const label = parts.length
    ? `Host 工具记录：${parts.join(' · ')}`
    : 'Host 未观测到工具调用'
  return {
    source: evidence?.source === 'z-host-tool-events' ? 'z-host-tool-events' : 'unknown',
    observedCallCount: calls.length,
    successfulReadCount: reads,
    successfulSearchCount: searches,
    failedCallCount: failed,
    runningCallCount: running,
    omittedToolCalls: Math.max(0, Number(evidence?.omittedToolCalls) || 0),
    label,
  }
}

export function assessSubtaskCompletion(task, result) {
  const calls = Array.isArray(result?.executionEvidence?.observedToolCalls)
    ? result.executionEvidence.observedToolCalls
    : []
  if (task?.taskType === 'research' || task?.taskType === 'review') {
    const reads = calls.filter((call) => call.toolName === 'read' && call.status === 'done').length
    if (reads === 0) {
      return {
        complete: false,
        reason: 'Host 未记录到成功的文件读取；搜索结果不足以证明源码或审查依据已被阅读核实。',
      }
    }
  }
  return { complete: true, reason: '' }
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
    parentSessionId,
  }) {
    const cwd = cwdOverride || getWorkspacePath()
    if (!cwd) throw new Error('请先设置工作区目录')
    if (!dshRuntime) throw new Error('多 Agent 编排需要 Z Runtime')
    if (!conversationId) throw new Error('Z 子任务缺少所属对话')
    const agentPreset = resolveOrchestrationAgentPreset({ noTools, taskType })
    const observedToolCalls = new Map()
    let omittedToolCalls = 0
    const tracedWebContents = taskId ? {
      isDestroyed: () => webContents?.isDestroyed?.() ?? false,
      send(channel, payload) {
        if (channel === 'chat:stream' && payload?.type === 'tool' && payload.taskId === taskId) {
          const id = String(payload.id ?? `${payload.toolName ?? 'tool'}-${observedToolCalls.size}`)
          const previous = observedToolCalls.get(id) ?? {}
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
        if (!webContents?.isDestroyed?.()) webContents?.send(channel, payload)
      },
    } : webContents
    const result = await dshRuntime.runAgentTurn({
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
    })
    if (!taskId) return result
    return {
      ...result,
      executionEvidence: {
        source: 'z-host-tool-events',
        observedToolCalls: [...observedToolCalls.values()],
        omittedToolCalls,
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
      const readOnlyRequest = requiresReadOnlyPlan(text)
      const plannerPathHints = await collectPlannerPathHints(cwd, text)
      await memory.init(conversationId, cwd, text)
      const plannerFile = path.join(agentDataPath, 'orchestration', conversationId, 'planner.jsonl')
      const plannerPrompt = [
        '你是 TaskWeaver 的多智能体高级任务规划器 (Planner Agent)。负责将软件工程需求拆分为协作子任务的有向无环图 (DAG)。你不执行代码，不能调用工具。',
        '协作子任务职责规范：',
        '1. research (调研 Agent): 负责先期探索工作区架构、定位受影响的文件与符号，输出结构化方案，无写权限。',
        '2. implementation (编码 Agent): 依赖 research，负责具体的代码编写与精准修改，严格遵循代码规范。',
        '3. test (测试验证 Agent): 依赖 implementation，负责运行构建/单元测试命令，验证修改结果。',
        '4. review (审查 Agent): 依赖 implementation，负责审查代码 Diff、潜在边界问题与安全性。',
        ...(readOnlyRequest ? [
          '【只读请求强制约束】用户明确要求只读/禁止修改。本次所有子任务只能使用 research 或 review；即使是交叉汇总、复核、总结，也必须标为 review 或 research，绝不能标为 implementation/test。每项描述必须明确“只读，不修改文件、不运行写入命令”。',
        ] : []),
        '请根据任务规模拆分为 2 到 5 个职责明确的子任务；如果用户明确给出“ N 项独立研究/调研并行”数量，DAG 必须恰好包含 N 个互相独立的 research 节点，不得增加 review 或汇总节点，也不得让这些 research 节点相互依赖。编排器会在所有子任务结束后自动调用最终汇总，因此不要额外创建只负责“汇总/总结/交叉汇总/综合各研究结果”的 review 子任务；review 只用于有独立审查对象和验收标准的实际审查（例如基于具体 diff 检查风险），不要重复读取 research 已覆盖的文件来代替最终汇总。',
        '研究/审查任务必须有明确边界：每项只回答一个问题，在 description 中列出允许检查的文件或最多一个窄目录、验收点和停止条件；不要分配“通读整个项目/检查所有代码”这类开放任务。回答函数实现、调用顺序或配置细节必须读取源码文件；grep/glob 只能定位，不能作为代码已核实的证据。每个需要解释代码或交叉核验事实的 research/review 任务，应优先指定少量直接可读文件或明确“先最多搜索 2 次、再 read 已定位文件”，预留检查预算用于读取。focused 只读子任务最多进行 6 次 read/glob/grep/find/ls 检查调用，到达上限就提交已验证结论与未确认项；不得因发现新路径而突破预算。多个只读任务应尽量检查不同范围，避免重复探索。',
        `【工作区路径索引：仅路径名，不含文件正文，也不代表已读取】扫描 ${plannerPathHints.visitedEntries} 个目录项${plannerPathHints.truncated ? '（达到扫描/展示上限，结果不完整）' : ''}。只从下列真实存在的路径中挑选候选文件；不得仅凭路径推断其内容。规划时尽量直接指定少量候选文件，并要求子 Agent 读取它们；只有索引不足时才安排少量搜索：\n${plannerPathHints.paths.map((item) => `- ${item}`).join('\n') || '(没有发现路径；任务需先用有限搜索定位，再实际读取文件)'}`,
        '只输出纯 JSON，不加 Markdown 代码块。格式：{"tasks":[{"id":"T1","title":"短标题","taskType":"research|implementation|test|review","role":"职责名","description":"目标与验收标准","dependsOn":[],"reasons":["规划原因"]}]}',
        `工作区：${cwd}`,
        `用户原始请求：\n${text}`,
      ].join('\n\n')
      let plannerSuffixRetry = '\n\n上次输出无法解析。请只输出一个 JSON 对象，不要 Markdown 代码块，不要任何解释文字。'
      let planResult
      let planned
      let plannerSessionKey = `tw-orchestration-${conversationId}-${runId}-planner`
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
          sessionKey: plannerSessionKey,
        })
        planned = validatePlanForRequest(validateAndOrderTasks(parsePlan(planResult.text)), text)
      } catch (firstError) {
        if (firstError?.message?.includes('只读请求包含非只读子任务类型')) {
          plannerSuffixRetry = `\n\n上次计划被安全校验拒绝：${firstError.message}。这是只读任务；请把所有 implementation/test 子任务改为 research/review。汇总和交叉核验请标为 review。不得输出任何非 research/review 类型。只输出纯 JSON。`
        } else if (firstError?.message?.startsWith('并行研究任务数量不匹配：')) {
          plannerSuffixRetry = `\n\n上次计划被请求约束校验拒绝：${firstError.message}。请严格按用户明确指定的独立并行研究数量重写计划：只创建恰好对应数量的 research 节点，彼此无依赖；不要创建 review 或汇总节点，最终综合由编排器完成。只输出纯 JSON。`
        }
        try {
          plannerSessionKey = `tw-orchestration-${conversationId}-${runId}-planner-retry`
          planResult = await runPrompt({
            modelKey: primaryModelKey,
            text: plannerPrompt + plannerSuffixRetry,
            sessionFile: plannerFile,
            noTools: true,
            skill,
            signal: abortController.signal,
            conversationId,
            cwdOverride: cwd,
            sessionKey: plannerSessionKey,
          })
          planned = validatePlanForRequest(validateAndOrderTasks(parsePlan(planResult.text)), text)
        } catch (secondError) {
          const message = secondError instanceof Error ? secondError.message : String(secondError)
          throw new PlannerFallbackError(message, { partialUsage: planResult?.usage ?? null })
        }
      }
      const plannerSessionId = dshRuntime.getSessionId?.(plannerSessionKey) || undefined
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
                executionEvidenceSummary: summarizeExecutionEvidence(meta.result.executionEvidence),
                messages: [...task.messages, {
                  id: `${changed.id}-assistant`,
                  author: 'agent',
                  name: changed.role,
                  time: nowLabel(),
                  text: (meta.result.text || '（Agent 未返回文本）') + upgradeNote,
                  modelKey: upgradedTo ?? changed.modelKey,
                  usage: meta.result.usage,
                  executionEvidence: meta.result.executionEvidence ?? null,
                  executionEvidenceSummary: summarizeExecutionEvidence(meta.result.executionEvidence),
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
          const buildPrompt = (evidenceBundle = null) => {
            const memoryBlock = buildMemoryPromptSections(projectMemory, task, dependencyResults, { evidenceBundle })
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

          const runSubtask = async (modelKey, evidenceBundle = null) => runPrompt({
              modelKey,
              text: buildPrompt(evidenceBundle),
              sessionFile: childFile,
              taskType: task.taskType,
              skill: subtaskSkill,
              webContents,
              taskId: task.id,
              cwdOverride: execCwd,
              signal: abortController.signal,
              conversationId,
              parentSessionId: plannerSessionId,
              // Escalation gets a clean DSH session: carry only the compact,
              // verified L4 evidence rather than inheriting failed-turn noise.
              sessionKey: evidenceBundle
                ? `${task.dshSessionKey}-escalation-${evidenceBundle.attempted_actions.length}`
                : task.dshSessionKey,
            })

          const subtaskUpgradeMax = Math.max(0, Math.min(3, Number(prefs.subtaskUpgradeMax ?? 1) || 0))
          let execution
          try {
            execution = await runWithSubtaskRetries({
              task,
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
              onRetry: async ({ displayName, attempt, maxRetries, failure, evidenceBundle }) => {
                await memory.recordEvidenceBundle(conversationId, evidenceBundle)
                if (!webContents.isDestroyed()) {
                  webContents.send('chat:stream', {
                    type: 'progress',
                    text: `子任务 ${task.id} 失败（${failure.kind}），正在尝试模型升级重试（${attempt}/${maxRetries}：${displayName}）…`,
                    conversationId,
                  })
                }
              },
            })
          } catch (error) {
            if (error?.evidenceBundle) await memory.recordEvidenceBundle(conversationId, error.evidenceBundle)
            throw error
          }
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
          result.completionAssessment = assessSubtaskCompletion(task, result)
          usage.push(result.usage)
          await memory.recordTaskResult(conversationId, {
            ...task,
            statusLabel: result.completionAssessment.complete ? '已完成' : '证据不足',
            modelKey,
          }, result)
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
        runtimeObservedActions: task.messages.at(-1)?.executionEvidence ?? {
          source: 'z-host-tool-events',
          observedToolCalls: [],
        },
        evidenceAssessment: task.executionEvidenceSummary
          ?? summarizeExecutionEvidence(task.messages.at(-1)?.executionEvidence),
      }))
      const projectMemory = await memory.load(conversationId)
      const synthesis = [
        '请根据下列子任务执行结果，面向用户总结本次工作的最终进展。不要再次执行工具，不要重复改代码。',
        '明确区分已完成、受阻和未完成的工作，并列出真实验证结果。若某子任务失败或被依赖阻塞，要明确说明。',
        '【证据规则】每个子任务附带的 runtimeObservedActions 是 Z Host 实际观测到的工具调用记录，优先级高于子 Agent 的自述；evidenceAssessment 是后端根据该记录计算的摘要。只能声称调用了记录中出现的工具；没有 read 工具记录就不能声称实际读取并核验了文件，没有测试/构建命令记录就不能声称测试/构建已运行或通过。若子 Agent 自述与记录不符，明确标为“未能从工具记录核实”，不要补造调用、文件或验证结果。无工具记录的依赖汇总可以作为汇总输出，但不得描述成独立核验。',
        projectMemory?.rolling_summary ? `【项目进展摘要】\n${projectMemory.rolling_summary}` : '',
        `用户原始请求：\n${text}`,
        `子任务结果：\n${JSON.stringify(outcomes, null, 2)}`,
      ].filter(Boolean).join('\n\n')
      if (!webContents.isDestroyed()) webContents.send('chat:stream', { type: 'progress', text: '子任务已结束，正在汇总执行结果…', conversationId })
      const synthesizeFn = async (prompt) => {
        if (!dshRuntime) throw new Error('多 Agent 编排需要 Z Runtime')
        return dshRuntime.runAgentTurn({
          conversationId,
          sessionKey: `tw-orchestration-${conversationId}-${runId}-synthesis`,
          modelKey: primaryModelKey,
          text: applySkillInstructions(prompt, skill),
          webContents,
          cwd,
          agentPreset: resolveOrchestrationAgentPreset({ noTools: true }),
          parentSessionId: plannerSessionId,
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

  return { planAndExecute, sendTaskMessage, abort, isBusy, listRunningConversationIds }
}
