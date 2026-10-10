import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'

const execFileAsync = promisify(execFile)

/**
 * 常见工具候选目录列表（跨平台与 macOS Homebrew / NVM / Cargo 支持）
 */
function getStandardToolDirectories() {
  const home = os.homedir()
  const dirs = []

  if (process.platform === 'darwin') {
    dirs.push(
      '/opt/homebrew/bin',
      '/opt/homebrew/sbin',
      '/usr/local/bin',
      '/usr/local/sbin',
      '/usr/bin',
      '/bin',
      '/usr/sbin',
      '/sbin',
    )
  } else if (process.platform === 'linux') {
    dirs.push(
      '/usr/local/bin',
      '/usr/bin',
      '/bin',
      '/usr/local/sbin',
      '/usr/sbin',
      '/sbin',
    )
  }

  // 用户个人目录下的通用工具链
  dirs.push(
    path.join(home, '.cargo', 'bin'),
    path.join(home, '.local', 'bin'),
  )

  // 探测 NVM 最新 Node 版本目录
  try {
    const nvmDir = path.join(home, '.nvm', 'versions', 'node')
    if (fs.existsSync(nvmDir)) {
      const versions = fs.readdirSync(nvmDir).sort().reverse()
      for (const ver of versions) {
        const binPath = path.join(nvmDir, ver, 'bin')
        if (fs.existsSync(binPath)) {
          dirs.push(binPath)
          break
        }
      }
    }
  } catch {
    // ignore
  }

  return dirs.filter((d) => {
    try {
      return fs.existsSync(d) && fs.statSync(d).isDirectory()
    } catch {
      return false
    }
  })
}

/**
 * 尝试通过用户登录 Shell 解析出真实的登录环境变量 PATH
 */
async function resolveLoginShellPath() {
  const shell = process.env.SHELL || (process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash')
  if (!fs.existsSync(shell)) return null

  try {
    const { stdout } = await execFileAsync(shell, ['-ilc', 'echo -n "$PATH"'], {
      timeout: 3000,
      env: { ...process.env, TERM: 'dumb' },
    })
    const trimmed = stdout.trim()
    return trimmed ? trimmed : null
  } catch {
    return null
  }
}

/**
 * 构建经过安全净化与补充合并的完整 PATH
 */
export async function getEffectivePath(customDirs = []) {
  const delimiter = path.delimiter
  const currentPath = process.env.PATH || ''
  const parts = currentPath.split(delimiter).filter(Boolean)

  // 1. 若当前 PATH 极简（典型 Dock 启动），尝试从 login shell 获取
  if (process.platform !== 'win32' && parts.length <= 4) {
    const loginShellPath = await resolveLoginShellPath()
    if (loginShellPath) {
      for (const dir of loginShellPath.split(delimiter)) {
        if (dir && !parts.includes(dir)) {
          parts.push(dir)
        }
      }
    }
  }

  // 2. 补充标准工具目录
  for (const dir of getStandardToolDirectories()) {
    if (!parts.includes(dir)) {
      parts.push(dir)
    }
  }

  // 3. 补充用户自定义目录
  for (const dir of customDirs) {
    if (dir && !parts.includes(dir) && fs.existsSync(dir)) {
      parts.unshift(dir)
    }
  }

  return parts.join(delimiter)
}

/**
 * 在指定的 PATH 中查找可执行程序并返回其实际路径
 */
export function findExecutableInPath(name, envPath) {
  const delimiter = path.delimiter
  const paths = (envPath || process.env.PATH || '').split(delimiter).filter(Boolean)
  const isWindows = process.platform === 'win32'
  const extensions = isWindows ? ['.exe', '.cmd', '.bat', ''] : ['']

  for (const dir of paths) {
    for (const ext of extensions) {
      const candidate = path.join(dir, `${name}${ext}`)
      try {
        if (fs.existsSync(candidate)) {
          const stat = fs.statSync(candidate)
          if (!stat.isDirectory()) {
            return path.resolve(candidate)
          }
        }
      } catch {
        // continue
      }
    }
  }
  return null
}

/**
 * 对常用工具生成修复建议指引，绝不输出误导性的“权限不足”
 */
function getToolFixGuide(name) {
  switch (name) {
    case 'git':
      return process.platform === 'darwin'
        ? '在终端执行 `xcode-select --install` 或 `brew install git`，并确认 /usr/bin 或 /opt/homebrew/bin 在 PATH 中。'
        : '请安装 git 软件包（例如 sudo apt install git 或 sudo yum install git）。'
    case 'node':
      return '建议通过 Homebrew (`brew install node`) 或 Node.js 官网安装包安装，或使用 nvm (`nvm install --lts`)。'
    case 'npm':
      return 'npm 随 Node.js 一起安装。请检查 node 所在目录的 npm 可执行文件。'
    case 'ocx':
      return '如需使用 OpenCodex CLI，请全局安装或将 ocx 所在路径加入系统 PATH。'
    default:
      return `未找到可执行文件 ${name}。请安装该程序并将其目录加入系统环境变量 PATH。`
  }
}

/**
 * 诊断指定外部工具的状态、实际路径与版本
 */
export async function diagnoseTool(name, effectivePath) {
  const resolvedPath = findExecutableInPath(name, effectivePath)
  if (!resolvedPath) {
    return {
      name,
      installed: false,
      resolvedPath: null,
      version: null,
      error: `系统 PATH 中未找到可执行文件 "${name}"`,
      fixGuide: getToolFixGuide(name),
    }
  }

  // 尝试获取版本
  let version = null
  let versionError = null
  try {
    const versionArgs = name === 'node' ? ['-v'] : ['--version']
    const { stdout } = await execFileAsync(resolvedPath, versionArgs, {
      timeout: 3000,
      env: { ...process.env, PATH: effectivePath, LC_ALL: 'C' },
    })
    version = stdout.trim().split('\n')[0]
  } catch (err) {
    versionError = err.message
  }

  return {
    name,
    installed: true,
    resolvedPath,
    version,
    error: versionError,
    fixGuide: null,
  }
}

/**
 * 诊断整个桌面应用的运行环境
 */
export async function diagnoseEnvironment(customDirs = []) {
  const rawPath = process.env.PATH || ''
  const effectivePath = await getEffectivePath(customDirs)
  const isDockLaunch = process.platform === 'darwin' && rawPath.split(path.delimiter).length <= 4

  const tools = ['git', 'node', 'npm', 'ocx']
  const toolDiagnostics = {}
  for (const tool of tools) {
    toolDiagnostics[tool] = await diagnoseTool(tool, effectivePath)
  }

  return {
    platform: process.platform,
    arch: process.arch,
    isDockLaunch,
    rawPath,
    effectivePath,
    standardToolDirs: getStandardToolDirectories(),
    tools: toolDiagnostics,
    launchMode: isDockLaunch ? 'dock_or_finder' : 'terminal_or_cli',
    summary: isDockLaunch
      ? '从 Dock/Finder 启动：已自动合并登录 Shell 与标准工具路径，确保开发工具正常可用。'
      : '从终端或完整环境启动：环境变量完整。',
  }
}

/**
 * 获取用于子进程或终端的安全净化环境变量字典
 */
export async function getSanitizedEnv(customDirs = [], extraEnv = {}) {
  const effectivePath = await getEffectivePath(customDirs)
  const base = {
    HOME: process.env.HOME,
    USER: process.env.USER,
    LOGNAME: process.env.LOGNAME,
    SHELL: process.env.SHELL || (process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash'),
    LANG: process.env.LANG || 'zh_CN.UTF-8',
    LC_ALL: process.env.LC_ALL || 'zh_CN.UTF-8',
    TERM: 'xterm-256color',
    TMPDIR: process.env.TMPDIR || os.tmpdir(),
    PATH: effectivePath,
    ...extraEnv,
  }

  // 过滤掉 undefined
  const sanitized = {}
  for (const [k, v] of Object.entries(base)) {
    if (v !== undefined) sanitized[k] = v
  }
  return sanitized
}
