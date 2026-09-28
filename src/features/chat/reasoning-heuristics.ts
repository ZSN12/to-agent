/** 与 DSH ReasoningRow 一致：折叠行只展示首行或流式尾行 */
export function firstLine(text: string): string {
  const newline = text.indexOf('\n')
  return newline === -1 ? text : text.slice(0, newline)
}

export function latestLine(text: string): string {
  const visible = text.trimEnd()
  const newline = visible.lastIndexOf('\n')
  return newline === -1 ? visible : visible.slice(newline + 1)
}

/**
 * 部分中转/API 把 extended thinking 打进 text 块而非 thinking 块。
 * 启发式折叠为 Think 行，避免整段推理铺满气泡（对齐 DSH 默认折叠）。
 */
export function shouldPresentTextAsThinking(text: string, isStreaming = false): boolean {
  const body = text.replace(/<\/?think>/gi, '').trim()
  if (body.length < 100) return false
  const line = firstLine(body)
  if (/^(#{1,3}\s|[-*]\s+\S|>\s)/.test(line)) return false
  if (/```/.test(body) && body.indexOf('```') < 400) return false
  const enPlanner =
    /^(I |I'm |I've |I'll |Let me |I need to |I should |I want to |I will |Looking at |Checking |Searching |The user )/i.test(
      line,
    )
  const zhPlanner = /^(我需要|我应该|让我|我来|先看|接下来|首先|用户)/.test(line)
  if (enPlanner || zhPlanner) return true
  if (isStreaming && body.length >= 280 && !body.includes('```')) {
    return enPlanner || zhPlanner || /^(\*\*)?[A-Z]/.test(line)
  }
  return false
}
