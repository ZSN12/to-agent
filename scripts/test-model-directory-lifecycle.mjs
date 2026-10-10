import assert from 'node:assert/strict'
import { createModelDirectoryClient } from '../desktop/backend/model/directory-client.mjs'

const ok = (value) => ({ result: { ok: true, value } })

function makeApi({ failFirstProviderRead = false } = {}) {
  let providerReads = 0
  const api = {
    llm: {
      async providers() {
        providerReads += 1
        if (failFirstProviderRead && providerReads === 1) throw new Error('temporary directory transport error')
        return ok({ providers: [{ provider: 'deepseek', active: true }] })
      },
      async models() { return ok({ groups: [{ id: 'deepseek', models: [{ id: 'v4' }] }], failures: [] }) },
    },
    settings: {
      async describe() { return ok({ namespaces: [{ ns: 'llm-pi-ai' }] }) },
    },
  }
  return { api, getProviderReads: () => providerReads }
}

{
  const { api } = makeApi()
  let readyCalls = 0
  let startCalls = 0
  const client = createModelDirectoryClient({
    dshHostManager: {
      state: 'ready',
      whenReady: async () => { readyCalls += 1; return { api } },
      start: async () => { startCalls += 1; throw new Error('start() should not be used when whenReady() exists') },
    },
  })
  const result = await client.getDshModelDirectory()
  assert.equal(result.groups[0].models[0].id, 'v4')
  assert.equal(readyCalls, 1)
  assert.equal(startCalls, 0)
}

{
  const { api, getProviderReads } = makeApi({ failFirstProviderRead: true })
  let readyCalls = 0
  const client = createModelDirectoryClient({
    dshHostManager: {
      state: 'ready',
      whenReady: async () => { readyCalls += 1; return { api } },
    },
  })
  const result = await client.getDshModelDirectory()
  assert.equal(result.providers[0].provider, 'deepseek')
  assert.equal(readyCalls, 2, 'a transient directory failure receives one retry')
  assert.equal(getProviderReads(), 2)
}

{
  let readyCalls = 0
  let startCalls = 0
  const client = createModelDirectoryClient({
    dshHostManager: {
      state: 'failed',
      getDiagnostics: () => 'host stderr tail: missing runtime module',
      whenReady: async () => { readyCalls += 1; throw new Error('should fail before requesting readiness') },
      start: async () => { startCalls += 1 },
    },
  })
  await assert.rejects(client.getDshModelDirectory(), /missing runtime module/)
  assert.equal(readyCalls, 0)
  assert.equal(startCalls, 0)
}

console.log('Model directory lifecycle checks passed: await Host readiness, one immediate retry, and failed-state diagnostics.')
