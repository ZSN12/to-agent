import { createTerminalService } from './terminal-service.mjs'
import { ipcHandle } from './ipc-utils.mjs'

export function registerTerminalIpc({ ipcMain, getWorkspacePath, fallbackWorkspace }) {
  const terminalService = createTerminalService()

  ipcHandle(ipcMain, 'terminal:create', async (event, options = {}) => {
    const cwdOverride = options.cwd
    const workspacePath = cwdOverride || await Promise.resolve(getWorkspacePath(options.conversationId)) || fallbackWorkspace
    const targetCwd = workspacePath
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

  ipcHandle(ipcMain, 'terminal:write', (_event, id, data) =>
    terminalService.write(id, data))
  ipcHandle(ipcMain, 'terminal:resize', (_event, id, cols, rows) =>
    terminalService.resize(id, cols, rows))
  ipcHandle(ipcMain, 'terminal:kill', (_event, id) =>
    terminalService.killSession(id))
  ipcHandle(ipcMain, 'terminal:list', () => terminalService.listSessions())

  return terminalService
}
