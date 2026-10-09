import { createTerminalService } from './terminal-service.mjs'
import { ipcHandle } from './ipc-utils.mjs'

export function registerTerminalIpc({ ipcMain, getWorkspacePath, fallbackWorkspace }) {
  const terminalService = createTerminalService()

  ipcHandle(ipcMain, 'terminal:create', async (event, options = {}) => {
    const targetCwd = options.cwd || getWorkspacePath() || fallbackWorkspace
    const sessionId = options.id || `term-${Date.now()}`

    event.sender.once('destroyed', () => {
      terminalService.killSession(sessionId)
    })

    return terminalService.createSession({
      id: sessionId,
      cwd: targetCwd,
      title: options.title,
      cols: options.cols,
      rows: options.rows,
      onData: (data) => {
        if (!event.sender.isDestroyed()) event.sender.send('terminal:data', { id: sessionId, data })
      },
      onExit: (code) => {
        if (!event.sender.isDestroyed()) event.sender.send('terminal:exit', { id: sessionId, code })
      },
    })
  })

  ipcHandle(ipcMain, 'terminal:write', (_event, payload = {}) =>
    terminalService.write(payload.id, payload.data))
  ipcHandle(ipcMain, 'terminal:resize', (_event, payload = {}) =>
    terminalService.resize(payload.id, payload.cols, payload.rows))
  ipcHandle(ipcMain, 'terminal:kill', (_event, payload = {}) =>
    terminalService.killSession(payload.id))
  ipcHandle(ipcMain, 'terminal:list', () => terminalService.listSessions())

  return terminalService
}
