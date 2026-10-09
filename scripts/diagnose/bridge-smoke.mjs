#!/usr/bin/env node
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const kind = process.argv.includes('--kind') ? process.argv[process.argv.indexOf('--kind') + 1] : 'cursor'
const supported = new Set(['cursor', 'google-antigravity', 'openai-compat-relay'])
if (!supported.has(kind)) {
  console.error(`bridge-smoke: unsupported kind ${kind} (expected ${[...supported].join(', ')})`)
  process.exit(1)
}

process.env.BRIDGE_SMOKE_MOCK = process.env.BRIDGE_SMOKE_MOCK ?? '1'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const transportUrl = pathToFileURL(path.join(root, 'packages/provider-bridge-transport/index.mjs')).href

const { installBridgeTransportBackends } = await import(transportUrl)

let registerBridgeBackend
let getBridgeBackend
let installDefaultBridgeBackends
try {
  const core = await import(pathToFileURL(path.join(
    root,
    'packages/runtime/bridge/bridge-core/src/registry.ts',
  )).href)
  registerBridgeBackend = core.registerBridgeBackend
  getBridgeBackend = core.getBridgeBackend
  installDefaultBridgeBackends = core.installDefaultBridgeBackends
} catch {
  const pending = {
    kind: 'cursor',
    async *stream() {
      const err = new Error('BRIDGE_BACKEND_PENDING')
      err.code = 'BRIDGE_BACKEND_PENDING'
      throw err
    },
  }
  registerBridgeBackend = (b) => { pending.kind = b.kind; Object.assign(pending, b) }
  getBridgeBackend = () => pending
  installDefaultBridgeBackends = () => {}
}

installDefaultBridgeBackends()
installBridgeTransportBackends({ registerBridgeBackend })

const profileByKind = {
  cursor: {
    providerId: 'bridge-composer',
    profile: { bridgeKind: 'cursor', displayName: 'Composer', models: [{ id: 'cursor/composer-2.5-fast' }] },
    model: 'cursor/composer-2.5-fast',
  },
  'google-antigravity': {
    providerId: 'bridge-antigravity',
    profile: {
      bridgeKind: 'google-antigravity',
      displayName: 'Antigravity',
      baseUrl: 'https://example.invalid',
      project: 'mock',
      models: [{ id: 'gemini-3.5-flash' }],
    },
    model: 'gemini-3.5-flash',
  },
  'openai-compat-relay': {
    providerId: 'bridge-relay',
    profile: {
      bridgeKind: 'openai-compat-relay',
      displayName: 'Relay',
      relayBaseURL: 'https://example.invalid',
      models: [{ id: 'gpt-4o-mini' }],
    },
    model: 'gpt-4o-mini',
  },
}
const spec = profileByKind[kind]
const backend = getBridgeBackend(kind)
const chunks = []
for await (const chunk of backend.stream({
  providerId: spec.providerId,
  profile: spec.profile,
  options: {
    provider: spec.providerId,
    model: spec.model,
    messages: [{ id: 'u1', role: 'user', content: [{ type: 'text', text: 'ping' }], source: { kind: 'user' } }],
  },
  harnessHome: root,
})) chunks.push(chunk)

const text = chunks.filter((c) => c.type === 'text-delta').map((c) => c.text).join('')
if (!text.includes('bridge-smoke-ok')) {
  console.error('bridge-smoke: expected mock stream text', chunks)
  process.exit(1)
}
console.log('bridge-smoke: ok', { kind, chunks: chunks.length })
