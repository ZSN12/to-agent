export interface CodeToken {
  text: string
  kind: 'plain' | 'comment' | 'string' | 'number' | 'keyword' | 'literal'
}

const KEYWORDS = new Set((`
  as async await break case catch class const continue debugger default delete do else
  export extends finally for from function get if implements import in instanceof interface
  let new of package private protected public return set static super switch this throw try
  typeof var void while with yield def lambda pass raise self global nonlocal assert
  elif except False True None and or not is del print match struct enum fn impl pub use mod
  crate trait where move mut ref type loop select insert update create alter drop table join
  inner left right on group order by limit offset into values when then end
`).trim().split(/\s+/u))

const LITERALS = new Set(['true', 'false', 'null', 'undefined', 'none', 'nil', 'True', 'False', 'None', 'NULL'])

function commentPattern(language: string): string {
  if (['python', 'py', 'bash', 'sh', 'zsh', 'shell', 'yaml', 'yml', 'toml', 'ruby', 'rb'].includes(language)) {
    return '#[^\\n]*'
  }
  if (language === 'sql') return '--[^\\n]*|/\\*[\\s\\S]*?\\*/'
  if (['html', 'xml', 'svg', 'md', 'markdown'].includes(language)) return '<!--[\\s\\S]*?-->|//[^\\n]*|/\\*[\\s\\S]*?\\*/'
  return '//[^\\n]*|/\\*[\\s\\S]*?\\*/'
}

/** Lightweight tokenizer used only after a code block stops streaming. */
export function highlightCode(source: string, languageName: string): CodeToken[] {
  const language = languageName.toLowerCase().replace(/^language-/u, '').split(/[\s,]/u)[0]
  const comments = commentPattern(language)
  const quotedPatterns = String.raw`"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\x60(?:\\.|[^\x60\\])*\x60`
  const scanner = new RegExp(
    `(${comments})|(${quotedPatterns})|(\\b\\d+(?:\\.\\d+)?(?:e[+-]?\\d+)?\\b)|([\\p{L}_$][\\p{L}\\p{N}_$]*)`,
    'giu',
  )
  const tokens: CodeToken[] = []
  let cursor = 0
  for (const match of source.matchAll(scanner)) {
    const start = match.index ?? cursor
    if (start > cursor) tokens.push({ text: source.slice(cursor, start), kind: 'plain' })
    const value = match[0]
    let kind: CodeToken['kind'] = 'plain'
    if (match[1]) kind = 'comment'
    else if (match[2]) kind = 'string'
    else if (match[3]) kind = 'number'
    else if (match[4]) kind = LITERALS.has(value) ? 'literal' : KEYWORDS.has(value) ? 'keyword' : 'plain'
    tokens.push({ text: value, kind })
    cursor = start + value.length
  }
  if (cursor < source.length) tokens.push({ text: source.slice(cursor), kind: 'plain' })
  return tokens.length ? tokens : [{ text: source, kind: 'plain' }]
}
