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

/**
 * 智能折叠大体积工具调用结果，提取关键行与首尾诊断，生成紧凑摘要。
 *
 * @param {string} text 原始工具输出
 * @param {{
 *   toolName?: string,
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

  const maxChars = options.maxChars ?? COMPACTION_LIMITS.MAX_TOOL_OUTPUT_CHARS
  const maxLines = options.maxLines ?? COMPACTION_LIMITS.MAX_TOOL_OUTPUT_LINES
  const headLinesCount = options.headLines ?? COMPACTION_LIMITS.HEAD_LINES
  const tailLinesCount = options.tailLines ?? COMPACTION_LIMITS.TAIL_LINES
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
  const contextWindow = options.modelContextWindow || 128_000

  const workspaceContextBytes = 32 * 1024

  // 1. 计划/目标模式：同 32KiB 注入上限，略多 Repo Map、略紧工具输出折叠
  if (workMode === 'plan' || workMode === 'goal') {
    return {
      repoMapTokens: contextWindow >= 64_000 ? 2000 : 1000,
      toolOutputMaxChars: 2400,
      workspaceContextBytes,
    }
  }

  // 2. 代码模式：32KiB 默认注入 + 适中 Repo Map
  return {
    repoMapTokens: contextWindow >= 64_000 ? 1200 : 600,
    toolOutputMaxChars: 2800,
    workspaceContextBytes,
  }
}
