export { createCursorAdapter, CURSOR_API_URL } from './adapters/cursor.js'
export type { CursorAdapterDeps } from './adapters/cursor.js'

export {
  createTranslatorBudget,
  isTranslatorBudgetExceededError,
  TranslatorBudgetExceededError,
} from './lib/translator-budget.js'
export type {
  TranslatorBudget,
  TranslatorBudgetOptions,
  TranslatorBudgetSnapshot,
} from './lib/translator-budget.js'

export {
  credentialsFromCursorTokens,
  CursorAuthTerminalError,
  generateCursorAuthParams,
  getTokenExpiry,
  loginCursor,
  pollCursorAuth,
  refreshCursorToken,
} from './oauth/cursor.js'
export type { CursorAuthParams } from './oauth/cursor.js'

export {
  discoverAntigravityProject,
  loginAntigravity,
  refreshAntigravityToken,
  validateAntigravityImportCredential,
} from './oauth/google-antigravity.js'
export { OAuthCallbackFlow } from './oauth/callback-server.js'
export type { OAuthCallbackFlowOptions, CallbackResult } from './oauth/callback-server.js'
export { generatePKCE } from './oauth/pkce.js'
