import fs from 'node:fs/promises'
import path from 'node:path'

const MAX_FILE_BYTES = 1024 * 1024
const MAX_FRAMES_PER_ERROR = 32
const MAX_CAUSE_DEPTH = 4
let writeQueue = Promise.resolve()

function safeLabel(value, fallback) {
  if (typeof value !== 'string') return fallback
  const normalized = value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 120)
  return /^[A-Za-z0-9_.:-]+$/.test(normalized) ? normalized : fallback
}

function safeFrame(line) {
  const value = line.trim().replace(/^at\s+/, '')
  const match = value.match(/^(.*?)(?:\s+\()?(.+?):(\d+):(\d+)\)?$/)
  if (!match) return null
  const functionName = match[1].replace(/\($/, '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 120)
  const fileName = path.basename(match[2].replace(/[?#].*$/, '')).slice(0, 120)
  if (!fileName) return null
  return `${functionName ? `${functionName} ` : ''}${fileName}:${match[3]}:${match[4]}`
}

function errorRecord(error) {
  const chain = []
  const seen = new Set()
  let current = error
  for (let depth = 0; current && typeof current === 'object' && depth < MAX_CAUSE_DEPTH; depth += 1) {
    if (seen.has(current)) break
    seen.add(current)
    const frames = typeof current.stack === 'string'
      ? current.stack.split('\n').slice(1).map(safeFrame).filter(Boolean).slice(0, MAX_FRAMES_PER_ERROR)
      : []
    chain.push({
      name: safeLabel(current.name, 'Error'),
      ...(typeof current.code === 'string' ? { code: safeLabel(current.code, 'unknown') } : {}),
      frames,
    })
    current = current.cause
  }
  if (chain.length === 0) chain.push({ name: 'NonErrorThrown', frames: [] })
  return chain
}

async function appendRecord(userDataPath, record) {
  if (typeof userDataPath !== 'string' || !path.isAbsolute(userDataPath)) return false
  const directory = path.join(userDataPath, 'taskweaver')
  const filePath = path.join(directory, 'chat-errors.jsonl')
  const rotatedPath = `${filePath}.1`
  const line = `${JSON.stringify(record)}\n`
  try {
    await fs.mkdir(directory, { recursive: true, mode: 0o700 })
    await fs.chmod(directory, 0o700)
    const existing = await fs.stat(filePath).catch(() => null)
    if (existing && existing.size + Buffer.byteLength(line) > MAX_FILE_BYTES) {
      await fs.rm(rotatedPath, { force: true })
      await fs.rename(filePath, rotatedPath).catch((error) => {
        if (error?.code !== 'ENOENT') throw error
      })
      await fs.chmod(rotatedPath, 0o600).catch(() => {})
    }
    await fs.appendFile(filePath, line, { encoding: 'utf8', mode: 0o600, flag: 'a' })
    await fs.chmod(filePath, 0o600)
    return true
  } catch {
    return false
  }
}

/** Persist bounded, local-only failure locations without messages or prompt data. */
export function appendChatErrorDiagnostic({ userDataPath, error, scope = 'chat-turn' } = {}) {
  let record
  try {
    record = {
      timestamp: new Date().toISOString(),
      scope: safeLabel(scope, 'chat-turn'),
      errors: errorRecord(error),
    }
  } catch {
    record = {
      timestamp: new Date().toISOString(),
      scope: 'chat-turn',
      errors: [{ name: 'ErrorDiagnosticFailed', frames: [] }],
    }
  }
  const pending = writeQueue.then(() => appendRecord(userDataPath, record))
  writeQueue = pending.catch(() => false)
  return pending.catch(() => false)
}
