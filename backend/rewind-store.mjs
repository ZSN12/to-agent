import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { createJsonStore } from './json-store.mjs'
import { assertSafeWorkspacePath } from './security-path.mjs'

const EMPTY_TURN = (conversationId, workspacePath, turn) => ({
  version: 1,
  conversationId,
  workspacePath,
  turn,
  files: {},
})
const MAX_SNAPSHOT_BYTES = 16 * 1024 * 1024

function digest(value) {
  return createHash('sha256').update(value === null ? '<missing>' : value, 'utf8').digest('hex')
}

function safeId(value) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError('会话标识无效')
  return Buffer.from(value).toString('base64url')
}

function isSameState(left, right) {
  return left === right
}

/** Persists edit/write preimages outside the worktree and refuses stale restores by default. */
export function createRewindStore(userDataPath) {
  if (typeof userDataPath !== 'string' || !userDataPath.trim()) {
    throw new TypeError('rewind store requires a user data path')
  }

  const rootPath = path.join(userDataPath, 'taskweaver', 'rewind')
  const stores = new Map()
  const pendingCalls = new Map()

  async function ensurePrivateDirectory(directoryPath) {
    await fs.mkdir(rootPath, { recursive: true, mode: 0o700 })
    await fs.chmod(rootPath, 0o700).catch(() => {})
    await fs.mkdir(directoryPath, { recursive: true, mode: 0o700 })
    await fs.chmod(directoryPath, 0o700).catch(() => {})
  }

  function turnStore(conversationId, workspacePath, turn) {
    const normalizedTurn = Number(turn)
    if (!Number.isSafeInteger(normalizedTurn) || normalizedTurn < 1) return null
    const conversationDirectory = path.join(rootPath, safeId(conversationId))
    const filePath = path.join(conversationDirectory, `${normalizedTurn}.json`)
    let store = stores.get(filePath)
    if (!store) {
      store = createJsonStore(filePath, () => EMPTY_TURN(conversationId, workspacePath, normalizedTurn))
      stores.set(filePath, store)
    }
    return { store, conversationDirectory, normalizedTurn }
  }

  async function resolveFile(workspacePath, candidatePath) {
    const root = await fs.realpath(path.resolve(workspacePath))
    const resolved = await assertSafeWorkspacePath(root, candidatePath)
    let stat = null
    try {
      stat = await fs.lstat(resolved.realPath)
    } catch (error) {
      if (error?.code !== 'ENOENT' && error?.code !== 'ENOTDIR') throw error
    }
    if (stat && !stat.isFile()) return null
    if (stat?.size > MAX_SNAPSHOT_BYTES) {
      return {
        root,
        absolutePath: resolved.realPath,
        relativePath: resolved.relativePath,
        content: null,
        unavailable: true,
      }
    }
    return {
      root,
      absolutePath: resolved.realPath,
      relativePath: resolved.relativePath,
      content: stat ? await fs.readFile(resolved.realPath, 'utf8') : null,
    }
  }

  async function captureBefore({ conversationId, workspacePath, turn, sessionId, callId, toolName, input }) {
    if ((toolName !== 'edit' && toolName !== 'write') || !workspacePath || !callId) return false
    const candidatePath = input?.file_path
    if (typeof candidatePath !== 'string' || !candidatePath.trim()) return false

    try {
      const target = await resolveFile(workspacePath, candidatePath)
      const slot = turnStore(conversationId, target?.root ?? workspacePath, turn)
      if (!target || !slot) return false
      await ensurePrivateDirectory(slot.conversationDirectory)
      await slot.store.update((current) => {
        const files = current.files && typeof current.files === 'object' ? current.files : {}
        if (!Object.hasOwn(files, target.relativePath)) {
          files[target.relativePath] = {
            before: target.content,
            after: null,
            touched: false,
            complete: false,
            ...(target.unavailable ? { unavailable: true } : {}),
          }
        }
        return {
          ...current,
          workspacePath: target.root,
          files,
        }
      })
      const pendingKey = `${sessionId ?? conversationId}\u0000${callId}`
      pendingCalls.set(pendingKey, {
        conversationId,
        workspacePath: target.root,
        turn: slot.normalizedTurn,
        relativePath: target.relativePath,
      })
      return true
    } catch {
      // Snapshot failures must not block otherwise-authorized model file edits.
      return false
    }
  }

  async function markToolResult({ conversationId, sessionId, callId, success }) {
    const pendingKey = `${sessionId ?? conversationId}\u0000${callId}`
    const pending = pendingCalls.get(pendingKey)
    pendingCalls.delete(pendingKey)
    if (!pending) return false
    if (!success) return true

    const slot = turnStore(pending.conversationId, pending.workspacePath, pending.turn)
    if (!slot) return false
    try {
      await slot.store.update((current) => {
        const file = current.files?.[pending.relativePath]
        if (!file) return current
        return {
          ...current,
          files: {
            ...current.files,
            [pending.relativePath]: { ...file, touched: true },
          },
        }
      })
      return true
    } catch {
      return false
    }
  }

  async function finalizeTurn({ conversationId, workspacePath, turn }) {
    const slot = turnStore(conversationId, workspacePath, turn)
    if (!slot) return
    try {
      const current = await slot.store.read()
      const completed = {}
      for (const [relativePath, file] of Object.entries(current.files ?? {})) {
        if (!file?.touched) continue
        if (file.unavailable) {
          completed[relativePath] = { ...file, complete: false }
          continue
        }
        try {
          const target = await resolveFile(current.workspacePath || workspacePath, relativePath)
          if (!target) continue
          if (target.unavailable) {
            completed[relativePath] = { ...file, complete: false, unavailable: true }
            continue
          }
          if (isSameState(file.before, target.content)) continue
          completed[relativePath] = {
            before: file.before,
            after: target.content,
            touched: true,
            complete: true,
          }
        } catch {
          // Keep an incomplete marker so a later rewind fails closed for this file.
          completed[relativePath] = { ...file, complete: false }
        }
      }
      await slot.store.write({ ...current, files: completed })
      if (Object.keys(completed).length === 0) {
        await fs.rm(slot.store.filePath, { force: true }).catch(() => {})
      }
    } catch {
      // Snapshot persistence must not prevent the Host from completing a turn.
    }
  }

  async function readState(workspacePath, relativePath) {
    const target = await resolveFile(workspacePath, relativePath)
    if (!target) throw new Error(`无法还原非普通文件：${relativePath}`)
    return target.content
  }

  async function collectPlan({ conversationId, workspacePath, targetTurn }) {
    if (!workspacePath) throw new Error('当前会话没有工作区，无法回退代码')
    const normalizedTarget = Number(targetTurn)
    if (!Number.isSafeInteger(normalizedTarget) || normalizedTarget < 1) {
      throw new Error('无法定位要回退的对话轮次')
    }
    const root = await fs.realpath(path.resolve(workspacePath))
    const conversationDirectory = path.join(rootPath, safeId(conversationId))
    let names = []
    try {
      names = await fs.readdir(conversationDirectory)
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
    const snapshots = []
    for (const name of names) {
      if (!/^\d+\.json$/.test(name)) continue
      const turn = Number(name.slice(0, -5))
      if (!Number.isSafeInteger(turn)) continue
      const filePath = path.join(conversationDirectory, name)
      const store = stores.get(filePath) ?? createJsonStore(filePath, () => EMPTY_TURN(conversationId, root, turn))
      stores.set(filePath, store)
      const snapshot = await store.read()
      if (snapshot.workspacePath && path.resolve(snapshot.workspacePath) !== path.resolve(root)) continue
      snapshots.push({ turn, files: snapshot.files ?? {} })
    }
    snapshots.sort((a, b) => a.turn - b.turn)

    const paths = new Set(snapshots.flatMap((snapshot) => Object.keys(snapshot.files)))
    const changes = []
    for (const relativePath of paths) {
      const history = snapshots
        .filter((snapshot) => Object.hasOwn(snapshot.files, relativePath))
        .map((snapshot) => ({ turn: snapshot.turn, ...snapshot.files[relativePath] }))
      if (history.some((item) => !item.complete)) {
        changes.push({ relativePath, unavailable: true })
        continue
      }

      const targetEntry = history.filter((item) => item.turn <= normalizedTarget).at(-1)
      const laterEntries = history.filter((item) => item.turn > normalizedTarget)
      const desired = laterEntries[0]?.before ?? targetEntry?.after
      const expected = history.at(-1)?.after
      if (desired === undefined || expected === undefined) continue

      let current
      try {
        current = await readState(root, relativePath)
      } catch (error) {
        if (error?.code === 'ENOENT') current = null
        else throw error
      }
      if (isSameState(current, desired)) continue
      changes.push({
        relativePath,
        desired,
        expected,
        current,
        conflict: !isSameState(current, expected),
      })
    }
    const conflicts = changes.filter((change) => change.conflict).map((change) => change.relativePath)
    const unavailable = changes.filter((change) => change.unavailable).map((change) => change.relativePath)
    const conflictToken = conflicts.length
      ? createHash('sha256').update(JSON.stringify({
        conversationId,
        targetTurn: normalizedTarget,
        conflicts: changes.filter((change) => change.conflict).map((change) => [
          change.relativePath,
          digest(change.current),
          digest(change.expected),
          digest(change.desired),
        ]),
      })).digest('hex')
      : null
    return { root, targetTurn: normalizedTarget, changes, conflicts, unavailable, conflictToken }
  }

  async function preview(options) {
    const plan = await collectPlan(options)
    return {
      conflicts: plan.conflicts,
      unavailable: plan.unavailable,
      conflictToken: plan.conflictToken,
      fileCount: plan.changes.filter((change) => !change.unavailable).length,
    }
  }

  async function restore({ confirmationToken = null, ...options }) {
    const plan = await collectPlan(options)
    if (plan.unavailable.length) {
      return { ok: false, reason: 'snapshot-unavailable', unavailable: plan.unavailable }
    }
    if (plan.conflicts.length && confirmationToken !== plan.conflictToken) {
      return {
        ok: false,
        reason: 'conflicts',
        conflicts: plan.conflicts,
        conflictToken: plan.conflictToken,
      }
    }

    const changed = plan.changes.filter((change) => !change.unavailable)
    const applied = []
    try {
      for (const change of changed) {
        const target = await assertSafeWorkspacePath(plan.root, change.relativePath)
        applied.push(change)
        if (change.desired === null) {
          await fs.rm(target.realPath, { force: true })
        } else {
          await fs.mkdir(path.dirname(target.realPath), { recursive: true })
          await fs.writeFile(target.realPath, change.desired, 'utf8')
        }
      }
    } catch (error) {
      for (const change of applied.reverse()) {
        try {
          const target = await assertSafeWorkspacePath(plan.root, change.relativePath)
          if (change.current === null) await fs.rm(target.realPath, { force: true })
          else await fs.writeFile(target.realPath, change.current, 'utf8')
        } catch { /* Keep the original failure; report partial recovery state. */ }
      }
      throw error
    }
    return {
      ok: true,
      restoredFiles: changed.map((change) => change.relativePath),
    }
  }

  return { captureBefore, markToolResult, finalizeTurn, preview, restore }
}
