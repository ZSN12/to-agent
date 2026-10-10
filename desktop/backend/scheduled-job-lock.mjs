import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

function lockPathFor(lockDirectory, jobId) {
  const key = crypto.createHash('sha256').update(String(jobId)).digest('hex')
  return path.join(lockDirectory, `${key}.lock`)
}

async function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error?.code === 'EPERM'
  }
}

async function isStaleLock(lockPath) {
  try {
    const raw = await fs.readFile(lockPath, 'utf8')
    const lock = JSON.parse(raw)
    const ageMs = Date.now() - Number(lock.createdAt || 0)
    if (await processIsAlive(Number(lock.pid))) return false
    return ageMs > 60_000
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    try {
      const stat = await fs.stat(lockPath)
      return Date.now() - stat.mtimeMs > 60_000
    } catch {
      return false
    }
  }
}

export async function withScheduledJobLock({ lockDirectory, jobId }, operation) {
  await fs.mkdir(lockDirectory, { recursive: true })
  const lockPath = lockPathFor(lockDirectory, jobId)
  const token = crypto.randomUUID()
  let handle
  try {
    handle = await fs.open(lockPath, 'wx', 0o600)
  } catch (error) {
    if (error?.code !== 'EEXIST' || !(await isStaleLock(lockPath))) return { acquired: false }
    await fs.rm(lockPath, { force: true }).catch(() => {})
    try {
      handle = await fs.open(lockPath, 'wx', 0o600)
    } catch (retryError) {
      if (retryError?.code === 'EEXIST') return { acquired: false }
      throw retryError
    }
  }

  try {
    await handle.writeFile(JSON.stringify({ pid: process.pid, createdAt: Date.now(), token }))
    await handle.close()
  } catch (error) {
    await handle.close().catch(() => {})
    await fs.rm(lockPath, { force: true }).catch(() => {})
    throw error
  }
  try {
    return { acquired: true, value: await operation() }
  } finally {
    try {
      const lock = JSON.parse(await fs.readFile(lockPath, 'utf8'))
      if (lock.token === token) await fs.rm(lockPath, { force: true })
    } catch {
      // A stale-lock recovery may already have removed this owner's lock.
    }
  }
}
