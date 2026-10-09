export function ipcHandle(ipcMain, channel, fn) {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
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
