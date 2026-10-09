#!/usr/bin/env node
/**
 * Phase-0 acceptance: models.json bridge block → Host llm-taskweaver-bridge settings (not llm-pi-ai).
 * Requires built Z runtime at vendor/taskweaver-z-runtime (or TASKWEAVER_Z_RUNTIME).
 */
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseDocument } from 'yaml'
import { createZHostManager, resolveTaskWeaverRuntimeRoot } from '../electron/agent/z-host/index.mjs'
import { ensureZHomeDirectory } from '../electron/agent/z-host/migrate-z-home.mjs'
import { isLlmTaskweaverBridgeNamespaceRegistered, isLlmPiAiNamespaceRegistered } from '../electron/backend/dsh-settings-repair.mjs'
import { ensureModelsJsonSyncedToDshHost } from '../electron/backend/sync-models-json-to-host.mjs'
import { ensureTaskWeaverModelsJson } from '../electron/backend/taskweaver-models-defaults.mjs'
import { loadBundledDefaultModelsDoc } from '../electron/backend/taskweaver-models-defaults.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const runtimeRoot = resolveTaskWeaverRuntimeRoot({
  appPath: root,
  resourcesPath: null,
  isPackaged: false,
  env: process.env,
})

try {
  await fs.access(path.join(runtimeRoot, 'lib', 'bin.js'))
} catch {
  console.warn('test-taskweaver-bridge-sync-e2e: skip（未找到 Z runtime，先运行 npm run build:z-runtime）')
  process.exit(0)
}

const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'tw-bridge-sync-e2e-'))
await ensureTaskWeaverModelsJson({ userDataPath, appPath: root })

const defaults = await loadBundledDefaultModelsDoc(root)
const modelsDocOverride = structuredClone(defaults)

const hostManager = createZHostManager({
  runtimeRoot,
  userDataPath,
  executable: process.execPath,
})

const sync = await ensureModelsJsonSyncedToDshHost({
  hostManager,
  userDataPath,
  modelsDocOverride,
})

assert.equal(sync.synced, true, `sync failed: ${JSON.stringify(sync)}`)
assert.ok(sync.bridgeProviderCount >= 1, 'expected bridge providers synced')

const { api } = await hostManager.start()
assert.equal(await isLlmTaskweaverBridgeNamespaceRegistered(api), true, 'llm-taskweaver-bridge ns missing')
assert.equal(await isLlmPiAiNamespaceRegistered(api), true, 'llm-pi-ai ns missing')

const providersReply = await api.llm.providers({})
const providers = providersReply?.result?.value?.providers ?? []
assert.ok(
  providers.some((provider) => provider.provider === 'bridge-composer' && provider.active === true),
  'bridge-composer settings were persisted but its Host route is not active',
)
const modelsReply = await api.llm.models({})
const groups = modelsReply?.result?.value?.groups ?? []
assert.ok(
  groups.some((group) => group.id === 'bridge-composer' && group.models.some((model) => model.id === 'cursor/composer-2.5')),
  'bridge-composer model is missing from the Host model catalog',
)

const { zHome } = ensureZHomeDirectory(userDataPath)
const settingsText = await fs.readFile(path.join(zHome, 'settings.yaml'), 'utf8')
const settings = parseDocument(settingsText).toJS()

const bridgeProviders = settings?.['llm-taskweaver-bridge']?.providers
assert.ok(bridgeProviders?.['bridge-composer'], 'bridge-composer missing in Host settings')
assert.equal(bridgeProviders['bridge-composer'].bridgeKind, 'cursor')

const piProviders = settings?.['llm-pi-ai']?.providers ?? {}
assert.equal(piProviders['bridge-composer'], undefined, 'bridge route must not be written into llm-pi-ai')

await hostManager.stop()
console.log('test-taskweaver-bridge-sync-e2e: ok', {
  bridgeProviderCount: sync.bridgeProviderCount,
  piProviderCount: sync.piProviderCount,
  activeBridgeRoute: true,
})
