import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { request as httpRequest } from 'node:http'
import { startShellHttpServer } from '../backend/shell/http-server.mjs'
import { createShellPlatform } from '../backend/platform/shell-platform.mjs'
import { shellEventBus } from '../backend/shell/event-bus.mjs'

const shellEntrySource = await readFile(new URL('../backend/shell/run.mjs', import.meta.url), 'utf8')
const shellModeGuard = shellEntrySource.indexOf("if (process.env.TASKWEAVER_DEV_HTTP !== '1'")
const firstRuntimeImport = shellEntrySource.indexOf("await import('../start-desktop-backend.mjs')")
assert.ok(shellModeGuard >= 0 && firstRuntimeImport > shellModeGuard,
  'the explicit Shell mode guard must run before loading desktop backend dependencies')
assert.doesNotMatch(shellEntrySource, /^import .*\/(?:start-desktop-backend|ensure-opencodex-proxy)\.mjs/m,
  'guarded Shell entry must not statically load backend dependencies')

const environmentWithoutDevHttp = { ...process.env }
delete environmentWithoutDevHttp.TASKWEAVER_DEV_HTTP
delete environmentWithoutDevHttp.TASKWEAVER_PACKAGED
delete environmentWithoutDevHttp.TASKWEAVER_RESOURCES_PATH
const disabledShellEntry = spawnSync(process.execPath, ['backend/shell/run.mjs'], {
  cwd: process.cwd(),
  env: environmentWithoutDevHttp,
  encoding: 'utf8',
})
assert.equal(disabledShellEntry.status, 2, 'Shell HTTP entry must fail closed unless development mode is explicit')
assert.match(disabledShellEntry.stderr, /HTTP backend is available to the Swift shell or dev:browser only/)

function request(url, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(url)
    const req = httpRequest({
      hostname: target.hostname,
      port: target.port,
      path: `${target.pathname}${target.search}`,
      method,
      headers,
    }, (res) => {
      const chunks = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      }))
    })
    req.on('error', reject)
    if (body !== undefined) req.end(body)
    else req.end()
  })
}

const origin = 'http://127.0.0.1:5173'
const authToken = 'test-shell-auth-token-1234567890abcdef'
const previousPackaged = process.env.TASKWEAVER_PACKAGED
process.env.TASKWEAVER_PACKAGED = '1'
try {
  assert.throws(
    () => startShellHttpServer({ authToken: null }),
    /随机访问令牌/,
    'packaged shell servers must fail closed without a launch token',
  )
} finally {
  if (previousPackaged === undefined) delete process.env.TASKWEAVER_PACKAGED
  else process.env.TASKWEAVER_PACKAGED = previousPackaged
}

const previousPackagedForDefaults = process.env.TASKWEAVER_PACKAGED
process.env.TASKWEAVER_PACKAGED = '1'
let packagedDefaultServer
try {
  assert.throws(() => startShellHttpServer({
    authToken,
    developmentUiPort: 5173,
  }), /开发版 UI 跳转只允许/, 'packaged mode cannot expose the development redirect')

  packagedDefaultServer = await startShellHttpServer({
    port: 0,
    host: '127.0.0.1',
    authToken,
  })
} finally {
  if (previousPackagedForDefaults === undefined) delete process.env.TASKWEAVER_PACKAGED
  else process.env.TASKWEAVER_PACKAGED = previousPackagedForDefaults
}
try {
  const packagedOrigin = new URL(packagedDefaultServer.baseUrl).origin
  const packagedPreflight = await request(`${packagedDefaultServer.baseUrl}/shell/v1/invoke`, {
    method: 'OPTIONS',
    headers: {
      Origin: packagedOrigin,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type,x-taskweaver-shell-token',
    },
  })
  assert.equal(packagedPreflight.status, 204)
  assert.equal(packagedPreflight.headers['access-control-allow-origin'], packagedOrigin)

  const devOriginPreflight = await request(`${packagedDefaultServer.baseUrl}/shell/v1/invoke`, {
    method: 'OPTIONS',
    headers: {
      Origin: 'http://127.0.0.1:5173',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type,x-taskweaver-shell-token',
    },
  })
  assert.equal(devOriginPreflight.status, 403, 'packaged defaults must not trust the development server origin')
  assert.equal(devOriginPreflight.headers['access-control-allow-origin'], undefined)
} finally {
  packagedDefaultServer.server.closeAllConnections?.()
  await new Promise((resolve) => packagedDefaultServer.server.close(resolve))
}

const devRedirectServer = await startShellHttpServer({
  port: 0,
  host: '127.0.0.1',
  authToken,
  allowDevelopmentOrigins: true,
  developmentUiPort: 5173,
})
try {
  const devUiEntry = await request(`${devRedirectServer.baseUrl}/__taskweaver/dev-ui`)
  assert.equal(devUiEntry.status, 302)
  assert.equal(devUiEntry.headers['cache-control'], 'no-store')
  const redirectTarget = new URL(devUiEntry.headers.location)
  assert.equal(redirectTarget.origin, 'http://127.0.0.1:5173')
  assert.equal(redirectTarget.searchParams.get('shellApi'), devRedirectServer.baseUrl)
  assert.equal(new URLSearchParams(redirectTarget.hash.slice(1)).get('shellToken'), authToken)
} finally {
  devRedirectServer.server.closeAllConnections?.()
  await new Promise((resolve) => devRedirectServer.server.close(resolve))
}

const { server, baseUrl } = await startShellHttpServer({
  port: 0,
  host: '127.0.0.1',
  allowedOrigins: [origin],
  allowDevelopmentOrigins: false,
  authToken,
  maxRequestBodyBytes: 64,
})
const shellPlatform = createShellPlatform({ platformName: 'linux' })
let authChannelCalls = 0
shellPlatform.ipcMain.handle('test:shellAuth', async (_event, value) => {
  authChannelCalls += 1
  return { value }
})

try {
  const healthChallenge = 'health-probe-challenge'
  const unauthenticatedHealth = await request(`${baseUrl}/shell/v1/health`, {
    headers: { 'X-TaskWeaver-Shell-Challenge': healthChallenge },
  })
  assert.equal(unauthenticatedHealth.status, 200)
  assert.equal(JSON.parse(unauthenticatedHealth.body).proof,
    createHmac('sha256', authToken).update(healthChallenge).digest('hex'),
    'health proves the backend knows the launch token without sending the token to an untrusted listener')

  const health = await request(`${baseUrl}/shell/v1/health`, {
    headers: { 'X-TaskWeaver-Shell-Challenge': 'verified-health-challenge' },
  })
  assert.equal(health.status, 200)
  assert.equal(JSON.parse(health.body).ok, true)
  assert.equal(health.headers['access-control-allow-origin'], undefined)

  const wrongToken = await request(`${baseUrl}/shell/v1/health`, {
    headers: { 'X-TaskWeaver-Shell-Token': 'incorrect-token' },
  })
  assert.equal(wrongToken.status, 400, 'health requires a challenge and never accepts the bearer token')

  const unauthenticatedInvoke = await request(`${baseUrl}/shell/v1/invoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel: 'app:getState' }),
  })
  assert.equal(unauthenticatedInvoke.status, 401, 'local clients cannot invoke channels without the launch token')

  const authorizedInvoke = await request(`${baseUrl}/shell/v1/invoke`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-TaskWeaver-Shell-Token': authToken,
    },
    body: JSON.stringify({ channel: 'test:shellAuth', args: ['authorized'] }),
  })
  assert.equal(authorizedInvoke.status, 200)
  assert.deepEqual(JSON.parse(authorizedInvoke.body), { value: 'authorized' })
  assert.equal(authChannelCalls, 1)

  const unauthenticatedEvents = await request(`${baseUrl}/shell/v1/events`)
  assert.equal(unauthenticatedEvents.status, 401)
  const wrongEventsToken = await request(`${baseUrl}/shell/v1/events`, {
    headers: { 'X-TaskWeaver-Shell-Token': 'incorrect-token' },
  })
  assert.equal(wrongEventsToken.status, 401)

  const eventStreamPromise = openEventStream(`${baseUrl}/shell/v1/events`, {
    'X-TaskWeaver-Shell-Token': authToken,
  })
  const baselinePushListeners = shellEventBus.listenerCount('push')
  const eventStream = await eventStreamPromise
  assert.equal(eventStream.response.statusCode, 200)
  assert.equal(shellEventBus.listenerCount('push'), baselinePushListeners + 1)
  const expectedEvent = { channel: 'test:sse', payload: { ok: true } }
  const eventReceived = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('SSE event timed out')), 1000)
    eventStream.response.on('data', (chunk) => {
      if (!String(chunk).includes(JSON.stringify(expectedEvent))) return
      clearTimeout(timer)
      resolve()
    })
  })
  shellEventBus.emit('push', expectedEvent)
  await eventReceived
  const streamClosed = new Promise((resolve) => eventStream.response.once('close', resolve))
  eventStream.request.destroy()
  await streamClosed
  await waitFor(() => shellEventBus.listenerCount('push') === baselinePushListeners)
  assert.equal(shellEventBus.listenerCount('push'), baselinePushListeners, 'closing SSE releases its event-bus listener')

  const preflight = await request(`${baseUrl}/shell/v1/invoke`, {
    method: 'OPTIONS',
    headers: {
      Origin: origin,
      'Access-Control-Request-Headers': 'content-type, x-taskweaver-shell-token',
    },
  })
  assert.equal(preflight.status, 204)
  assert.equal(preflight.headers['access-control-allow-origin'], origin)
  assert.match(preflight.headers['access-control-allow-headers'], /x-taskweaver-shell-token/i)

  const rejectedOrigin = await request(`${baseUrl}/shell/v1/invoke`, {
    method: 'OPTIONS',
    headers: { Origin: 'https://evil.example' },
  })
  assert.equal(rejectedOrigin.status, 403)
  assert.equal(rejectedOrigin.headers['access-control-allow-origin'], undefined)

  const rejectedNullOrigin = await request(`${baseUrl}/shell/v1/invoke`, {
    method: 'POST',
    headers: { Origin: 'null', 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel: 'app:getState' }),
  })
  assert.equal(rejectedNullOrigin.status, 403)

  const rejectedHost = await request(`${baseUrl}/shell/v1/health`, {
    headers: { Host: `evil.example:${new URL(baseUrl).port}` },
  })
  assert.equal(rejectedHost.status, 403)

  const oversizedBody = await request(`${baseUrl}/shell/v1/invoke`, {
    method: 'POST',
    headers: {
      Origin: origin,
      'Content-Type': 'application/json',
      'X-TaskWeaver-Shell-Token': authToken,
    },
    body: JSON.stringify({ channel: 'app:getState', args: ['x'.repeat(100)] }),
  })
  assert.equal(oversizedBody.status, 413)

  // This test checks the fallback response without opening a real native dialog
  // on macOS test hosts.
  const dialog = shellPlatform.dialog
  assert.deepEqual(await dialog.showMessageBox(null, {
    buttons: ['使用本机凭据', '取消'],
    cancelId: 1,
  }), { response: 1 })
  assert.deepEqual(await dialog.showMessageBox(null, {
    buttons: ['使用本机凭据', '取消'],
  }), { response: 1 })
  assert.deepEqual(await dialog.showMessageBox(null, {
    buttons: ['确定'],
  }), { response: 0 })

  assert.throws(() => startShellHttpServer({ host: '0.0.0.0' }), /loopback/)
} finally {
  server.closeAllConnections?.()
  await new Promise((resolve) => server.close(resolve))
}

console.log('shell-http-guard: ok')

async function waitFor(predicate, timeoutMs = 1000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  assert.ok(predicate(), 'timed out waiting for condition')
}

function openEventStream(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(url)
    const req = httpRequest({
      hostname: target.hostname,
      port: target.port,
      path: `${target.pathname}${target.search}`,
      headers,
    }, (response) => resolve({ request: req, response }))
    req.on('error', reject)
    req.end()
  })
}
