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
const MAX_READ_ONLY_SCOPE_PATHS = 12
const PLANNER_INDEX_IGNORES = new Set([
  '.git', '.svn', '.hg', 'node_modules', 'dist', 'build', 'release', '.next', '.nuxt',
  '.turbo', '.cache', 'coverage', 'target', 'out', 'vendor', 'runtime-packages',
  '.pnpm-store', '.taskweaver-build', 'taskweaver-z-runtime', 'taskweaver-dsh-runtime',
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

export function createPlannerProgressRelay(webContents, conversationId, {
  now = Date.now,
  heartbeatMs = 10_000,
} = {}) {
  const startedAt = now()
  let stage = '正在分析任务并生成 DAG'
  let lastText = ''

  const publish = (force = false) => {
    if (!webContents || webContents.isDestroyed?.()) return
    const seconds = Math.max(0, Math.floor((now() - startedAt) / 1_000))
    const waited = seconds < 60
      ? `已等待 ${seconds} 秒`
      : `已等待 ${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`
    const text = `${stage}（${waited}）…`
    if (!force && text === lastText) return
    lastText = text
    try {
      webContents.send('chat:stream', { type: 'progress', text, conversationId })
    } catch { /* renderer may be closing */ }
  }
  const setStage = (nextStage) => {
    if (stage === nextStage) return
    stage = nextStage
    publish(true)
  }

  publish(true)
  const timer = setInterval(() => publish(true), Math.max(1_000, heartbeatMs))
  timer.unref?.()

  return {
    webContents: {
      isDestroyed: () => Boolean(webContents?.isDestroyed?.()),
      send(channel, event) {
        if (channel !== 'chat:stream') return
        if (event?.type === 'planner_phase' && event.phase === 'reasoning') {
          setStage('Planner 正在分析任务关系')
        } else if (event?.type === 'planner_phase' && event.phase === 'text') {
          setStage('Planner 正在整理任务计划')
        } else if (event?.type === 'thinking_start' || event?.type === 'thinking_delta') {
          setStage('Planner 正在分析任务关系')
        } else if (event?.type === 'delta') {
          setStage('Planner 正在整理任务计划')
        } else if (event?.type === 'retry' && event.phase === 'start') {
          setStage('计划未通过校验，正在进行一次有限修正')
        } else if (event?.type === 'error') {
          setStage('Planner 请求失败，正在准备安全回退')
        } else {
          return
        }
      },
    },
    update(nextStage) {
      if (typeof nextStage !== 'string' || !nextStage.trim()) return
      setStage(nextStage.trim())
    },
    dispose() {
      clearInterval(timer)
    },
  }
}

function messageId() {
  return `m-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function mergeFileChanges(...collections) {
  const files = new Map()
  for (const change of collections.flat(2)) {
    if (typeof change?.path !== 'string' || !change.path) continue
    const key = change.path.replace(/\\/g, '/').toLocaleLowerCase()
    const current = files.get(key)
    const hasCounts = Number.isFinite(change.addedLines) && Number.isFinite(change.deletedLines)
    if (!current) {
      files.set(key, {
        path: change.path,
        ...(hasCounts ? { addedLines: Math.max(0, change.addedLines), deletedLines: Math.max(0, change.deletedLines) } : {}),
        ...(change.isNewFile ? { isNewFile: true } : {}),
        statsComplete: hasCounts,
      })
      continue
    }
    if (hasCounts && current.statsComplete) {
      current.addedLines += Math.max(0, change.addedLines)
      current.deletedLines += Math.max(0, change.deletedLines)
    } else {
      current.statsComplete = false
      delete current.addedLines
      delete current.deletedLines
    }
    current.isNewFile ||= change.isNewFile === true
  }
  return Array.from(files.values(), ({ statsComplete, ...file }) => file)
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
    scopePaths: task.scopePaths,
  }))
}

function normalizeReadOnlyScopePaths(scopePaths, taskId) {
  if (!Array.isArray(scopePaths)) {
    throw new Error(`只读子任务范围无效：${taskId} 缺少 scopePaths 数组`)
  }
  if (scopePaths.length === 0 || scopePaths.length > MAX_READ_ONLY_SCOPE_PATHS) {
    throw new Error(`只读子任务范围无效：${taskId} 必须指定 1 到 ${MAX_READ_ONLY_SCOPE_PATHS} 个明确的工作区相对路径`)
  }

  const normalized = []
  for (const rawPath of scopePaths) {
    if (typeof rawPath !== 'string' || rawPath.trim() === '') {
      throw new Error(`只读子任务范围无效：${taskId} 的 scopePaths 只能包含非空路径`)
    }
    const candidate = rawPath.trim().normalize('NFC').replaceAll('\\', '/')
    const segments = candidate.split('/')
    if (
      candidate.startsWith('/')
      || /^[a-z]:/i.test(candidate)
      || /[\u0000-\u001f\u007f]/.test(candidate)
      || /[*?{}\[\]]/.test(candidate)
      || segments.includes('..')
    ) {
      throw new Error(`只读子任务范围无效：${taskId} 的路径必须是字面量工作区相对路径，不能包含绝对路径、通配符或 ..`)
    }
    const relativePath = segments.filter((segment) => segment && segment !== '.').join('/')
    if (!relativePath) {
      throw new Error(`只读子任务范围无效：${taskId} 不能把整个工作区作为单个搜索范围`)
    }
    if (!normalized.includes(relativePath)) normalized.push(relativePath)
  }
  return normalized
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
  const normalizedTasks = tasks.map((task) => READ_ONLY_TASK_TYPES.has(task.taskType)
    ? { ...task, scopePaths: normalizeReadOnlyScopePaths(task.scopePaths, task.id) }
    : task)
  if (requiresReadOnlyPlan(requestText)) {
    const unsafe = normalizedTasks.filter((task) => !READ_ONLY_TASK_TYPES.has(task.taskType))
    if (unsafe.length) {
      throw new Error(`只读请求包含非只读子任务类型：${unsafe.map((task) => `${task.id}=${task.taskType}`).join(', ')}；只允许 research/review`)
    }
  }
  const requestedResearchCount = explicitParallelResearchCount(requestText)
  if (requestedResearchCount !== null) {
    const researchTasks = normalizedTasks.filter((task) => task.taskType === 'research')
    if (researchTasks.length !== requestedResearchCount
      || normalizedTasks.length !== requestedResearchCount
      || researchTasks.some((task) => task.dependsOn?.length)) {
      throw new Error(
        `并行研究任务数量不匹配：用户明确要求 ${requestedResearchCount} 项相互独立的研究任务，计划却包含 ${researchTasks.length} 项 research、共 ${normalizedTasks.length} 个节点，或研究任务存在依赖；最终交叉汇总由编排器负责，不应额外创建汇总节点。`,
      )
    }
  }
  return normalizedTasks
}

/** Close predictable entrypoint and request-chain gaps using only indexed, existing paths. */
export function completeReadOnlyPlanScopes(tasks, requestText, indexedPaths) {
  const request = String(requestText ?? '')
  const available = new Set(Array.isArray(indexedPaths) ? indexedPaths : [])
  const needsStartupCoverage = /应用启动|启动入口|启动链路|初始化顺序/.test(request)
  const needsAgentChainCoverage = /(?:agent|请求|调用|聊天).{0,24}(?:链路|调用|端到端)|(?:链路|端到端).{0,24}(?:agent|请求|调用|聊天)/i.test(request)

  return tasks.map((task) => {
    if (!READ_ONLY_TASK_TYPES.has(task.taskType)) return task
    const taskText = `${task.title ?? ''} ${task.role ?? ''} ${task.description ?? ''}`
    // A planner may intentionally provide a closed evidence boundary. In that
    // case, augmenting it with predictable "missing" files contradicts the
    // assigned scope and encourages the agent to keep exploring after its stop
    // condition. Trust the explicit scopePaths and let completion evidence
    // report a genuine gap instead.
    const hasExplicitScopeBoundary = /(?:范围\s*(?:仅限|只限|限定)|(?:仅限|只限)(?:于)?(?:读取|检查|查看|研究)\s*(?:以下|这些)|只(?:读取|检查|查看)(?:以下|这些))/i.test(taskText)
      || /(?:不要|不得|禁止)\s*(?:继续|扩展).{0,60}(?:范围|旁支|其他文件|host)/i.test(taskText)
    if (hasExplicitScopeBoundary) return task
    const explicitlyExcludesAgent = /(?:不|勿|无需|不要|不得).{0,12}(?:深入|检查|涉及|追查|分析|读取).{0,20}(?:agent|智能体)/i.test(taskText)
    const explicitlyExcludesStartup = /(?:不|勿|无需|不要|不得).{0,12}(?:深入|检查|涉及|追查|分析|读取).{0,16}(?:应用)?启动/i.test(taskText)
    const taskFocusesStartup = /(?:应用|electron).{0,12}(?:启动入口|启动链路|启动顺序)|(?:应用启动|启动入口|启动链路|启动顺序)/i.test(taskText)
    const taskFocusesAgentChain = /(?:agent|智能体).{0,24}(?:请求|调用).{0,12}(?:链路|路径|流程)|(?:请求|调用).{0,12}(?:agent|智能体).{0,12}(?:链路|路径|流程)|chat:send|sessions\.prompt|从前端.{0,32}(?:host|后端)/i.test(taskText)
    const required = []
    if (needsStartupCoverage && taskFocusesStartup && !explicitlyExcludesStartup) {
      required.push('package.json', 'index.html')
    }
    if (needsAgentChainCoverage && taskFocusesAgentChain && !explicitlyExcludesAgent) {
      required.push(
        'src/features/app/useAppBackend.ts',
        'electron/preload.cjs',
        'electron/backend/register-ipc.mjs',
        'electron/backend/dsh-chat-service.mjs',
        'electron/backend/orchestration-service.mjs',
        'electron/agent/z-host/index.mjs',
        'electron/agent/z-host/z-api-client.mjs',
        'electron/agent/z-host/spawn-host.mjs',
      )
    }
    const additions = required.filter((candidate) => available.has(candidate) && !task.scopePaths.includes(candidate))
    if (task.scopePaths.length + additions.length > MAX_READ_ONLY_SCOPE_PATHS) {
      throw new Error(`只读子任务范围闭环补全失败：${task.id} 补齐入口/调用链证据将超过 ${MAX_READ_ONLY_SCOPE_PATHS} 个路径，请先缩小原始范围`)
    }
    if (additions.length === 0) return task
    const scopePaths = [...task.scopePaths, ...additions]
    return {
      ...task,
      scopePaths,
      description: `${task.description ?? ''}\n为闭合所请求的源码链路，允许读取的补充范围：${additions.join('、')}。这些是精确入口/桥接范围，不要再做工作区级目录发现；必要时可直接读取这些路径。`,
    }
  })
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

  const asksForCallChain = /调用链|请求链|端到端|从前端|从渲染端|renderer|preload|ipc|调用顺序|链路/i.test(String(query ?? ''))
  const callChainPathBonus = (candidate) => {
    if (!asksForCallChain) return 0
    const normalized = candidate.toLocaleLowerCase()
    if (normalized === 'electron/agent/z-host') return 20
    if (/^src\/features\/app\/useappbackend\.(ts|tsx|js|jsx)$/.test(normalized)) return 24
    if (/^electron\/preload\.(cjs|mjs|js)$/.test(normalized)) return 22
    if (/^electron\/backend\/register-ipc\.(mjs|cjs|js)$/.test(normalized)) return 22
    if (/^electron\/backend\/(dsh-chat-service|orchestration-service)\.(mjs|cjs|js)$/.test(normalized)) return 18
    if (/^electron\/agent\/z-host\/(z-api-client|spawn-host)\.(mjs|cjs|js)$/.test(normalized)) return 16
    return 0
  }
  const rankPath = (candidate) => {
    const depth = candidate.split('/').length
    const rootFileBonus = depth === 1 ? 3 : 0
    const rootManifestBonus = depth === 1 && /^(package\.json|pnpm-lock\.yaml|package-lock\.json|tsconfig\.json|README(?:\.md)?)$/i.test(candidate) ? 12 : 0
    const codePathBonus = /(^|\/)(main|index|app|server|register-ipc|dsh-chat-service|orchestration-service)(\.[^.]+)?$/i.test(candidate) ? 5 : 0
    const sourceExtensionBonus = /\.(c|m)?(js|jsx|ts|tsx|mjs|cjs|json|py|go|rs)$/i.test(candidate) ? 1 : 0
    return scoreTextRelevance(query, '', { pathText: candidate })
      + rootFileBonus
      + rootManifestBonus
      + codePathBonus
      + sourceExtensionBonus
      + callChainPathBonus(candidate)
  }
  const rankedFiles = files
    .map((candidate) => ({ candidate, score: rankPath(candidate) }))
    .sort((a, b) => b.score - a.score || a.candidate.localeCompare(b.candidate))
  const preferredDirectories = directories
    .filter((candidate) => candidate.split('/').length <= 2 || (asksForCallChain && candidate.toLocaleLowerCase() === 'electron/agent/z-host'))
    .sort((a, b) => rankPath(b) - rankPath(a) || a.localeCompare(b))
  const highValueCallChainPaths = asksForCallChain
    ? [
      'src/features/app/useAppBackend.ts',
      'electron/preload.cjs',
      'electron/backend/register-ipc.mjs',
      'electron/backend/dsh-chat-service.mjs',
      'electron/backend/orchestration-service.mjs',
      'electron/agent/z-host/z-api-client.mjs',
      'electron/agent/z-host/spawn-host.mjs',
      'electron/agent/z-host',
    ].filter((candidate) => files.includes(candidate) || directories.includes(candidate))
    : []
  const selected = []
  for (const candidate of [...highValueCallChainPaths, ...rankedFiles.map(({ candidate }) => candidate), ...preferredDirectories]) {
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
  const scopeDeniedToolCalls = Math.max(0, Number(evidence?.scopeDeniedToolCalls) || 0)
  const parts = []
  if (reads) parts.push(`读取 ${reads}`)
  if (searches) parts.push(`搜索 ${searches}`)
  if (failed) parts.push(`失败 ${failed}`)
  if (scopeDeniedToolCalls) parts.push(`越界拒绝 ${scopeDeniedToolCalls}`)
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
    scopeDeniedToolCalls,
    runningCallCount: running,
    omittedToolCalls: Math.max(0, Number(evidence?.omittedToolCalls) || 0),
    label,
  }
}

function explicitlyReportsEvidenceGap(text) {
  return /(?:范围不足|待复核)|(?:本任务|任务(?:要求|目标|验收点)?|(?:核心|关键|部分)?(?:调用|请求|端到端)?链(?:路)?|验收点)[^。；\n]{0,32}(?:未(?:闭合|核实|完成)|尚未(?:核实|完成)|无法(?:证明|完成)|仍有(?:关键)?证据缺口|不完整)|未能从源码读取核实[^。；\n]{0,48}(?:超出允许文件范围|范围不足|证据缺口)/i.test(String(text ?? ''))
}

export function assessSubtaskCompletion(task, result) {
  if (typeof result?.text !== 'string' || !result.text.trim()) {
    return {
      complete: false,
      reason: 'Agent 未返回最终文本；不能仅凭工具调用将子任务标记为完成。',
    }
  }
  const calls = Array.isArray(result?.executionEvidence?.observedToolCalls)
    ? result.executionEvidence.observedToolCalls
    : []
  if (task?.taskType === 'research' || task?.taskType === 'review') {
    const scopeDeniedToolCalls = Math.max(0, Number(result?.executionEvidence?.scopeDeniedToolCalls) || 0)
    if (scopeDeniedToolCalls > 0 && explicitlyReportsEvidenceGap(result.text)) {
      return {
        complete: false,
        reason: `Host 拒绝了 ${scopeDeniedToolCalls} 次超出只读子任务范围的工具调用；当前路径计划可能缺少必要证据，需补足范围后再标记完成。`,
      }
    }
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
  maxSubtaskConcurrency = null,
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
    let scopeDeniedToolCalls = 0
    const tracedWebContents = taskId ? {
      isDestroyed: () => webContents?.isDestroyed?.() ?? false,
      send(channel, payload) {
        if (channel === 'chat:stream' && payload?.type === 'tool' && payload.taskId === taskId) {
          const id = String(payload.id ?? `${payload.toolName ?? 'tool'}-${observedToolCalls.size}`)
          const previous = observedToolCalls.get(id) ?? {}
          if (payload.status === 'error' && /TaskWeaver read-only scope denied/i.test(String(payload.resultSummary ?? ''))) {
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
        if (!webContents?.isDestroyed?.()) webContents?.send(channel, payload)
      },
    } : webContents
    let result
    try {
      result = await dshRuntime.runAgentTurn({
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
      })
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

  async function planAndExecute({ text, primaryModelKey, conversationId, webContents, skill, skillAlreadyApplied = false, workspacePath }) {
    if (!conversationId) throw new Error('当前对话标识无效')
    if (getRun(conversationId)?.inFlight) throw new Error('该对话的上一条多 Agent 任务仍在处理中')
    const abortController = new AbortController()
    const run = { inFlight: true, abortController }
    runs.set(conversationId, run)
    const runId = crypto.randomUUID()
    const plannerSkill = skillAlreadyApplied ? null : skill
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
        '研究/审查任务必须有明确边界：每项只回答一个问题，在 description 中列出允许检查的文件或最多一个窄目录、验收点和停止条件；不要分配“通读整个项目/检查所有代码”这类开放任务。回答函数实现、调用顺序或配置细节必须读取源码文件；grep/glob 只能定位，不能作为代码已核实的证据。优先指定直接相关的文件；路径未知时可先搜索定位，再读取实际源码。对于端到端链路/跨文件调用关系问题，scopePaths 必须覆盖闭合结论所需的每个环节（例如 UI 状态/发送入口、preload、IPC、服务与 Host 调用端），不能只授权入口后再尝试越界读取；若现有候选文件不足，应在规划时纳入必要文件或窄目录。独立任务表示彼此无依赖，不要求文件范围完全不重叠；调用链闭合、证据完整优先于零重叠，必要时允许多个任务读取同一个桥接文件。子任务 description 必须写明按给定文件顺序逐跳核实；大源码文件先对目标符号做一次窄搜索，再读取相关 offset/limit 行段，禁止先整文件读取或反复扩大搜索；已给行号/符号时直接从该位置检查。避免重复探索，只有发现尚未解决的具体事实时才扩大检查。',
        '每个 research/review 节点还必须输出 scopePaths 字符串数组，至少 1 项、最多 12 项，只能使用工作区路径索引中的字面量相对路径；不能写绝对路径、通配符、.. 或工作区根目录。scopePaths 是工具层强制执行的读文件/搜索边界，范围外调用会被 Host 拒绝。',
        `【工作区路径索引：仅路径名，不含文件正文，也不代表已读取】扫描 ${plannerPathHints.visitedEntries} 个目录项${plannerPathHints.truncated ? '（达到扫描/展示上限，结果不完整）' : ''}。只从下列真实存在的路径中挑选候选文件；不得仅凭路径推断其内容。规划时尽量直接指定少量候选文件，并要求子 Agent 读取它们；只有索引不足时才安排必要的搜索：\n${plannerPathHints.paths.map((item) => `- ${item}`).join('\n') || '(没有发现路径；任务需先搜索定位，再实际读取文件)'}`,
        '只输出纯 JSON，不加 Markdown 代码块。格式：{"tasks":[{"id":"T1","title":"短标题","taskType":"research|implementation|test|review","role":"职责名","description":"目标、允许检查的文件/目录、验收点与停止条件","scopePaths":["electron/main.cjs"],"dependsOn":[],"reasons":["规划原因"]}]}',
        `工作区：${cwd}`,
        `用户原始请求：\n${text}`,
      ].join('\n\n')
      let plannerSuffixRetry = '\n\n上次输出无法解析。请只输出一个 JSON 对象，不要 Markdown 代码块，不要任何解释文字。'
      let planResult
      let planned
      let plannerSessionKey = `tw-orchestration-${conversationId}-${runId}-planner`
      const plannerProgress = createPlannerProgressRelay(webContents, conversationId)
      try {
        try {
          planResult = await runPrompt({
            modelKey: primaryModelKey,
            text: plannerPrompt,
            sessionFile: plannerFile,
            noTools: true,
            skill: plannerSkill,
            signal: abortController.signal,
            conversationId,
            cwdOverride: cwd,
            sessionKey: plannerSessionKey,
            webContents: plannerProgress.webContents,
          })
          planned = completeReadOnlyPlanScopes(
            validatePlanForRequest(validateAndOrderTasks(parsePlan(planResult.text)), text),
            text,
            plannerPathHints.paths,
          )
        } catch (firstError) {
          if (firstError?.message?.startsWith('只读子任务范围无效：')) {
            plannerSuffixRetry = `\n\n上次计划被范围校验拒绝：${firstError.message}。为每个 research/review 节点补齐 scopePaths 字符串数组，只能使用工作区路径索引里的字面量相对文件或窄目录路径，至少 1 项，不得使用绝对路径、通配符、.. 或工作区根目录。description 也必须写清允许范围、验收点和停止条件。只输出纯 JSON。`
          } else if (firstError?.message?.includes('只读请求包含非只读子任务类型')) {
            plannerSuffixRetry = `\n\n上次计划被安全校验拒绝：${firstError.message}。这是只读任务；请把所有 implementation/test 子任务改为 research/review。汇总和交叉核验请标为 review。不得输出任何非 research/review 类型。只输出纯 JSON。`
          } else if (firstError?.message?.startsWith('并行研究任务数量不匹配：')) {
            plannerSuffixRetry = `\n\n上次计划被请求约束校验拒绝：${firstError.message}。请严格按用户明确指定的独立并行研究数量重写计划：只创建恰好对应数量的 research 节点，彼此无依赖；不要创建 review 或汇总节点，最终综合由编排器完成。只输出纯 JSON。`
          }
          plannerProgress.update('计划未通过校验，正在进行一次有限修正')
          try {
            plannerSessionKey = `tw-orchestration-${conversationId}-${runId}-planner-retry`
            planResult = await runPrompt({
              modelKey: primaryModelKey,
              text: plannerPrompt + plannerSuffixRetry,
              sessionFile: plannerFile,
              noTools: true,
              skill: plannerSkill,
              signal: abortController.signal,
              conversationId,
              cwdOverride: cwd,
              sessionKey: plannerSessionKey,
              webContents: plannerProgress.webContents,
            })
            planned = completeReadOnlyPlanScopes(
              validatePlanForRequest(validateAndOrderTasks(parsePlan(planResult.text)), text),
              text,
              plannerPathHints.paths,
            )
          } catch (secondError) {
            const message = secondError instanceof Error ? secondError.message : String(secondError)
            throw new PlannerFallbackError(message, { partialUsage: planResult?.usage ?? null })
          }
        }
      } finally {
        plannerProgress.dispose()
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
        maxConcurrency: maxSubtaskConcurrency,
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
                  text: meta.result.completionAssessment?.complete === false
                    ? `未完成：${meta.result.completionAssessment.reason || '证据不足。'}${meta.result.text ? `\n\n${meta.result.text}` : ''}${upgradeNote}`
                    : meta.result.text
                      ? meta.result.text + upgradeNote
                      : `未完成：${meta.result.completionAssessment?.reason || 'Agent 未返回最终文本。'}`,
                  modelKey: upgradedTo ?? changed.modelKey,
                  usage: meta.result.usage,
                  fileChanges: meta.result.fileChanges,
                  executionEvidence: meta.result.executionEvidence ?? null,
                  executionEvidenceSummary: summarizeExecutionEvidence(meta.result.executionEvidence),
                }],
              }
            }
            if (meta?.error) {
              const partial = meta.error.partialResult ?? {}
              const evidence = meta.error.executionEvidence ?? partial.executionEvidence ?? null
              const reason = meta.error.message || '子任务未能生成最终结果'
              return {
                ...changed,
                executionEvidenceSummary: summarizeExecutionEvidence(evidence),
                messages: [...task.messages, {
                  id: `${changed.id}-assistant`,
                  author: 'agent',
                  name: changed.role,
                  time: nowLabel(),
                  text: partial.text || `未完成：${reason}`,
                  modelKey: changed.modelKey,
                  usage: partial.usage,
                  fileChanges: partial.fileChanges,
                  executionEvidence: evidence,
                  executionEvidenceSummary: summarizeExecutionEvidence(evidence),
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
            if (READ_ONLY_TASK_TYPES.has(task.taskType)) {
              parts.push('只读范围执行规则：scopePaths 是执行层强制白名单且已覆盖本任务验收点。所有文件工具路径必须使用工作区相对路径，禁止传绝对路径。对其中列出的字面文件路径，不要用 glob/ls 再确认是否存在，直接 read；若需定位未给出的符号，只对该文件 grep 一次。只有直接读取报告路径不存在时，才在已授权范围内搜索替代路径。不要对父目录或工作区执行 glob/ls。被拒绝的范围外探索不代表本任务缺少证据；只有任务明确要求的验收点无法由授权文件证明时，才报告任务未完成。不要把未要求的相邻模块或内部实现列为证据缺口。')
              parts.push(`<taskweaver-readonly-scope-v1>${JSON.stringify({ paths: task.scopePaths })}</taskweaver-readonly-scope-v1>`)
            }
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
          assistant: {
            text: '多 Agent 任务已停止；已完成的子任务进度保留。',
            usage: combineUsage(usage),
            fileChanges: mergeFileChanges(...tasks.map((task) => task.messages.map((message) => message.fileChanges))),
            cancelled: true,
          },
          tasks,
          failedTaskIds: [...execution.failed],
        }
      }

      const outcomes = tasks.map((task) => {
        const agentResult = task.messages.findLast((message) => message.author === 'agent')
        return {
          id: task.id,
          title: task.title,
          status: task.statusLabel,
          result: agentResult?.text ?? '（任务未生成结果）',
          runtimeObservedActions: agentResult?.executionEvidence ?? {
            source: 'z-host-tool-events',
            observedToolCalls: [],
          },
          evidenceAssessment: task.executionEvidenceSummary
            ?? summarizeExecutionEvidence(agentResult?.executionEvidence),
        }
      })
      const projectMemory = await memory.load(conversationId)
      const synthesis = [
        '请根据下列子任务执行结果，面向用户总结本次工作的最终进展。不要再次执行工具，不要重复改代码。',
        '明确区分已完成、受阻和未完成的工作，并列出真实验证结果。若某子任务失败或被依赖阻塞，要明确说明。',
        '最终回复保持精炼：先给总体结论，再按子任务各列结论与最必要的源码/工具证据，最后说明交叉结果和关键未验证项；不要逐条复述工具过程或重复子任务原文，通常控制在约 800–1500 个中文字符，只有必要信息较多时才超出。失败、证据缺口和未执行的验证必须如实保留。',
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
          text: applySkillInstructions(prompt, plannerSkill),
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
        assistant: {
          ...assistant,
          usage: combineUsage(usage),
          fileChanges: mergeFileChanges(
            assistant.fileChanges,
            ...tasks.map((task) => task.messages.map((message) => message.fileChanges)),
          ),
        },
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
