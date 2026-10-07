import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createTaskWeaverConversationRuntime } from '../electron/backend/dsh-conversation-runtime.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runtimeRoot = path.join(root, 'vendor/taskweaver-z-runtime')
const runtime = await createTaskWeaverConversationRuntime(runtimeRoot)
assert.ok(runtime.events.entries().length >= 10, 'all DSH chat event node definitions must load in Node ESM')
assert.ok(runtime.views.entries().length >= 1, 'the DSH chat view definition must load')

const missingRoot = path.join(os.tmpdir(), 'taskweaver-runtime-no-registry-root')
const originalWarn = console.warn
let missing
try {
  console.warn = () => {}
  missing = await createTaskWeaverConversationRuntime(missingRoot)
} finally {
  console.warn = originalWarn
}
assert.deepEqual(missing.events.entries(), [], 'a genuinely missing registry retains the documented empty fallback')

console.log(`dsh conversation runtime registry: loaded ${runtime.events.entries().length} event definitions and ${runtime.views.entries().length} view definitions`)
