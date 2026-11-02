/**
 * Shared conservative token-count estimate for backend context budgets.
 * This is intentionally approximate and must not be used for billing or hard
 * context-window enforcement; provider-reported usage remains authoritative.
 */
const CJK_SCRIPT_GLOBAL = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu

/** Return additive character metrics so callers can budget joined text in linear time. */
export function estimateTokenMetrics(text) {
  if (typeof text !== 'string' || text.length === 0) {
    return { cjkCharacters: 0, otherUtf16Units: 0 }
  }

  const cjkMatches = text.match(CJK_SCRIPT_GLOBAL) ?? []
  let cjkUtf16Units = 0
  for (const character of cjkMatches) cjkUtf16Units += character.length

  return {
    cjkCharacters: cjkMatches.length,
    otherUtf16Units: text.length - cjkUtf16Units,
  }
}

/** Convert additive metrics to the shared conservative estimate. */
export function estimateTokensFromMetrics({ cjkCharacters, otherUtf16Units }) {
  return cjkCharacters + Math.ceil(otherUtf16Units / 3.5)
}

export function estimateTokens(text) {
  return estimateTokensFromMetrics(estimateTokenMetrics(text))
}
