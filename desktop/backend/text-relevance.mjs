const STOP_WORDS = new Set([
  '当前', '这个', '那个', '这些', '那些', '进行', '相关', '文件', '代码', '项目', '任务',
  '请帮', '帮我', '一下', '怎么', '如何', '以及', '然后', '并且', '查看', '读取', '分析',
])

export function precomputeQueryTerms(value) {
  return terms(value)
}

function terms(value) {
  const normalized = String(value ?? '').toLocaleLowerCase()
  const result = new Set(normalized.match(/[\p{L}\p{N}_]{2,}/gu) ?? [])
  for (const [, sequence] of normalized.matchAll(/([\p{Script=Han}]+)/gu)) {
    if (sequence.length === 1) result.add(sequence)
    for (let index = 0; index < sequence.length - 1; index += 1) {
      result.add(sequence.slice(index, index + 2))
    }
  }
  return [...result].filter((term) => !STOP_WORDS.has(term))
}

/** Deterministic lexical relevance score; deliberately local and dependency-free. */
export function scoreTextRelevance(query, text, { pathText = '', titleText = '', precomputedTerms = null } = {}) {
  const queryTerms = precomputedTerms ?? terms(query)
  if (!queryTerms.length) return 0
  const body = String(text ?? '').toLocaleLowerCase()
  const filePath = `${pathText} ${titleText}`.toLocaleLowerCase()
  let score = 0
  for (const term of queryTerms) {
    if (filePath.includes(term)) score += 4
    if (body.includes(term)) score += 1
  }
  return score
}
