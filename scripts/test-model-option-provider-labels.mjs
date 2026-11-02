#!/usr/bin/env node
import assert from 'node:assert/strict'
import { catalogModelsToOptions } from '../src/features/models/format.ts'
import { displayModelRoute } from '../src/features/roles/model-route-label.ts'

const shared = {
  name: 'Gemini 3.8 Flash',
  reasoning: true,
  vision: false,
  contextWindow: 100_000,
  profile: null,
}
const models = [
  { ...shared, key: 'bridge-composer/cursor/gemini-3.8-flash', provider: 'bridge-composer' },
  { ...shared, key: 'bridge-antigravity/google-antigravity/gemini-3.8-flash', provider: 'bridge-antigravity' },
  { ...shared, name: 'Composer 2.5', key: 'bridge-composer/cursor/composer-2.5', provider: 'bridge-composer' },
  { ...shared, name: 'GPT-6 Luna', key: 'openai-codex/gpt-6-luna', provider: 'openai-codex' },
  { ...shared, name: 'GPT-6 Luna', key: 'openai/gpt-6-luna', provider: 'openai' },
]

const options = catalogModelsToOptions(models)
assert.deepEqual(options.map((option) => option.name), [
  'Gemini 3.8 Flash · Cursor',
  'Gemini 3.8 Flash · Antigravity',
  'Composer 2.5',
  'GPT-6 Luna · Codex',
  'GPT-6 Luna · openai',
])
assert.deepEqual(options.map((option) => option.id), models.map((model) => model.key),
  'display labels must not alter the provider-specific model keys sent to the backend')
assert.ok(options.every((option) => !option.name.includes('openai-codex')),
  'the internal Codex provider id must not leak into model display labels')
assert.equal(displayModelRoute('openai-codex/gpt-6-luna'), 'Codex/gpt-6-luna')

console.log('model option provider labels passed: provider aliases are clean and route IDs stay isolated')
