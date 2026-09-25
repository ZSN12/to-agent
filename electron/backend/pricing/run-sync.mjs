import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { loadPriceRegistry } from '../price-registry.mjs'
import { officialAdapters, fallbackAdapters } from './adapters/index.mjs'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

function defaultRegistryPath() {
  return path.join(REPO_ROOT, 'pricing', 'registry.json')
}

function isManualSeed(entry) {
  return typeof entry?.source === 'string' && entry.source.startsWith('seed:manual')
}

function confidenceRank(c) {
  if (c === 'high') return 3
  if (c === 'medium') return 2
  if (c === 'low') return 1
  return 0
}

/**
 * @param {Record<string, object>} base
 * @param {Record<string, object>} overlay
 * @param {boolean} onlyHigherConfidence
 */
function mergeModels(base, overlay, onlyHigherConfidence = false) {
  const out = { ...base }
  for (const [key, entry] of Object.entries(overlay)) {
    if (!entry) continue
    const prev = out[key]
    if (
      onlyHigherConfidence &&
      prev &&
      confidenceRank(prev.confidence) > confidenceRank(entry.confidence)
    ) {
      continue
    }
    out[key] = entry
  }
  return out
}

function diffKeys(before, after) {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])
  return [...keys].filter((key) => JSON.stringify(before?.[key]) !== JSON.stringify(after?.[key]))
}

function checksum(obj) {
  return createHash('sha256').update(JSON.stringify(obj)).digest('hex').slice(0, 16)
}

/**
 * @param {object} options
 * @param {string} [options.registryPath]
 * @param {boolean} [options.dryRun]
 * @param {boolean} [options.allowNetwork]
 */
export async function runPricingSync(options = {}) {
  const registryPath = options.registryPath ?? defaultRegistryPath()
  const dryRun = options.dryRun === true
  const allowNetwork = options.allowNetwork !== false

  const previous = loadPriceRegistry(registryPath)
  const errors = []
  const adapterSnapshots = {}

  let official = {}
  for (const adapter of officialAdapters) {
    try {
      if (!allowNetwork && !options.fixtures?.[adapter.id]) {
        errors.push({ adapter: adapter.id, error: 'network disabled' })
        continue
      }
      const prices = await adapter.fetchPrices(options.fixtures?.[adapter.id] ?? {})
      official = mergeModels(official, prices)
      adapterSnapshots[adapter.id] = prices
    } catch (error) {
      errors.push({ adapter: adapter.id, error: error instanceof Error ? error.message : String(error) })
    }
  }

  let catalog = {}
  try {
    catalog = await fallbackAdapters[0].fetchPrices()
  } catch (error) {
    errors.push({ adapter: 'runtime-catalog', error: error instanceof Error ? error.message : String(error) })
  }

  let models = mergeModels(catalog, official, true)

  for (const [key, entry] of Object.entries(previous.models ?? {})) {
    if (isManualSeed(entry) && !official[key]) {
      models[key] = entry
    }
  }

  const syncedAt = new Date().toISOString()
  const next = {
    version: 1,
    synced_at: syncedAt,
    checksum: checksum(models),
    models,
    last_run: {
      synced_at: syncedAt,
      errors,
      adapter_count: Object.keys(adapterSnapshots).length,
      model_count: Object.keys(models).length,
    },
  }

  const changed = diffKeys(previous.models, models)

  if (dryRun) {
    return { dryRun: true, changed, errors, modelCount: Object.keys(models).length, registry: next }
  }

  await fs.mkdir(path.dirname(registryPath), { recursive: true })
  const snapshotsDir = path.join(path.dirname(registryPath), 'snapshots')
  await fs.mkdir(snapshotsDir, { recursive: true })
  const stamp = syncedAt.replace(/[:.]/g, '-')
  await fs.writeFile(path.join(snapshotsDir, `${stamp}.json`), `${JSON.stringify(next, null, 2)}\n`, 'utf8')
  await fs.writeFile(registryPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8')

  const repoPricingDir = path.join(REPO_ROOT, 'pricing')
  if (changed.length > 0 && path.dirname(path.resolve(registryPath)) === repoPricingDir) {
    const changelogPath = path.join(repoPricingDir, 'CHANGELOG.md')
    const lines = [
      `## ${syncedAt}`,
      '',
      `- 变更 ${changed.length} 条模型价签`,
      ...changed.slice(0, 50).map((k) => `  - \`${k}\``),
      errors.length ? `- 警告: ${errors.map((e) => `${e.adapter}: ${e.error}`).join('; ')}` : '',
      '',
    ].filter(Boolean)
    let prev = ''
    try {
      prev = await fs.readFile(changelogPath, 'utf8')
    } catch {
      prev = '# Pricing changelog (auto)\n\n'
    }
    await fs.writeFile(changelogPath, `${prev}${lines.join('\n')}\n`, 'utf8')
  }

  return { dryRun: false, changed, errors, modelCount: Object.keys(models).length, registryPath }
}
