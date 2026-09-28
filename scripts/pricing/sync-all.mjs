#!/usr/bin/env node
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runPricingSync } from '../../electron/backend/pricing/run-sync.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const dryRun = process.argv.includes('--dry-run')
const offline = process.argv.includes('--offline')

const result = await runPricingSync({
  registryPath: path.join(ROOT, 'pricing', 'registry.json'),
  dryRun,
  allowNetwork: !offline,
})

if (result.dryRun) {
  console.log(`pricing dry-run: ${result.changed.length} entries would change, ${result.modelCount} models total`)
  if (result.errors.length) {
    console.warn('adapter warnings:', result.errors)
  }
  for (const key of result.changed.slice(0, 30)) {
    console.log(`  ${key}`)
  }
} else {
  console.log(`pricing sync → ${result.registryPath}`)
  console.log(`  models: ${result.modelCount}, changed: ${result.changed.length}`)
  if (result.errors.length) {
    console.warn('adapter warnings:', result.errors)
  }
}
