/**
 * Bundled `ocx` CLI: export catalog + OAuth login (no 10100 product surface).
 */
import path from 'node:path'
import { spawn } from 'node:child_process'
import { resolveOcxBunExecutable, resolveOcxExecutable } from '../opencodex-binary.mjs'

const DEFAULT_TIMEOUT_MS = 120_000

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
 * @param {{ timeoutMs?: number }} [options]
 */
export function runOcx(args, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  return new Promise((resolve, reject) => {
    const ocx = resolveOcxExecutable()
    const child = spawn(ocx, args, {
      env: openCodexEnvironment(),
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
export async function exportFromOcx() {
  const { stdout } = await runOcx(['export', '--client', 'pi', '--json'], { timeoutMs: 90_000 })
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

/** Start OAuth in the system browser via ocx (non-blocking). */
export function startOcxProviderLogin(provider = 'cursor') {
  const ocx = resolveOcxExecutable()
  const child = spawn(ocx, ['login', provider], {
    detached: true,
    stdio: 'ignore',
    env: openCodexEnvironment(),
  })
  child.unref()
  return { provider, ocx }
}
