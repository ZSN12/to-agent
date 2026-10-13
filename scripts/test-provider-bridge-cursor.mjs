#!/usr/bin/env node
import assert from 'node:assert/strict'
import { buildCursorParsedRequest } from '../packages/provider-bridge-transport/index.mjs'
import {
  createCursorAdapter,
  createTranslatorBudget,
} from '../packages/provider-bridge/lib/index.mjs'

const profile = {
  bridgeKind: 'cursor',
  models: [{ id: 'cursor/composer-2.5' }],
}

function parsedRequest() {
  return buildCursorParsedRequest({
    providerId: 'bridge-composer',
    profile,
    options: {
      provider: 'bridge-composer',
      model: 'cursor/composer-2.5',
      messages: [{ id: 'u1', role: 'user', content: [{ type: 'text', text: 'adapter test' }] }],
      system: 'TaskWeaver adapter test',
      tools: [],
    },
    harnessHome: '/tmp',
  })
}

// Importing and asking the live adapter to run without a stored credential must fail closed
// before any HTTP request. The fake fetch is a tripwire: credential lookup must stop first.
let fetchCalls = 0
const noCredentialEvents = []
await createCursorAdapter({ name: 'cursor', adapter: 'cursor' }).runTurn(
  parsedRequest(),
  {
    headers: new Headers(),
    translatorBudget: createTranslatorBudget(),
    providerFetch: async () => {
      fetchCalls += 1
      throw new Error('network access is not part of this test')
    },
  },
  event => noCredentialEvents.push(event),
)
assert.equal(fetchCalls, 0)
assert.ok(noCredentialEvents.some(event => event.type === 'error' && /access token/i.test(event.message)))

// The adapter owns its protocol mapping, while an injected transport replaces network and auth.
const injectedEvents = []
let createdTransport = 0
const adapter = createCursorAdapter(
  { name: 'cursor', adapter: 'cursor', apiKey: 'unit-test-token' },
  {
    createTransport() {
      createdTransport += 1
      return {
        async *run() {
          yield { type: 'text', text: 'injected cursor response' }
          yield { type: 'done', usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 } }
        },
        writeClient() {},
        close() {},
      }
    },
  },
)
await adapter.runTurn(
  parsedRequest(),
  { headers: new Headers(), translatorBudget: createTranslatorBudget() },
  event => injectedEvents.push(event),
)
assert.equal(createdTransport, 1)
assert.ok(injectedEvents.some(event => event.type === 'text_delta' && event.text === 'injected cursor response'))
assert.ok(injectedEvents.some(event => event.type === 'done'))

console.log('test-provider-bridge-cursor: no-credential failure and injected transport passed')
