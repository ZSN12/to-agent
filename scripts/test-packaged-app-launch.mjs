#!/usr/bin/env node
/** Packaged-app smoke: shell HTTP backend, mock model reads a workspace file. */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const appCandidates = process.argv[2]
  ? [path.resolve(process.argv[2])]
  : [
      ...(process.env.TASKWEAVER_APP_BUNDLE ? [path.resolve(process.env.TASKWEAVER_APP_BUNDLE)] : []),
      path.join(root, 'apps/macos/build/TaskWeaver.app'),
      path.join(root, 'release/mac-arm64/TaskWeaver.app'),
      path.join(root, 'release/mac/TaskWeaver.app'),
      path.join(root, 'release/mac-universal/TaskWeaver.app'),
    ]
const appPath = appCandidates.find((candidate) => fs.existsSync(candidate))
assert.ok(appPath, 'TaskWeaver.app is missing; run pnpm run app:builder first')

const resources = path.join(appPath, 'Contents/Resources')
const hostNode = path.join(resources, 'host-node/bin/node')
const shellEntry = path.join(resources, 'app/backend/shell/run.mjs')
const scheduledRunner = path.join(resources, 'taskweaver-scheduled-runner.mjs')
assert.ok(fs.existsSync(hostNode), `missing bundled Node: ${hostNode}`)
assert.ok(fs.existsSync(shellEntry), `missing shell backend: ${shellEntry}`)
assert.ok(fs.existsSync(scheduledRunner), `missing scheduled-job runner: ${scheduledRunner}`)

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
const shellPort = await freePort()
const env = {
  ...process.env,
  TASKWEAVER_PACKAGED: '1',
  TASKWEAVER_INSECURE_CREDENTIAL_STORE: '1',
  TASKWEAVER_STARTUP_TRACE: '1',
  TASKWEAVER_STARTUP_TRACE_FILE: tracePath,
  TASKWEAVER_USER_DATA: userData,
  TASKWEAVER_SHELL_SERVER: '1',
  TASKWEAVER_SHELL_PORT: String(shellPort),
  TASKWEAVER_SHELL_HOST: '127.0.0.1',
  TASKWEAVER_RESOURCES_PATH: resources,
}
const child = spawn(hostNode, [shellEntry], {
  cwd: path.join(resources, 'app'),
  env,
  stdio: ['ignore', 'pipe', 'pipe'],
})
let logs = ''
child.stdout?.on('data', (chunk) => { logs = `${logs}${chunk}`.slice(-8000) })
child.stderr?.on('data', (chunk) => { logs = `${logs}${chunk}`.slice(-8000) })

async function waitForHealth() {
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Shell backend exited (${child.exitCode})\n${logs}`)
    try {
      const response = await fetch(`http://127.0.0.1:${shellPort}/shell/v1/health`, { signal: AbortSignal.timeout(1_500) })
      if (response.ok) return
    } catch { /* retry */ }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`Timed out waiting for shell backend\n${logs}`)
}

async function invoke(channel, args = []) {
  const response = await fetch(`http://127.0.0.1:${shellPort}/shell/v1/invoke`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ channel, args }),
  })
  const body = await response.json()
  if (!response.ok || body.ok === false) throw new Error(`${channel}: ${body.error ?? response.status}`)
  return body.data
}

async function stopBackend() {
  if (child.exitCode === null) {
    child.kill('SIGTERM')
    await Promise.race([
      new Promise((resolve) => child.once('exit', resolve)),
      new Promise((resolve) => setTimeout(resolve, 5_000)),
    ])
  }
  if (child.exitCode === null) child.kill('SIGKILL')
  await new Promise((resolve) => mockServer.close(() => resolve()))
  await fs.promises.rm(tempRoot, { recursive: true, force: true })
}

try {
  await waitForHealth()
  await invoke('backend:ready')
  await invoke('models:loadBundle')
  await invoke('app:setWorkspace', [workspace])
  await invoke('workspace:setTrust', [true])
  const provider = await invoke('models:upsertCustomProvider', [{
    providerId: 'custom-packaged-smoke',
    name: 'Packaged smoke fixture',
    baseUrl: mockUrl,
    apiKey: 'packaged-smoke-fixture',
    modelId: 'smoke-model',
    api: 'openai-completions',
  }])
  await invoke('models:refresh')
  await invoke('models:add', [provider.modelKey])
  const state = await invoke('app:clearConversation', [{
    workspacePath: workspace,
    permissionMode: 'readonly',
    modelKey: provider.modelKey,
    title: 'Packaged smoke',
  }])
  const conversationId = state?.conversationId
  assert.ok(conversationId, 'new conversation did not return an ID')
  await invoke('chat:send', [
    `${promptMarker} Read smoke-input.txt and answer with its exact contents. Do not change any files.`,
    provider.modelKey,
    null,
    'single-agent',
    'code',
    conversationId,
  ])
  assert.ok(readResultObserved, 'mock model never received the file-read result')
  assert.ok(finalAnswerObserved, 'mock model did not return a final answer after reading the file')
  const trace = await fs.promises.readFile(tracePath, 'utf8').catch(() => '')
  const startupEvents = trace.split('\n').filter(Boolean).map((line) => JSON.parse(line))
    .filter((row) => ['ipc:registration-end', 'models:loadBundle-end'].includes(row.event))
    .map(({ event, elapsedMs }) => `${event}=${elapsedMs}ms`)
  console.log(`test-packaged-app-launch: ok (${path.basename(appPath)}, shell HTTP${startupEvents.length ? `; ${startupEvents.join(', ')}` : ''})`)
} catch (error) {
  throw new Error(`${error instanceof Error ? error.message : String(error)}\nMock requests: ${mockRequestCount}\n${logs}`)
} finally {
  await stopBackend()
}
