import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  fetchProxyHealthz,
  parseLoopbackBaseUrl,
} from '../electron/backend/opencodex-health.mjs'
import { ocxSupportsComposerToolContinuation } from '../electron/backend/opencodex-binary.mjs'
import { autoStartOpenCodexIfNeeded, catalogReferencesOpenCodex } from '../electron/backend/opencodex-lifecycle.mjs'

assert.equal(ocxSupportsComposerToolContinuation('2.79.0'), true)
assert.equal(ocxSupportsComposerToolContinuation('2.28.0'), false)
assert.equal(ocxSupportsComposerToolContinuation('opencodex 2.79.0'), true)

const loopback = parseLoopbackBaseUrl('http://127.0.0.1:10100/v1')
assert.deepEqual(loopback, { host: '127.0.0.1', port: 10100 })

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-opencodex-lifecycle-'))
try {
  let ensureCalls = 0
  const ensureProxy = async (modelsPath, options) => {
    ensureCalls += 1
    assert.equal(modelsPath, path.join(tempRoot, 'taskweaver', 'models.json'))
    assert.deepEqual(options, { upgradeGlobalIfStale: false })
    return { up: false, baseUrl: 'http://127.0.0.1:10100/v1', proxyVersion: null, composerContinuationOk: false }
  }
  const catalog = { models: [{ key: 'opencodex/composer-2.5' }], candidateModels: [] }
  assert.equal(catalogReferencesOpenCodex(catalog), true)
  const startup = await autoStartOpenCodexIfNeeded({ userDataPath: tempRoot, catalog, ensureProxy })
  assert.equal(ensureCalls, 1, 'an OpenCodex model must enter the main-process ensure/restart lifecycle once')
  assert.equal(startup.started, false, 'a missing proxy stays reported as not started')
  assert.equal(startup.reason, 'proxy-unreachable')

  const otherCatalog = { models: [{ key: 'anthropic/claude-sonnet' }], candidateModels: [] }
  assert.equal(catalogReferencesOpenCodex(otherCatalog), false)
  const skipped = await autoStartOpenCodexIfNeeded({ userDataPath: tempRoot, catalog: otherCatalog, ensureProxy })
  assert.equal(skipped.reason, 'no-opencodex-models')
  assert.equal(ensureCalls, 1, 'catalogs without OpenCodex models must not restart the proxy')
} finally {
  await fs.rm(tempRoot, { recursive: true, force: true })
}

const health = await fetchProxyHealthz('127.0.0.1', 10100)
if (health.ok) {
  assert.ok(typeof health.version === 'string' || health.version === null)
  console.log('live proxy version:', health.version)
}

console.log('test-opencodex-health: ok')
