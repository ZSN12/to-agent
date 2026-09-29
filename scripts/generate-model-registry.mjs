#!/usr/bin/env node
import fsp from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dataDir = process.env.PI_AI_DATA_DIR
  ? path.resolve(process.env.PI_AI_DATA_DIR)
  : path.join(root, 'vendor', 'taskweaver-dsh-runtime', 'runtime-packages', '@earendil-works', 'pi-ai', 'dist', 'providers', 'data')
const output = path.resolve(process.argv[2] || path.join(root, 'registry', 'model-registry.v1.json'))
const overrides = JSON.parse(await fsp.readFile(path.join(root, 'registry', 'overrides.json'), 'utf8'))
const runtime = JSON.parse(await fsp.readFile(path.join(root, 'runtime-lock.json'), 'utf8'))
const appPackage = JSON.parse(await fsp.readFile(path.join(root, 'package.json'), 'utf8'))
let catalogVersion = runtime.piAi.version
try {
  const catalogPackage = JSON.parse(await fsp.readFile(path.resolve(dataDir, '..', '..', '..', 'package.json'), 'utf8'))
  if (typeof catalogPackage.version === 'string' && catalogPackage.version) catalogVersion = catalogPackage.version
} catch {
  // Bundled and test catalogs may not carry package metadata. The runtime lock
  // remains the authoritative fallback for those inputs.
}
const files = (await fsp.readdir(dataDir)).filter((name) => name.endsWith('.json')).sort()
const providers = {}
const models = {}

for (const file of files) {
  const document = JSON.parse(await fsp.readFile(path.join(dataDir, file), 'utf8'))
  for (const [api, entries] of Object.entries(document)) {
    for (const model of Object.values(entries ?? {})) {
      if (!model?.provider || !model?.id) continue
      const provider = providers[model.provider] ?? {
        id: model.provider,
        name: model.provider.split(/[-_]/).map((part) => part ? part[0].toUpperCase() + part.slice(1) : part).join(' '),
        protocols: [],
        authTypes: ['api_key'],
      }
      if (!provider.protocols.includes(api)) provider.protocols.push(api)
      if (model.baseUrl && !provider.defaultEndpointRef) provider.defaultEndpointRef = model.baseUrl
      providers[model.provider] = provider
      const key = `${model.provider}/${model.id}`
      models[key] = {
        provider: model.provider,
        id: model.id,
        name: model.name || model.id,
        api,
        contextWindow: model.contextWindow,
        maxTokens: model.maxTokens,
        input: model.input ?? ['text'],
        reasoningEfforts: model.thinkingLevelMap,
        toolCalling: true,
        cache: { read: Number(model.cost?.cacheRead) > 0, write: Number(model.cost?.cacheWrite) > 0 },
        pricing: {
          input: Math.max(0, Number(model.cost?.input) || 0),
          output: Math.max(0, Number(model.cost?.output) || 0),
          cacheRead: Math.max(0, Number(model.cost?.cacheRead) || 0),
          cacheWrite: Math.max(0, Number(model.cost?.cacheWrite) || 0),
        },
        priceDetails: model.cost?.tiers ? { tiers: model.cost.tiers } : undefined,
        capabilitySummary: '',
        taskTags: [],
        deprecated: false,
        replacementModel: null,
        source: `pi-ai@${catalogVersion}`,
        updatedAt: new Date().toISOString(),
        confidence: 'upstream',
      }
    }
  }
}

for (const [id, patch] of Object.entries(overrides.providers ?? {})) providers[id] = { ...(providers[id] ?? {}), ...patch }
for (const [id, patch] of Object.entries(overrides.models ?? {})) models[id] = { ...(models[id] ?? {}), ...patch }
for (const provider of Object.values(providers)) provider.protocols.sort()
const stamp = new Date()
const version = process.env.MODEL_REGISTRY_VERSION
  || `${stamp.getUTCFullYear()}.${String(stamp.getUTCMonth() + 1).padStart(2, '0')}.${String(stamp.getUTCDate()).padStart(2, '0')}.${process.env.GITHUB_RUN_NUMBER || '1'}`
const registry = {
  schemaVersion: 1,
  registryVersion: version,
  generatedAt: stamp.toISOString(),
  expiresAt: new Date(stamp.getTime() + 120 * 24 * 60 * 60 * 1000).toISOString(),
  minimumTaskWeaverVersion: appPackage.version,
  minimumDshRuntimeVersion: runtime.dsh.version,
  providers: Object.fromEntries(Object.entries(providers).sort(([a], [b]) => a.localeCompare(b))),
  models: Object.fromEntries(Object.entries(models).sort(([a], [b]) => a.localeCompare(b))),
  sources: [{ name: `@earendil-works/pi-ai ${catalogVersion}`, updatedAt: stamp.toISOString(), confidence: 'upstream' }],
}
await fsp.mkdir(path.dirname(output), { recursive: true })
await fsp.writeFile(output, `${JSON.stringify(registry, null, 2)}\n`)
console.log(`generate-model-registry: ${Object.keys(providers).length} providers, ${Object.keys(models).length} models → ${output}`)
