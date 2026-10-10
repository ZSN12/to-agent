const FENCE_PATTERN = /^ {0,3}(`{3,}|~{3,})/
const LIST_ITEM_PATTERN = /^(\s*)(?:[-+*]|\d+[.)])\s+/u
const REFERENCE_PATTERN = /^ {0,3}\[[^\]]+\]:\s+/mu
const REFERENCE_LINK_PATTERN = /\[[^\]]+\]\[[^\]]*\]/u
const SETEXT_UNDERLINE_PATTERN = /^ {0,3}(?:=+|-+)\s*$/u
const TABLE_SEPARATOR_PATTERN = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/u
const BLOCK_START_PATTERN = /^ {0,3}(?:#{1,6}(?:\s|$)|>|(?:[-+*]|\d+[.)])\s+|-{3,}|\*{3,}|_{3,})/u

function isFenceClose(line: string, fence: { marker: '`' | '~'; length: number }): boolean {
  const match = FENCE_PATTERN.exec(line)
  return Boolean(match
    && match[1][0] === fence.marker
    && match[1].length >= fence.length
    && new RegExp(`^ {0,3}${fence.marker === '`' ? '`' : '~'}{${fence.length},}\\s*$`, 'u').test(line))
}

function canSeparateBlock(block: string, nextLine: string): boolean {
  const trimmedNext = nextLine.trim()
  if (!trimmedNext) return false

  const lines = block.split('\n').filter((line) => line.trim())
  const lastLine = lines.at(-1) ?? ''
  if (/^\s{1,}/u.test(nextLine)) return false
  if (REFERENCE_PATTERN.test(block) || REFERENCE_LINK_PATTERN.test(block)
    || REFERENCE_PATTERN.test(nextLine)) return false
  if (SETEXT_UNDERLINE_PATTERN.test(trimmedNext)) return false

  if (/^ {0,3}>/u.test(lastLine) && /^ {0,3}>/u.test(trimmedNext)) return false

  const listItems = lines.map((line) => LIST_ITEM_PATTERN.exec(line)).filter(Boolean)
  if (listItems.length > 0) {
    const baseIndent = Math.min(...listItems.map((match) => match?.[1].length ?? 0))
    const nextListItem = LIST_ITEM_PATTERN.exec(nextLine)
    if (nextListItem && nextListItem[1].length <= baseIndent) return false
  }

  if (lines.some((line) => TABLE_SEPARATOR_PATTERN.test(line)) && /^\s*\|/u.test(trimmedNext)) {
    return false
  }
  return true
}

/** Split complete top-level Markdown blocks from the only block that can still grow. */
export function splitMarkdownStableBlocks(source: string): { stableBlocks: string[]; tail: string } {
  const lines = String(source ?? '').split('\n')
  const stableBlocks: string[] = []
  let blockStart = 0
  let fence: { marker: '`' | '~'; length: number } | null = null

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const fenceMatch = FENCE_PATTERN.exec(line)
    if (fence) {
      if (!isFenceClose(line, fence)) continue
      const completed = lines.slice(blockStart, index + 1).join('\n').trimEnd()
      if (completed) stableBlocks.push(completed)
      let next = index + 1
      while (next < lines.length && !lines[next].trim()) next += 1
      blockStart = next
      index = next - 1
      fence = null
      continue
    }

    if (fenceMatch) {
      const previous = lines.slice(blockStart, index).join('\n').trimEnd()
      if (previous && canSeparateBlock(previous, line)) {
        stableBlocks.push(previous)
        blockStart = index
      }
      fence = { marker: fenceMatch[1][0] as '`' | '~', length: fenceMatch[1].length }
      continue
    }

    if (index > blockStart && line.trim() && BLOCK_START_PATTERN.test(line)) {
      const previous = lines.slice(blockStart, index).join('\n').trimEnd()
      if (previous && canSeparateBlock(previous, line)) {
        stableBlocks.push(previous)
        blockStart = index
      }
    }

    if (line.trim()) continue
    let next = index + 1
    while (next < lines.length && !lines[next].trim()) next += 1
    if (next >= lines.length) continue

    const block = lines.slice(blockStart, index).join('\n').trimEnd()
    if (!block || !canSeparateBlock(block, lines[next])) continue
    stableBlocks.push(block)
    blockStart = next
    index = next - 1
  }

  return {
    stableBlocks,
    tail: lines.slice(blockStart).join('\n'),
  }
}
