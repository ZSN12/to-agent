import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'

const DEFAULT_TIMEOUT_MS = 120_000

function expandedPath() {
  const home = process.env.HOME || process.env.USERPROFILE || ''
  const extra = home ? `${path.join(home, '.local', 'bin')}` : ''
  return extra ? `${extra}${path.delimiter}${process.env.PATH || ''}` : process.env.PATH || ''
}

/**
 * @param {string[]} args
 * @param {{ timeoutMs?: number }} [options]
 */
export function runOcx(args, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  return new Promise((resolve, reject) => {
    const child = spawn('ocx', args, {
      env: { ...process.env, PATH: expandedPath() },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error(`ocx ${args.join(' ')} 超时（${Math.round(timeoutMs / 1000)}s）`))
    }, timeoutMs)
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
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
      if (code === 0) {
        resolve({ stdout, stderr })
      } else {
        const detail = (stderr || stdout).trim().slice(0, 400)
        reject(new Error(detail || `ocx ${args.join(' ')} 退出码 ${code}`))
      }
    })
  })
}

/** @returns {Promise<Record<string, unknown>>} */
export async function exportPiConfigJson() {
  const { stdout } = await runOcx(['export', '--client', 'pi', '--json'], { timeoutMs: 90_000 })
  const trimmed = stdout.trim()
  const start = trimmed.indexOf('{')
  const jsonText = start >= 0 ? trimmed.slice(start) : trimmed
  let parsed
  try {
    parsed = JSON.parse(jsonText)
  } catch {
    throw new Error('OpenCodex 导出的 models 配置不是合法 JSON，请在本机终端执行 ocx export --client pi --json 检查。')
  }
  if (!parsed?.providers || typeof parsed.providers !== 'object') {
    throw new Error('OpenCodex 导出结果缺少 providers 字段。')
  }
  return parsed
}

/**
 * @param {string} modelsPath
 * @param {Record<string, unknown>} exportDoc
 */
export async function mergeExportIntoModelsJson(modelsPath, exportDoc) {
  await fs.mkdir(path.dirname(modelsPath), { recursive: true })
  let current = { providers: {} }
  try {
    const raw = await fs.readFile(modelsPath, 'utf8')
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && parsed.providers) current = parsed
  } catch {
    // fresh file
  }
  const providers = { ...current.providers }
  for (const [providerId, config] of Object.entries(exportDoc.providers)) {
    providers[providerId] = config
  }
  const next = { providers }
  await fs.writeFile(modelsPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
  return next
}

/**
 * @param {import('./credential-store.mjs').CredentialStore} credentials
 * @param {Record<string, unknown>} exportDoc
 */
export async function applyExportCredentials(credentials, exportDoc) {
  for (const [providerId, config] of Object.entries(exportDoc.providers ?? {})) {
    if (!config || typeof config !== 'object') continue
    const apiKey = config.apiKey
    if (typeof apiKey !== 'string' || !apiKey.trim()) continue
    await credentials.modify(providerId, async () => ({
      type: 'api_key',
      key: apiKey.trim(),
    }))
  }
}

export function modelSourceNamespace(modelId) {
  const id = String(modelId ?? '')
  const slash = id.indexOf('/')
  if (slash <= 0) return 'other'
  return id.slice(0, slash)
}

/**
 * @param {{ modelsPath: string, credentials: import('./credential-store.mjs').CredentialStore, ensureProxy?: boolean }} options
 */
export async function syncOpenCodexFromCli(options) {
  if (options.ensureProxy !== false) {
    try {
      await runOcx(['ensure'], { timeoutMs: 45_000 })
    } catch {
      // ensure 失败时仍尝试 export（可能 proxy 已在跑）
    }
  }
  const exportDoc = await exportPiConfigJson()
  await mergeExportIntoModelsJson(options.modelsPath, exportDoc)
  await applyExportCredentials(options.credentials, exportDoc)
  const opencodex = exportDoc.providers?.opencodex
  const baseUrl =
    opencodex && typeof opencodex === 'object' && typeof opencodex.baseUrl === 'string'
      ? opencodex.baseUrl
      : null
  return { exportDoc, baseUrl, providerIds: Object.keys(exportDoc.providers ?? {}) }
}

/**
 * @param {Record<string, unknown>} exportDoc
 * @param {string[]} providerIds
 */
export function listModelsFromExport(exportDoc, providerIds) {
  const ids = providerIds?.length ? providerIds : Object.keys(exportDoc.providers ?? {})
  const rows = []
  for (const providerId of ids) {
    const block = exportDoc.providers?.[providerId]
    if (!block || typeof block !== 'object' || !Array.isArray(block.models)) continue
    for (const entry of block.models) {
      if (!entry || typeof entry !== 'object') continue
      const id = String(entry.id ?? '')
      if (!id) continue
      rows.push({
        key: `${providerId}/${id}`,
        name: String(entry.name ?? id),
        id,
        provider: providerId,
        source: modelSourceNamespace(id),
      })
    }
  }
  return rows
}
