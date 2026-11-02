/**
 * 默认折叠阈值常量（字节与行数）
 */
export const COMPACTION_LIMITS = Object.freeze({
  /** 工具文本输出触发折叠的默认最大字符数（约 3KB，减后续轮次历史体积） */
  MAX_TOOL_OUTPUT_CHARS: 3000,
  /** 工具文本输出触发折叠的最大行数 */
  MAX_TOOL_OUTPUT_LINES: 60,
  /** 折叠后保留的头部行数 */
  HEAD_LINES: 20,
  /** 折叠后保留的尾部行数 */
  TAIL_LINES: 20,
})

const DEFAULT_MODEL_CONTEXT_WINDOW = 128_000
const WORKSPACE_CONTEXT_BASE_BYTES = 32 * 1024
const WORKSPACE_CONTEXT_MIN_BYTES = 8 * 1024
const WORKSPACE_CONTEXT_MAX_BYTES = 128 * 1024

/**
 * 根据模型上下文窗口大小动态计算折叠阈值
 *
 * @param {number | null | undefined} contextWindow 模型上下文窗口大小 (tokens)
 * @returns {{
 *   maxChars: number,
 *   maxLines: number,
 *   headLines: number,
 *   tailLines: number,
 * }}
 */
export function resolveModelCompactionLimits(contextWindow) {
  const windowSize = Number(contextWindow)
  if (!Number.isFinite(windowSize) || windowSize <= 0) {
    return {
      maxChars: COMPACTION_LIMITS.MAX_TOOL_OUTPUT_CHARS,
      maxLines: COMPACTION_LIMITS.MAX_TOOL_OUTPUT_LINES,
      headLines: COMPACTION_LIMITS.HEAD_LINES,
      tailLines: COMPACTION_LIMITS.TAIL_LINES,
    }
  }

  // 小模型（<= 32k）：严格保守截断，防止爆上下文
  if (windowSize <= 32_000) {
    return {
      maxChars: 2000,
      maxLines: 40,
      headLines: 15,
      tailLines: 15,
    }
  }

  // 常规模型（64k ~ 128k）
  if (windowSize <= 128_000) {
    return {
      maxChars: 4000,
      maxLines: 60,
      headLines: 20,
      tailLines: 20,
    }
  }

  // 中大窗口模型（约 200k）
  if (windowSize <= 256_000) {
    return {
      maxChars: 8000,
      maxLines: 120,
      headLines: 30,
      tailLines: 30,
    }
  }

  // 超大窗口模型（>= 500k，如 1M, 2M）
  return {
    maxChars: 12000,
    maxLines: 200,
    headLines: 40,
    tailLines: 40,
  }
}

/**
 * 智能折叠大体积工具调用结果，提取关键行与首尾诊断，生成紧凑摘要。
 *
 * @param {string} text 原始工具输出
 * @param {{
 *   toolName?: string,
 *   contextWindow?: number,
 *   maxChars?: number,
 *   maxLines?: number,
 *   headLines?: number,
 *   tailLines?: number,
 * }} [options]
 * @returns {{
 *   compacted: boolean,
 *   text: string,
 *   originalLength: number,
 *   compactedLength: number,
 *   omittedLines: number,
 * }}
 */
export function compactToolOutput(text, options = {}) {
  if (typeof text !== 'string') {
    return { compacted: false, text: String(text || ''), originalLength: 0, compactedLength: 0, omittedLines: 0 }
  }

  const modelLimits = options.contextWindow ? resolveModelCompactionLimits(options.contextWindow) : null
  const maxChars = options.maxChars ?? modelLimits?.maxChars ?? COMPACTION_LIMITS.MAX_TOOL_OUTPUT_CHARS
  const maxLines = options.maxLines ?? modelLimits?.maxLines ?? COMPACTION_LIMITS.MAX_TOOL_OUTPUT_LINES
  const headLinesCount = options.headLines ?? modelLimits?.headLines ?? COMPACTION_LIMITS.HEAD_LINES
  const tailLinesCount = options.tailLines ?? modelLimits?.tailLines ?? COMPACTION_LIMITS.TAIL_LINES
  const toolName = options.toolName || 'tool'

  const lines = text.split('\n')
  const shouldCompact = text.length > maxChars || lines.length > maxLines

  if (!shouldCompact) {
    return {
      compacted: false,
      text,
      originalLength: text.length,
      compactedLength: text.length,
      omittedLines: 0,
    }
  }

  // 提取首部和尾部行
  const head = lines.slice(0, headLinesCount)
  const tail = lines.slice(-tailLinesCount)
  const middle = lines.slice(headLinesCount, -tailLinesCount)

  // 当行数不足以支撑首尾行截断（例如单行巨型文本），或首尾行字符总和已超过最大限制时，回退到字符级截断，杜绝重叠与体积翻倍
  const isLineCompactionIneffective = lines.length <= (headLinesCount + tailLinesCount)
    || (head.join('\n').length + tail.join('\n').length) > maxChars

  if (isLineCompactionIneffective) {
    const half = Math.max(100, Math.floor((maxChars - 200) / 2))
    const charHead = text.slice(0, half)
    const charTail = text.slice(-half)
    const omittedChars = Math.max(0, text.length - half * 2)
    const banner = `\n... [工具 ${toolName} 输出过长，自动省略中间 ${omittedChars} 字符 (总计 ${lines.length} 行 / ${text.length} 字符)] ...\n`
    const compactedText = `${charHead}${banner}${charTail}`
    return {
      compacted: true,
      text: compactedText,
      originalLength: text.length,
      compactedLength: compactedText.length,
      omittedLines: Math.max(0, lines.length - 2),
    }
  }

  // 从中间被省略的部分中，抓取包含 error, fail, fatal, warning, exception, ts\d+, syntax 等关键诊断行（最多保留 10 行）
  const criticalPattern = /(?:error|fail|fatal|exception|panic|syntax|cannot find|ts\d+)/i
  const keyDiagnostics = middle.filter((line) => criticalPattern.test(line)).slice(0, 10)

  const omittedLines = Math.max(0, lines.length - head.length - tail.length - keyDiagnostics.length)

  const middleBannerParts = [
    `\n... [工具 ${toolName} 输出过长，自动省略中间 ${omittedLines} 行 (总计 ${lines.length} 行 / ${text.length} 字符)] ...`,
  ]
  if (keyDiagnostics.length > 0) {
    middleBannerParts.push(`\n[中间关键诊断摘要]:\n${keyDiagnostics.join('\n')}\n...`)
  }

  const compactedText = [
    ...head,
    middleBannerParts.join('\n'),
    ...tail,
  ].join('\n')

  return {
    compacted: true,
    text: compactedText,
    originalLength: text.length,
    compactedLength: compactedText.length,
    omittedLines,
  }
}

/**
 * 工作模式与上下文预算配置
 * @typedef {'code' | 'goal' | 'plan' | 'architect'} WorkMode
 */

/**
 * 根据工作模式与请求意图，动态计算各上下文层级的 Token 预算
 *
 * @param {string} workMode
 * @param {{
 *   hasUserQuery?: boolean,
 *   modelContextWindow?: number | null,
 * }} [options]
 * @returns {{
 *   repoMapTokens: number,
 *   toolOutputMaxChars: number,
 *   workspaceContextBytes: number,
 * }}
 */
export function calculateDynamicContextBudget(workMode, options = {}) {
  const requestedWindow = Number(options.modelContextWindow)
  const contextWindow = Number.isFinite(requestedWindow) && requestedWindow > 0
    ? Math.floor(requestedWindow)
    : DEFAULT_MODEL_CONTEXT_WINDOW
  const windowScale = Math.max(0.25, contextWindow / DEFAULT_MODEL_CONTEXT_WINDOW)

  // Keep workspace context at one quarter of the default model window, scaled
  // linearly with the selected model. The byte clamps keep tiny and very large
  // model windows from producing unusable or unbounded prompt injections.
  const workspaceContextBytes = Math.min(
    WORKSPACE_CONTEXT_MAX_BYTES,
    Math.max(WORKSPACE_CONTEXT_MIN_BYTES, Math.round(WORKSPACE_CONTEXT_BASE_BYTES * windowScale)),
  )

  // Repo Map and UI trace previews scale with the selected model window.
  // Model-facing tool pruning remains owned by the DSH pruner.
  if (workMode === 'plan' || workMode === 'goal') {
    return {
      repoMapTokens: Math.min(16_000, Math.round(2000 * windowScale)),
      toolOutputMaxChars: Math.min(24_000, Math.round(2400 * windowScale)),
      workspaceContextBytes,
    }
  }

  return {
    repoMapTokens: Math.min(16_000, Math.round(1200 * windowScale)),
    toolOutputMaxChars: Math.min(24_000, Math.round(2800 * windowScale)),
    workspaceContextBytes,
  }
}
