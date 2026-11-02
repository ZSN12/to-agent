/**
 * First line of every repair prompt sent by TaskWeaver's automatic verification
 * loop. Must match `AUTO_VERIFICATION_PROMPT_MARKER` in backend/chat-turn-pipeline.mjs
 * (checked by scripts/test-auto-verification.mjs).
 */
export const AUTO_VERIFICATION_PROMPT_MARKER = '[TaskWeaver 自动验证]'

export function isAutoVerificationPrompt(text: string | undefined): boolean {
  return typeof text === 'string' && text.startsWith(AUTO_VERIFICATION_PROMPT_MARKER)
}
