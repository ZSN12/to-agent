import fs from 'node:fs/promises'
import path from 'node:path'
import { scoreTextRelevance } from '../text-relevance.mjs'
import { analyzeUserIntent, USER_INTENTS } from '../user-intent.mjs'
import { canRunScopedImplementationTasksConcurrently } from '../task-profile.mjs'

export class PlannerFallbackError extends Error {
  constructor(message, { partialUsage } = {}) {
    super(message)
    this.name = 'PlannerFallbackError'
    this.code = 'PLANNER_FALLBACK'
    this.partialUsage = partialUsage ?? null
  }
}

const TASK_TYPES = new Set(['research', 'implementation', 'test', 'review'])
const READ_ONLY_TASK_TYPES = new Set(['research', 'review'])
const MAX_READ_ONLY_SCOPE_PATHS = 12
const MAX_IMPLEMENTATION_WRITE_SCOPES = 12
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

function directExecutionSummary(outcomes, error) {
  const message = String(error?.message ?? error ?? '未知错误')
    .replace(/\bBearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/((?:api[_-]?key|access[_-]?token|refresh[_-]?token|secret)\s*[:=]\s*)\S+/gi, '$1[REDACTED]')
    .slice(0, 500)
  const rows = outcomes.map((outcome) => {
    const detail = String(outcome.result ?? '（无子任务结果）').trim().slice(0, 1200)
    return `- ${outcome.id} ${outcome.title}｜${outcome.status}\n  ${detail}`
  })
  return {
    text: [
      'DAG 子任务已结束，但最终汇总模型调用失败。以下是直接根据子任务状态和结果生成的汇总，未经汇总模型复核。',
      `汇总调用错误：${message}`,
      ...rows,
    ].join('\n\n').slice(0, 8000),
    usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0 },
    fileChanges: [],
  }
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
    writeScopes: task.taskType === 'implementation'
      ? normalizeImplementationWriteScopes(task.writeScopes, task.id)
      : [],
  }))
}

function normalizeImplementationWriteScopes(writeScopes, taskId) {
  if (writeScopes === undefined) return []
  if (!Array.isArray(writeScopes) || writeScopes.length > MAX_IMPLEMENTATION_WRITE_SCOPES) {
    throw new Error(`实现写入范围无效：${taskId} 的 writeScopes 必须是最多 ${MAX_IMPLEMENTATION_WRITE_SCOPES} 项的路径数组`)
  }
  const normalized = []
  for (const rawPath of writeScopes) {
    if (typeof rawPath !== 'string' || rawPath.trim() === '') {
      throw new Error(`实现写入范围无效：${taskId} 的 writeScopes 只能包含非空路径`)
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
      throw new Error(`实现写入范围无效：${taskId} 的路径必须是字面量工作区相对路径，不能包含绝对路径、通配符或 ..`)
    }
    const relativePath = segments.filter((segment) => segment && segment !== '.').join('/')
    if (!relativePath) throw new Error(`实现写入范围无效：${taskId} 不能把整个工作区作为写入范围`)
    if (!normalized.includes(relativePath)) normalized.push(relativePath)
  }
  return normalized
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

function removeTargetedWriteConstraints(text) {
  return String(text ?? '').replace(
    /(?:不要|别|请勿|不必|不得|禁止|do not|don't|never)\s*(?:去)?(?:修改|改动|更改|编辑|触碰|modify|change|edit)\s+(?!(?:任何|所有|全部|工作区|仓库|文件系统|代码库|any|all|the whole|the entire)\b)[^，,。；;\n]+?(?=\s*(?:，|,|。|；|;|但|但是|而|同时|然后|并且|but|however|$))/gi,
    ' ',
  )
}

export function requiresReadOnlyPlan(text) {
  const original = String(text ?? '')
  const broadNoWrite = /(?:不要|别|请勿|不必|不得|禁止)\s*(?:去)?(?:修改|改动|更改|编辑|写入|创建|删除)\s*(?:任何|所有|全部|工作区|整个工作区|整个仓库|仓库|文件系统|文件|代码库|代码|源码)(?:范围|内容)?/i.test(original)
  const clean = removeTargetedWriteConstraints(original).replace(
    /(?:不要|别|不需要|无需|不是|并非|取消|关闭|解除)\s*(?:使用|启用|进入|切换到|设为)?\s*只读(?:模式)?/gi,
    '',
  ).replace(/^[\s，,。；;]+/, '').replace(/^只(?=(?:检查|查看|阅读|审查|分析|定位|搜索|查找|读取))/, '')
  if (broadNoWrite) return true
  if (analyzeUserIntent(clean) === USER_INTENTS.CODE_MUTATION) return false
  return analyzeUserIntent(clean) === USER_INTENTS.READ_ONLY
}

function isCodeMutationRequest(text) {
  const clean = removeTargetedWriteConstraints(text)
  return !requiresReadOnlyPlan(clean) && analyzeUserIntent(clean) === USER_INTENTS.CODE_MUTATION
}

function explicitParallelResearchCount(text) {
  const request = String(text ?? '')
  const match = request.match(/(?:要求|需要|请|要)?\s*(两|二|三|四|五|[2-5])\s*(?:项|个)\s*(?:彼此)?独立(?:的)?(?:并行)?(?:研究|调研)(?:任务)?(?:并行)?/i)
  if (!match) return null
  const count = { 两: 2, 二: 2, 三: 3, 四: 4, 五: 5 }[match[1]] ?? Number(match[1])
  return Number.isInteger(count) ? count : null
}

function dependsTransitivelyOn(tasksById, task, targetId) {
  const pending = [...(task.dependsOn ?? [])]
  const visited = new Set()
  while (pending.length > 0) {
    const dependencyId = pending.pop()
    if (dependencyId === targetId) return true
    if (visited.has(dependencyId)) continue
    visited.add(dependencyId)
    pending.push(...(tasksById.get(dependencyId)?.dependsOn ?? []))
  }
  return false
}

export function validatePlanForRequest(tasks, requestText, { requireParallelImplementationScopes = false } = {}) {
  const normalizedTasks = tasks.map((task) => READ_ONLY_TASK_TYPES.has(task.taskType)
    ? { ...task, scopePaths: normalizeReadOnlyScopePaths(task.scopePaths, task.id) }
    : task)
  const readOnlyRequest = requiresReadOnlyPlan(requestText)
  if (readOnlyRequest) {
    const unsafe = normalizedTasks.filter((task) => !READ_ONLY_TASK_TYPES.has(task.taskType))
    if (unsafe.length) {
      throw new Error(`只读请求包含非只读子任务类型：${unsafe.map((task) => `${task.id}=${task.taskType}`).join(', ')}；只允许 research/review`)
    }
  }
  if (isCodeMutationRequest(requestText)
    && !normalizedTasks.some((task) => task.taskType === 'implementation')) {
    throw new Error('代码变更请求缺少 implementation 节点：计划不能只安排 research/review/test')
  }

  if (requireParallelImplementationScopes) {
    const implementations = normalizedTasks.filter((task) => task.taskType === 'implementation')
    const tasksById = new Map(normalizedTasks.map((task) => [task.id, task]))
    for (let leftIndex = 0; leftIndex < implementations.length; leftIndex += 1) {
      const left = implementations[leftIndex]
      for (let rightIndex = leftIndex + 1; rightIndex < implementations.length; rightIndex += 1) {
        const right = implementations[rightIndex]
        // Only incomparable nodes can become concurrent in a valid DAG. Nodes
        // with a dependency path between them are intentionally serialized.
        if (dependsTransitivelyOn(tasksById, left, right.id) || dependsTransitivelyOn(tasksById, right, left.id)) continue
        if (left.writeScopes.length === 0 || right.writeScopes.length === 0) {
          throw new Error(`并行实现写入范围缺失：${left.id} 与 ${right.id} 没有完整的 writeScopes，无法安全并行执行`)
        }
        if (!canRunScopedImplementationTasksConcurrently([left, right])) {
          throw new Error(`实现写入范围重叠：${left.id} 与 ${right.id} 的 writeScopes 有交集；请合并实现任务或通过 dependsOn 明确串行关系`)
        }
      }
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


export {
  READ_ONLY_TASK_TYPES,
  TYPE_LABELS,
  TIER_LABELS,
  parsePlan,
  layoutTasks,
  combineUsage,
  mergeFileChanges,
  directExecutionSummary,
  messageId,
  isCodeMutationRequest,
}
