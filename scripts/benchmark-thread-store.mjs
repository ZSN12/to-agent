#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { performance } from 'node:perf_hooks'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createThreadStore } from '../backend/thread-store.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUTPUT_PATH = path.join(ROOT, 'docs/benchmark-results/thread-store-2026-10-30.json')
const WARMUPS = 5
const TRIALS = 20
const MIB = 1024 * 1024
const FIXED_UPDATED_AT = 1_798_000_000_000

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)]
}

function distribution(values) {
  return {
    p50Ms: percentile(values, 0.5),
    p95Ms: percentile(values, 0.95),
    samples: values,
  }
}

function makeThread(id, conversationId, title, bodyText, timestamp) {
  return {
    id,
    conversationId,
    workspacePath: '/synthetic/workspace',
    title,
    titleSource: 'user',
    permissionMode: 'ask',
    pinned: false,
    archived: false,
    modelKey: null,
    thinkingLevel: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    messages: [{ id: `${id}-message`, author: 'user', text: bodyText }],
    tasks: [],
    outputLogs: [],
  }
}

async function writeLegacyFixture(filePath, state) {
  await fs.writeFile(filePath, `${JSON.stringify(state, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
}

async function legacyJsonUpdate(filePath, targetConversationId, counters) {
  const started = performance.now()
  const raw = await fs.readFile(filePath, 'utf8')
  counters.readBytes += Buffer.byteLength(raw)
  const state = JSON.parse(raw)
  const target = state.threads.find((thread) => thread.conversationId === targetConversationId)
  assert.ok(target)
  target.messages = [{ id: 'probe-message', author: 'user', text: 'synthetic target update' }]
  target.updatedAt = FIXED_UPDATED_AT
  state.threads = state.threads.map((thread) => ({ ...thread }))

  const temporaryPath = `${filePath}.${process.pid}.tmp`
  const serialized = `${JSON.stringify(state, null, 2)}\n`
  counters.writeBytes += Buffer.byteLength(serialized)
  await fs.writeFile(temporaryPath, serialized, { encoding: 'utf8', mode: 0o600 })
  await fs.rename(temporaryPath, filePath)

  // The old updateConversation() called currentState() after writing, which
  // reopened and parsed the same complete JSON document a second time.
  const committedRaw = await fs.readFile(filePath, 'utf8')
  counters.readBytes += Buffer.byteLength(committedRaw)
  const committed = JSON.parse(committedRaw)
  committed.threads.map((thread) => ({ ...thread }))
  return performance.now() - started
}

async function seedSqlite(store, archiveText, timestamp) {
  const db = new DatabaseSync(store.filePath)
  db.exec('PRAGMA foreign_keys = ON; BEGIN IMMEDIATE;')
  try {
    db.exec('DELETE FROM thread_bodies; DELETE FROM thread_summaries;')
    const insertSummary = db.prepare(`INSERT INTO thread_summaries (
      id, conversation_id, workspace_path, title, title_source, permission_mode,
      pinned, archived, model_key, thinking_level, created_at, updated_at, message_count
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    const insertBody = db.prepare(`INSERT INTO thread_bodies (thread_id, body_json, previous_body_json)
      VALUES (?, ?, NULL)`)
    const target = makeThread('thread-target', 'conversation-target', 'Small target', 'small current body', timestamp)
    const archive = makeThread('thread-archive', 'conversation-archive', 'Large archived body', archiveText, timestamp - 1)
    for (const thread of [target, archive]) {
      insertSummary.run(
        thread.id, thread.conversationId, thread.workspacePath, thread.title, thread.titleSource,
        thread.permissionMode, 0, 0, null, null, thread.createdAt, thread.updatedAt, thread.messages.length,
      )
      insertBody.run(thread.id, JSON.stringify({ messages: thread.messages, tasks: thread.tasks, outputLogs: thread.outputLogs }))
    }
    db.prepare(`INSERT INTO store_meta (key, value) VALUES ('current_thread_id', 'thread-target')
      ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run()
    db.exec('COMMIT')
  } catch (error) {
    try { db.exec('ROLLBACK') } catch { /* preserve setup error */ }
    throw error
  } finally {
    db.close()
  }
}

const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'tw-thread-store-benchmark-'))
const results = []

try {
  for (const totalMiB of [1, 10, 50]) {
    const archiveText = 'x'.repeat(totalMiB * MIB)
    const timestamp = FIXED_UPDATED_AT - 10_000
    const baselineRoot = path.join(temporaryRoot, `legacy-${totalMiB}`)
    const sqliteRoot = path.join(temporaryRoot, `sqlite-${totalMiB}`)
    await Promise.all([fs.mkdir(baselineRoot), fs.mkdir(sqliteRoot)])

    const legacyFilePath = path.join(baselineRoot, 'taskweaver-threads.json')
    const legacyState = {
      currentThreadId: 'thread-target',
      threads: [
        makeThread('thread-target', 'conversation-target', 'Small target', 'small current body', timestamp),
        makeThread('thread-archive', 'conversation-archive', 'Large archived body', archiveText, timestamp - 1),
      ],
    }
    await writeLegacyFixture(legacyFilePath, legacyState)

    const store = createThreadStore(sqliteRoot, '/synthetic/workspace')
    await store.initialize()
    await seedSqlite(store, archiveText, timestamp)
    const baselineCounters = { readBytes: 0, writeBytes: 0 }
    const baselineSamples = []
    for (let index = 0; index < WARMUPS + TRIALS; index += 1) {
      const elapsed = await legacyJsonUpdate(legacyFilePath, 'conversation-target', baselineCounters)
      if (index >= WARMUPS) baselineSamples.push(elapsed)
    }

    const sqliteSamples = []
    for (let index = 0; index < WARMUPS + TRIALS; index += 1) {
      const started = performance.now()
      const updated = await store.updateConversation('conversation-target', {
        messages: [{ id: 'probe-message', author: 'user', text: 'synthetic target update' }],
      })
      const elapsed = performance.now() - started
      assert.equal(updated.messages[0].text, 'synthetic target update')
      if (index >= WARMUPS) sqliteSamples.push(elapsed)
    }
    assert.equal((await store.getByConversationId('conversation-archive')).messages[0].text.length, totalMiB * MIB)
    await store.close()

    const legacyBytes = (await fs.stat(legacyFilePath)).size
    const sqliteBytes = (await fs.stat(path.join(sqliteRoot, 'taskweaver-threads.sqlite'))).size
    const baseline = distribution(baselineSamples)
    const sqlite = distribution(sqliteSamples)
    results.push({
      requestedArchiveTextMiB: totalMiB,
      legacyJsonBytes: legacyBytes,
      sqliteMainDatabaseBytes: sqliteBytes,
      warmups: WARMUPS,
      trials: TRIALS,
      legacyWholeFileJson: {
        ...baseline,
        readsPerUpdate: 2,
        writesPerUpdate: 1,
        totalReadBytes: baselineCounters.readBytes,
        totalWrittenBytes: baselineCounters.writeBytes,
      },
      sqliteThreadStore: {
        ...sqlite,
        targetBodyRowsReadPerUpdate: 1,
        targetBodyRowsWrittenPerUpdate: 1,
        unrelatedBodyRowsReadOrWrittenPerUpdate: 0,
      },
      speedup: Number((baseline.p50Ms / sqlite.p50Ms).toFixed(2)),
    })
    console.log(`${totalMiB} MiB: legacy p50 ${baseline.p50Ms.toFixed(2)} ms, SQLite p50 ${sqlite.p50Ms.toFixed(2)} ms`)
  }

  const result = {
    generatedAt: new Date().toISOString(),
    node: process.version,
    sqliteVersion: process.versions.sqlite ?? null,
    hardware: {
      platform: process.platform,
      arch: process.arch,
      cpu: os.cpus()[0]?.model ?? 'unknown',
      logicalCores: os.cpus().length,
    },
    baselineCommit: 'd48020732985086057c9e4c055eb1308bd2fbabb',
    headCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(),
    fixture: 'synthetic: one 1/10/50 MiB archived body plus one small target conversation',
    baselineAlgorithm: 'V1 createJsonStore.update + parse/normalize/write/atomic rename + currentState reread/parse',
    currentAlgorithm: 'one BEGIN IMMEDIATE SQLite transaction, target summary/body only, WAL + synchronous FULL',
    resultLimitations: [
      'Synthetic local storage timing is device/filesystem specific; deterministic body-row locality is separately enforced by test-thread-store-split.mjs.',
      'The benchmark measures a small target conversation while one archived conversation owns the requested large body.',
      'node:sqlite is experimental in this Node release; the emitted runtime warning is intentionally not suppressed.',
    ],
    results,
  }
  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true })
  await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 })
  console.log(`Wrote ${path.relative(ROOT, OUTPUT_PATH)}`)
} finally {
  await fs.rm(temporaryRoot, { recursive: true, force: true })
}
