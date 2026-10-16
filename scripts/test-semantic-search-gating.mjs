import assert from 'node:assert/strict'
import { createSemanticToolGate } from '../packages/runtime/fs/tool-fs-semantic-search/lib/types/tool-gate.js'

const credentials = { jina: false, openai: false }
let provider = 'jina'
const tools = new Set()
const promptSections = new Set()
const index = new Map()

const gate = createSemanticToolGate({
  getProvider: () => provider,
  hasCredential: async selected => credentials[selected],
  mount: () => {
    const disposers = []
    for (const name of ['index_project_for_semantic_search', 'semantic_search_code', 'semantic_search_stats']) {
      tools.add(name)
      disposers.push(() => tools.delete(name))
    }
    promptSections.add('tool:semantic_search_code')
    disposers.push(() => promptSections.delete('tool:semantic_search_code'))
    return disposers
  },
  onReset: () => index.clear(),
})

await gate.synchronize()
assert.equal(tools.size, 0, 'without a key, semantic tools stay unregistered')
assert.equal(promptSections.size, 0, 'without a key, semantic-search guidance stays out of the prompt')

credentials.jina = true
await gate.synchronize()
assert.deepEqual([...tools].sort(), ['index_project_for_semantic_search', 'semantic_search_code', 'semantic_search_stats'])
assert.deepEqual([...promptSections], ['tool:semantic_search_code'])

provider = 'openai'
await gate.synchronize()
assert.equal(tools.size, 0, 'switching to a provider without a key removes the tools')
assert.equal(promptSections.size, 0, 'switching to a provider without a key removes the prompt section')

credentials.openai = true
await gate.synchronize()
assert.equal(tools.size, 3, 'a key for the selected provider remounts the tools')
assert.equal(promptSections.size, 1)

credentials.openai = false
await gate.synchronize()
assert.equal(tools.size, 0, 'removing the selected provider key unmounts the tools')
assert.equal(promptSections.size, 0)

gate.dispose()
console.log('test-semantic-search-gating: ok (missing key, provider change, credential add/remove)')
