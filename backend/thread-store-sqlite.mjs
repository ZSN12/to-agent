import fs from 'node:fs/promises'
import { chmodSync } from 'node:fs'
import path from 'node:path'
import { randomUUID, createHash } from 'node:crypto'
import { DEFAULT_THREAD_TITLE, legacyTitleFromMessage, titleFromMessage } from './thread-title.mjs'
import { sliceForkMessages } from './fork-turns.mjs'

const VALID_PERMISSION_MODES = new Set(['readonly', 'ask', 'on-risk', 'full'])
const VALID_TITLE_SOURCES = new Set(['default', 'automatic', 'user'])
const SCHEMA_VERSION = 2
const AUTO_TITLE_FORMAT_VERSION = '1'
const BUSY_TIMEOUT_MS = 10_000
const databasePaths = new WeakMap()
const SUMMARY_SELECT = `
  SELECT id,
    conversation_id AS conversationId,
    workspace_path AS workspacePath,
    title,
    title_source AS titleSource,
    permission_mode AS permissionMode,
    pinned,
    archived,
    model_key AS modelKey,
    thinking_level AS thinkingLevel,
    created_at AS createdAt,
    updated_at AS updatedAt,
    message_count AS messageCount
  FROM thread_summaries
`

function makeThread({ workspacePath, permissionMode = 'ask', title = DEFAULT_THREAD_TITLE, titleSource, pinned = false, archived = false, modelKey = null, thinkingLevel = null, conversationId = randomUUID(), now = Date.now() }) {
  return {
    id: randomUUID(),
    conversationId,
    workspacePath: workspacePath ?? null,
    title,
    titleSource: titleSource ?? (title === DEFAULT_THREAD_TITLE ? 'default' : 'user'),
    permissionMode: VALID_PERMISSION_MODES.has(permissionMode) ? permissionMode : 'ask',
    pinned: Boolean(pinned),
    archived: Boolean(archived),
    modelKey: modelKey ?? null,
    thinkingLevel: thinkingLevel ?? null,
    createdAt: now,
    updatedAt: now,
    messages: [],
    tasks: [],
    outputLogs: [],
  }
}

function normalizeThread(thread = {}, fallbackWorkspace) {
  const id = String(thread.id ?? thread.conversationId ?? randomUUID())
  const conversationId = String(thread.conversationId ?? randomUUID())
  const title = typeof thread.title === 'string' ? thread.title : thread.threadTitle ?? DEFAULT_THREAD_TITLE
  const messages = Array.isArray(thread.messages) ? thread.messages : []
  const firstUserMessage = messages.find((message) => message.author === 'user')
  const persistedTitleSource = thread.titleSource
  const titleSource = VALID_TITLE_SOURCES.has(persistedTitleSource)
    ? persistedTitleSource
    : title === DEFAULT_THREAD_TITLE
      ? 'default'
      : firstUserMessage && (
        titleFromMessage(firstUserMessage.text) === title
        || legacyTitleFromMessage(firstUserMessage.text) === title
      )
        ? 'automatic'
        : 'user'

  return {
    ...thread,
    id,
    conversationId,
    workspacePath: thread.workspacePath === undefined ? (fallbackWorkspace ?? null) : thread.workspacePath,
    title,
    titleSource,
    permissionMode: VALID_PERMISSION_MODES.has(thread.permissionMode) ? thread.permissionMode : 'ask',
    pinned: Boolean(thread.pinned),
    archived: Boolean(thread.archived),
    modelKey: typeof thread.modelKey === 'string' ? thread.modelKey : null,
    thinkingLevel: typeof thread.thinkingLevel === 'string' ? thread.thinkingLevel : null,
    createdAt: Number.isFinite(thread.createdAt) ? thread.createdAt : Date.now(),
    updatedAt: Number.isFinite(thread.updatedAt) ? thread.updatedAt : Date.now(),
    messages,
    tasks: Array.isArray(thread.tasks) ? thread.tasks : [],
    outputLogs: Array.isArray(thread.outputLogs) ? thread.outputLogs : [],
  }
}

function summary(thread) {
  return {
    id: thread.id,
    conversationId: thread.conversationId,
    workspacePath: thread.workspacePath ?? null,
    title: thread.title,
    titleSource: thread.titleSource ?? 'default',
    permissionMode: thread.permissionMode,
    pinned: Boolean(thread.pinned),
    archived: Boolean(thread.archived),
    modelKey: thread.modelKey ?? null,
    thinkingLevel: thread.thinkingLevel ?? null,
    createdAt: thread.createdAt ?? thread.updatedAt ?? Date.now(),
    updatedAt: thread.updatedAt ?? Date.now(),
    messageCount: Array.isArray(thread.messages)
      ? thread.messages.length
      : (Number.isFinite(thread.messageCount) ? thread.messageCount : 0),
  }
}

function summaryFromRow(row) {
  return {
    id: row.id,
    conversationId: row.conversationId,
    workspacePath: row.workspacePath ?? null,
    title: row.title,
    titleSource: row.titleSource,
    permissionMode: row.permissionMode,
    pinned: Boolean(row.pinned),
    archived: Boolean(row.archived),
    modelKey: row.modelKey ?? null,
    thinkingLevel: row.thinkingLevel ?? null,
    createdAt: Number(row.createdAt),
    updatedAt: Number(row.updatedAt),
    messageCount: Number(row.messageCount),
  }
}

function encodeBody(thread) {
  return JSON.stringify({ messages: thread.messages, tasks: thread.tasks, outputLogs: thread.outputLogs })
}

function decodeBody(row, threadSummary) {
  if (!row) throw new Error(`会话正文缺失（threadId=${threadSummary.id}）`)
  let body
  try {
    body = JSON.parse(row.bodyJson)
  } catch {
    throw new Error(`会话正文损坏，无法解析（threadId=${threadSummary.id}）`)
  }
  if (!body || typeof body !== 'object' || !Array.isArray(body.messages) || !Array.isArray(body.tasks) || !Array.isArray(body.outputLogs)) {
    throw new Error(`会话正文结构损坏（threadId=${threadSummary.id}）`)
  }
  return normalizeThread({ ...threadSummary, ...body }, undefined)
}

function isThenable(value) {
  return value !== null && (typeof value === 'object' || typeof value === 'function') && typeof value.then === 'function'
}

function withTransaction(db, operation) {
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = operation()
    if (isThenable(result)) throw new TypeError('thread-store transaction callbacks must be synchronous')
    secureDatabaseFiles(db)
    db.exec('COMMIT')
    return result
  } catch (error) {
    try { db.exec('ROLLBACK') } catch { /* preserve the transaction error */ }
    throw error
  }
}

const securedFilePaths = new Set()

function secureDatabaseFiles(db) {
  const databasePath = databasePaths.get(db)
  if (!databasePath) return
  for (const filePath of [databasePath, `${databasePath}-wal`, `${databasePath}-shm`]) {
    if (securedFilePaths.has(filePath)) continue
    try {
      chmodSync(filePath, 0o600)
      securedFilePaths.add(filePath)
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
  }
}

function withReadTransaction(db, operation) {
  db.exec('BEGIN')
  try {
    const result = operation()
    if (isThenable(result)) throw new TypeError('thread-store read callbacks must be synchronous')
    db.exec('COMMIT')
    return result
  } catch (error) {
    try { db.exec('ROLLBACK') } catch { /* preserve the read error */ }
    throw error
  }
}

async function enableWalMode(db) {
  const deadline = Date.now() + BUSY_TIMEOUT_MS
  let delayMs = 5
  while (true) {
    try {
      const mode = db.prepare('PRAGMA journal_mode = WAL').get()?.journal_mode
      if (String(mode).toLowerCase() !== 'wal') {
        throw new Error(`无法启用 SQLite WAL 日志模式（当前模式：${mode ?? '未知'}）`)
      }
      return
    } catch (error) {
      const isBusy = error?.errcode === 5
        || error?.errcode === 6
        || /database is (?:locked|busy)/i.test(error instanceof Error ? error.message : String(error))
      if (!isBusy || Date.now() >= deadline) throw error
      await new Promise((resolve) => setTimeout(resolve, delayMs))
      delayMs = Math.min(delayMs * 2, 100)
    }
  }
}

async function backupFile(sourcePath, exactSource = null) {
  let source = exactSource
  if (source === null) {
    try {
      source = await fs.readFile(sourcePath)
    } catch (error) {
      if (error?.code === 'ENOENT') return null
      throw error
    }
  }

  const digest = createHash('sha256').update(source).digest('hex').slice(0, 12)
  const candidates = [
    `${sourcePath}.pre-sqlite.bak`,
    `${sourcePath}.pre-sqlite-${digest}.bak`,
  ]
  for (const destination of candidates) {
    // Never write directly into the final path: an exclusive create makes
    // the filename visible before writeFile finishes, so another migrating
    // process can observe a truncated backup and incorrectly fail migration.
    // Build and sync a private sibling first, then publish it with an atomic
    // no-overwrite hard link. The winner's bytes are complete before EEXIST
    // can be observed by another process.
    const temporary = `${destination}.tmp-${process.pid}-${randomUUID()}`
    let handle
    try {
      handle = await fs.open(temporary, 'wx', 0o600)
      await handle.writeFile(source)
      await handle.sync()
      await handle.close()
      handle = null
      try {
        await fs.link(temporary, destination)
        return destination
      } catch (error) {
        if (error?.code !== 'EEXIST') throw error
      }
      const existing = await fs.readFile(destination).catch((error) => {
        if (error?.code === 'ENOENT') return null
        throw error
      })
      if (existing?.equals(source)) return destination
    } catch (error) {
      throw error
    } finally {
      await handle?.close().catch(() => {})
      await fs.rm(temporary, { force: true }).catch(() => {})
    }
  }
  throw new Error(`无法为旧会话文件创建独立备份：${path.basename(sourcePath)}`)
}

async function readLegacyJson(filePath) {
  let raw
  try {
    raw = await fs.readFile(filePath, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new TypeError('expected a JSON object')
    return { raw, parsed }
  } catch (error) {
    throw new Error(`旧会话文件无效，原文件已保留：${path.basename(filePath)} (${error.message})`)
  }
}

function createSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS store_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS thread_summaries (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL UNIQUE,
      workspace_path TEXT,
      title TEXT NOT NULL,
      title_source TEXT NOT NULL,
      permission_mode TEXT NOT NULL,
      pinned INTEGER NOT NULL,
      archived INTEGER NOT NULL,
      model_key TEXT,
      thinking_level TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      message_count INTEGER NOT NULL CHECK (message_count >= 0)
    );
    CREATE INDEX IF NOT EXISTS thread_summaries_updated_idx
      ON thread_summaries(updated_at DESC);
    CREATE TABLE IF NOT EXISTS thread_bodies (
      thread_id TEXT PRIMARY KEY REFERENCES thread_summaries(id) ON DELETE CASCADE,
      body_json TEXT NOT NULL CHECK (json_valid(body_json)),
      previous_body_json TEXT CHECK (previous_body_json IS NULL OR json_valid(previous_body_json))
    );
  `)
  const bodyColumns = new Set(db.prepare('PRAGMA table_info(thread_bodies)').all().map((column) => column.name))
  if (!bodyColumns.has('previous_body_json')) {
    db.exec('ALTER TABLE thread_bodies ADD COLUMN previous_body_json TEXT CHECK (previous_body_json IS NULL OR json_valid(previous_body_json))')
  }
}

function readMeta(db, key) {
  return db.prepare('SELECT value FROM store_meta WHERE key = ?').get(key)?.value ?? null
}

function writeMeta(db, key, value) {
  db.prepare(`INSERT INTO store_meta (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(key, String(value))
}

function ensureAutoTitleFormat(db) {
  if (readMeta(db, 'auto_title_format') === AUTO_TITLE_FORMAT_VERSION) return
  withTransaction(db, () => {
    if (readMeta(db, 'auto_title_format') === AUTO_TITLE_FORMAT_VERSION) return
    const rows = db.prepare(`SELECT s.id, s.title, s.title_source AS titleSource, b.body_json AS bodyJson
      FROM thread_summaries s JOIN thread_bodies b ON b.thread_id = s.id
      WHERE s.title_source IN ('automatic', 'default')`).all()
    const update = db.prepare('UPDATE thread_summaries SET title = ?, title_source = ? WHERE id = ?')
    for (const row of rows) {
      let body
      try { body = JSON.parse(row.bodyJson) } catch { continue }
      if (!Array.isArray(body?.messages)) continue
      const firstUserMessage = body.messages.find((message) => message?.author === 'user' && typeof message.text === 'string')
      if (!firstUserMessage) continue
      const title = titleFromMessage(firstUserMessage.text)
      if (title === DEFAULT_THREAD_TITLE) continue
      if (row.title !== title || row.titleSource === 'default') update.run(title, 'automatic', row.id)
    }
    writeMeta(db, 'auto_title_format', AUTO_TITLE_FORMAT_VERSION)
  })
}

function allSummaries(db) {
  return db.prepare(`${SUMMARY_SELECT} ORDER BY updated_at DESC, id`).all().map(summaryFromRow)
}

function summaryById(db, threadId) {
  const row = db.prepare(`${SUMMARY_SELECT} WHERE id = ?`).get(threadId)
  return row ? summaryFromRow(row) : null
}

function summaryByConversation(db, conversationId) {
  const row = db.prepare(`${SUMMARY_SELECT} WHERE conversation_id = ?`).get(conversationId)
  return row ? summaryFromRow(row) : null
}

function loadThread(db, threadSummary, fallbackWorkspace) {
  const row = db.prepare(`SELECT body_json AS bodyJson, previous_body_json AS previousBodyJson
    FROM thread_bodies WHERE thread_id = ?`).get(threadSummary.id)
  try {
    return normalizeThread(decodeBody(row, threadSummary), fallbackWorkspace)
  } catch (error) {
    if (row?.previousBodyJson) {
      try {
        decodeBody({ bodyJson: row.previousBodyJson }, threadSummary)
        throw new Error(`${error.message}；检测到上一版已提交正文，可显式调用 recoverConversation 恢复`)
      } catch (previousError) {
        if (previousError.message?.includes('recoverConversation 恢复')) throw previousError
      }
    }
    throw error
  }
}

function saveThread(db, value) {
  const thread = normalizeThread(value, undefined)
  const item = summary(thread)
  db.prepare(`INSERT INTO thread_summaries (
      id, conversation_id, workspace_path, title, title_source, permission_mode,
      pinned, archived, model_key, thinking_level, created_at, updated_at, message_count
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      conversation_id = excluded.conversation_id,
      workspace_path = excluded.workspace_path,
      title = excluded.title,
      title_source = excluded.title_source,
      permission_mode = excluded.permission_mode,
      pinned = excluded.pinned,
      archived = excluded.archived,
      model_key = excluded.model_key,
      thinking_level = excluded.thinking_level,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at,
      message_count = excluded.message_count`).run(
    item.id,
    item.conversationId,
    item.workspacePath,
    item.title,
    item.titleSource,
    item.permissionMode,
    item.pinned ? 1 : 0,
    item.archived ? 1 : 0,
    item.modelKey,
    item.thinkingLevel,
    item.createdAt,
    item.updatedAt,
    item.messageCount,
  )
  db.prepare(`INSERT INTO thread_bodies (thread_id, body_json, previous_body_json) VALUES (?, ?, NULL)
    ON CONFLICT(thread_id) DO UPDATE SET
      previous_body_json = thread_bodies.body_json,
      body_json = excluded.body_json`).run(item.id, encodeBody(thread))
  return thread
}

function snapshotForThread(db, thread, currentThreadId = readMeta(db, 'current_thread_id')) {
  if (!thread) throw new Error('当前会话不存在')
  return { ...thread, currentThreadId, threads: allSummaries(db) }
}

function updateThreadInTransaction(db, threadSummary, patch, fallbackWorkspace) {
  const current = loadThread(db, threadSummary, fallbackWorkspace)
  const nextPatch = typeof patch === 'function' ? patch(current) : patch
  if (isThenable(nextPatch)) throw new TypeError('thread-store update callbacks must be synchronous')
  // The sidebar uses updatedAt as conversation recency. Task snapshots, tool
  // logs, settings, and title edits can be persisted frequently, but they are
  // not new conversation activity and must not reorder the recent list.
  const hasMessageActivity = Boolean(nextPatch && Object.hasOwn(nextPatch, 'messages'))
  const latestActivityAt = hasMessageActivity
    ? Number(db.prepare('SELECT MAX(updated_at) AS latest FROM thread_summaries').get()?.latest ?? 0)
    : current.updatedAt
  const updatedAt = hasMessageActivity
    ? Math.max(Date.now(), current.updatedAt + 1, latestActivityAt + 1)
    : current.updatedAt
  return saveThread(db, normalizeThread({ ...current, ...nextPatch, updatedAt }, fallbackWorkspace))
}

async function loadLegacyThreadDetails(manifest, threadsDir, fallbackWorkspace) {
  const entries = Array.isArray(manifest?.threads) ? manifest.threads : []
  const result = []
  for (const entry of entries) {
    const hasInlineBody = Array.isArray(entry?.messages) || Array.isArray(entry?.tasks) || Array.isArray(entry?.outputLogs)
    let source = entry
    if (!hasInlineBody) {
      if (typeof entry?.id !== 'string' || !entry.id || path.basename(entry.id) !== entry.id) {
        throw new Error('旧会话索引包含无效 thread id，迁移已中止')
      }
      const detailPath = path.join(threadsDir, `${entry.id}.json`)
      let raw
      try {
        raw = await fs.readFile(detailPath, 'utf8')
      } catch (error) {
        if (error?.code === 'ENOENT') throw new Error(`旧会话正文缺失，迁移已中止（threadId=${entry.id}）`)
        throw error
      }
      try {
        const detail = JSON.parse(raw)
        if (!detail || typeof detail !== 'object' || Array.isArray(detail)) throw new TypeError('expected object')
        if (detail.id && detail.id !== entry.id) throw new Error('thread id mismatch')
        if (detail.conversationId && detail.conversationId !== entry.conversationId) throw new Error('conversation id mismatch')
        source = { ...entry, ...detail }
      } catch (error) {
        throw new Error(`旧会话正文无效，迁移已中止（threadId=${entry.id}: ${error.message}）`)
      }
    }
    result.push(normalizeThread(source, fallbackWorkspace))
  }
  return result
}

async function writeAtomicJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`
  let handle
  try {
    handle = await fs.open(temporaryPath, 'wx', 0o600)
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, 'utf8')
    await handle.sync()
    await handle.close()
    handle = null
    await fs.link(temporaryPath, filePath)
    await fs.unlink(temporaryPath).catch(() => {})
    const directory = await fs.open(path.dirname(filePath), 'r')
    try { await directory.sync() } finally { await directory.close() }
  } catch (error) {
    await handle?.close().catch(() => {})
    await fs.rm(temporaryPath, { force: true }).catch(() => {})
    throw error
  }
}

/** Local thread metadata and bodies stored in SQLite transactions. */
export function createThreadStore(userDataPath, fallbackWorkspace) {
  const root = path.resolve(userDataPath)
  const filePath = path.join(root, 'taskweaver-threads.sqlite')
  const legacyManifestPath = path.join(root, 'taskweaver-threads.json')
  const legacyAppStatePath = path.join(root, 'taskweaver-app-state.json')
  const legacyThreadsDir = path.join(root, 'threads')
  let databasePromise
  let initialized = false
  let searchSessionContent = async () => ({ items: [], hasMore: false })

  function getDatabase() {
    if (!databasePromise) {
      databasePromise = (async () => {
        await fs.mkdir(root, { recursive: true })
        const { DatabaseSync } = await import('node:sqlite')
        const db = new DatabaseSync(filePath)
        databasePaths.set(db, filePath)
        try {
          db.exec(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}; PRAGMA foreign_keys = ON;`)
          // WAL mode is database-wide. Two processes can open a brand-new
          // store together and briefly contend while the first changes it.
          // SQLite's busy handler does not consistently wait for this PRAGMA,
          // so retry only this connection-setup race within the same bound.
          await enableWalMode(db)
          db.exec('PRAGMA synchronous = NORMAL;')
          createSchema(db)
          secureDatabaseFiles(db)
          return db
        } catch (error) {
          try { db.close() } catch { /* preserve initialization failure */ }
          throw error
        }
      })().catch((error) => {
        databasePromise = undefined
        throw error
      })
    }
    return databasePromise
  }

  async function migrateIfNeeded(db, legacyState) {
    if (readMeta(db, 'schema_version') === String(SCHEMA_VERSION)) {
      return withTransaction(db, () => {
        const count = Number(db.prepare('SELECT COUNT(*) AS count FROM thread_summaries').get().count)
        if (count === 0) throw new Error('SQLite 会话存储已初始化但没有会话；原文件已保留，请先导出诊断信息')
        const currentId = readMeta(db, 'current_thread_id')
        if (currentId && summaryById(db, currentId)) return
        const latest = db.prepare('SELECT id FROM thread_summaries ORDER BY updated_at DESC, id LIMIT 1').get()
        if (latest) writeMeta(db, 'current_thread_id', latest.id)
      })
    }

    if (readMeta(db, 'schema_version') === '1' && SCHEMA_VERSION === 2) {
      return withTransaction(db, () => {
        const count = Number(db.prepare('SELECT COUNT(*) AS count FROM thread_summaries').get().count)
        if (count === 0) throw new Error('旧版 SQLite 会话库已初始化但没有会话；原文件已保留，请先导出诊断信息')
        const currentId = readMeta(db, 'current_thread_id')
        if (!currentId || !summaryById(db, currentId)) {
          const latest = db.prepare('SELECT id FROM thread_summaries ORDER BY updated_at DESC, id LIMIT 1').get()
          if (latest) writeMeta(db, 'current_thread_id', latest.id)
        }
        writeMeta(db, 'schema_version', SCHEMA_VERSION)
      })
    }

    const legacyManifest = await readLegacyJson(legacyManifestPath)
    if (legacyManifest && Object.hasOwn(legacyManifest.parsed, 'threads') && !Array.isArray(legacyManifest.parsed.threads)) {
      throw new Error('旧会话索引的 threads 字段无效，迁移已中止；原文件已保留')
    }
    await Promise.all([
      backupFile(legacyManifestPath, legacyManifest ? Buffer.from(legacyManifest.raw) : null),
      backupFile(legacyAppStatePath),
    ])
    const legacyThreads = await loadLegacyThreadDetails(legacyManifest?.parsed, legacyThreadsDir, fallbackWorkspace)
    let initialThreads = legacyThreads
    let currentThreadId = legacyManifest?.parsed?.currentThreadId ?? null

    const legacySingleState = legacyState
      ?? (legacyManifest && !Array.isArray(legacyManifest.parsed.threads) ? legacyManifest.parsed : null)
    if (initialThreads.length === 0 && legacySingleState && typeof legacySingleState === 'object') {
      const migrated = normalizeThread({
        id: legacySingleState.threadId ?? legacySingleState.conversationId ?? randomUUID(),
        conversationId: legacySingleState.conversationId,
        workspacePath: legacySingleState.workspacePath,
        title: legacySingleState.threadTitle,
        permissionMode: legacySingleState.permissionMode,
        messages: legacySingleState.messages,
        tasks: legacySingleState.tasks,
        outputLogs: legacySingleState.outputLogs,
      }, fallbackWorkspace)
      initialThreads = [migrated]
      currentThreadId = migrated.id
    }
    if (initialThreads.length === 0) {
      const first = makeThread({ workspacePath: fallbackWorkspace })
      initialThreads = [first]
      currentThreadId = first.id
    }
    const ids = new Set()
    const conversationIds = new Set()
    for (const thread of initialThreads) {
      if (ids.has(thread.id) || conversationIds.has(thread.conversationId)) {
        throw new Error('旧会话数据存在重复 ID，迁移已中止；原文件和备份均已保留')
      }
      ids.add(thread.id)
      conversationIds.add(thread.conversationId)
    }
    if (!ids.has(currentThreadId)) currentThreadId = initialThreads[0].id

    withTransaction(db, () => {
      if (readMeta(db, 'schema_version') === String(SCHEMA_VERSION)) return
      const existingCount = Number(db.prepare('SELECT COUNT(*) AS count FROM thread_summaries').get().count)
      if (existingCount !== 0) throw new Error('SQLite 会话存储存在未完成数据；未自动覆盖')
      for (const thread of initialThreads) saveThread(db, thread)

      const migratedSummaries = allSummaries(db)
      const migratedIds = new Set(migratedSummaries.map((item) => item.id))
      if (migratedIds.size !== initialThreads.length || initialThreads.some((thread) => !migratedIds.has(thread.id))) {
        throw new Error('SQLite 会话迁移校验失败：thread 数量或 ID 不一致')
      }
      for (const expected of initialThreads) {
        const actualSummary = summaryById(db, expected.id)
        const actual = loadThread(db, actualSummary, fallbackWorkspace)
        if (actual.conversationId !== expected.conversationId
          || actual.messages.length !== expected.messages.length
          || actual.tasks.length !== expected.tasks.length
          || actual.outputLogs.length !== expected.outputLogs.length
          || JSON.stringify(actual.messages) !== JSON.stringify(expected.messages)
          || JSON.stringify(actual.tasks) !== JSON.stringify(expected.tasks)
          || JSON.stringify(actual.outputLogs) !== JSON.stringify(expected.outputLogs)
          || JSON.stringify(summary(actual)) !== JSON.stringify(summary(expected))) {
          throw new Error(`SQLite 会话迁移校验失败（threadId=${expected.id}）`)
        }
      }
      writeMeta(db, 'current_thread_id', currentThreadId)
      writeMeta(db, 'schema_version', SCHEMA_VERSION)
    })
  }

  async function ensureInitialized(legacyState = null) {
    const db = await getDatabase()
    if (!initialized || readMeta(db, 'schema_version') !== String(SCHEMA_VERSION)) {
      await migrateIfNeeded(db, legacyState)
      ensureAutoTitleFormat(db)
      initialized = true
    }
    return db
  }

  async function currentState() {
    const db = await ensureInitialized()
    return withReadTransaction(db, () => {
      const currentId = readMeta(db, 'current_thread_id')
      const threadSummary = currentId ? summaryById(db, currentId) : null
      if (!threadSummary) throw new Error('当前会话不存在')
      return snapshotForThread(db, loadThread(db, threadSummary, fallbackWorkspace), currentId)
    })
  }

  function updateConversationInTransaction(db, conversationId, patch) {
    const threadSummary = summaryByConversation(db, conversationId)
    if (!threadSummary) throw new Error('找不到该对话')
    const updated = updateThreadInTransaction(db, threadSummary, patch, fallbackWorkspace)
    return snapshotForThread(db, updated)
  }

  return {
    filePath,
    async isInitialized() {
      const db = await getDatabase()
      const version = readMeta(db, 'schema_version')
      return version === String(SCHEMA_VERSION) || version === '1'
    },
    async initialize(legacyState = null) {
      await ensureInitialized(legacyState)
      return currentState()
    },
    getState: currentState,
    async getByConversationId(conversationId) {
      const db = await ensureInitialized()
      return withReadTransaction(db, () => {
        const threadSummary = summaryByConversation(db, conversationId)
        if (!threadSummary) throw new Error('找不到该对话')
        const currentId = readMeta(db, 'current_thread_id')
        return snapshotForThread(db, loadThread(db, threadSummary, fallbackWorkspace), currentId)
      })
    },
    async updateConversation(conversationId, patch) {
      const db = await ensureInitialized()
      return withTransaction(db, () => updateConversationInTransaction(db, conversationId, patch))
    },
    async recoverConversation(conversationId) {
      const db = await ensureInitialized()
      return withTransaction(db, () => {
        const threadSummary = summaryByConversation(db, conversationId)
        if (!threadSummary) throw new Error('找不到该对话')
        const row = db.prepare(`SELECT body_json AS bodyJson, previous_body_json AS previousBodyJson
          FROM thread_bodies WHERE thread_id = ?`).get(threadSummary.id)
        try {
          decodeBody(row, threadSummary)
          throw new Error('当前会话正文结构正常，无需恢复')
        } catch (error) {
          if (error.message === '当前会话正文结构正常，无需恢复') throw error
        }
        if (!row?.previousBodyJson) throw new Error(`没有可恢复的上一版会话正文（threadId=${threadSummary.id}）`)
        const recovered = decodeBody({ bodyJson: row.previousBodyJson }, threadSummary)
        db.prepare(`UPDATE thread_bodies SET body_json = previous_body_json, previous_body_json = NULL
          WHERE thread_id = ?`).run(threadSummary.id)
        db.prepare('UPDATE thread_summaries SET message_count = ? WHERE id = ?').run(
          recovered.messages.length, threadSummary.id,
        )
        const restoredSummary = summaryById(db, threadSummary.id)
        return snapshotForThread(db, loadThread(db, restoredSummary, fallbackWorkspace))
      })
    },
    async listThreads() {
      const db = await ensureInitialized()
      return withReadTransaction(db, () => {
        const currentId = readMeta(db, 'current_thread_id')
        return allSummaries(db).map((thread) => ({ ...thread, current: thread.id === currentId }))
      })
    },
    setSessionSearch(search) {
      searchSessionContent = typeof search === 'function'
        ? search
        : async () => ({ items: [], hasMore: false })
    },
    async createThread({ workspacePath, permissionMode, title, modelKey, thinkingLevel } = {}) {
      const db = await ensureInitialized()
      return withTransaction(db, () => {
        const currentId = readMeta(db, 'current_thread_id')
        const current = currentId ? summaryById(db, currentId) : null
        const thread = makeThread({
          workspacePath: workspacePath !== undefined ? workspacePath : (current?.workspacePath ?? null),
          permissionMode: permissionMode ?? current?.permissionMode ?? 'ask',
          title: title ?? DEFAULT_THREAD_TITLE,
          modelKey: modelKey !== undefined ? modelKey : (current?.modelKey ?? null),
          thinkingLevel: thinkingLevel !== undefined ? thinkingLevel : (current?.thinkingLevel ?? null),
        })
        saveThread(db, thread)
        writeMeta(db, 'current_thread_id', thread.id)
        return snapshotForThread(db, thread, thread.id)
      })
    },
    async createBackgroundThread({ conversationId, workspacePath, permissionMode = 'readonly', title = '后台任务' }) {
      const db = await ensureInitialized()
      const id = conversationId || randomUUID()
      const thread = withTransaction(db, () => {
        const existing = summaryByConversation(db, id)
        if (existing) {
          const updatedSummary = {
            ...existing,
            workspacePath: workspacePath ?? null,
            permissionMode: VALID_PERMISSION_MODES.has(permissionMode) ? permissionMode : 'readonly',
            title,
            archived: true,
          }
          saveThread(db, { ...loadThread(db, existing, fallbackWorkspace), ...updatedSummary })
          return loadThread(db, summaryById(db, existing.id), fallbackWorkspace)
        }
        const created = makeThread({ conversationId: id, workspacePath: workspacePath ?? null, permissionMode, title, archived: true })
        return saveThread(db, created)
      })
      return withReadTransaction(db, () => snapshotForThread(db, thread))
    },
    async switchThread(threadId) {
      const db = await ensureInitialized()
      return withTransaction(db, () => {
        const threadSummary = summaryById(db, threadId)
        if (!threadSummary) throw new Error('找不到该会话')
        writeMeta(db, 'current_thread_id', threadId)
        return snapshotForThread(db, loadThread(db, threadSummary, fallbackWorkspace), threadId)
      })
    },
    async renameThread(threadId, title, options = {}) {
      const db = await ensureInitialized()
      const generated = options?.generated === true
      const normalized = String(title ?? '').trim()
      if (!normalized) throw new Error('会话名称不能为空')
      return withTransaction(db, () => {
        const thread = summaryById(db, threadId)
        if (!thread) throw new Error('找不到该会话')
        if (generated && thread.titleSource === 'user') {
          const currentId = readMeta(db, 'current_thread_id')
          return allSummaries(db).map((item) => ({ ...item, current: item.id === currentId }))
        }
        db.prepare(`UPDATE thread_summaries SET title = ?, title_source = ? WHERE id = ?`).run(
          normalized.slice(0, 80), generated ? 'automatic' : 'user', threadId,
        )
        const currentId = readMeta(db, 'current_thread_id')
        return allSummaries(db).map((item) => ({ ...item, current: item.id === currentId }))
      })
    },
    async togglePinThread(threadId) {
      const db = await ensureInitialized()
      return withTransaction(db, () => {
        const thread = summaryById(db, threadId)
        if (!thread) throw new Error('找不到该会话')
        db.prepare('UPDATE thread_summaries SET pinned = ? WHERE id = ?').run(thread.pinned ? 0 : 1, threadId)
        const currentId = readMeta(db, 'current_thread_id')
        return allSummaries(db).map((item) => ({ ...item, current: item.id === currentId }))
      })
    },
    async toggleArchiveThread(threadId) {
      const db = await ensureInitialized()
      return withTransaction(db, () => {
        const thread = summaryById(db, threadId)
        if (!thread) throw new Error('找不到该会话')
        const nextArchived = !thread.archived
        db.prepare('UPDATE thread_summaries SET archived = ? WHERE id = ?').run(nextArchived ? 1 : 0, threadId)
        if (nextArchived && readMeta(db, 'current_thread_id') === threadId) {
          const active = db.prepare('SELECT id FROM thread_summaries WHERE archived = 0 AND id <> ? ORDER BY updated_at DESC, id LIMIT 1').get(threadId)
          if (active) writeMeta(db, 'current_thread_id', active.id)
        }
        const currentId = readMeta(db, 'current_thread_id')
        return allSummaries(db).map((item) => ({ ...item, current: item.id === currentId }))
      })
    },
    async searchThreads(query, { workspacePath } = {}) {
      const db = await ensureInitialized()
      const state = withReadTransaction(db, () => ({ currentThreadId: readMeta(db, 'current_thread_id'), threads: allSummaries(db) }))
      const q = String(query || '').trim().toLowerCase()
      if (!q) {
        return state.threads
          .filter((thread) => (workspacePath ? thread.workspacePath === workspacePath : true))
          .map((thread) => ({ ...thread, current: thread.id === state.currentThreadId }))
      }

      const contentSearch = await searchSessionContent(String(query || '').trim())
      const snippetsByConversation = new Map()
      for (const hit of contentSearch?.items ?? []) {
        if (typeof hit?.conversationId === 'string' && typeof hit?.snippet === 'string') {
          snippetsByConversation.set(hit.conversationId, hit.snippet)
        }
      }
      return state.threads
        .filter((thread) => {
          if (workspacePath && thread.workspacePath !== workspacePath) return false
          return (thread.title || '').toLowerCase().includes(q)
            || (thread.workspacePath ?? '').toLowerCase().includes(q)
            || snippetsByConversation.has(thread.conversationId)
        })
        .map((thread) => ({
          ...thread,
          current: thread.id === state.currentThreadId,
          ...(snippetsByConversation.has(thread.conversationId)
            ? { searchSnippet: snippetsByConversation.get(thread.conversationId) }
            : {}),
        }))
    },
    async deleteThread(threadId) {
      const db = await ensureInitialized()
      return withTransaction(db, () => {
        if (!summaryById(db, threadId)) throw new Error('找不到该会话')
        db.prepare('DELETE FROM thread_summaries WHERE id = ?').run(threadId)
        let currentId = readMeta(db, 'current_thread_id')
        if (currentId === threadId || !summaryById(db, currentId)) {
          let next = db.prepare('SELECT id FROM thread_summaries ORDER BY updated_at DESC, id LIMIT 1').get()
          if (!next) {
            const replacement = makeThread({ workspacePath: fallbackWorkspace })
            saveThread(db, replacement)
            next = { id: replacement.id }
          }
          currentId = next.id
          writeMeta(db, 'current_thread_id', currentId)
        }
        const currentSummary = summaryById(db, currentId)
        return snapshotForThread(db, loadThread(db, currentSummary, fallbackWorkspace), currentId)
      })
    },
    async forkThread(threadId, messageId) {
      const db = await ensureInitialized()
      return withTransaction(db, () => {
        const sourceSummary = summaryById(db, threadId)
        if (!sourceSummary) throw new Error('找不到要分支的会话')
        const source = loadThread(db, sourceSummary, fallbackWorkspace)
        const slicedMessages = sliceForkMessages(source.messages, messageId)
        const baseTitle = (source.title || DEFAULT_THREAD_TITLE).replace(/\s*\(分支\s*\d*\)$/, '')
        const forked = normalizeThread({
          id: randomUUID(),
          conversationId: randomUUID(),
          workspacePath: source.workspacePath ?? fallbackWorkspace ?? null,
          title: `${baseTitle} (分支)`,
          permissionMode: source.permissionMode,
          modelKey: source.modelKey,
          thinkingLevel: source.thinkingLevel,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          messages: JSON.parse(JSON.stringify(slicedMessages)),
          tasks: [],
          outputLogs: [],
        }, fallbackWorkspace)
        saveThread(db, forked)
        writeMeta(db, 'current_thread_id', forked.id)
        return snapshotForThread(db, forked, forked.id)
      })
    },
    async setCurrent(patch) {
      const db = await ensureInitialized()
      return withTransaction(db, () => {
        const currentId = readMeta(db, 'current_thread_id')
        const currentSummary = currentId ? summaryById(db, currentId) : null
        if (!currentSummary) throw new Error('当前会话不存在')
        return updateConversationInTransaction(db, currentSummary.conversationId, patch)
      })
    },
    async updateCurrent(mutator) {
      const db = await ensureInitialized()
      return withTransaction(db, () => {
        const currentId = readMeta(db, 'current_thread_id')
        const currentSummary = currentId ? summaryById(db, currentId) : null
        if (!currentSummary) throw new Error('当前会话不存在')
        return updateConversationInTransaction(db, currentSummary.conversationId, mutator)
      })
    },
    async exportSnapshot() {
      const db = await ensureInitialized()
      return withReadTransaction(db, () => {
        const currentThreadId = readMeta(db, 'current_thread_id')
        const threads = allSummaries(db).map((threadSummary) => loadThread(db, threadSummary, fallbackWorkspace))
        return { currentThreadId, threads }
      })
    },
    async exportRollbackSnapshot(outputPath) {
      if (!outputPath || typeof outputPath !== 'string') throw new TypeError('outputPath is required')
      const snapshot = await this.exportSnapshot()
      const output = path.resolve(outputPath)
      await writeAtomicJson(output, snapshot)
      return output
    },
    async close() {
      if (!databasePromise) return
      const db = await databasePromise
      db.close()
      databasePromise = undefined
      initialized = false
    },
  }
}
