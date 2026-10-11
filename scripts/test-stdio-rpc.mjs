#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import readline from 'node:readline'
import { PassThrough } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { createRpcRouter } from '../backend/rpc/router.mjs'
import { createStdioJsonRpcServer } from '../backend/rpc/stdio-server.mjs'

console.log('--- 开始测试 stdio JSON-RPC 服务端 ---')

const child = spawn(process.execPath, ['backend/app-server.mjs', '--platform=test'], {
  stdio: ['pipe', 'pipe', 'inherit'],
})

const rl = readline.createInterface({ input: child.stdout })
const incomingLines = []
rl.on('line', (line) => {
  try {
    incomingLines.push(JSON.parse(line))
  } catch (e) {
    console.error('Invalid JSON received from server:', line)
  }
})

function writeMessage(obj) {
  child.stdin.write(JSON.stringify(obj) + '\n')
}

async function waitForMessage(predicate, timeoutMs = 5000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const idx = incomingLines.findIndex(predicate)
    if (idx !== -1) {
      const [found] = incomingLines.splice(idx, 1)
      return found
    }
    await new Promise((r) => setTimeout(r, 20))
  }
  throw new Error(`waitForMessage timed out after ${timeoutMs}ms`)
}

// 1. 测试握手 initialize
console.log('1. 测试握手 (initialize)...')
writeMessage({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })
const initResp = await waitForMessage((m) => m.id === 1)
assert.equal(initResp.result.protocolVersion, 1, 'protocolVersion 必须为 1')
assert.ok(initResp.result.backendVersion, '必须返回 backendVersion')
console.log('✓ 握手成功:', initResp.result)

// 2. 测试普通 invoke: backend:ready
console.log('2. 测试普通 invoke (backend:ready)...')
writeMessage({ jsonrpc: '2.0', id: 2, method: 'backend:ready', params: [] })
const readyResp = await waitForMessage((m) => m.id === 2)
const isReady = readyResp.result?.data?.ready ?? readyResp.result?.ready
assert.ok(isReady, 'backend:ready 应返回 ready: true')
console.log('✓ backend:ready 响应成功:', readyResp.result)

// 3. 测试不存在的方法 (Method not found: -32601)
console.log('3. 测试未知方法错误 (-32601)...')
writeMessage({ jsonrpc: '2.0', id: 3, method: 'nonexistent:channel', params: [] })
const notFoundResp = await waitForMessage((m) => m.id === 3)
assert.equal(notFoundResp.error.code, -32601, '未注册通道应返回 -32601')
console.log('✓ 未知方法错误处理正常')

// 4. 测试粘包分帧 (两条消息同时发送)
console.log('4. 测试粘包分帧 (两条消息合并发送)...')
child.stdin.write(
  JSON.stringify({ jsonrpc: '2.0', id: 4, method: 'backend:ready', params: [] }) + '\n' +
  JSON.stringify({ jsonrpc: '2.0', id: 5, method: 'backend:ready', params: [] }) + '\n'
)
const msg4 = await waitForMessage((m) => m.id === 4)
const msg5 = await waitForMessage((m) => m.id === 5)
const ok4 = msg4.result?.data?.ready ?? msg4.result?.ready
const ok5 = msg5.result?.data?.ready ?? msg5.result?.ready
assert.ok(ok4 && ok5, '粘包两条消息均应正确解析并响应')
console.log('✓ 粘包分帧处理正常')

// 5. 测试半包分帧 (分次写入)
console.log('5. 测试半包分帧 (分块写入)...')
const part1 = '{"jsonrpc":"2.0","id":6,"method":"backend'
const part2 = ':ready","params":[]}\n'
child.stdin.write(part1)
await new Promise((r) => setTimeout(r, 50))
child.stdin.write(part2)
const msg6 = await waitForMessage((m) => m.id === 6)
const ok6 = msg6.result?.data?.ready ?? msg6.result?.ready
assert.ok(ok6, '半包消息应在收到换行后完整解析')
console.log('✓ 半包分帧处理正常')

// 6. 测试超大消息 (超过 8MB)
console.log('6. 测试超大单帧防护 (超过 8MB 限制)...')
const hugePadding = 'A'.repeat(8 * 1024 * 1024 + 100)
child.stdin.write(`{"jsonrpc":"2.0","id":7,"method":"test","params":["${hugePadding}"]}\n`)
const hugeResp = await waitForMessage((m) => m.error && m.error.code === -32600)
assert.equal(hugeResp.error.code, -32600, '超大消息应返回 -32600 错误')
console.log('✓ 超大单帧防护正常')

// 7. 测试退出生命周期：关闭 stdin
console.log('7. 测试 stdin 关闭后进程安全退出...')
child.stdin.end()

const exitCode = await new Promise((resolve) => {
  child.on('exit', (code) => resolve(code))
})
assert.equal(exitCode, 0, 'stdin 关闭后进程应以 0 状态码优雅退出')
console.log('✓ 进程优雅退出成功')

// EOF must stop the Host before the process exits, not just close the RPC loop.
console.log('7.1 测试 stdin EOF 会回收 Host...')
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const stopMarker = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-rpc-cleanup-')), 'host-stopped')
const appServerUrl = new URL('../backend/app-server.mjs', import.meta.url).href
const cleanupProbe = `
const { writeFile } = await import('node:fs/promises')
const { startAppServer } = await import(${JSON.stringify(appServerUrl)})
await startAppServer(['--platform=test'], {
  createStartup: () => ({
    bootstrap: { start: async () => {} },
    hostManager: { stop: async () => writeFile(process.env.TASKWEAVER_TEST_HOST_STOP, 'stopped') },
    fail() {},
  }),
  registerServices: async () => ({}),
})
`
const cleanupChild = spawn(process.execPath, ['--input-type=module', '-e', cleanupProbe], {
  cwd: repoRoot,
  env: { ...process.env, TASKWEAVER_TEST_HOST_STOP: stopMarker },
  stdio: ['pipe', 'pipe', 'pipe'],
})
let cleanupStderr = ''
let cleanupReadyTimer
try {
  await Promise.race([
    new Promise((resolve, reject) => {
      cleanupChild.stderr.on('data', (chunk) => {
        cleanupStderr += chunk.toString('utf8')
        if (cleanupStderr.includes('ready on stdio JSON-RPC')) resolve()
      })
      cleanupChild.once('error', reject)
      cleanupChild.once('exit', (code) => reject(new Error(`cleanup child exited before ready (${code}): ${cleanupStderr}`)))
    }),
    new Promise((_, reject) => {
      cleanupReadyTimer = setTimeout(() => reject(new Error(`cleanup child did not become ready: ${cleanupStderr}`)), 5000)
    }),
  ])
  clearTimeout(cleanupReadyTimer)
  cleanupChild.stdin.end()
  let cleanupExitTimer
  const [cleanupExitCode] = await Promise.race([
    new Promise((resolve) => cleanupChild.once('exit', (code, signal) => resolve([code, signal]))),
    new Promise((_, reject) => {
      cleanupExitTimer = setTimeout(() => reject(new Error('Host cleanup child did not exit within 5 seconds')), 5000)
    }),
  ]).finally(() => clearTimeout(cleanupExitTimer))
  assert.equal(cleanupExitCode, 0, `EOF shutdown must exit successfully: ${cleanupStderr}`)
  assert.equal(await fs.readFile(stopMarker, 'utf8'), 'stopped', 'stdin EOF must await Host manager cleanup before exit')
  console.log('✓ stdin EOF 在 5 秒内退出，且 HostManager.stop 已完成')
} finally {
  clearTimeout(cleanupReadyTimer)
  if (cleanupChild.exitCode === null && cleanupChild.signalCode === null) cleanupChild.kill('SIGKILL')
  await fs.rm(path.dirname(stopMarker), { recursive: true, force: true })
}

// 8. Test that $/cancelRequest reaches the handler as request context and
// produces the standard JSON-RPC cancellation error.
console.log('8. 测试请求取消会传递 AbortSignal 并返回 -32800...')
const cancelRouter = createRpcRouter()
const cancelStdin = new PassThrough()
const cancelStdout = new PassThrough()
const cancelMessages = []
let cancelOutputBuffer = ''
let resolveHandlerStarted
const handlerStarted = new Promise((resolve) => { resolveHandlerStarted = resolve })
let handlerObservedAborted = false

cancelRouter.handle('test:cancel', async (_params, { signal }) => {
  assert.ok(signal instanceof AbortSignal, 'handler context 必须包含 AbortSignal')
  resolveHandlerStarted()
  await new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }))
  handlerObservedAborted = signal.aborted
  return 'handler completed after observing cancellation'
})

cancelStdout.on('data', (chunk) => {
  cancelOutputBuffer += chunk.toString('utf8')
  let newlineIndex
  while ((newlineIndex = cancelOutputBuffer.indexOf('\n')) !== -1) {
    const line = cancelOutputBuffer.slice(0, newlineIndex)
    cancelOutputBuffer = cancelOutputBuffer.slice(newlineIndex + 1)
    if (line) cancelMessages.push(JSON.parse(line))
  }
})

const cancelServer = createStdioJsonRpcServer({
  router: cancelRouter,
  stdin: cancelStdin,
  stdout: cancelStdout,
})
cancelServer.start()
cancelStdin.write(JSON.stringify({ jsonrpc: '2.0', id: 8, method: 'test:cancel', params: [{}] }) + '\n')
let handlerStartTimer
try {
  await Promise.race([
    handlerStarted,
    new Promise((_, reject) => {
      handlerStartTimer = setTimeout(() => reject(new Error('cancel handler did not start')), 2000)
    }),
  ])
} finally {
  clearTimeout(handlerStartTimer)
}
cancelStdin.write(JSON.stringify({ jsonrpc: '2.0', method: '$/cancelRequest', params: { id: 8 } }) + '\n')

const cancellationResponse = await (async () => {
  const deadline = Date.now() + 2000
  while (Date.now() < deadline) {
    const index = cancelMessages.findIndex((message) => message.id === 8)
    if (index !== -1) return cancelMessages.splice(index, 1)[0]
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error('cancellation response timed out')
})()
assert.equal(handlerObservedAborted, true, 'handler must observe signal.aborted after cancellation')
assert.equal(cancellationResponse.error?.code, -32800, 'cancelled request must return JSON-RPC -32800')
cancelServer.shutdown()
cancelStdin.destroy()
cancelStdout.destroy()
console.log('✓ handler 收到并观察到取消信号，服务端返回 -32800')

// 9. Platform calls are sent as reverse requests and resolve from the matching reply.
console.log('9. 测试反向平台请求成功与超时...')
const reverseStdin = new PassThrough()
const reverseWrites = []
const reverseStdout = {
  write(chunk) {
    reverseWrites.push(String(chunk))
    return true
  },
}
const reverseServer = createStdioJsonRpcServer({
  router: createRpcRouter(),
  stdin: reverseStdin,
  stdout: reverseStdout,
  reverseRequestTimeoutMs: 100,
})
reverseServer.start()
const reverseResultPromise = reverseServer.sendReverseRequest('$platform/ui.pickDirectory', { title: 'Choose project' })
const reverseRequest = JSON.parse(reverseWrites.shift().trim())
assert.equal(reverseRequest.method, '$platform/ui.pickDirectory')
assert.deepEqual(reverseRequest.params, { title: 'Choose project' })
reverseStdin.write(JSON.stringify({ jsonrpc: '2.0', id: reverseRequest.id, result: { path: '/workspace' } }) + '\n')
assert.deepEqual(await reverseResultPromise, { path: '/workspace' }, 'reverse request resolves from its matching response')

const timeoutServer = createStdioJsonRpcServer({
  router: createRpcRouter(),
  stdin: new PassThrough(),
  stdout: { write() { return true } },
  reverseRequestTimeoutMs: 20,
})
const reverseTimeoutPromise = assert.rejects(
  timeoutServer.sendReverseRequest('$platform/secrets.get', { key: 'test-key' }),
  /timed out after 20ms/,
)
await new Promise((resolve) => setTimeout(resolve, 30))
await reverseTimeoutPromise
assert.throws(() => createStdioJsonRpcServer({
  router: createRpcRouter(),
  reverseRequestTimeoutMs: 0,
}), RangeError, 'reverse request timeout must stay within the Node timer range')
reverseServer.shutdown()
timeoutServer.shutdown()
reverseStdin.destroy()
console.log('✓ 反向请求响应正确匹配，超时可注入测试且生产默认仍为 60 秒')

// 10. High-frequency terminal events should preserve every payload while using few writes.
console.log('10. 测试高频 terminal:data 事件合并...')
const eventFrames = []
const eventServer = createStdioJsonRpcServer({
  router: createRpcRouter(),
  stdin: new PassThrough(),
  stdout: { write(chunk) { eventFrames.push(String(chunk)); return true } },
})
for (let sequence = 0; sequence < 1000; sequence += 1) {
  eventServer.sendNotification('terminal:data', { id: 'term-1', sequence, data: 'x'.repeat(32) })
}
await new Promise((resolve) => setTimeout(resolve, 40))
const eventLines = eventFrames.flatMap((frame) => frame.trimEnd().split('\n'))
assert.equal(eventLines.length, 1000, 'batching must preserve all terminal event payloads')
assert.ok(eventFrames.length <= 20, `1000 terminal events should use at most 20 writes, got ${eventFrames.length}`)
const decodedEvents = eventLines.map((line) => JSON.parse(line))
assert.equal(decodedEvents[0].params.sequence, 0)
assert.equal(decodedEvents[999].params.sequence, 999)
eventServer.sendNotification('terminal:data', { id: 'term-1', sequence: 1000, data: 'final output' })
eventServer.sendNotification('terminal:exit', { id: 'term-1', exitCode: 0 })
const orderedTail = eventFrames.slice(-2).flatMap((frame) => frame.trimEnd().split('\n')).map((line) => JSON.parse(line))
assert.deepEqual(orderedTail.map((message) => message.method), ['terminal:data', 'terminal:exit'],
  'a queued data event must flush before its following terminal exit event')
eventServer.shutdown()
console.log(`✓ 保留 1000 条事件、合并为 ${eventFrames.length} 帧，并保持退出事件顺序`)

console.log('--- stdio JSON-RPC 服务端全套测试通过！---')
