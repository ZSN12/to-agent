import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolvePrimaryAgentPreset } from '../backend/primary-agent-preset.mjs'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const presetDir = path.join(root, 'packages/runtime/host-cli/config/agent-presets/tw-taskweaver-pi-lite')

assert.ok(fs.existsSync(path.join(presetDir, 'agent.cordis.yml')))
assert.ok(fs.existsSync(path.join(presetDir, 'preset.yml')))

const cordis = fs.readFileSync(path.join(presetDir, 'agent.cordis.yml'), 'utf8')
assert.match(cordis, /complete: true/)
assert.match(cordis, /maxBytes: 8192/)
assert.match(cordis, /pi-lite preset/)
assert.doesNotMatch(cordis, /tool-subagent/)
assert.doesNotMatch(cordis, /tool-workflow/)

assert.equal(resolvePrimaryAgentPreset('谢谢'), 'tw-default')
assert.equal(resolvePrimaryAgentPreset('只阅读 src/a.ts 和 src/b.ts'), 'tw-default')
assert.equal(resolvePrimaryAgentPreset('修复这个 bug'), 'tw-default')

console.log('test-taskweaver-pi-lite-preset: ok')
