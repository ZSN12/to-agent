import { isShellBackend } from '../platform/runtime-mode.mjs'

const TRUSTED_FRAME_URL = [
  /^taskweaver:\/\//,
  /^http:\/\/127\.0\.0\.1:5173\//,
  /^file:\/\//,
]

/** @param {import('electron').IpcMainInvokeEvent} event */
export function assertTrustedSender(event) {
  if (isShellBackend()) return
  const packaged = process.env.TASKWEAVER_PACKAGED === '1' || process.env.TASKWEAVER_PACKAGED === 'true'
  const patterns = packaged
    ? TRUSTED_FRAME_URL.filter((re) => !String(re).includes('5173'))
    : TRUSTED_FRAME_URL
  const url = event.senderFrame?.url ?? event.sender?.getURL?.() ?? ''
  if (!patterns.some((re) => re.test(url))) {
    throw new Error(`拒绝来自不可信页面的 IPC：${url.slice(0, 80)}`)
  }
}

/** @type {Set<string>} */
export const registeredInvokeChannels = new Set()

export function ipcHandle(ipcMain, channel, handler) {
  registeredInvokeChannels.add(channel)
  ipcMain.handle(channel, async (event, ...args) => {
    assertTrustedSender(event)
    try {
      const data = await handler(event, ...args)
      return { ok: true, data }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  })
}

export function assertAllChannelsRegistered(expectedChannels) {
  const missing = expectedChannels.filter((name) => !registeredInvokeChannels.has(name))
  if (missing.length) {
    throw new Error(`IPC 通道未注册：${missing.join(', ')}`)
  }
}
