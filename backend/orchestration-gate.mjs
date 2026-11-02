/**
 * Deterministic, model-free entry gate for multi-agent orchestration.
 *
 * The score estimates whether a request is worth considering for multiple
 * agents. It does not authorize DAG execution by itself: only explicit
 * independent-work evidence or distinct path clusters do that. Requests with
 * enough cross-module complexity but without that structural evidence go to
 * ASK_USER.
 */

export const ORCHESTRATION_GATE_MAX_INPUT_CHARS = 12_000

export const ORCHESTRATION_GATE_THRESHOLDS = Object.freeze({
  askUserMinScore: 35,
  askUserMaxConfidence: 0.74,
})

const CROSS_MODULE_PATTERNS = [
  /跨(?:模块|包|层|组件)/i,
  /多(?:个)?模块|多个包|多个组件|多个工作面/i,
  /前后端|前端.{0,24}(?:后端|服务端|API|接口)|(?:后端|服务端|API|接口).{0,24}前端/i,
  /(?:界面|UI|渲染进程).{0,24}(?:服务端|后端|API|接口)|(?:服务端|后端|API|接口).{0,24}(?:界面|UI|渲染进程)/i,
  /端到端|全链路|贯穿.{0,20}(?:模块|包|组件|层)/i,
]

const WORKSTREAM_PATTERNS = [
  { id: 'frontend', re: /前端|React|Vue|界面|\bUI\b|渲染进程|src\/(?:features|components)/i },
  { id: 'backend', re: /后端|服务端|\bAPI\b|接口|主进程|backend\//i },
  { id: 'runtime', re: /运行时|\bRuntime\b|\bHost\b|packages\/runtime/i },
  { id: 'tests', re: /测试|\be2e\b|单元测试|集成测试|scripts\/test/i },
  { id: 'docs', re: /文档|\bREADME\b|docs\//i },
  { id: 'delivery', re: /部署|\bCI\b|发布|Docker|electron-builder/i },
]

const ACTION_PATTERN = /修改|修复|实现|新增|添加|重构|优化|迁移|接入|对齐|删除|更新|补全|开发|搭建|完成|交付|检查|审查|分析|研究|比较|梳理|排查|\b(?:implement|refactor|fix|review|analy[sz]e|investigate|compare)\b/i
const INDEPENDENCE_PATTERN = /并行|并发|互不依赖|独立(?:地|完成|进行|研究|实现|处理|推进|子任务|任务|工作流)?|分别|各自|parallel|independent|separate workstreams?/i
const SERIAL_PATTERN = /串行|逐步|一步一步|同一文件|同一个\s*(?:bug|问题|功能)|先.{0,32}(?:再|然后|之后|最后)|(?<!不)依赖.{0,24}(?:完成|结果|之后)/i
const SIMPLE_PATTERN = /(?:单个|一个|仅一个|只改|只需|仅需|小\s*bug|一行|单文件|单个文件).{0,24}(?:文件|函数|按钮|文案|样式|改动|修改|修复|变更)?|修复.{0,16}(?:按钮颜色|文案|typo|拼写错误)/i
const PASSIVE_QUESTION_PATTERN = /^(?:请问|为什么|怎么(?:理解|实现|回事)|如何(?:理解|实现|看待)|什么是|解释一下|说明一下|介绍一下|what|why|how|where|when|which)/i
const COUNTED_WORK_PATTERN = /(?:两|三|四|五|六|多|多个|若干)(?:项|个|类|组)?(?:(?:独立|互不依赖|可独立)(?:的)?)?(?:工作流|工作|工作面|子任务|任务|模块|包|组件|部分|问题|功能|研究|分析|审查)|\b(?:two|three|four|multiple|several)\s+(?:independent\s+)?(?:workstreams?|subtasks?|tasks?|modules?|components?|parts?|studies|reviews)\b/i
const TASK_LABEL_PATTERN = /(?:子任务|任务|工作流)\s*(?:#?\d+|[A-D]|[一二三四])/gi
const NUMBERED_ITEM_PATTERN = /(?:^|\n)\s*(?:[-*•]|\d{1,2}[.)、]|[一二三四五六七八九十]+[、.])\s+\S/gm
const EXPLICIT_PATH_PATTERN = /@?(?:[A-Za-z0-9_.@~-]+[\\/])+[A-Za-z0-9_.@~-]+(?:[\\/]?)?/g
const KNOWN_REPOSITORY_ROOTS = new Set([
  'apps', 'backend', 'contract', 'desktop', 'docs', 'packages', 'scripts', 'src', 'test', 'tests',
])

function normalizeInput(text) {
  const raw = typeof text === 'string' ? text : text == null ? '' : String(text)
  const truncated = raw.length > ORCHESTRATION_GATE_MAX_INPUT_CHARS
  const bounded = truncated ? raw.slice(0, ORCHESTRATION_GATE_MAX_INPUT_CHARS) : raw
  return { text: bounded.trim(), truncated }
}

function explicitModes(context) {
  const overrides = Array.isArray(context.modeOverrides) ? context.modeOverrides : []
  const modes = [
    ...overrides,
    context.explicitMode,
    context.executionModeOverride,
    context.workMode === 'goal' ? 'multi-agent' : null,
    context.workMode === 'plan' ? 'single-agent' : null,
  ]
  return modes.filter((mode) => mode === 'single-agent' || mode === 'multi-agent')
}

function collectWorkstreams(text) {
  const streams = new Set()
  for (const { id, re } of WORKSTREAM_PATTERNS) {
    if (re.test(text)) streams.add(id)
  }
  return streams
}

function collectPathClusters(text) {
  const clusters = new Set()
  for (const match of text.matchAll(EXPLICIT_PATH_PATTERN)) {
    const raw = match[0].replace(/^@/, '').replace(/[),.;!?，。；）】]+$/u, '')
    const previousCharacter = match.index > 0 ? text[match.index - 1] : ''
    const isAbsolute = previousCharacter === '/' || previousCharacter === '\\'
    let segments = raw.split(/[\\/]+/).filter(Boolean)
    if (isAbsolute) {
      const rootIndex = segments.findIndex((segment) => KNOWN_REPOSITORY_ROOTS.has(segment.toLowerCase()))
      if (rootIndex < 0) continue
      segments = segments.slice(rootIndex)
    } else {
      segments = segments.filter((segment) => segment !== '.' && segment !== '..')
    }
    if (segments.length < 2) continue

    const last = segments.at(-1)
    const looksLikeFile = /\.[A-Za-z0-9_-]{1,12}$/.test(last)
    const directories = looksLikeFile ? segments.slice(0, -1) : segments
    if (directories.length === 0) continue
    const clusterDepth = Math.min(3, directories.length)
    clusters.add(directories.slice(0, clusterDepth).join('/').toLowerCase())
  }
  return clusters
}

function countListItems(text, pattern) {
  return [...text.matchAll(pattern)].length
}

function countExplicitTaskLabels(text) {
  return [...text.matchAll(TASK_LABEL_PATTERN)].length
}

function hasCountedWork(text) {
  return COUNTED_WORK_PATTERN.test(text)
}

function withTruncationReason(reasons, truncated) {
  return truncated
    ? [...reasons, `输入超过 ${ORCHESTRATION_GATE_MAX_INPUT_CHARS} 字符，门控仅扫描前 ${ORCHESTRATION_GATE_MAX_INPUT_CHARS} 字符。`]
    : reasons
}

function explicitDecision(mode, reason, truncated) {
  return {
    mode,
    confidence: 1,
    reasons: withTruncationReason([reason], truncated),
  }
}

/**
 * Decide whether a chat turn should stay single-agent, ask the user, or enter
 * multi-agent DAG planning. Complexity scoring is deterministic and scans at
 * most ORCHESTRATION_GATE_MAX_INPUT_CHARS characters.
 *
 * Context fields mirror resolveOrchestrationPolicy:
 * - modeOverrides / explicitMode / executionModeOverride: explicit controls
 * - workMode: 'goal' forces multi-agent; 'plan' forces single-agent
 * - skillRequiresDag and preferMultiAgent: explicit defaults that force DAG
 *
 * @param {string} text
 * @param {{ modeOverrides?: Array<'single-agent'|'multi-agent'>, explicitMode?: 'single-agent'|'multi-agent', executionModeOverride?: 'single-agent'|'multi-agent', workMode?: string, skillRequiresDag?: boolean, preferMultiAgent?: boolean }} [context]
 * @returns {{ mode: 'single-agent'|'ask-user'|'multi-agent', confidence: number, reasons: string[] }}
 */
export function decideOrchestrationMode(text, context = {}) {
  const { text: boundedText, truncated } = normalizeInput(text)
  context = context && typeof context === 'object' ? context : {}
  const modes = explicitModes(context)
  if (modes.includes('single-agent')) {
    return explicitDecision('single-agent', '显式单 Agent 约束优先，保持单 Agent。', truncated)
  }
  if (modes.includes('multi-agent')) {
    return explicitDecision('multi-agent', '用户显式选择多 Agent，直接进入 DAG。', truncated)
  }
  if (context.skillRequiresDag === true) {
    return explicitDecision('multi-agent', '所选 Skill 强制 DAG 编排，直接进入多 Agent。', truncated)
  }
  if (context.preferMultiAgent === true) {
    return explicitDecision('multi-agent', '用户偏好默认多 Agent，直接进入 DAG。', truncated)
  }
  if (!boundedText) {
    return {
      mode: 'single-agent',
      confidence: 1,
      reasons: withTruncationReason(['空请求不触发多 Agent 编排。'], truncated),
    }
  }

  const reasons = []
  const workstreams = collectWorkstreams(boundedText)
  const pathClusters = collectPathClusters(boundedText)
  const independentCue = INDEPENDENCE_PATTERN.test(boundedText)
  const countedWork = hasCountedWork(boundedText)
  const listItems = countListItems(boundedText, NUMBERED_ITEM_PATTERN)
  const taskLabels = countExplicitTaskLabels(boundedText)
  const hasAtLeastTwoTasks = workstreams.size >= 2 || countedWork || listItems >= 2 || taskLabels >= 2
  const hasCrossModuleSignal = CROSS_MODULE_PATTERNS.some((pattern) => pattern.test(boundedText))
    || workstreams.size >= 2
  const hasAction = ACTION_PATTERN.test(boundedText)
  const hasSerialCue = SERIAL_PATTERN.test(boundedText)
  const isSimple = SIMPLE_PATTERN.test(boundedText)
  const isPassiveQuestion = PASSIVE_QUESTION_PATTERN.test(boundedText)
    || /[?？]\s*$/.test(boundedText)

  if (workstreams.size >= 2) reasons.push(`识别到 ${workstreams.size} 个不同工作面（${[...workstreams].join('、')}）。`)
  if (pathClusters.size > 0) reasons.push(`识别到 ${pathClusters.size} 个明确路径簇（${[...pathClusters].join('、')}）。`)
  if (independentCue) reasons.push('检测到并行、独立、分别或各自处理的信号。')
  if (countedWork || listItems >= 2 || taskLabels >= 2) reasons.push('检测到至少两个任务或工作项的显式信号。')
  if (hasCrossModuleSignal) reasons.push('检测到跨模块或跨工作面的描述。')
  if (hasAction) reasons.push('检测到具体的执行、分析或检查动作。')

  // A dependency cue does not by itself make work inseparable: DAG nodes can
  // execute in sequence. Keep local/single-scope sequential work on one agent.
  const hasDistributedScope = workstreams.size >= 2 || pathClusters.size >= 2
  if (hasSerialCue && !hasDistributedScope) {
    reasons.push('用户描述了串行步骤，但缺少跨工作面或多个路径簇证据，保持单 Agent。')
    return {
      mode: 'single-agent',
      confidence: 0.96,
      reasons: withTruncationReason(reasons, truncated),
    }
  }
  if (pathClusters.size >= 2) {
    reasons.push(hasSerialCue
      ? '多个明确路径簇可拆分为 DAG 节点；先后关系由任务依赖表达。'
      : '多个明确路径簇提供了可拆分的代码范围，直接进入多 Agent DAG。')
    return {
      mode: 'multi-agent',
      confidence: 0.96,
      reasons: withTruncationReason(reasons, truncated),
    }
  }
  if (independentCue && hasAtLeastTwoTasks) {
    reasons.push('已明确表达至少两个可独立推进的任务，直接进入多 Agent DAG。')
    return {
      mode: 'multi-agent',
      confidence: 0.94,
      reasons: withTruncationReason(reasons, truncated),
    }
  }

  let complexityScore = 0
  if (hasCrossModuleSignal) complexityScore += 25
  if (workstreams.size >= 2) complexityScore += Math.min(20, (workstreams.size - 1) * 10)
  if (pathClusters.size === 1) complexityScore += 10
  if (hasAction) complexityScore += 10
  if (countedWork || listItems >= 2 || taskLabels >= 2) complexityScore += 10
  if (/全链路|端到端|贯穿|多阶段|多个步骤|完整流程/i.test(boundedText)) complexityScore += 10
  complexityScore = Math.min(complexityScore, 100)

  if (isPassiveQuestion && !hasAction && pathClusters.size === 0) {
    reasons.push('这是没有明确执行动作或代码范围的问题，保持单 Agent，避免为普通咨询启用 DAG。')
    return {
      mode: 'single-agent',
      confidence: 0.94,
      reasons: withTruncationReason(reasons, truncated),
    }
  }
  if (isSimple && pathClusters.size < 2) {
    reasons.push('请求明确限定在局部、小范围改动，使用单 Agent 更合适。')
    return {
      mode: 'single-agent',
      confidence: 0.94,
      reasons: withTruncationReason(reasons, truncated),
    }
  }

  if (hasCrossModuleSignal && hasAction && complexityScore >= ORCHESTRATION_GATE_THRESHOLDS.askUserMinScore) {
    const confidence = Math.min(
      ORCHESTRATION_GATE_THRESHOLDS.askUserMaxConfidence,
      Number((complexityScore / 100).toFixed(2)),
    )
    reasons.push(`跨模块复杂度评分 ${complexityScore}/100，处于灰区（${ORCHESTRATION_GATE_THRESHOLDS.askUserMinScore}–${Math.round(ORCHESTRATION_GATE_THRESHOLDS.askUserMaxConfidence * 100)}）；缺少明确独立任务或多个路径簇，先询问用户。`)
    return {
      mode: 'ask-user',
      confidence,
      reasons: withTruncationReason(reasons, truncated),
    }
  }

  reasons.push(`复杂度评分 ${complexityScore}/100，低于灰区阈值 ${ORCHESTRATION_GATE_THRESHOLDS.askUserMinScore}；使用单 Agent。`)
  return {
    mode: 'single-agent',
    confidence: Number((1 - complexityScore / 100).toFixed(2)),
    reasons: withTruncationReason(reasons, truncated),
  }
}
