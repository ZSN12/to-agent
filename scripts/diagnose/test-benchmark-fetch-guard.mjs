import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import { zstdCompressSync } from 'node:zlib'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  BENCHMARK_MODEL,
  MAX_ATTEMPTS,
  MAX_OUTPUT_TOKENS,
  RESERVED_USD_PER_ATTEMPT,
  createBenchmarkFetchGuard,
  installBenchmarkWebSocketGuard,
} from './benchmark-fetch-guard.mjs'

const modulePath = fileURLToPath(new URL('./benchmark-fetch-guard.mjs', import.meta.url))
const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'tw-benchmark-fetch-guard-'))

function requestBody(overrides = {}) {
  return {
    model: BENCHMARK_MODEL,
    input: 'fixture input; never sent to the network',
    ...overrides,
  }
}

function endpointRequest(body = requestBody(), options = {}) {
  const headers = new Headers({ 'content-type': options.contentType ?? 'application/json' })
  if (options.contentEncoding) headers.set('content-encoding', options.contentEncoding)
  return new Request(options.url ?? 'https://chatgpt.com/backend-api/codex/responses', {
    method: options.method ?? 'POST',
    headers,
    body: options.rawBody ?? JSON.stringify(body),
  })
}

function fixtureFetch(recorder) {
  return async (request) => {
    recorder.push(request)
    return new Response('fixture response', { status: 200 })
  }
}

function runReservationWorker({ directory, moduleUrl, callCount, maxAttempts }) {
  const source = `
    const { createBenchmarkFetchGuard } = await import(process.env.GUARD_MODULE_URL)
    const guarded = createBenchmarkFetchGuard({
      fetchImpl: async () => new Response('fixture response', { status: 200 }),
      budgetDirectory: process.env.GUARD_DIRECTORY,
      maxAttempts: Number(process.env.GUARD_MAX_ATTEMPTS),
    })
    const request = () => new Request('https://chatgpt.com/backend-api/codex/responses', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-6-luna', input: 'fixture', max_output_tokens: 2048 }),
    })
    const results = await Promise.allSettled(
      Array.from({ length: Number(process.env.GUARD_CALL_COUNT) }, () => guarded(request())),
    )
    process.stdout.write(JSON.stringify({
      fulfilled: results.filter(result => result.status === 'fulfilled').length,
      rejected: results.filter(result => result.status === 'rejected').length,
    }))
  `
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', source], {
      env: {
        PATH: process.env.PATH ?? '',
        GUARD_MODULE_URL: moduleUrl,
        GUARD_DIRECTORY: directory,
        GUARD_CALL_COUNT: String(callCount),
        GUARD_MAX_ATTEMPTS: String(maxAttempts),
      },
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    let stdout = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', chunk => { stdout += chunk })
    child.once('error', () => reject(new Error('reservation worker failed to start')))
    child.once('exit', (code) => {
      if (code !== 0) return reject(new Error(`reservation worker exited with ${code}`))
      try { resolve(JSON.parse(stdout)) }
      catch { reject(new Error('reservation worker returned invalid fixture output')) }
    })
  })
}

async function expectRejected(promise, pattern) {
  await assert.rejects(promise, (error) => {
    assert.match(error.message, pattern)
    // Guard diagnostics must not echo URL/body/header material.
    assert.doesNotMatch(error.message, /chatgpt\.com|Authorization|Bearer|fixture input/i)
    return true
  })
}

try {
  assert.equal(MAX_ATTEMPTS, 280)
  assert.equal(MAX_OUTPUT_TOKENS, 2_048)
  assert.equal(RESERVED_USD_PER_ATTEMPT, 0.035024)
  assert.ok(RESERVED_USD_PER_ATTEMPT * MAX_ATTEMPTS < 10)

  // `NODE_OPTIONS=--import=...` activates the same process-global patch before
  // the Host entry point runs. The probe does not issue any network request.
  const probe = spawnSync(process.execPath, ['-e', `
    const marker = Symbol.for('taskweaver.benchmark-fetch-guard')
    if (globalThis[marker] !== true || globalThis.fetch.name !== 'benchmarkGuardedFetch') process.exit(19)
  `], {
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH ?? '',
      NODE_OPTIONS: `--import=${modulePath}`,
      TASKWEAVER_BENCHMARK_GUARD: '1',
      TASKWEAVER_BENCHMARK_GUARD_DIR: path.join(tempRoot, 'import-probe'),
    },
  })
  assert.equal(probe.status, 0, `NODE_OPTIONS preload failed with exit ${probe.status}`)
  assert.equal(probe.stdout, '')
  assert.equal(probe.stderr, '')

  // Output cap is installed before the fake transport is called; smaller caps
  // stay smaller and redirects remain manual to prevent an external escape.
  {
    const directory = path.join(tempRoot, 'output-cap')
    const sent = []
    const guardedFetch = createBenchmarkFetchGuard({ fetchImpl: fixtureFetch(sent), budgetDirectory: directory })
    await guardedFetch(endpointRequest(requestBody({ max_output_tokens: 9_999 })))
    await guardedFetch(endpointRequest(requestBody({ max_output_tokens: 777 })))
    await guardedFetch(endpointRequest())

    const bodies = await Promise.all(sent.map(async (request) => JSON.parse(await request.clone().text())))
    assert.deepEqual(bodies.map((body) => body.max_output_tokens), [2_048, 777, 2_048])
    assert.ok(sent.every((request) => request.redirect === 'manual'))
    assert.ok(sent.every((request) => request.headers.get('content-length') === null))
  }

  // The Codex SSE implementation may compress larger JSON payloads with
  // zstd. The guard decompresses before inspection and sends the bounded body
  // uncompressed so it never guesses at model or token fields.
  {
    const directory = path.join(tempRoot, 'zstd')
    const sent = []
    const guardedFetch = createBenchmarkFetchGuard({ fetchImpl: fixtureFetch(sent), budgetDirectory: directory })
    const compressed = zstdCompressSync(Buffer.from(JSON.stringify(requestBody({ max_output_tokens: 9_999 }))))
    const request = new Request('https://chatgpt.com/backend-api/codex/responses', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-encoding': 'zstd' },
      body: compressed,
    })
    await guardedFetch(request)
    const sentBody = JSON.parse(await sent[0].clone().text())
    assert.equal(sentBody.max_output_tokens, MAX_OUTPUT_TOKENS)
    assert.equal(sent[0].headers.get('content-encoding'), null)
    assert.equal(sent[0].headers.get('content-length'), null)
    await expectRejected(guardedFetch(endpointRequest(requestBody(), { contentEncoding: 'gzip' })), /encoded request bodies/)
    assert.equal(sent.length, 1)
  }

  // Loopback is allowed for Host IPC and consumes no billable attempt slot.
  {
    const directory = path.join(tempRoot, 'loopback')
    const sent = []
    const guardedFetch = createBenchmarkFetchGuard({ fetchImpl: fixtureFetch(sent), budgetDirectory: directory })
    await guardedFetch(new Request('http://127.0.0.1:43123/health'))
    await guardedFetch(new Request('http://[::1]:43123/rpc'))
    await guardedFetch(new Request('http://localhost:43123/rpc'))
    assert.equal(sent.length, 3)
    await assert.rejects(fs.readdir(directory), { code: 'ENOENT' })
  }

  // The Codex client defaults to WebSocket. Benchmarks set the provider profile
  // to SSE, and the process-global WebSocket guard fails closed if that setting
  // is ignored; local Host RPC remains available.
  {
    const previousDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'WebSocket')
    const marker = Symbol.for('taskweaver.benchmark-websocket-guard')
    class FakeWebSocket {
      constructor(url, options) { this.url = String(url); this.options = options }
    }
    try {
      globalThis.WebSocket = FakeWebSocket
      const guarded = installBenchmarkWebSocketGuard({ WebSocketImpl: FakeWebSocket })
      assert.throws(() => new guarded('wss://chatgpt.com/backend-api/codex/responses'), /external WebSocket transport is disabled/)
      assert.throws(() => new guarded('wss://example.com/socket'), /external WebSocket transport is disabled/)
      assert.throws(() => new guarded('https://localhost/socket'), /protocol is not allowlisted/)
      assert.throws(() => new guarded('not a URL'), /invalid WebSocket URL/)
      const local = new globalThis.WebSocket('ws://127.0.0.1:43123/rpc', { headers: { fixture: 'only' } })
      assert.equal(local.url, 'ws://127.0.0.1:43123/rpc')
      assert.deepEqual(local.options, { headers: { fixture: 'only' } })
      assert.equal(globalThis[marker], true)
    } finally {
      if (previousDescriptor) Object.defineProperty(globalThis, 'WebSocket', previousDescriptor)
      else delete globalThis.WebSocket
      delete globalThis[marker]
    }
  }

  // Disallowed hosts, paths, protocols, methods, content types, and model ids
  // fail before the fake transport or the shared budget is touched.
  {
    const directory = path.join(tempRoot, 'rejections')
    const sent = []
    const guardedFetch = createBenchmarkFetchGuard({ fetchImpl: fixtureFetch(sent), budgetDirectory: directory })
    for (const url of [
      'https://example.com/backend-api/codex/responses',
      'https://notchatgpt.com/backend-api/codex/responses',
      'http://chatgpt.com/backend-api/codex/responses',
      'https://chatgpt.com/backend-api/codex/responses/extra',
      'https://chatgpt.com:444/backend-api/codex/responses',
    ]) {
      await expectRejected(guardedFetch(endpointRequest(requestBody(), { url })), /not allowlisted/)
    }
    await expectRejected(guardedFetch(endpointRequest(requestBody({ model: 'gpt-6-sol' }))), /fixed benchmark model/)
    await expectRejected(guardedFetch(endpointRequest(requestBody(), { method: 'PUT' })), /requires POST/)
    await expectRejected(guardedFetch(endpointRequest(requestBody(), { contentType: 'text/plain' })), /application\/json/)
    await expectRejected(guardedFetch(endpointRequest(requestBody({ max_output_tokens: 0 }))), /positive integer/)
    await expectRejected(guardedFetch(endpointRequest(requestBody({ max_tokens: 99_999 }))), /unsupported output-token field/)
    await expectRejected(guardedFetch(endpointRequest(requestBody(), { rawBody: '{broken' })), /valid JSON/)
    assert.equal(sent.length, 0)
    await assert.rejects(fs.readdir(directory), { code: 'ENOENT' })
  }

  // Parallel processes race on O_EXCL-created sequence slots. Exactly the
  // configured fixture allowance reaches fake fetch; each slot is sanitized.
  {
    const directory = path.join(tempRoot, 'parallel')
    const sent = []
    const guardedFetch = createBenchmarkFetchGuard({
      fetchImpl: fixtureFetch(sent),
      budgetDirectory: directory,
      maxAttempts: 7,
    })
    const outcomes = await Promise.allSettled(
      Array.from({ length: 19 }, () => guardedFetch(endpointRequest())),
    )
    assert.equal(outcomes.filter((result) => result.status === 'fulfilled').length, 7)
    assert.equal(outcomes.filter((result) => result.status === 'rejected').length, 12)
    assert.equal(sent.length, 7)

    const files = (await fs.readdir(directory)).sort()
    assert.deepEqual(files, Array.from({ length: 7 }, (_, index) => `attempt-${String(index + 1).padStart(3, '0')}.json`))
    const slots = await Promise.all(files.map(async (filename) => {
      const text = await fs.readFile(path.join(directory, filename), 'utf8')
      const slot = JSON.parse(text)
      assert.deepEqual(Object.keys(slot).sort(), ['reservedUsd', 'sequence', 'timestamp'])
      assert.equal(slot.reservedUsd, RESERVED_USD_PER_ATTEMPT)
      assert.match(slot.timestamp, /^\d{4}-\d\d-\d\dT/)
      assert.doesNotMatch(text, /chatgpt\.com|https?:|Authorization|Bearer|fixture input/i)
      return slot
    }))
    assert.deepEqual(slots.map((slot) => slot.sequence).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7])
    await expectRejected(guardedFetch(endpointRequest()), /budget exhausted/)
    assert.equal(sent.length, 7)
  }

  // Separate Node processes share the same O_EXCL slot directory. This is the
  // cross-process case used by paired baseline/candidate Hosts.
  {
    const directory = path.join(tempRoot, 'cross-process')
    const workers = await Promise.all(Array.from({ length: 5 }, () => runReservationWorker({
      directory,
      moduleUrl: new URL('./benchmark-fetch-guard.mjs', import.meta.url).href,
      callCount: 8,
      maxAttempts: 17,
    })))
    assert.equal(workers.reduce((sum, result) => sum + result.fulfilled, 0), 17)
    assert.equal(workers.reduce((sum, result) => sum + result.rejected, 0), 23)
    const files = (await fs.readdir(directory)).sort()
    assert.equal(files.length, 17)
    const sequences = await Promise.all(files.map(async (filename) => {
      const slot = JSON.parse(await fs.readFile(path.join(directory, filename), 'utf8'))
      assert.deepEqual(Object.keys(slot).sort(), ['reservedUsd', 'sequence', 'timestamp'])
      assert.equal(slot.reservedUsd, RESERVED_USD_PER_ATTEMPT)
      return slot.sequence
    }))
    assert.deepEqual(sequences.sort((a, b) => a - b), Array.from({ length: 17 }, (_, index) => index + 1))
  }

  // Production default is exactly 280 attempts; a missing budget directory
  // must fail closed even for the otherwise allowed public endpoint.
  {
    const sent = []
    const guardedFetch = createBenchmarkFetchGuard({ fetchImpl: fixtureFetch(sent), budgetDirectory: null })
    await expectRejected(guardedFetch(endpointRequest()), /not configured/)
    assert.equal(sent.length, 0)
  }

  process.stdout.write('benchmark fetch guard fixture tests passed\n')
} finally {
  await fs.rm(tempRoot, { recursive: true, force: true })
}
