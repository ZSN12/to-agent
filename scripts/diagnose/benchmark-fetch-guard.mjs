/**
 * Fail-closed network and request-budget guard for isolated live benchmarks.
 *
 * Activate in the Host process with:
 *   TASKWEAVER_BENCHMARK_GUARD=1
 *   TASKWEAVER_BENCHMARK_GUARD_DIR=/private/shared/attempt-slots
 *   NODE_OPTIONS="--import=/absolute/path/to/benchmark-fetch-guard.mjs"
 *
 * The slot directory must be unique to one baseline/candidate comparison and
 * shared by every Host process in that comparison. Slot contents deliberately
 * contain no request, URL, header, credential, or prompt data.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { isIP } from 'node:net'

export const BENCHMARK_MODEL = 'gpt-6-luna'
export const MAX_OUTPUT_TOKENS = 2_048
export const MAX_ATTEMPTS = 280
export const MAX_CONTEXT_TOKENS = 272_000
export const INPUT_RESERVE_USD_PER_MILLION = 0.125
export const OUTPUT_USD_PER_MILLION = 0.50
export const RESERVED_USD_PER_ATTEMPT = Number((
  MAX_CONTEXT_TOKENS * INPUT_RESERVE_USD_PER_MILLION / 1_000_000
  + MAX_OUTPUT_TOKENS * OUTPUT_USD_PER_MILLION / 1_000_000
).toFixed(6))

const CODEX_HOST = 'chatgpt.com'
const CODEX_PATH = '/backend-api/codex/responses'
const INSTALL_MARKER = Symbol.for('taskweaver.benchmark-fetch-guard')

function guardError(reason) {
  return new Error(`benchmark fetch guard: ${reason}`)
}

function normalizedHostname(hostname) {
  return hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1).toLowerCase()
    : hostname.toLowerCase()
}

/** Only literal loopback addresses and the conventional localhost name pass. */
function isLoopbackHostname(hostname) {
  const host = normalizedHostname(hostname)
  if (host === 'localhost' || host === '::1') return true
  if (isIP(host) !== 4) return false
  const octets = host.split('.').map(Number)
  return octets.length === 4 && octets[0] === 127
}

function isAllowedCodexEndpoint(url) {
  return url.protocol === 'https:'
    && url.hostname.toLowerCase() === CODEX_HOST
    && (url.port === '' || url.port === '443')
    && url.pathname === CODEX_PATH
    && url.username === ''
    && url.password === ''
    && url.hash === ''
}

function requestFrom(input, init) {
  try {
    // Manual redirects ensure a permitted endpoint cannot silently redirect
    // fetch to an unapproved external host without passing this guard again.
    return new Request(input, { ...init, redirect: 'manual' })
  } catch {
    throw guardError('invalid request')
  }
}

function isJsonContentType(value) {
  return typeof value === 'string' && /^application\/json(?:\s*;|\s*$)/i.test(value)
}

async function reserveAttemptSlot(budgetDirectory, maxAttempts = MAX_ATTEMPTS) {
  if (typeof budgetDirectory !== 'string' || budgetDirectory.length === 0) {
    throw guardError('shared attempt budget is not configured')
  }

  try {
    await fs.mkdir(budgetDirectory, { recursive: true, mode: 0o700 })
  } catch {
    throw guardError('could not reserve shared attempt budget')
  }

  for (let sequence = 1; sequence <= maxAttempts; sequence += 1) {
    const filename = `attempt-${String(sequence).padStart(3, '0')}.json`
    const slotPath = path.join(budgetDirectory, filename)
    let handle
    try {
      // wx is O_CREAT | O_EXCL: concurrent Host processes cannot reserve the
      // same attempt, and an incomplete file still consumes its slot safely.
      handle = await fs.open(slotPath, 'wx', 0o600)
      await handle.writeFile(`${JSON.stringify({
        timestamp: new Date().toISOString(),
        sequence,
        reservedUsd: RESERVED_USD_PER_ATTEMPT,
      })}\n`, 'utf8')
      await handle.close()
      return sequence
    } catch (error) {
      await handle?.close().catch(() => {})
      if (error?.code === 'EEXIST') continue
      throw guardError('could not reserve shared attempt budget')
    }
  }

  throw guardError('shared attempt budget exhausted')
}

async function guardedExternalRequest(request, options) {
  if (!isAllowedCodexEndpoint(new URL(request.url))) {
    throw guardError('external endpoint is not allowlisted')
  }
  if (request.method !== 'POST') throw guardError('Codex endpoint requires POST')
  if (!isJsonContentType(request.headers.get('content-type'))) {
    throw guardError('Codex request must use application/json')
  }
  const contentEncoding = request.headers.get('content-encoding')
  if (contentEncoding && contentEncoding.toLowerCase() !== 'identity') {
    throw guardError('encoded request bodies are not supported')
  }

  let body
  try {
    body = JSON.parse(await request.clone().text())
  } catch {
    throw guardError('Codex request body must be valid JSON')
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw guardError('Codex request body must be a JSON object')
  }
  if (body.model !== BENCHMARK_MODEL) throw guardError('model is not the fixed benchmark model')
  if (Object.hasOwn(body, 'max_tokens') || Object.hasOwn(body, 'max_completion_tokens')) {
    throw guardError('unsupported output-token field')
  }
  if (body.max_output_tokens !== undefined
    && (!Number.isSafeInteger(body.max_output_tokens) || body.max_output_tokens < 1)) {
    throw guardError('max_output_tokens must be a positive integer')
  }

  body.max_output_tokens = Math.min(body.max_output_tokens ?? MAX_OUTPUT_TOKENS, MAX_OUTPUT_TOKENS)
  const headers = new Headers(request.headers)
  // The rewritten JSON may have a different byte length.
  headers.delete('content-length')
  let boundedRequest
  try {
    boundedRequest = new Request(request, {
      body: JSON.stringify(body),
      headers,
      redirect: 'manual',
    })
  } catch {
    throw guardError('could not bound Codex request')
  }

  await reserveAttemptSlot(options.budgetDirectory, options.maxAttempts)
  return boundedRequest
}

/**
 * Create a guarded fetch function. The injectable fetch and attempt limit are
 * test seams; import-time Host activation always uses the fixed limit of 280.
 */
export function createBenchmarkFetchGuard({
  fetchImpl = globalThis.fetch,
  budgetDirectory = process.env.TASKWEAVER_BENCHMARK_GUARD_DIR,
  maxAttempts = MAX_ATTEMPTS,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function')
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > MAX_ATTEMPTS) {
    throw new TypeError(`maxAttempts must be an integer from 1 to ${MAX_ATTEMPTS}`)
  }

  return async function benchmarkGuardedFetch(input, init) {
    const request = requestFrom(input, init)
    const url = new URL(request.url)

    if (isLoopbackHostname(url.hostname)) return fetchImpl(request)
    if (!isAllowedCodexEndpoint(url)) throw guardError('external endpoint is not allowlisted')

    const boundedRequest = await guardedExternalRequest(request, { budgetDirectory, maxAttempts })
    return fetchImpl(boundedRequest)
  }
}

/** Install the process-wide guard once; returns the wrapped global fetch. */
export function installBenchmarkFetchGuard(options = {}) {
  if (globalThis[INSTALL_MARKER]) return globalThis.fetch
  const guardedFetch = createBenchmarkFetchGuard(options)
  Object.defineProperty(globalThis, INSTALL_MARKER, { value: true, configurable: false })
  globalThis.fetch = guardedFetch
  return guardedFetch
}

// NODE_OPTIONS --import runs this module before Host application code. The
// explicit switch prevents an unrelated import from silently changing fetch.
if (process.env.TASKWEAVER_BENCHMARK_GUARD === '1') {
  installBenchmarkFetchGuard()
}
