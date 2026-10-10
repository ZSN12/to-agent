import assert from 'node:assert/strict'
import { createModelDirectoryClient } from '../desktop/backend/model/directory-client.mjs'

let providerCalls = 0
let starts = 0
let stops = 0
let resolveOldProviders
const oldProviders = new Promise((resolve) => { resolveOldProviders = resolve })
const api = {
  llm: {
    providers: async () => {
      providerCalls += 1
      return providerCalls === 1 ? oldProviders : { providers: [{ provider: 'fresh', active: true }] }
    },
    models: async () => ({ groups: [{ id: 'fresh', models: [{ id: 'model' }] }], failures: [] }),
  },
  settings: { async describe() { return { namespaces: [] } } },
}
const dshHostManager = {
  async start() { starts += 1; return { api } },
  async stop() { stops += 1 },
}
const directoryClient = createModelDirectoryClient({ dshHostManager })

const oldRequest = directoryClient.getDshModelDirectory()
while (providerCalls === 0) await new Promise((resolve) => setTimeout(resolve, 0))
directoryClient.invalidateModelDirectoryCache()
const freshRequest = directoryClient.getDshModelDirectory()
const freshDirectory = await freshRequest
assert.equal(freshDirectory.providers[0].provider, 'fresh')
resolveOldProviders({ providers: [{ provider: 'stale', active: true }] })
await oldRequest
const cachedDirectory = await directoryClient.getDshModelDirectory()
assert.equal(cachedDirectory.providers[0].provider, 'fresh', 'an invalidated in-flight request cannot repopulate the cache')
assert.equal(starts, 2, 'concurrent readers share each in-flight directory request')

await directoryClient.reloadDshHostAfterCredentialChange()
assert.equal(stops, 0, 'credential updates do not stop Host')
assert.equal(starts, 2, 'credential invalidation does not restart Host')
const afterCredentialChange = await directoryClient.getDshModelDirectory()
assert.equal(afterCredentialChange.providers[0].provider, 'fresh')
assert.equal(starts, 3, 'the next read revalidates the directory')
console.log('model directory invalidation checks passed: single-flight, generation guard, credential hot apply')
