import fs from 'node:fs'
import fsp from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { runOcx, expandedPath } from './opencodex-sync.mjs'
import { isCursorFamilyModelKey } from './cursor-model-route.mjs'
import {
  ocxSupportsComposerToolContinuation,
  OCX_COMPOSER_CONTINUATION_MIN_VERSION,
} from './opencodex-binary.mjs'

/**
 * @param {string} modelsPath
 * @returns {Promise<string | null>}
 */
export async function readOpenCodexBaseUrlFromModelsJson(modelsPath) {
  try {
    const raw = await fsp.readFile(modelsPath, 'utf8')
    const doc = JSON.parse(raw)
    const providers = doc?.providers ?? {}
    const block = providers.opencodex
    if (block && typeof block.baseUrl === 'string' && block.baseUrl.trim()) {
      return block.baseUrl.trim().replace(/\/+$/, '')
    }
    for (const [id, entry] of Object.entries(providers)) {
      const baseUrl = entry?.baseUrl
      if (typeof baseUrl !== 'string' || !baseUrl.trim()) continue
      if (id === 'opencodex' || /127\.0\.0\.1:10100|localhost:10100/.test(baseUrl)) {
        return baseUrl.trim().replace(/\/+$/, '')
      }
    }
  } catch {
    // missing models.json
  }
  return null
}

/**
 * @param {string} baseUrl e.g. http://127.0.0.1:10100/v1
 */
export function parseLoopbackBaseUrl(baseUrl) {
  try {
    const url = new URL(baseUrl)
    const port = url.port ? Number(url.port) : (url.protocol === 'https:' ? 443 : 80)
    const host = url.hostname
    if (!host || !Number.isFinite(port)) return null
    return { host, port }
  } catch {
    return null
  }
}

export function probeTcp(host, port, timeoutMs = 2500) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port })
    const timer = setTimeout(() => {
      socket.destroy()
      resolve(false)
    }, timeoutMs)
    socket.once('connect', () => {
      clearTimeout(timer)
      socket.destroy()
      resolve(true)
    })
    socket.once('error', () => {
      clearTimeout(timer)
      socket.destroy()
      resolve(false)
    })
  })
}

/**
 * @param {string} host
 * @param {number} port
 */
export async function fetchProxyHealthz(host, port, timeoutMs = 4000) {
  const url = `http://${host}:${port}/healthz`
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
    if (!res.ok) return { ok: false, version: null, pid: null }
    const json = await res.json()
    const version = typeof json?.version === 'string' ? json.version : null
    return {
      ok: json?.status === 'ok',
      version,
      pid: typeof json?.pid === 'number' ? json.pid : null,
    }
  } catch {
    return { ok: false, version: null, pid: null }
  }
}

export function resolveGlobalOcxExecutable() {
  const home = process.env.HOME || process.env.USERPROFILE || ''
  if (!home) return null
  const candidate = path.join(home, '.local', 'bin', 'ocx')
  try {
    return fs.existsSync(candidate) ? candidate : null
  } catch {
    return null
  }
}

function runDetachedCommand(command, args, { timeoutMs = 120_000, env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: { ...process.env, PATH: expandedPath(), ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error(`${command} ${args.join(' ')} 超时（${Math.round(timeoutMs / 1000)}s）`))
    }, timeoutMs)
    child.stdout.on('data', (chunk) => { stdout += chunk.toString() })
    child.stderr.on('data', (chunk) => { stderr += chunk.toString() })
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve({ stdout, stderr })
      else reject(new Error((stderr || stdout).trim().slice(0, 400) || `${command} 退出码 ${code}`))
    })
  })
}

/**
 * launchd/systemd 上的旧版 ocx 会拒绝 TaskWeaver 内置 ocx 的 restart；升级全局安装并 service restart。
 * @param {string} [minVersion]
 */
export async function upgradeGlobalOpenCodexService(minVersion = OCX_COMPOSER_CONTINUATION_MIN_VERSION) {
  await runDetachedCommand('npm', ['install', '-g', `@bitkyc08/opencodex@${minVersion}`], {
    timeoutMs: 180_000,
  })
  const globalOcx = resolveGlobalOcxExecutable()
  if (!globalOcx) {
    throw new Error('全局 ocx 未找到（~/.local/bin/ocx）。请在终端执行 npm install -g @bitkyc08/opencodex@' + minVersion)
  }
  await runDetachedCommand(globalOcx, ['service', 'restart'], { timeoutMs: 90_000 })
  for (let attempt = 0; attempt < 35; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000))
    const health = await fetchProxyHealthz('127.0.0.1', 10100)
    if (health.ok && ocxSupportsComposerToolContinuation(health.version)) return health
  }
  throw new Error(
    `OpenCodex 服务重启后仍低于 ${minVersion}。请在终端执行：npm install -g @bitkyc08/opencodex@${minVersion} && ocx service restart`,
  )
}

/**
 * Try `ocx ensure` then verify loopback port from models.json is accepting connections.
 * @param {string | null | undefined} modelsPath
 * @param {{ upgradeGlobalIfStale?: boolean }} [options]
 */
export async function ensureOpenCodexProxyReachable(modelsPath, options = {}) {
  const { upgradeGlobalIfStale = true } = options
  try {
    // 旧 ocx 守护进程会一直用 resumeAction；ensure 不会换二进制，必须 restart。
    await runOcx(['restart'], { timeoutMs: 35_000 })
  } catch {
    try {
      await runOcx(['ensure'], { timeoutMs: 25_000 })
    } catch {
      // export may still work if proxy already up; continue to TCP probe
    }
  }
  const baseUrl = modelsPath ? await readOpenCodexBaseUrlFromModelsJson(modelsPath) : null
  const target = baseUrl ? parseLoopbackBaseUrl(baseUrl) : { host: '127.0.0.1', port: 10100 }
  const resolvedBase = baseUrl ?? `http://${target.host}:${target.port}/v1`
  const up = await probeTcp(target.host, target.port)
  let health = up ? await fetchProxyHealthz(target.host, target.port) : { ok: false, version: null }
  let composerContinuationOk = ocxSupportsComposerToolContinuation(health.version)
  let upgradeAttempted = false
  let upgradeError = null

  if (up && !composerContinuationOk && upgradeGlobalIfStale) {
    upgradeAttempted = true
    try {
      health = await upgradeGlobalOpenCodexService()
      composerContinuationOk = true
    } catch (error) {
      upgradeError = error instanceof Error ? error.message : String(error)
    }
  }

  return {
    up,
    baseUrl: resolvedBase,
    proxyVersion: health.version,
    composerContinuationOk,
    composerContinuationMinVersion: OCX_COMPOSER_CONTINUATION_MIN_VERSION,
    upgradeAttempted,
    upgradeError,
  }
}

export function isOpenCodexModelKey(modelKey) {
  const key = String(modelKey ?? '')
  return key.startsWith('opencodex/') || isCursorFamilyModelKey(key)
}

/**
 * @param {string} message
 * @param {string | null | undefined} modelKey
 */
export function humanizeOpenCodexTransportError(message, modelKey) {
  const text = String(message ?? '')
  if (!isOpenCodexModelKey(modelKey)) return text
  if (!/ECONNREFUSED|fetch failed|ENOTFOUND|EAI_AGAIN/i.test(text)) return text
  return [
    '无法连接本机 OpenCodex 代理（Composer / Cursor 模型经 ocx 转发，不是 TaskWeaver 工具层故障）。',
    '请在「模型与来源」页 OpenCodex 卡片点击「启动 OpenCodex」或「浏览器登录 Cursor」，再重试「扫描本地模型」。',
    '官方直连模型（如小米 MiMo）不经过 ocx，因此可正常使用。',
    text.includes('ECONNREFUSED') || /fetch failed/i.test(text) ? `底层：${text}` : text,
  ].join(' ')
}
