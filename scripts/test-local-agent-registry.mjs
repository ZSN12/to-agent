import assert from 'node:assert/strict'
import { LOCAL_AGENT_INTEGRATIONS } from '../electron/backend/model-sync/local-agent-registry.mjs'
import { discoverAgentsFromExport } from '../electron/backend/model-sync/discover-local-agents.mjs'
import { bridgeProviderBlocksFromExport } from '../electron/backend/model-sync/bridge-catalog.mjs'

assert.ok(LOCAL_AGENT_INTEGRATIONS.length >= 2)
const exportDoc = {
  providers: {
    opencodex: { models: [{ id: 'cursor/composer-2.5-fast', name: 'Fast' }] },
    'google-antigravity': { models: [{ id: 'gemini-3.5-flash', name: 'Flash' }], baseUrl: 'https://x', project: 'p' },
  },
}
const blocks = bridgeProviderBlocksFromExport(exportDoc)
assert.ok(blocks['bridge-composer'])
assert.ok(blocks['bridge-antigravity'])

const agents = discoverAgentsFromExport(exportDoc, { cursor: true, 'google-antigravity': false })
const cursor = agents.find((a) => a.agentId === 'cursor-composer')
const ag = agents.find((a) => a.agentId === 'google-antigravity')
assert.equal(cursor?.modelCount, 1)
assert.equal(cursor?.loggedIn, true)
assert.equal(ag?.loginRequired, true)

console.log('test-local-agent-registry: ok')
