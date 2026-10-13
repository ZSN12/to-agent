/**
 * Shared conservative token-count estimate for backend context budgets.
 * This is intentionally approximate and must not be used for billing or hard
 * context-window enforcement; provider-reported usage remains authoritative.
 */
const CJK_SCRIPT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u

export function estimateTokens(text) {
  if (typeof text !== 'string' || text.length === 0) return 0
  let cjkCharacters = 0
  let otherUtf16Units = 0
  for (const character of text) {
    if (CJK_SCRIPT.test(character)) cjkCharacters += 1
    else otherUtf16Units += character.length
  }
  return cjkCharacters + Math.ceil(otherUtf16Units / 3.5)
}
