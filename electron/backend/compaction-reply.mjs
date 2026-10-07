/** @param {string | null | undefined} text */
export function parseCompactionCommandText(text) {
  if (typeof text !== 'string') return null
  const trimmed = text.trim()
  const match = trimmed.match(/^Compacted\s+(\d+)\s+history items\s+\(~([\d,]+)\s+tokens\)\.\s*$/i)
  if (!match) return null
  return {
    historyItems: Number(match[1]),
    tokensShadowed: Number(match[2].replace(/,/g, '')),
  }
}
