/** Load TaskWeaver's Node-native Antigravity adapter. */
import { createGoogleAdapter, resolveAntigravityModelRoute } from './google-antigravity-adapter.mjs'

export { resolveAntigravityModelRoute }

export async function loadCreateGoogleAdapter() {
  return createGoogleAdapter
}
