import crypto from 'node:crypto'

/** @type {Map<string, (response: PermissionPromptResponse) => void>} */
const pending = new Map()

/**
 * @typedef {{ action: 'allow-once' | 'allow-always' | 'deny' }} PermissionPromptResponse
 */

/**
 * @param {import('electron').WebContents} webContents
 * @param {{
 *   reason: string
 *   detail: string
 *   tool: string
 *   allowAlways?: boolean
 * }} payload
 * @param {number} [timeoutMs]
 */
export function waitForRendererPermissionPrompt(webContents, payload, timeoutMs = 300_000) {
  return new Promise((resolve) => {
    if (!webContents || webContents.isDestroyed()) {
      resolve({ action: 'deny' })
      return
    }
    const id = crypto.randomUUID()
    const timer = setTimeout(() => {
      pending.delete(id)
      resolve({ action: 'deny' })
    }, timeoutMs)
    pending.set(id, (response) => {
      clearTimeout(timer)
      pending.delete(id)
      resolve(response)
    })
    webContents.send('permission:prompt', { id, ...payload })
  })
}

/**
 * @param {string} id
 * @param {PermissionPromptResponse} response
 */
export function resolvePermissionPrompt(id, response) {
  const settle = pending.get(id)
  if (!settle) return false
  pending.delete(id)
  settle(response)
  return true
}
