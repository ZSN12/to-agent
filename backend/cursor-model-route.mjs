/**
 * Cursor / OpenCodex cursor/* routes — same family DSH Web uses via ocx.
 * TaskWeaver-specific routing should not fight Composer's native-tool habits.
 */

export function isCursorFamilyModelKey(modelKey) {
  const key = String(modelKey ?? '')
  if (key.startsWith('cursor/')) return true
  if (key.startsWith('opencodex/cursor/')) return true
  return false
}

/** @param {{ provider?: string, id?: string }} config */
export function isCursorFamilyRoute(config) {
  if (!config?.provider || !config?.id) return false
  return isCursorFamilyModelKey(`${config.provider}/${config.id}`)
}
