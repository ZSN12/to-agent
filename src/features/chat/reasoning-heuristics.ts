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
 * Think/正文应由 Host 的结构化 content block 类型决定；不能从普通正文的
 * 语言、长度或首字母推断成 reasoning。否则流式文本可能被折叠，结束后又
 * 因启发式条件变化而突然展开。
 */
export function isStructuredThinkingBlock(block: { kind: 'thinking' | 'text' }): boolean {
  return block.kind === 'thinking'
}
