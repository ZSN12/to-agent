import { spawn } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { getSanitizedEnv } from './env-service.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

// 自动检测并修复 node-pty 二进制 spawn-helper 的执行权限 (+x)
try {
  const ptyEntry = require.resolve('node-pty')
  const ptyDir = path.dirname(ptyEntry)
  const candidateDirs = [
    path.join(ptyDir, '..', 'prebuilds', `${process.platform}-${process.arch}`),
    path.join(ptyDir, '..', 'build', 'Release'),
  ]
  for (const cDir of candidateDirs) {
    const helper = path.join(cDir, 'spawn-helper')
    if (fs.existsSync(helper)) {
      try {
        const st = fs.statSync(helper)
        if ((st.mode & 0o111) === 0) {
          fs.chmodSync(helper, 0o755)
        }
      } catch {
        // ignore
      }
    }
  }
} catch {
  // ignore
}

let nodePty = null
let nodePtyError = null
try {
  nodePty = require('node-pty')
} catch (e) {
  nodePtyError = e?.message || String(e)
}

/**
 * 获取解包后的真实 pty-shim.py 路径 (支持 app.asar.unpacked)
 */
function resolvePtyShimPath() {
  const directPath = path.join(__dirname, 'pty-shim.py')
  if (directPath.includes('app.asar')) {
    const unpacked = directPath.replace('app.asar', 'app.asar.unpacked')
    if (fs.existsSync(unpacked)) {
      return unpacked
    }
  }
  return directPath
}

/**
 * 寻找可用的 Python3 解释器
 */
function findSystemPython() {
  const candidates = [
    '/usr/bin/python3',
    '/opt/homebrew/bin/python3',
    '/usr/local/bin/python3',
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }
  return null
}

/**
 * 终端服务 (Terminal Service)
 * 管理交互式本地 Shell / PTY 会话：
 * 1. 优先使用 node-pty 原生虚拟终端模块；
 * 2. 优雅降级使用 Python 3 pty-shim 驱动；
 * 3. 严格禁止静默降级为普通非 PTY 进程（避免无真实交互能力）；
 * 4. 支持尺寸动态调整 (SIGWINCH)、全生命周期管理与进程组彻底清理。
 */
export function createTerminalService() {
  /** @type {Map<string, { id: string, title: string, cwd: string, driver: 'node-pty' | 'python-shim', pty?: any, process?: import('node:child_process').ChildProcess, pid: number, isPty: boolean, shell: string, cols: number, rows: number }>} */
  const sessions = new Map()

  function getShell() {
    if (process.platform === 'win32') {
      return process.env.COMSPEC || 'cmd.exe'
    }
    const preferred = process.env.SHELL || '/bin/zsh'
    if (fs.existsSync(preferred)) return preferred
    if (fs.existsSync('/bin/zsh')) return '/bin/zsh'
    if (fs.existsSync('/bin/bash')) return '/bin/bash'
    return '/bin/sh'
  }

  function isPtyShimAvailable() {
    const shimPath = resolvePtyShimPath()
    const py = findSystemPython()
    return process.platform !== 'win32' && fs.existsSync(shimPath) && Boolean(py)
  }

  /**
   * 创建新的终端会话 (优先使用真实 PTY 驱动)
   * @param {object} options
   * @param {string} options.id
   * @param {string} [options.cwd]
   * @param {string} [options.title]
   * @param {number} [options.cols]
   * @param {number} [options.rows]
   * @param {(data: string) => void} [options.onData]
   * @param {(code: number | null) => void} [options.onExit]
   */
  async function createSession({ id, cwd, title, cols = 80, rows = 24, onData, onExit }) {
    if (!id || typeof id !== 'string') {
      throw new Error('终端会话创建失败：会话 ID 必须为有效字符串')
    }

    if (sessions.has(id)) {
      killSession(id)
    }

    let safeCwd = process.cwd()
    if (cwd) {
      try {
        if (fs.existsSync(cwd) && fs.statSync(cwd).isDirectory()) {
          safeCwd = path.resolve(cwd)
        }
      } catch {
        safeCwd = process.cwd()
      }
    }

    const safeCols = Math.max(10, Math.min(Number(cols) || 80, 500))
    const safeRows = Math.max(3, Math.min(Number(rows) || 24, 200))

    const shell = getShell()
    const ptyAvailable = isPtyShimAvailable()
    const ptyShimPath = resolvePtyShimPath()
    const pythonBin = findSystemPython()

    // 净化与合并完整的登录 Shell 环境变量
    let env = process.env
    try {
      env = await getSanitizedEnv([], {
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        LANG: process.env.LANG || 'zh_CN.UTF-8',
        LC_ALL: process.env.LC_ALL || 'zh_CN.UTF-8',
      })
    } catch {
      env = {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        LANG: process.env.LANG || 'zh_CN.UTF-8',
        LC_ALL: process.env.LC_ALL || 'zh_CN.UTF-8',
        PATH: process.env.PATH || '/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin',
      }
    }

    let sessionInfo = null

    // 优先方案 1：node-pty 原生模块
    if (nodePty && typeof nodePty.spawn === 'function') {
      try {
        const ptyProcess = nodePty.spawn(shell, [], {
          name: 'xterm-256color',
          cols: safeCols,
          rows: safeRows,
          cwd: safeCwd,
          env,
        })

        ptyProcess.onData((data) => {
          onData?.(data)
        })

        ptyProcess.onExit(({ exitCode }) => {
          sessions.delete(id)
          onExit?.(exitCode)
        })

        sessionInfo = {
          id,
          cwd: safeCwd,
          title: title || path.basename(safeCwd) || '终端',
          driver: 'node-pty',
          pty: ptyProcess,
          pid: ptyProcess.pid,
          isPty: true,
          shell,
          cols: safeCols,
          rows: safeRows,
        }
      } catch (err) {
        console.warn(`[TaskWeaver-Terminal] node-pty 启动失败: ${err.message}，尝试降级到 Python PTY shim`)
      }
    }

    // 方案 2：Python PTY shim
    if (!sessionInfo && ptyAvailable && pythonBin) {
      try {
        const child = spawn(pythonBin, [
          ptyShimPath,
          '--cwd', safeCwd,
          '--rows', String(safeRows),
          '--cols', String(safeCols),
          '--shell', shell,
        ], {
          cwd: safeCwd,
          env,
          stdio: ['pipe', 'pipe', 'pipe'],
          detached: process.platform !== 'win32',
        })

        child.stdout?.setEncoding('utf-8')
        child.stderr?.setEncoding('utf-8')

        child.stdout?.on('data', (chunk) => {
          onData?.(chunk)
        })

        child.stderr?.on('data', (chunk) => {
          onData?.(chunk)
        })

        child.on('close', (code) => {
          sessions.delete(id)
          onExit?.(code)
        })

        child.on('error', (err) => {
          onData?.(`\r\n\x1b[31m[终端启动异常]\x1b[0m 无法启动终端 Shell (${err.message})。\r\n请检查系统环境设置或终端路径。\r\n`)
          sessions.delete(id)
          onExit?.(-1)
        })

        sessionInfo = {
          id,
          cwd: safeCwd,
          title: title || path.basename(safeCwd) || '终端',
          driver: 'python-shim',
          process: child,
          pid: child.pid,
          isPty: true,
          shell,
          cols: safeCols,
          rows: safeRows,
        }
      } catch (err) {
        console.warn(`[TaskWeaver-Terminal] Python shim 启动失败: ${err.message}`)
      }
    }

    // 若两种 PTY 方案均不可用：绝对不静默降级为普通非 PTY shell！
    if (!sessionInfo) {
      const ptyFailReason = [
        '\r\n\x1b[31;1m[TaskWeaver 终端不可用]\x1b[0m 当前系统缺少交互式 PTY 驱动：',
        nodePtyError ? `  • 原生模块 node-pty 加载受限: ${nodePtyError}` : '  • 原生模块 node-pty 不可用',
        pythonBin ? `  • Python PTY 脚本不可用 (${ptyShimPath})` : '  • 未检测到系统 Python 3 环境 (/usr/bin/python3, /opt/homebrew/bin/python3)',
        '\r\n\x1b[33m排查建议：\x1b[0m',
        '  1. 确认系统已安装 Python 3 或具备原生终端环境；',
        '  2. 检查系统 PATH 与执行权限。\r\n',
      ].join('\r\n')

      onData?.(ptyFailReason)
      onExit?.(-1)
      throw new Error(`终端初始化失败：当前系统缺少 PTY 驱动支持（node-pty 无法加载且无可用 Python 3 环境）。`)
    }

    sessions.set(id, sessionInfo)
    return {
      id,
      cwd: safeCwd,
      title: sessionInfo.title,
      isPty: true,
      shell,
      driver: sessionInfo.driver,
      cols: safeCols,
      rows: safeRows,
    }
  }

  /**
   * 向终端输入内容
   */
  function write(id, data) {
    if (!id || typeof id !== 'string') return false
    const session = sessions.get(id)
    if (!session) return false

    try {
      if (session.driver === 'node-pty') {
        session.pty.write(data)
        return true
      } else if (session.driver === 'python-shim') {
        if (session.process?.stdin?.writable) {
          session.process.stdin.write(data)
          return true
        }
      }
    } catch {
      return false
    }
    return false
  }

  /**
   * 动态调整终端尺寸 (触发操作系统 SIGWINCH)
   */
  function resize(id, cols, rows) {
    if (!id || typeof id !== 'string') return false
    const session = sessions.get(id)
    if (!session) return false

    const safeCols = Math.max(10, Math.min(Number(cols) || 80, 500))
    const safeRows = Math.max(3, Math.min(Number(rows) || 24, 200))

    try {
      if (session.driver === 'node-pty') {
        session.pty.resize(safeCols, safeRows)
        session.cols = safeCols
        session.rows = safeRows
        return true
      } else if (session.driver === 'python-shim') {
        if (session.process?.stdin?.writable) {
          session.process.stdin.write(`__TW_RESIZE__:${safeRows}:${safeCols}\n`)
          session.cols = safeCols
          session.rows = safeRows
          return true
        }
      }
    } catch {
      return false
    }
    return false
  }

  /**
   * 终止终端会话并可靠清理其进程树
   */
  function killSession(id) {
    if (!id || typeof id !== 'string') return false
    const session = sessions.get(id)
    if (!session) return false

    try {
      if (session.driver === 'node-pty') {
        session.pty.kill()
      } else if (session.driver === 'python-shim') {
        const pid = session.pid
        if (process.platform !== 'win32' && pid) {
          process.kill(-pid, 'SIGTERM')
          setTimeout(() => {
            try {
              process.kill(-pid, 'SIGKILL')
            } catch {
              // ignore
            }
          }, 150)
        } else {
          session.process?.kill('SIGTERM')
        }
      }
    } catch {
      // ignore
    }
    sessions.delete(id)
    return true
  }

  /**
   * 获取所有会话列表
   */
  function listSessions() {
    return Array.from(sessions.values()).map((s) => ({
      id: s.id,
      cwd: s.cwd,
      title: s.title,
      isPty: s.isPty,
      shell: s.shell,
      driver: s.driver,
    }))
  }

  /**
   * 销毁所有会话，清理全部子进程
   */
  function dispose() {
    for (const id of sessions.keys()) {
      killSession(id)
    }
  }

  return {
    createSession,
    write,
    resize,
    killSession,
    listSessions,
    dispose,
    isPtyShimAvailable,
    findSystemPython,
    resolvePtyShimPath,
  }
}
