import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { createZHostManager } from '../../electron/agent/z-host/index.mjs'
import { createDshChatService } from '../../electron/backend/dsh-chat-service.mjs'
import { createModelService } from '../../electron/backend/model-service.mjs'
import { createProfileStore } from '../../electron/backend/profile-store.mjs'

// --inspect reads only a COPIED archive through the native cold-history API.
// --run makes real provider requests against a fork in the isolated home.
// macOS wraps the entire Host/process tree in an extra file-write boundary;
// preserving the original tool preset must not grant writes to the real project.
const run = process.argv.includes('--run')
const compact = process.argv.includes('--compact')
const compactOnly = process.argv.includes('--compact-only')
assert.ok(!compact || run, '--compact requires --run')
assert.ok(!compactOnly || compact, '--compact-only requires --compact')
assert.ok(run || process.argv.includes('--inspect'), 'Pass --inspect or --run')
assert.equal(process.platform, 'darwin', 'This harness requires the macOS outer read-only boundary')
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const originalHome = path.join(os.homedir(), 'Library/Application Support/taskweaver-desktop')
const runtimeRoot = path.join(root, 'vendor/taskweaver-z-runtime')
const reportDir = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-history-smoke-'))
const sourceId = process.argv.find(arg => arg.startsWith('--session='))?.slice('--session='.length)
const map = JSON.parse(await fs.readFile(path.join(originalHome, 'taskweaver/dsh-session-map.json'), 'utf8')).sessions
const candidates = Object.entries(map).filter(([, entry]) => entry.cwd === root && (!sourceId || entry.sessionId === sourceId))
const sessionRoot = path.join(originalHome, 'dsh/sessions')
const workspaceDirs = await fs.readdir(sessionRoot)
const artifacts = []
for (const [conversationId, entry] of candidates) {
  for (const workspace of workspaceDirs) {
    const directory = path.join(sessionRoot, workspace, entry.sessionId)
    try {
      const archive = path.join(directory, 'session.jsonl.zstd')
      const stat = await fs.stat(archive)
      artifacts.push({ conversationId, entry, directory, archive, workspace, bytes: stat.size })
    } catch (error) { if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error }
  }
}
const source = artifacts.sort((a, b) => b.bytes - a.bytes)[0]
assert.ok(source, 'No matching archived project session')
async function fingerprint() {
  const data = await fs.readFile(source.archive)
  const stat = await fs.stat(source.archive)
  return { sha256: createHash('sha256').update(data).digest('hex'), bytes: stat.size, mtimeMs: stat.mtimeMs }
}
const before = await fingerprint()
const report = { runtimeRoot, sourceSessionId: source.entry.sessionId, archiveBytes: source.bytes,
  startedAt: Date.now(), realProviderRequests: run, cases: [] }
let manager
let chat
let modelService
let heartbeat
const events = []
const value = reply => {
  if (!reply.result?.ok) throw new Error(reply.result?.error?.message || 'Native RPC failed')
  return reply.result.value
}
function summarizeHistory(events) {
  const turns = []
  let current
  for (const event of events) {
    if (event.type === 'turn/start') {
      current = { turn: event.data.turn, startedAt: event.time, tools: 0, reasoningChars: 0, steps: 0,
        retries: 0, retryFailures: [], firstChunkMs: null, firstTextMs: null, longestEventGapMs: 0, lastEventAt: event.time }
      turns.push(current)
    }
    if (!current) continue
    current.longestEventGapMs = Math.max(current.longestEventGapMs, event.time - current.lastEventAt)
    current.lastEventAt = event.time
    if (event.type === 'tool/call') current.tools++
    if (event.type === 'step/start') current.steps++
    if (event.type === 'llm/retry') {
      current.retries++
      current.retryFailures.push({ code: event.data.failure?.code ?? null, delayMs: event.data.delayMs ?? null })
    }
    if (event.type === 'assistant/chunk') {
      current.firstChunkMs ??= event.time - current.startedAt
      if (event.data.chunk.type === 'text-delta') current.firstTextMs ??= event.time - current.startedAt
    }
    if (event.type === 'assistant/chunk' && event.data.chunk.type === 'reasoning-delta') current.reasoningChars += event.data.chunk.text?.length || 0
    if (event.type === 'turn/end') {
      current.elapsedMs = event.time - current.startedAt
      current.reason = event.data.reason.kind
      delete current.lastEventAt
      current = null
    }
  }
  return { events: events.length, turns: turns.length, completedTurns: turns.filter(turn => turn.reason).length,
    tools: turns.reduce((sum, turn) => sum + turn.tools, 0),
    slowestTurns: turns.filter(turn => turn.elapsedMs).sort((a, b) => b.elapsedMs - a.elapsedMs).slice(0, 5) }
}
async function runQuestion(name, id, prompt, marker = 'HISTORY_SHORT_OK') {
  if (process.exitCode) return undefined
  const since = Date.now()
  let timer
  let observed
  try {
    const result = await Promise.race([
      chat.send({ conversationId: id, text: prompt, modelKey: report.modelKey, cwdOverride: root,
        agentPreset: source.entry.agentPreset || 'code', webContents: { isDestroyed: () => false,
          send(channel, event) { if (channel === 'chat:stream') events.push({ time: Date.now(), ...event }) } } }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Observation deadline (240 seconds)')), 240_000) }),
    ])
    const rows = events.filter(event => event.conversationId === id && event.time >= since)
    const tools = rows.filter(event => event.type === 'tool' && event.status === 'running').map(event => event.toolName)
    observed = { usage: result.usage, textChars: result.text.length, reasoningChars: result.thinking.length,
      hasExpectedMarker: result.text.includes(marker),
      syntheticFactTokens: result.text.match(/\bFACT_[a-z0-9]+\b/gi) ?? [], tools }
    assert.ok(result.text.includes(marker), 'Expected short answer marker')
    assert.equal(result.cancelled, false)
    assert.equal(tools.length, 0, 'Simple question must not revive the old code audit')
    const row = { name, status: 'passed', elapsedMs: Date.now() - since,
      firstTextMs: (rows.find(event => event.type === 'delta')?.time ?? Date.now()) - since,
      reasoningChars: result.thinking.length, tools, usage: result.usage, text: result.text }
    report.cases.push(row)
    console.log(JSON.stringify(row))
    return result
  } catch (error) {
    report.cases.push({ name, status: 'failed', elapsedMs: Date.now() - since, error: error.message, observed })
    await chat.abort(id)
    process.exitCode = 1
    console.log(JSON.stringify(report.cases.at(-1)))
  } finally { clearTimeout(timer) }
}
try {
  const copiedDir = path.join(reportDir, 'dsh/sessions', source.workspace, source.entry.sessionId)
  await fs.cp(source.directory, copiedDir, { recursive: true })
  if (run) {
    for (const file of ['settings.yaml', '.credentials.yaml']) {
      const target = path.join(reportDir, 'dsh', file)
      await fs.copyFile(path.join(originalHome, 'dsh', file), target)
      await fs.chmod(target, 0o600)
    }
  }
  const canonicalHome = await fs.realpath(reportDir)
  const profile = `(version 1) (allow default) (deny file-write*) (allow file-write* (subpath ${JSON.stringify(canonicalHome)}) (literal "/dev/null") (literal "/dev/tty"))`
  manager = createZHostManager({ runtimeRoot, userDataPath: reportDir, executable: process.execPath,
    environment: { ...process.env, TMPDIR: canonicalHome },
    spawnProcess: (executable, args, options) => spawn('/usr/bin/sandbox-exec', ['-p', profile, executable, ...args], options) })
  const { api } = await manager.start()
  const since = Date.now()
  const native = value(await api.sessions.history({ sessionId: source.entry.sessionId, maxMessages: 100_000 }))
  assert.equal(native.hasMore, false, 'Metadata analysis must cover the entire copied history')
  report.history = { readMs: Date.now() - since, ...summarizeHistory(native.events.map(row => row.event)) }
  console.log(JSON.stringify({ status: 'history-inspected', reportDir, ...report.history }))
  if (run) {
    const fork = value(await api.sessions.fork({ sessionId: source.entry.sessionId }))
    const oldId = `old-history-${crypto.randomUUID()}`
    await fs.mkdir(path.join(reportDir, 'taskweaver'), { recursive: true })
    await fs.writeFile(path.join(reportDir, 'taskweaver/dsh-session-map.json'), JSON.stringify({ version: 1,
      sessions: { [oldId]: { sessionId: fork.sessionId, cwd: root, agentPreset: source.entry.agentPreset || 'code',
        ownerConversationId: oldId, lastUsedAt: Date.now() } } }), { mode: 0o600 })
    const profileStore = createProfileStore(originalHome)
    report.modelKey = await profileStore.getActiveModelKey()
    modelService = createModelService({ profileStore, dshHostManager: manager, userDataPath: reportDir,
      dshRuntimeRoot: runtimeRoot, priceRegistryPath: path.join(root, 'pricing/registry.json') })
    chat = createDshChatService({ hostManager: manager, userDataPath: reportDir, modelService, profileStore,
      getWorkspacePath: () => root, getPermissionMode: () => 'ask' })
    heartbeat = setInterval(() => console.log(JSON.stringify({ status: 'running',
      elapsedMs: Date.now() - report.startedAt, completedCases: report.cases.length,
      toolCalls: events.filter(event => event.type === 'tool' && event.status === 'running').length })), 20_000)
    const prompt = '这是一条独立的简单问题，不要继续以前的代码审查或任务，也不要调用任何工具：1 加 1 等于几？只回答数字，再另起一行写 HISTORY_SHORT_OK。'
    if (!compactOnly) {
      await runQuestion('fresh-session-simple-question', `fresh-history-${crypto.randomUUID()}`, prompt)
      await runQuestion('old-long-history-simple-question', oldId, prompt)
      await runQuestion('old-long-history-warm-simple-question', oldId, prompt)
    }
    if (compact && !process.exitCode) {
      // Put a unique fact in the middle of the conversation, then move the
      // retained tail past it. Recall must come from the new checkpoint, not
      // the verbatim latest assistant message.
      const fact = `FACT_${crypto.randomUUID().replaceAll('-', '')}`
      const seeded = await runQuestion('checkpoint-fact-seed', oldId,
        `这不是代码任务，不要调用工具。请记住后续测试的唯一验证码 ${fact}，压缩时也必须保留。只回复 FACT_SAVED。`, 'FACT_SAVED')
      if (!seeded) throw new Error('Fact seed failed; dependent compression and recall requests skipped')
      const separated = await runQuestion('checkpoint-tail-separator', oldId,
        '独立问题，不要调用工具：2 加 2 等于几？只回复 4，再另起一行写 HISTORY_SHORT_OK。')
      if (!separated) throw new Error('Tail separator failed; dependent compression and recall requests skipped')
      const sessionId = chat.getSessionId(oldId)
      const preCompact = value(await api.sessions.history({ sessionId, maxMessages: 100_000 })).events.map(row => row.event)
      const sinceCompact = Date.now()
      let timer
      try {
        const result = await Promise.race([
          chat.send({ conversationId: oldId, text: '/compact', modelKey: report.modelKey, cwdOverride: root }),
          new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Compaction observation deadline (240 seconds)')), 240_000) }),
        ])
        assert.equal(chat.isBusy(oldId), false)
        assert.match(result.text, /Compacted/)
        const postCompact = value(await api.sessions.history({ sessionId, maxMessages: 100_000 })).events.map(row => row.event)
        assert.deepEqual(postCompact.slice(0, preCompact.length), preCompact, 'Original log survives compression')
        const summary = postCompact.slice(preCompact.length).find(row => row.type === 'compaction/summary')
        assert.ok(summary, 'Summary must be committed durably')
        const sourceFact = preCompact.find(row => row.type === 'user/message' && JSON.stringify(row.data).includes(fact))
        assert.ok(sourceFact && summary.data.shadowedSeqs.includes(sourceFact.seq), 'Fact must be inside the replaced span')
        const checkpoint = postCompact.slice(preCompact.length).find(row => row.type === 'user/message')
        const summaryFactPreserved = JSON.stringify(summary.data.summary).includes(fact)
        const checkpointFactPreserved = JSON.stringify(checkpoint?.data).includes(fact)
        assert.equal(postCompact.filter(row => row.type === 'turn/end').length,
          preCompact.filter(row => row.type === 'turn/end').length, 'Compression must not fabricate a chat turn')
        report.cases.push({ name: 'native-old-history-compaction', status: 'passed', elapsedMs: Date.now() - sinceCompact,
          usage: result.usage, shadowedMessages: summary.data.shadowedSeqs?.length,
          shadowedTokenCount: summary.data.shadowedTokenCount, summaryFactPreserved, checkpointFactPreserved,
          factInRawOutput: JSON.stringify(summary.data.rawOutput).includes(fact), durableLogPreserved: true })
        console.log(JSON.stringify(report.cases.at(-1)))
        await runQuestion('checkpoint-fact-recall', oldId,
          '不要调用工具。请写出之前让你记住的唯一验证码，再另起一行写 HISTORY_SHORT_OK。', fact)
        assert.ok(summaryFactPreserved && checkpointFactPreserved, 'Fact must be in the landed checkpoint, not just summary reasoning')
      } catch (error) {
        report.cases.push({ name: 'native-old-history-compaction', status: 'failed', elapsedMs: Date.now() - sinceCompact, error: error.message })
        await chat.abort(oldId)
        process.exitCode = 1
        console.log(JSON.stringify(report.cases.at(-1)))
      } finally { clearTimeout(timer) }
    }
    report.forkSessionId = fork.sessionId
  }
} catch (error) {
  report.failure = error.message
  process.exitCode = 1
  console.error(JSON.stringify({ status: 'failed', error: error.message, reportDir }))
} finally {
  clearInterval(heartbeat)
  try { if (chat) await chat.stop(); else await manager?.stop() }
  finally {
    try { await modelService?.dispose() }
    finally {
      for (const file of ['settings.yaml', '.credentials.yaml']) {
        await fs.unlink(path.join(reportDir, 'dsh', file)).catch(error => { if (error.code !== 'ENOENT') throw error })
      }
      report.sourceUnchanged = JSON.stringify(before) === JSON.stringify(await fingerprint())
      report.elapsedMs = Date.now() - report.startedAt
      // Copied history can contain private messages: retain only aggregate report.
      await fs.rm(path.join(reportDir, 'dsh/sessions'), { recursive: true, force: true })
      await fs.writeFile(path.join(reportDir, 'report.json'), JSON.stringify(report, null, 2), { mode: 0o600 })
      console.log(JSON.stringify({ status: 'completed', reportPath: path.join(reportDir, 'report.json'), sourceUnchanged: report.sourceUnchanged }))
      assert.equal(report.sourceUnchanged, true, 'Original session archive must remain byte-identical')
    }
  }
}
