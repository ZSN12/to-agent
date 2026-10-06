import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createZHostManager } from '../electron/agent/z-host/index.mjs'
import { createDshChatService } from '../electron/backend/dsh-chat-service.mjs'
import { createModelService } from '../electron/backend/model-service.mjs'
import { createProfileStore } from '../electron/backend/profile-store.mjs'

// Real provider requests: invoke explicitly; never attach to user-owned sessions.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
if (!process.argv.includes('--installed') && !process.argv.includes('--local')) {
  throw new Error('Pass --installed or --local; this test makes real model requests')
}
const focusedOnly = process.argv.includes('--focused-only')
const modelArgIndex = process.argv.indexOf('--model')
const requestedModelKey = modelArgIndex < 0 ? null : process.argv[modelArgIndex + 1]
if (modelArgIndex >= 0 && (!requestedModelKey || requestedModelKey.startsWith('--'))) {
  throw new Error('Pass a model key after --model')
}
const runtimeRoot = process.argv.includes('--installed')
  ? '/Applications/TaskWeaver.app/Contents/Resources/taskweaver-z-runtime'
  : path.join(root, 'vendor/taskweaver-z-runtime')
const originalHome = path.join(os.homedir(), 'Library/Application Support/taskweaver-desktop')
const reportDir = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-lifecycle-smoke-'))
const report = { runtimeRoot, cwd: root, startedAt: Date.now(), cases: [], observations: [] }
const events = []
let manager
let chat
let modelService
let api
let heartbeat

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))
async function waitFor(predicate, label, timeoutMs = 240_000) {
  const end = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() >= end) throw new Error(`Test observation deadline: ${label}`)
    await sleep(100)
  }
}
function bounded(promise, label) {
  let timer
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Test observation deadline: ${label}`)), 240_000) }),
  ]).finally(() => clearTimeout(timer))
}
function connection(expectedId) {
  return {
    isDestroyed: () => false,
    send(channel, event) {
      if (channel !== 'chat:stream') return
      const row = { time: Date.now(), expectedId, busyAtEmission: chat.isBusy(expectedId), ...event }
      events.push(row)
      if (['start', 'done', 'error', 'tool'].includes(event.type)) {
        console.log(JSON.stringify({ conversationId: event.conversationId, type: event.type,
          tool: event.toolName, status: event.status, busyAtEmission: row.busyAtEmission }))
      }
    },
  }
}
function options(id, text) {
  return { conversationId: id, text, modelKey: report.modelKey, cwdOverride: root,
    agentPreset: 'taskweaver-readonly', webContents: connection(id) }
}
function caseEvents(id, since) {
  return events.filter(event => event.expectedId === id && event.time >= since)
}
function metrics(id, since) {
  const stream = caseEvents(id, since)
  return { elapsedMs: Date.now() - since,
    firstTextMs: stream.find(event => event.type === 'delta')?.time - since || null,
    tools: stream.filter(event => event.type === 'tool' && event.status === 'running').map(event => event.toolName),
    errors: stream.filter(event => event.type === 'error' || (event.type === 'tool' && event.status === 'error')).map(event => event.message || event.resultSummary),
    retries: stream.filter(event => event.type === 'retry').length,
    misroutedEvents: stream.filter(event => event.conversationId !== id).length }
}
async function history(id) {
  const reply = await api.sessions.history({ sessionId: chat.getSessionId(id) })
  assert.equal(reply.result?.ok, true)
  return reply.result.value.events.map(row => row.event)
}
async function runCase(name, run) {
  const startedAt = Date.now()
  try {
    const data = await run(startedAt)
    const row = { name, status: 'passed', ...data }
    report.cases.push(row)
    console.log(JSON.stringify({ case: name, ...row }))
  } catch (error) {
    const row = { name, status: 'failed', elapsedMs: Date.now() - startedAt, error: error.message }
    report.cases.push(row)
    console.log(JSON.stringify(row))
    await chat.abort()
    process.exitCode = 1
  }
  await fs.writeFile(path.join(reportDir, 'report.json'), JSON.stringify(report, null, 2))
}

try {
  await fs.mkdir(path.join(reportDir, 'dsh'), { recursive: true })
  for (const file of ['settings.yaml', '.credentials.yaml']) {
    const target = path.join(reportDir, 'dsh', file)
    try {
      await fs.copyFile(path.join(originalHome, 'dsh', file), target)
      await fs.chmod(target, 0o600)
    } catch (error) { if (error.code !== 'ENOENT') throw error }
  }
  manager = createZHostManager({ runtimeRoot, userDataPath: reportDir, executable: process.execPath })
  ;({ api } = await manager.start())
  const profileStore = createProfileStore(originalHome)
  report.modelKey = requestedModelKey ?? await profileStore.getActiveModelKey()
  assert.ok(report.modelKey)
  if (requestedModelKey) {
    assert.ok((await profileStore.listAddedModelKeys()).includes(requestedModelKey),
      `Requested smoke-test model is not added to TaskWeaver: ${requestedModelKey}`)
  }
  modelService = createModelService({ profileStore, dshHostManager: manager,
    userDataPath: reportDir, dshRuntimeRoot: runtimeRoot, priceRegistryPath: path.join(root, 'pricing/registry.json') })
  chat = createDshChatService({ hostManager: manager, userDataPath: reportDir, modelService, profileStore,
    getWorkspacePath: () => root, getPermissionMode: () => 'ask' })
  console.log(JSON.stringify({ status: 'starting', reportDir, modelKey: report.modelKey, runtimeRoot }))
  heartbeat = setInterval(() => console.log(JSON.stringify({ status: 'running', elapsedMs: Date.now() - report.startedAt,
    completedCases: report.cases.length, toolCalls: events.filter(event => event.type === 'tool' && event.status === 'running').length })), 20_000)

  if (!focusedOnly) {
    await runCase('greeting-without-tools', async since => {
      const id = `greeting-${crypto.randomUUID()}`
      const result = await bounded(chat.send(options(id, '你好，只用一句中文问候回复，不要调用工具。')), 'greeting')
      const data = metrics(id, since)
      assert.ok(result.text.trim())
      assert.equal(data.tools.length, 0, 'greeting should not inspect the repository')
      return { ...data, text: result.text }
    })
  }

  const focusedId = `focused-${crypto.randomUUID()}`
  await runCase('focused-file-read', async since => {
    const result = await bounded(chat.send(options(focusedId, '只读取当前工作区 package.json，原样列出 scripts.build 的命令，最后另起一行写 FOCUS_OK。不要读取其他文件，不要修改文件。')), 'focused read', 120_000)
    const expected = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8')).scripts.build
    for (const part of expected.split(' && ')) assert.ok(result.text.includes(part), `missing actual build command: ${part}`)
    const data = metrics(focusedId, since)
    assert.ok(data.tools.length > 0, 'must really invoke a file tool')
    assert.equal(data.misroutedEvents, 0)
    return { ...data, text: result.text }
  })
  if (!focusedOnly) {
  await runCase('follow-up-retains-history', async since => {
    const result = await bounded(chat.send(options(focusedId, '不需要再读取文件：我上一条让你在最后写的标记是什么？只回答那个标记。')), 'follow-up')
    assert.ok(result.text.includes('FOCUS_OK'), 'follow-up must retain previous request context')
    const data = metrics(focusedId, since)
    assert.equal(data.tools.length, 0, 'history question should not re-read files')
    const native = await history(focusedId)
    assert.equal(native.filter(event => event.type === 'turn/end').length, 2, 'both original turns must remain in native history')
    return { ...data, text: result.text }
  })

  await runCase('parallel-independent-sessions', async since => {
    const jobs = [
      { id: `parallel-A-${crypto.randomUUID()}`, marker: `PA_${crypto.randomUUID()}`, file: 'src/main.tsx' },
      { id: `parallel-B-${crypto.randomUUID()}`, marker: `PB_${crypto.randomUUID()}`, file: 'electron/main.cjs' },
    ]
    const results = await bounded(Promise.all(jobs.map(job => chat.send(options(job.id,
      `只读取 ${job.file} 前80行，用一句中文说明这个入口文件的作用。只读，不检查其他文件。最后另起一行写 ${job.marker}。`)))), 'parallel sessions')
    const rows = results.map((result, index) => {
      const job = jobs[index]
      const data = metrics(job.id, since)
      assert.ok(result.text.includes(job.marker))
      assert.ok(!result.text.includes(jobs[1 - index].marker), 'other session answer must not leak into this result')
      assert.equal(data.misroutedEvents, 0, 'all stream events must stay on their own connection')
      return { id: job.id, ...data, text: result.text }
    })
    const starts = jobs.map(job => caseEvents(job.id, since).find(event => event.type === 'start')?.time)
    const ends = jobs.map(job => caseEvents(job.id, since).find(event => event.type === 'done')?.time)
    assert.ok(starts.every(Boolean) && ends.every(Boolean))
    const overlapped = Math.max(...starts) < Math.min(...ends)
    assert.equal(overlapped, true, 'both session lifecycles must overlap')
    return { elapsedMs: Date.now() - since, overlapped, sessions: rows }
  })

  await runCase('queued-follow-up-preserves-both-turns', async since => {
    const id = `queued-${crypto.randomUUID()}`
    const firstMarker = `FIRST_${crypto.randomUUID()}`
    const nextMarker = `NEXT_${crypto.randomUUID()}`
    const firstPromise = bounded(chat.send(options(id,
      `只读取 src/main.tsx 和 electron/main.cjs 各前80行，用两句话解释各自作用。只读，末尾写 ${firstMarker}。`)), 'queued first turn')
    // Attach a rejection handler before waiting for stream activity.
    firstPromise.catch(() => {})
    await waitFor(() => caseEvents(id, since).some(event => ['activity', 'thinking_delta', 'tool'].includes(event.type)) && chat.isBusy(id), 'first turn activity')
    const accepted = await chat.send(options(id,
      `不用再读文件。只告诉我上一条要求的末尾标记，并在最后写 ${nextMarker}。`))
    assert.equal(accepted.queued, true, 'busy follow-up must be queued, not replace the first turn')
    const first = await firstPromise
    await waitFor(() => !chat.isBusy(id) && caseEvents(id, since).filter(event => event.type === 'done').length >= 2, 'queued completion')
    const completed = caseEvents(id, since).filter(event => event.type === 'done')
    assert.ok(first.text.includes(firstMarker))
    assert.ok(completed[0].full.includes(firstMarker))
    assert.ok(completed[1].full.includes(firstMarker) && completed[1].full.includes(nextMarker))
    const native = await history(id)
    assert.equal(native.filter(event => event.type === 'turn/end').length, 2)
    assert.equal(completed[0].continuing, true, 'first done must retain queued run state')
    assert.equal(completed[1].continuing, false, 'last done must finish the run')
    assert.ok(completed[0].turnId && completed[1].turnId)
    assert.notEqual(completed[0].turnId, completed[1].turnId)
    assert.equal(first.turnId, completed[0].turnId)
    const intermediateDone = completed[0]
    if (intermediateDone.busyAtEmission && !intermediateDone.continuing) {
      report.observations.push({ severity: 'warning', case: 'queued-follow-up-preserves-both-turns',
        message: 'Backend emits done for the first turn while a queued turn is still running, without a continuation flag. Native answers are retained, but consumers treating every done as session completion can clear UI running state early.' })
    }
    return { ...metrics(id, since), accepted, completedTurns: completed.map(event => ({ text: event.full, turnId: event.turnId, busyAtEmission: event.busyAtEmission, continuing: event.continuing ?? null })) }
  })
  }
  report.elapsedMs = Date.now() - report.startedAt
  console.log(JSON.stringify({ status: 'completed', reportPath: path.join(reportDir, 'report.json'), elapsedMs: report.elapsedMs,
    cases: report.cases.map(({ name, status, elapsedMs }) => ({ name, status, elapsedMs })), observations: report.observations }))
} catch (error) {
  report.failure = error.message
  process.exitCode = 1
  console.error(JSON.stringify({ status: 'failed', reportDir, error: error.message }))
} finally {
  clearInterval(heartbeat)
  try {
    if (chat) await chat.stop()
    else await manager?.stop()
  } finally {
    try { await modelService?.dispose() }
    finally {
      for (const file of ['.credentials.yaml', 'settings.yaml']) {
        await fs.unlink(path.join(reportDir, 'dsh', file)).catch(error => { if (error.code !== 'ENOENT') throw error })
      }
      await fs.writeFile(path.join(reportDir, 'report.json'), JSON.stringify(report, null, 2))
    }
  }
}
