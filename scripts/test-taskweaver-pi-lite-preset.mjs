import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolvePrimaryAgentPreset, TASKWEAVER_PI_LITE_PRESET } from '../electron/backend/primary-agent-preset.mjs'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const presetDir = path.join(root, 'vendor/z-runtime/apps/cli/config/agent-presets/taskweaver-pi-lite')

assert.equal(TASKWEAVER_PI_LITE_PRESET, 'taskweaver-pi-lite')
assert.ok(fs.existsSync(path.join(presetDir, 'agent.cordis.yml')))
assert.ok(fs.existsSync(path.join(presetDir, 'preset.yml')))

const cordis = fs.readFileSync(path.join(presetDir, 'agent.cordis.yml'), 'utf8')
assert.match(cordis, /complete: true/)
assert.match(cordis, /maxBytes: 8192/)
assert.match(cordis, /pi-lite preset/)
assert.doesNotMatch(cordis, /tool-subagent/)
assert.doesNotMatch(cordis, /tool-workflow/)

assert.equal(resolvePrimaryAgentPreset('谢谢'), 'taskweaver-pi-lite')
assert.equal(resolvePrimaryAgentPreset('修复这个 bug'), 'standard')

console.log('test-taskweaver-pi-lite-preset: ok')
