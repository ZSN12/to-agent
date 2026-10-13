import fs from 'node:fs/promises'
import path from 'node:path'
import { createTerminalService } from './terminal-service.mjs'
import { createTerminalOutputThrottle } from './terminal-output-throttle.mjs'
import { ipcHandle } from './ipc-utils.mjs'

function isInside(root, target) {
  const relative = path.relative(root, target)
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
}

export function registerTerminalIpc({
  ipcMain,
  resolveRuntimeContext,
  resolveTerminalPolicy,
  terminalService = createTerminalService(),
}) {
  const sessionOwners = new Map()
  const owners = new Map()

  const ownerKeyFor = (event) => {
    const sender = event?.sender
    if (Number.isInteger(sender?.id)) return sender.id
    // Electron exposes a stable numeric WebContents id. The native Shell
    // adapter has no such id, so use its stable sender object identity instead
    // of inventing an Electron-shaped id or sharing ownership across windows.
    if (sender && typeof sender === 'object') return sender
    throw new Error('终端请求缺少有效的窗口身份')
  }

  function forgetSession(id) {
    const ownerKey = sessionOwners.get(id)
    if (ownerKey === undefined) return
    sessionOwners.delete(id)
    const owner = owners.get(ownerKey)
    if (!owner) return
    owner.sessionIds.delete(id)
    if (owner.sessionIds.size === 0) {
      owner.sender.removeListener?.('destroyed', owner.onDestroyed)
      owners.delete(ownerKey)
    }
  }

  function registerOwner(event, id) {
    const ownerKey = ownerKeyFor(event)
    let owner = owners.get(ownerKey)
    if (!owner) {
      const sender = event.sender
      owner = {
        sender,
        sessionIds: new Set(),
        onDestroyed: () => {
          for (const sessionId of [...owner.sessionIds]) {
            terminalService.killSession(sessionId)
            sessionOwners.delete(sessionId)
          }
          owner.sessionIds.clear()
          owners.delete(ownerKey)
        },
      }
      owners.set(ownerKey, owner)
      sender.once?.('destroyed', owner.onDestroyed)
    }
    owner.sessionIds.add(id)
    sessionOwners.set(id, ownerKey)
  }

  function ownsSession(event, id) {
    if (typeof id !== 'string' || !id) return false
    try {
      return sessionOwners.get(id) === ownerKeyFor(event)
    } catch {
      return false
    }
  }

  ipcHandle(ipcMain, 'terminal:create', async (event, rawOptions = {}) => {
    const options = rawOptions && typeof rawOptions === 'object' && !Array.isArray(rawOptions)
      ? rawOptions
      : {}
    const { conversationId, workspacePath, permissionMode, bashSandbox, sessionSandboxMode } = await resolveRuntimeContext()
    if (!conversationId) throw new Error('当前会话无效，无法创建终端')
    if (typeof workspacePath !== 'string' || !workspacePath) throw new Error('请先为当前会话设置工作区')

    let workspaceRoot
    let cwd
    try {
      workspaceRoot = await fs.realpath(path.resolve(workspacePath))
      const rootInfo = await fs.stat(workspaceRoot)
      if (!rootInfo.isDirectory()) throw new Error('工作区不是文件夹')
      cwd = options.cwd
        ? await fs.realpath(path.resolve(options.cwd))
        : workspaceRoot
      const cwdInfo = await fs.stat(cwd)
      if (!cwdInfo.isDirectory()) throw new Error('终端工作目录不是文件夹')
    } catch {
      throw new Error('终端工作区或工作目录不存在、不可访问')
    }
    if (!isInside(workspaceRoot, cwd)) {
      throw new Error('终端只能在当前会话工作区内启动')
    }

    const id = typeof options.id === 'string' && options.id.length > 0
      ? options.id
      : `term-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    if (sessionOwners.has(id)) throw new Error('终端会话 ID 已被占用')

    const sandboxPolicy = resolveTerminalPolicy({
      workspacePath: workspaceRoot,
      permissionMode,
      bashSandbox,
      sessionSandboxMode,
    })
    registerOwner(event, id)
    const output = createTerminalOutputThrottle({
      emit: (data) => {
        if (!event.sender.isDestroyed?.()) event.sender.send('terminal:data', { id, data })
      },
    })
    let sessionInfo
    try {
      sessionInfo = await terminalService.createSession({
        id,
        cwd,
        title: typeof options.title === 'string' ? options.title : undefined,
        cols: options.cols,
        rows: options.rows,
        sandboxPolicy,
        onData: (data) => output.push(data),
        onExit: (code) => {
          output.flush()
          output.dispose()
          if (!event.sender.isDestroyed?.()) event.sender.send('terminal:exit', { id, code })
          forgetSession(id)
        },
      })
    } catch (error) {
      output.flush()
      output.dispose()
      forgetSession(id)
      throw error
    }

    if (event.sender.isDestroyed?.()) {
      terminalService.killSession(id)
      forgetSession(id)
      throw new Error('创建终端期间窗口已关闭')
    }
    return sessionInfo
  })

  ipcHandle(ipcMain, 'terminal:write', (event, id, data) => {
    if (!ownsSession(event, id)) return false
    if (typeof data !== 'string' || data.length > 64 * 1024) return false
    return terminalService.write(id, data)
  })
  ipcHandle(ipcMain, 'terminal:resize', (event, id, cols, rows) => {
    if (!ownsSession(event, id)) return false
    return terminalService.resize(id, cols, rows)
  })
  ipcHandle(ipcMain, 'terminal:kill', (event, id) => {
    if (!ownsSession(event, id)) return false
    const killed = terminalService.killSession(id)
    if (killed) forgetSession(id)
    return killed
  })
  ipcHandle(ipcMain, 'terminal:list', (event) => {
    const ownerKey = ownerKeyFor(event)
    return terminalService.listSessions().filter((session) => sessionOwners.get(session.id) === ownerKey)
  })

  return terminalService
}
