#!/usr/bin/env node
/** Packaged-app smoke: launch, wait for IPC, read a workspace file through a mock model, exit. */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const appCandidates = [
  path.join(root, 'release/mac-arm64/TaskWeaver.app'),
  path.join(root, 'release/mac/TaskWeaver.app'),
  path.join(root, 'release/mac-universal/TaskWeaver.app'),
]
const appPath = appCandidates.find((candidate) => fs.existsSync(candidate))
assert.ok(appPath, 'TaskWeaver.app is missing; run npm run app:builder first')
const binary = path.join(appPath, 'Contents/MacOS/TaskWeaver')
assert.ok(fs.existsSync(binary), `missing binary: ${binary}`)

const tempRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'taskweaver-packaged-smoke-'))
const userData = path.join(tempRoot, 'userData')
const workspace = path.join(tempRoot, 'workspace')
const tracePath = path.join(tempRoot, 'startup-trace.jsonl')
const marker = 'TASKWEAVER_PACKAGED_FILE_READ_OK'
const promptMarker = '[TASKWEAVER_PACKAGED_SMOKE]'
await fs.promises.mkdir(workspace, { recursive: true })
await fs.promises.writeFile(path.join(workspace, 'smoke-input.txt'), `${marker}\n`, 'utf8')

async function freePort() {
  const server = net.createServer()
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  return port
}

function sendText(response, text) {
  response.writeHead(200, { 'content-type': 'text/event-stream' })
  response.end([
    `data: ${JSON.stringify({ choices: [{ delta: { role: 'assistant', content: text }, index: 0, finish_reason: null }] })}\n\n`,
    'data: {"choices":[{"delta":{},"index":0,"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":2}}\n\n',
    'data: [DONE]\n\n',
  ].join(''))
}

function sendToolCall(response, id, name, args) {
  response.writeHead(200, { 'content-type': 'text/event-stream' })
  response.end([
    `data: ${JSON.stringify({ choices: [{ delta: { role: 'assistant', tool_calls: [{ index: 0, id, type: 'function', function: { name, arguments: JSON.stringify(args) } }] }, index: 0, finish_reason: null }] })}\n\n`,
    'data: {"choices":[{"delta":{},"index":0,"finish_reason":"tool_calls"}]}\n\n',
    'data: [DONE]\n\n',
  ].join(''))
}

let readResultObserved = false
let finalAnswerObserved = false
let mockRequestCount = 0
const mockServer = http.createServer((request, response) => {
  mockRequestCount += 1
  let body = ''
  request.on('data', (chunk) => { body += chunk.toString('utf8') })
  request.on('end', () => {
    if (!request.url?.endsWith('/chat/completions')) {
      response.writeHead(404).end()
      return
    }
    let payload
    try { payload = JSON.parse(body) } catch {
      response.writeHead(400).end('invalid JSON')
      return
    }
    const messages = Array.isArray(payload.messages) ? payload.messages : []
    const serialized = JSON.stringify(payload)
    const titleRequest = serialized.includes('Create a concise title for an AI coding-assistant session')
    const toolNames = (payload.tools ?? []).map((tool) => tool.function?.name ?? tool.name)
    const readResult = messages.find((item) => item.role === 'tool' && JSON.stringify(item).includes(marker))
    if (readResult) {
      readResultObserved = true
      finalAnswerObserved = true
      sendText(response, `File contents: ${marker}`)
    } else if (!titleRequest && serialized.includes(promptMarker) && toolNames.includes('read')) {
      sendToolCall(response, 'packaged-smoke-read', 'read', { file_path: 'smoke-input.txt' })
    } else if (!titleRequest && serialized.includes(promptMarker) && toolNames.includes('run_code')) {
      sendToolCall(response, 'packaged-smoke-read', 'run_code', {
        description: 'Read the smoke fixture',
        code: 'const result = await tools.read({ file_path: "smoke-input.txt" }); console.log(result);',
      })
    } else {
      sendText(response, titleRequest ? 'Packaged smoke test' : 'Mock provider ready')
    }
  })
})

await new Promise((resolve, reject) => mockServer.once('error', reject).listen(0, '127.0.0.1', resolve))
const mockUrl = `http://127.0.0.1:${mockServer.address().port}/v1`
const debugPort = await freePort()
const env = { ...process.env, TASKWEAVER_PACKAGED: '1', TASKWEAVER_STARTUP_TRACE: '1', TASKWEAVER_STARTUP_TRACE_FILE: tracePath }
delete env.ELECTRON_RUN_AS_NODE
const child = spawn(binary, [
  `--user-data-dir=${userData}`,
  `--remote-debugging-port=${debugPort}`,
  '--remote-debugging-address=127.0.0.1',
], { env, stdio: ['ignore', 'pipe', 'pipe'] })
let logs = ''
child.stdout?.on('data', (chunk) => { logs = `${logs}${chunk}`.slice(-8000) })
child.stderr?.on('data', (chunk) => { logs = `${logs}${chunk}`.slice(-8000) })
let socket = null

async function waitForPage() {
  const deadline = Date.now() + 90000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`TaskWeaver exited during startup (${child.exitCode})\n${logs}`)
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`, { signal: AbortSignal.timeout(1000) })
      const targets = await response.json()
      const page = targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl)
      if (page) return page
    } catch { /* DevTools endpoint is not ready yet. */ }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`Timed out waiting for TaskWeaver renderer\n${logs}`)
}

function connectDevTools(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    const pending = new Map()
    let nextId = 0
    const onOpen = () => resolve({
      async send(method, params = {}, timeoutMs = 30000) {
        const id = ++nextId
        return new Promise((done, fail) => {
          const timer = setTimeout(() => {
            pending.delete(id)
            fail(new Error(`DevTools command timed out: ${method}`))
          }, timeoutMs)
          pending.set(id, { done, fail, timer })
          ws.send(JSON.stringify({ id, method, params }))
        })
      },
      close() { ws.close() },
      ws,
      pending,
    })
    ws.addEventListener('open', onOpen, { once: true })
    ws.addEventListener('error', () => reject(new Error('Cannot connect to packaged app DevTools')), { once: true })
    ws.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data))
      const row = pending.get(message.id)
      if (!row) return
      pending.delete(message.id)
      clearTimeout(row.timer)
      if (message.error) row.fail(new Error(message.error.message))
      else row.done(message.result)
    })
    ws.addEventListener('close', () => {
      for (const row of pending.values()) {
        clearTimeout(row.timer)
        row.fail(new Error('Packaged app DevTools connection closed'))
      }
      pending.clear()
    })
  })
}

async function evaluate(devtools, expression, timeoutMs = 30000) {
  const result = await devtools.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    timeout: timeoutMs,
  }, timeoutMs + 5000)
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text)
  }
  return result.result?.value
}

async function stopApp() {
  if (socket) {
    await socket.send('Browser.close').catch(() => {})
    socket.close()
  }
  if (child.exitCode === null) {
    child.kill('SIGTERM')
    await Promise.race([
      new Promise((resolve) => child.once('exit', resolve)),
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ])
  }
  if (child.exitCode === null) child.kill('SIGKILL')
  await new Promise((resolve) => mockServer.close(() => resolve()))
  await fs.promises.rm(tempRoot, { recursive: true, force: true })
}

try {
  const page = await waitForPage()
  socket = await connectDevTools(page.webSocketDebuggerUrl)
  await socket.send('Runtime.enable')
  await evaluate(socket, `(() => {
    const api = window.taskweaver
    if (!api) throw new Error('TaskWeaver preload API is unavailable')
    return true
  })()`)
  const expression = `(async () => {
    const check = async (label, promise) => {
      const result = await promise
      if (!result?.ok) throw new Error(label + ': ' + (result?.error || 'unknown failure'))
      return result.data
    }
    const workspace = ${JSON.stringify(workspace)}
    await check('Host readiness', window.taskweaver.backendReady())
    await check('model and Host bootstrap', window.taskweaver.models.loadBundle())
    await check('workspace setup', window.taskweaver.app.setWorkspace(workspace))
    await check('workspace trust', window.taskweaver.workspace.setTrust(true))
    const provider = await check('mock provider setup', window.taskweaver.models.upsertCustomProvider({
      providerId: 'custom-packaged-smoke',
      name: 'Packaged smoke fixture',
      baseUrl: ${JSON.stringify(mockUrl)},
      apiKey: 'packaged-smoke-fixture',
      modelId: 'smoke-model',
      api: 'openai-completions',
    }))
    await check('mock model directory refresh', window.taskweaver.models.refresh())
    await check('mock model activation', window.taskweaver.models.add(provider.modelKey))
    const state = await check('new readonly conversation', window.taskweaver.app.clearConversation({
      workspacePath: workspace,
      permissionMode: 'readonly',
      modelKey: provider.modelKey,
      title: 'Packaged smoke',
    }))
    const conversationId = state.conversationId
    if (!conversationId) throw new Error('new conversation did not return an ID')
    await check('mock chat', window.taskweaver.chat.send(
      ${JSON.stringify(`${promptMarker} Read smoke-input.txt and answer with its exact contents. Do not change any files.`)},
      provider.modelKey,
      null,
      'single-agent',
      'code',
      conversationId,
    ))
    return conversationId
  })()`
  const conversationId = await evaluate(socket, expression, 180000)
  assert.ok(conversationId, 'packaged smoke did not create a conversation')
  assert.ok(readResultObserved, 'mock model never received the file-read result')
  assert.ok(finalAnswerObserved, 'mock model did not return a final answer after reading the file')
  const trace = await fs.promises.readFile(tracePath, 'utf8').catch(() => '')
  const startupEvents = trace.split('\n').filter(Boolean).map((line) => JSON.parse(line))
    .filter((row) => ['main:module-start', 'app:ready', 'window:did-finish-load', 'ipc:registration-end', 'models:loadBundle-end'].includes(row.event))
    .map(({ event, elapsedMs }) => `${event}=${elapsedMs}ms`)
  console.log(`test-packaged-app-launch: ok (${path.basename(appPath)}, file read via mock provider${startupEvents.length ? `; ${startupEvents.join(', ')}` : ''})`)
} catch (error) {
  throw new Error(`${error instanceof Error ? error.message : String(error)}\nMock requests: ${mockRequestCount}\n${logs}`)
} finally {
  await stopApp()
}
