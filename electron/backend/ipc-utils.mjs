import { app } from 'electron'

const TRUSTED_FRAME_URL = [
  /^taskweaver:\/\//,
  /^http:\/\/127\.0\.0\.1:5173\//,
]

/** @param {import('electron').IpcMainInvokeEvent} event */
export function assertTrustedSender(event) {
  const packaged = app?.isPackaged === true
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

export function assertAllChannelsRegistered(expectedChannels, { allowExtraHandlers = ['debug:shadowTranscript'] } = {}) {
  const expected = new Set(expectedChannels)
  const allowExtra = new Set(allowExtraHandlers)
  const missing = [...expected].filter((channel) => !registeredInvokeChannels.has(channel))
  const extra = [...registeredInvokeChannels].filter(
    (channel) => !expected.has(channel) && !allowExtra.has(channel),
  )
  if (missing.length || extra.length) {
    const parts = []
    if (missing.length) parts.push(`missing handlers: ${missing.join(', ')}`)
    if (extra.length) parts.push(`unexpected handlers: ${extra.join(', ')}`)
    throw new Error(`IPC registration mismatch — ${parts.join('; ')}`)
  }
}

export function ipcHandle(ipcMain, channel, fn) {
  registeredInvokeChannels.add(channel)
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      assertTrustedSender(event)
      const data = await fn(event, ...args)
      return { ok: true, data }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return {
        ok: false,
        error: message,
        ...(error?.partialResult?.turnId || error?.turnId
          ? { turnId: error.partialResult?.turnId ?? error.turnId }
          : {}),
        ...(error?.runContinues ? { runContinues: true } : {}),
      }
    }
  })
}
