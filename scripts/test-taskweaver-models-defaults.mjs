import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ensureTaskWeaverModelsJson,
  loadBundledDefaultModelsDoc,
  mergeMissingDefaultProviders,
  modelsDocHasBridgeProvider,
} from '../electron/backend/taskweaver-models-defaults.mjs'
import { resolveTaskWeaverModelsPath } from '../electron/backend/taskweaver-models-path.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const defaults = await loadBundledDefaultModelsDoc(root)
assert.ok(modelsDocHasBridgeProvider(defaults))
assert.equal(defaults.providers['bridge-composer'].bridgeKind, 'cursor')

const merged = mergeMissingDefaultProviders({ providers: { deepseek: { name: 'DS', baseUrl: 'https://api.deepseek.com', models: [] } } }, defaults)
assert.ok(merged.providers.deepseek)
assert.ok(merged.providers['bridge-composer'])

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'tw-models-defaults-'))
const result = await ensureTaskWeaverModelsJson({ userDataPath: tmp, appPath: root })
assert.equal(result.created, true)
assert.ok(result.addedProviderIds.includes('bridge-composer'))
const onDisk = JSON.parse(await fs.readFile(resolveTaskWeaverModelsPath(tmp), 'utf8'))
assert.ok(onDisk.providers['bridge-composer'])

const again = await ensureTaskWeaverModelsJson({ userDataPath: tmp, appPath: root })
assert.equal(again.updated, false)
assert.deepEqual(again.addedProviderIds, [])

console.log('test-taskweaver-models-defaults: ok')
