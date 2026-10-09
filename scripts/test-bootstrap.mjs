#!/usr/bin/env node
import assert from 'node:assert/strict'
import { createAppBootstrap } from '../electron/backend/bootstrap.mjs'

let startCalls = 0
const bootstrap = createAppBootstrap({
  userData: '/tmp/tw-bootstrap-user',
  appPath: '/tmp/tw-bootstrap-app',
  hostManager: {
    start: async () => { startCalls += 1 },
  },
  profileStore: {},
  modelService: {
    loadModelBundle: async () => ({ catalog: { models: [] } }),
    refreshCatalog: async () => null,
  },
  credentialStore: {},
  modelRegistryUpdater: {
    hydrateStatus: async () => {},
    checkForUpdates: async () => ({ state: 'idle' }),
  },
})

// Monkey-patch migrate functions by testing singleton promise behavior only:
// full integration is covered by test:model-registry / test:z-host-deploy.
const p1 = bootstrap.start()
const p2 = bootstrap.start()
assert.equal(p1, p2, 'bootstrap.start should return the same promise')
await p1.catch(() => {
  // Expected: migrate/host paths invalid in this stub test — still proves dedupe.
})
assert.equal(startCalls, 1, 'bootstrap.start should invoke the host once for concurrent callers')

console.log('test-bootstrap: ok (start deduplication)')
