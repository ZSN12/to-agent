#!/usr/bin/env node
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
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

console.log('deepseek pricing adapter checks passed')
