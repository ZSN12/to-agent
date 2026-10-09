#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runPricingSync } from '../../electron/backend/pricing/run-sync.mjs'
import {
  parseDeepseekPricingHtml,
  fetchDeepseekOfficialPrices,
} from '../../electron/backend/pricing/adapters/deepseek-official.mjs'

const fixturePath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'pricing',
  'fixtures',
  'deepseek-pricing.html',
)

const html = await import('node:fs').then((fs) => fs.readFileSync(fixturePath, 'utf8'))
const { flash, pro } = parseDeepseekPricingHtml(html)
assert.ok(flash.input > 0 && flash.output > 0)
assert.ok(pro.input >= flash.input)
assert.ok(pro.output >= flash.output)

const models = await fetchDeepseekOfficialPrices({ fixturePath })
assert.ok(models['deepseek/deepseek-v4-flash'])
assert.ok(models['deepseek/deepseek-chat'])
assert.equal(models['deepseek/deepseek-chat'].currency, 'USD')

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-pricing-adapter-'))
try {
  const sync = await runPricingSync({
    registryPath: path.join(tempDir, 'registry.json'),
    dryRun: true,
    allowNetwork: false,
    getDshDirectory: async () => ({
      providers: [{ provider: 'fixture' }],
      groups: [{ provider: 'fixture', models: [{ id: 'model-1', pricing: { input: 1, output: 2 } }] }],
    }),
  })
  assert.equal(sync.registry.models['fixture/model-1'].source, 'adapter:dsh-catalog')
  assert.equal(sync.errors.some((entry) => entry.adapter === 'dsh-catalog'), false)
} finally {
  await fs.rm(tempDir, { recursive: true, force: true })
}

console.log('deepseek pricing adapter checks passed')
