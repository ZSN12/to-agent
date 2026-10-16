/**
 * Bundled `ocx` CLI: export catalog (requires local OpenCodex HTTP proxy) + OAuth login.
 */
import path from 'node:path'
import { spawn } from 'node:child_process'
import { resolveOcxBunExecutable, resolveOcxExecutable } from '../opencodex-binary.mjs'

const DEFAULT_TIMEOUT_MS = 120_000
const LOGIN_URL_TIMEOUT_MS = 20_000

export function expandedPath() {
  const home = process.env.HOME || process.env.USERPROFILE || ''
  const extra = home ? `${path.join(home, '.local', 'bin')}` : ''
  return extra ? `${extra}${path.delimiter}${process.env.PATH || ''}` : process.env.PATH || ''
}

export function openCodexEnvironment(extraEnv = {}) {
  const env = { ...process.env, PATH: expandedPath(), ...extraEnv }
  const bunPath = resolveOcxBunExecutable()
  if (bunPath) env.OPENCODEX_BUN_PATH = bunPath
  return env
}

/**
 * @param {string[]} args
 * @param {{ timeoutMs?: number, env?: NodeJS.ProcessEnv }} [options]
 */
export function runOcx(args, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  return new Promise((resolve, reject) => {
    const ocx = resolveOcxExecutable()
    const child = spawn(ocx, args, {
      env: openCodexEnvironment(options.env),
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error(`ocx ${args.join(' ')} 超时（${Math.round(timeoutMs / 1000)}s）`))
    }, timeoutMs)
    child.stdout.on('data', (chunk) => { stdout += chunk.toString() })
    child.stderr.on('data', (chunk) => { stderr += chunk.toString() })
    child.on('error', (error) => {
      clearTimeout(timer)
      if (error?.code === 'ENOENT') {
        reject(new Error('未找到 ocx 命令。请先安装 OpenCodex 并确保 ocx 在 PATH 中（常见路径：~/.local/bin/ocx）。'))
        return
      }
      reject(error)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve({ stdout, stderr })
      else {
        const detail = (stderr || stdout).trim().slice(0, 400)
        reject(new Error(detail || `ocx ${args.join(' ')} 退出码 ${code}`))
      }
    })
  })
}

/** @returns {Promise<Record<string, unknown>>} */
export async function exportFromOcx({ userDataPath, hostManager } = {}) {
  const { ensureOpenCodexProxyForExport, resolveOpenCodexHome } = await import('../ensure-opencodex-proxy.mjs')
  if (userDataPath) {
    await ensureOpenCodexProxyForExport({ userDataPath, hostManager })
  }
  const env = userDataPath
    ? openCodexEnvironment({ OPENCODEX_HOME: resolveOpenCodexHome(userDataPath) })
    : undefined
  const { stdout } = await runOcx(['export', '--client', 'pi', '--json'], { timeoutMs: 90_000, env })
  const trimmed = stdout.trim()
  const start = trimmed.indexOf('{')
  const jsonText = start >= 0 ? trimmed.slice(start) : trimmed
  let parsed
  try {
    parsed = JSON.parse(jsonText)
  } catch {
    throw new Error('ocx export 的 models 配置不是合法 JSON，请在本机终端执行 ocx export --client pi --json 检查。')
  }
  if (!parsed?.providers || typeof parsed.providers !== 'object') {
    throw new Error('ocx export 结果缺少 providers 字段。')
  }
  return parsed
}

/** @deprecated alias */
export const exportPiConfigJson = exportFromOcx

export function modelSourceNamespace(modelId) {
  const id = String(modelId ?? '')
  const slash = id.indexOf('/')
  if (slash <= 0) return 'other'
  return id.slice(0, slash)
}

function loginLaunchError(error) {
  if (error?.code === 'ENOENT') {
    return new Error('TaskWeaver 自带的本地登录组件未能启动，请重新安装应用后重试。')
  }
  if (error?.code === 'EACCES') {
    return new Error('TaskWeaver 自带的本地登录组件没有执行权限，请重新安装应用后重试。')
  }
  return new Error('无法启动本地登录流程，请重试或重装应用。')
}

function validateLoginUrl(provider, rawUrl) {
  let url
  try {
    url = new URL(rawUrl)
  } catch {
    throw new Error('本地登录流程返回了无效的授权链接。')
  }
  const valid = url.protocol === 'https:' && (
    (provider === 'cursor' && url.hostname === 'cursor.com' && url.pathname === '/loginDeepControl')
    || (provider === 'google-antigravity' && url.hostname === 'accounts.google.com' && url.pathname === '/o/oauth2/v2/auth')
  )
  if (!valid) throw new Error('本地登录流程返回了不受支持的授权地址。')
  return url.href
}

/**
 * Start the OAuth flow. Desktop callers provide the Host's safe external-link
 * capability; the child reports its provider-generated URL and stays alive to
 * finish the PKCE exchange after the user approves it.
 */
export async function startOcxProviderLogin(provider = 'cursor', options = {}) {
  if (provider !== 'cursor' && provider !== 'google-antigravity') {
    throw new Error('不支持此本地官方 Agent 登录方式。')
  }
  const {
    userDataPath,
    openExternal,
    spawnImpl = spawn,
    executable = resolveOcxExecutable(),
    timeoutMs = LOGIN_URL_TIMEOUT_MS,
  } = options
  const envOverrides = {}
  if (userDataPath) {
    const { resolveOpenCodexHome } = await import('../ensure-opencodex-proxy.mjs')
    envOverrides.OPENCODEX_HOME = resolveOpenCodexHome(userDataPath)
  }
  if (typeof openExternal === 'function') envOverrides.TASKWEAVER_HOST_OPENS_LOGIN_URL = '1'
  const env = openCodexEnvironment(envOverrides)
  const stdio = typeof openExternal === 'function' ? ['ignore', 'pipe', 'pipe'] : 'ignore'
  let child
  try {
    child = spawnImpl(executable, ['login', provider], { detached: true, stdio, env })
  } catch (error) {
    throw loginLaunchError(error)
  }

  if (typeof openExternal !== 'function') {
    await new Promise((resolve, reject) => {
      let spawned = false
      child.once('spawn', () => { spawned = true; resolve() })
      child.once('error', (error) => reject(loginLaunchError(error)))
      child.on('error', (error) => {
        if (spawned) console.error('[model-sync] 本地登录进程启动后异常退出:', error?.code ?? 'unknown')
      })
    })
    child.unref()
    return { provider, executable, pid: child.pid ?? null }
  }

  const loginUrl = await new Promise((resolve, reject) => {
    let settled = false
    let urlOpening = false
    let output = ''
    let timer
    const finish = (error, value) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      if (error) reject(error)
      else resolve(value)
    }
    const stopChild = () => {
      try { child.kill('SIGTERM') } catch { /* best-effort cleanup */ }
    }
    const openUrlFromOutput = (chunk) => {
      if (settled || urlOpening) return
      output = `${output}${String(chunk)}`.slice(-8192)
      const marker = 'TASKWEAVER_AUTH_URL '
      const markerAt = output.indexOf(marker)
      if (markerAt < 0) return
      const candidateStart = markerAt + marker.length
      const lineEnd = output.indexOf('\n', candidateStart)
      if (lineEnd < 0) return
      const candidate = output.slice(candidateStart, lineEnd).trim()
      if (!candidate) return
      let url
      try {
        url = validateLoginUrl(provider, candidate)
      } catch (error) {
        finish(error)
        stopChild()
        return
      }
      urlOpening = true
      // Prevent a slow OS launcher from racing the startup timeout.
      if (timer) clearTimeout(timer)
      timer = undefined
      void Promise.resolve()
        .then(() => openExternal(url))
        .then(() => finish(null, url))
        .catch(() => {
          finish(new Error('系统未能打开登录浏览器，请检查默认浏览器设置后重试。'))
          stopChild()
        })
    }

    timer = setTimeout(() => {
      finish(new Error('本地登录流程启动超时，请重试。'))
      stopChild()
    }, timeoutMs)
    timer.unref?.()
    child.stdout?.setEncoding?.('utf8')
    child.stdout?.on('data', openUrlFromOutput)
    // Drain diagnostics without storing or exposing process output, which may
    // contain provider-specific details that do not belong in the UI.
    child.stderr?.resume?.()
    child.on('error', (error) => {
      if (settled) {
        console.error('[model-sync] 本地登录进程启动后异常退出:', error?.code ?? 'unknown')
        return
      }
      finish(loginLaunchError(error))
      stopChild()
    })
    child.once('close', (code) => {
      if (!settled) finish(new Error(`本地登录流程未能打开授权页（退出码 ${code ?? '未知'}）。`))
    })
  })

  child.unref()
  child.stdout?.unref?.()
  child.stderr?.unref?.()
  return {
    provider,
    executable,
    pid: child.pid ?? null,
    loginUrl,
    message: '已在默认浏览器打开授权页。完成登录后点击“刷新状态”。',
  }
}
