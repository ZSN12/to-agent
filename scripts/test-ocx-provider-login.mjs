import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { startOcxProviderLogin } from '../backend/model-sync/ocx-cli.mjs'
import { runTaskWeaverCli } from '../vendor/opencodex/src/cli/taskweaver.ts'

function mockChild({ afterSpawn } = {}) {
  const child = new EventEmitter()
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  child.pid = 2468
  child.unref = () => {}
  child.kill = () => true
  queueMicrotask(() => {
    child.emit('spawn')
    afterSpawn?.(child)
  })
  return child
}

{
  const url = 'https://cursor.com/loginDeepControl?challenge=public-test-value'
  const opened = []
  const child = mockChild({ afterSpawn: (process) => {
    // Split the marker and URL across chunks to cover pipe chunk boundaries.
    process.stdout.write('TASKWEAVER_AUTH_URL https://cursor.com/loginDeep')
    process.stdout.write('Control?challenge=public-test-value\n')
  } })
  const result = await startOcxProviderLogin('cursor', {
    executable: '/test/ocx',
    spawnImpl: () => child,
    openExternal: async (value) => { opened.push(value) },
    timeoutMs: 250,
  })
  assert.deepEqual(opened, [url])
  assert.equal(result.loginUrl, url)
  assert.match(result.message, /默认浏览器打开授权页/)
  child.stdout.end()
  child.stderr.end()
  child.emit('close', 0, null)
}

{
  const child = mockChild({ afterSpawn: (process) => {
    process.stdout.write('TASKWEAVER_AUTH_URL https://evil.example/login?x=1\n')
  } })
  await assert.rejects(
    startOcxProviderLogin('cursor', {
      executable: '/test/ocx',
      spawnImpl: () => child,
      openExternal: async () => assert.fail('untrusted URL must not open'),
      timeoutMs: 250,
    }),
    /不受支持的授权地址/,
  )
  child.stdout.end()
  child.stderr.end()
  child.emit('close', 1, null)
}

{
  const child = mockChild({ afterSpawn: (process) => {
    process.emit('error', Object.assign(new Error('missing executable'), { code: 'ENOENT' }))
  } })
  await assert.rejects(
    startOcxProviderLogin('google-antigravity', {
      executable: '/test/ocx',
      spawnImpl: () => child,
      openExternal: async () => assert.fail('browser must not open after spawn failure'),
      timeoutMs: 250,
    }),
    /重新安装应用/,
  )
  child.stdout.end()
  child.stderr.end()
  child.emit('close', -2, null)
}

{
  const child = mockChild({ afterSpawn: (process) => {
    process.stdout.write('TASKWEAVER_AUTH_URL https://accounts.google.com/o/oauth2/v2/auth?client_id=public-test-value\n')
  } })
  await assert.rejects(
    startOcxProviderLogin('google-antigravity', {
      executable: '/test/ocx',
      spawnImpl: () => child,
      openExternal: async () => { throw new Error('browser launcher unavailable') },
      timeoutMs: 250,
    }),
    /系统未能打开登录浏览器/,
  )
  child.stdout.end()
  child.stderr.end()
  child.emit('close', 1, null)
}

await assert.rejects(
  startOcxProviderLogin('unsupported-provider'),
  /不支持此本地官方 Agent 登录方式/,
)

{
  const child = mockChild({ afterSpawn: (process) => {
    process.stdout.end('ERROR: provider login unavailable; access_token=public-test-secret\n')
    setImmediate(() => child.emit('close', 1, null))
  } })
  await assert.rejects(
    startOcxProviderLogin('cursor', {
      executable: '/test/ocx',
      spawnImpl: () => child,
      openExternal: async () => assert.fail('browser must not open without an authorization URL'),
      timeoutMs: 250,
    }),
    (error) => {
      assert.match(error.message, /provider login unavailable/)
      assert.doesNotMatch(error.message, /public-test-secret/)
      assert.doesNotMatch(error.message, /access_token=/)
      return true
    },
  )
}

{
  const oldHostOpen = process.env.TASKWEAVER_HOST_OPENS_LOGIN_URL
  const logs = []
  let automaticBrowserOpen = false
  const originalLog = console.log
  const originalError = console.error
  process.env.TASKWEAVER_HOST_OPENS_LOGIN_URL = '1'
  console.log = (...args) => logs.push(args.join(' '))
  console.error = (...args) => logs.push(args.join(' '))
  try {
    await runTaskWeaverCli(['login', 'cursor'], {
      loginCursorImpl: async (controller) => {
        controller.onAuth?.({
          url: 'https://cursor.com/loginDeepControl?challenge=public-test-value',
          instructions: 'complete the test login',
        })
        return { refresh: 'test-refresh', access: 'test-access', expires: Date.now() + 60_000 }
      },
      saveCredentialImpl: async () => {},
      openUrlImpl: async () => {
        automaticBrowserOpen = true
        return { status: 'started' }
      },
    })
  } finally {
    console.log = originalLog
    console.error = originalError
    if (oldHostOpen === undefined) delete process.env.TASKWEAVER_HOST_OPENS_LOGIN_URL
    else process.env.TASKWEAVER_HOST_OPENS_LOGIN_URL = oldHostOpen
  }
  assert.match(logs.join('\n'), /TASKWEAVER_AUTH_URL https:\/\/cursor\.com\/loginDeepControl/)
  assert.equal(automaticBrowserOpen, false, 'the desktop Host must own opening the login URL')
}

console.log('test-ocx-provider-login: ok')
