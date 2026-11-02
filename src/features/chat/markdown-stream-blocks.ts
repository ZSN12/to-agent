const FENCE_PATTERN = /^ {0,3}(`{3,}|~{3,})/
const LIST_ITEM_PATTERN = /^(\s*)(?:[-+*]|\d+[.)])\s+/u
const REFERENCE_PATTERN = /^ {0,3}\[[^\]]+\]:\s+/mu
const SETEXT_UNDERLINE_PATTERN = /^ {0,3}(?:=+|-+)\s*$/u
const TABLE_SEPARATOR_PATTERN = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/u
const BLOCK_START_PATTERN = /^ {0,3}(?:#{1,6}(?:\s|$)|>|(?:[-+*]|\d+[.)])\s+|-{3,}|\*{3,}|_{3,})/u

type Fence = { marker: '`' | '~'; length: number }
type BlockState = {
  start: number
  hasContent: boolean
  hasLine: boolean
  lastLine: string
  listIndent: number
  table: boolean
  reference: boolean
  referenceLink: boolean
  // Reference labels may span lines, so these recognizers carry across lines.
  definitionPhase: number
  definitionLength: number
  linkPhase: number
  linkLength: number
  blank: boolean
  fence: Fence | null
  afterFence: boolean
}

type SplitResult = { stableBlocks: string[]; tail: string }
type SplitOptions = { onLineProcessed?: () => void }

function emptyBlock(start: number): BlockState {
  return {
    start, hasContent: false, hasLine: false, lastLine: '', listIndent: Infinity,
    table: false, reference: false, referenceLink: false,
    definitionPhase: 0, definitionLength: 0, linkPhase: 0, linkLength: 0,
    blank: false, fence: null, afterFence: false,
  }
}

function isFenceClose(line: string, fence: Fence): boolean {
  const match = FENCE_PATTERN.exec(line)
  return Boolean(match && match[1][0] === fence.marker && match[1].length >= fence.length
    && !line.slice(match[0].length).trim())
}

function scanReferenceCharacter(state: BlockState, character: string, startsDefinition = false) {
  // A definition's whitespace must survive trimEnd() before it can prevent a split.
  if (state.definitionPhase === 4 && character.trim()) state.reference = true
  if (startsDefinition) {
    state.definitionPhase = 1
    state.definitionLength = 0
  } else if (state.definitionPhase === 1) {
    if (character === ']') state.definitionPhase = state.definitionLength ? 2 : 0
    else state.definitionLength += 1
  } else if (state.definitionPhase === 2) {
    state.definitionPhase = character === ':' ? 3 : 0
  } else if (state.definitionPhase === 3) {
    state.definitionPhase = character.trim() ? 0 : 4
  }

  if (state.linkPhase === 0) {
    if (character === '[') { state.linkPhase = 1; state.linkLength = 0 }
  } else if (state.linkPhase === 1) {
    if (character === ']') state.linkPhase = state.linkLength ? 2 : 0
    else state.linkLength += 1
  } else if (state.linkPhase === 2) {
    state.linkPhase = character === '[' ? 3 : 0
  } else if (character === ']') {
    state.referenceLink = true
    state.linkPhase = 0
  }
}

function addLine(state: BlockState, line: string) {
  if (state.hasLine) scanReferenceCharacter(state, '\n')
  state.hasLine = true
  const definitionStart = /^ {0,3}\[/u.exec(line)
  for (let index = 0; index < line.length; index += 1) {
    scanReferenceCharacter(state, line[index], Boolean(definitionStart && index === definitionStart[0].length - 1))
  }
  if (!line.trim()) { state.blank = true; return }
  state.hasContent = true
  state.lastLine = line
  state.blank = false
  const list = LIST_ITEM_PATTERN.exec(line)
  if (list) state.listIndent = Math.min(state.listIndent, list[1].length)
  if (TABLE_SEPARATOR_PATTERN.test(line)) state.table = true
}

function canSeparateBlock(state: BlockState, nextLine: string): boolean {
  const trimmedNext = nextLine.trim()
  if (!trimmedNext || /^\s/u.test(nextLine)) return false
  if (state.reference || state.referenceLink || REFERENCE_PATTERN.test(nextLine)) return false
  if (SETEXT_UNDERLINE_PATTERN.test(trimmedNext)) return false
  if (/^ {0,3}>/u.test(state.lastLine) && /^ {0,3}>/u.test(trimmedNext)) return false
  const nextList = LIST_ITEM_PATTERN.exec(nextLine)
  if (nextList && nextList[1].length <= state.listIndent && state.listIndent < Infinity) return false
  if (state.table && /^\|/u.test(trimmedNext)) return false
  return true
}

/**
 * Keep only complete-line state between updates. The unfinished final line is previewed
 * on a copy: appending can turn it into a reference, a fence, or a Setext underline.
 * Replaced/truncated input resets the parser, including all previously stable blocks.
 */
export function createMarkdownStreamSplitter(options: SplitOptions = {}) {
  let previousSource = ''
  let committedOffset = 0
  let state = emptyBlock(0)
  let stableBlocks: string[] = []

  function processLine(source: string, line: string, start: number, end: number) {
    options.onLineProcessed?.()
    if (state.afterFence) {
      state.start = start
      if (!line.trim()) { state.start = end + 1; return }
      state.afterFence = false
    }
    if (state.fence) {
      if (isFenceClose(line, state.fence)) {
        const completed = source.slice(state.start, end).trimEnd()
        if (completed) stableBlocks.push(completed)
        state = emptyBlock(end + 1)
        state.afterFence = true
      } else addLine(state, line)
      return
    }
    const fenceMatch = FENCE_PATTERN.exec(line)
    if (state.hasContent && line.trim()
      && (state.blank || fenceMatch || (start > state.start && BLOCK_START_PATTERN.test(line)))
      && canSeparateBlock(state, line)) {
      stableBlocks.push(source.slice(state.start, start).trimEnd())
      state = emptyBlock(start)
    }
    if (fenceMatch) state.fence = { marker: fenceMatch[1][0] as '`' | '~', length: fenceMatch[1].length }
    addLine(state, line)
  }

  return {
    splitMarkdownStableBlocks(input: string): SplitResult {
      const source = String(input ?? '')
      // String equality uses the engine's bulk comparison while still validating every
      // prior character; checking only sampled positions would miss in-place edits.
      if (source.slice(0, previousSource.length) !== previousSource) {
        committedOffset = 0
        state = emptyBlock(0)
        stableBlocks = []
      }
      let start = committedOffset
      let newline = source.indexOf('\n', start)
      while (newline !== -1) {
        processLine(source, source.slice(start, newline), start, newline)
        start = newline + 1
        newline = source.indexOf('\n', start)
      }
      committedOffset = start
      previousSource = source
      const committedState = state
      const committedBlocks = stableBlocks
      state = { ...state }
      stableBlocks = stableBlocks.slice()
      processLine(source, source.slice(start), start, source.length)
      const result = { stableBlocks, tail: source.slice(state.start) }
      state = committedState
      stableBlocks = committedBlocks
      return result
    },
  }
}

/** Split complete top-level Markdown blocks from the only block that can still grow. */
export function splitMarkdownStableBlocks(source: string): SplitResult {
  return createMarkdownStreamSplitter().splitMarkdownStableBlocks(source)
}
