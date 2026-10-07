import assert from 'node:assert/strict'
import { shouldInjectCursorToolGuidance, CURSOR_TOOL_GUIDANCE_TEXT } from '../electron/backend/cursor-tool-guidance.mjs'

assert.equal(shouldInjectCursorToolGuidance('opencodex/cursor/composer-2.5'), true)
assert.equal(shouldInjectCursorToolGuidance('cursor/composer-2.5'), true)
assert.equal(shouldInjectCursorToolGuidance('opencodex/some-model'), true)
assert.equal(shouldInjectCursorToolGuidance('xiaomi/mimo-v2.6-flash'), false)
assert.match(CURSOR_TOOL_GUIDANCE_TEXT, /read、grep、glob/)
assert.match(CURSOR_TOOL_GUIDANCE_TEXT, /GetDynamicTool/)
assert.ok(Buffer.byteLength(CURSOR_TOOL_GUIDANCE_TEXT, 'utf8') < 600, 'cursor guidance should stay compact')

import { humanizeOpenCodexTransportError } from '../electron/backend/opencodex-health.mjs'

const hint = humanizeOpenCodexTransportError('fetch failed（底层原因：ECONNREFUSED）', 'opencodex/cursor/composer-2.5')
assert.match(hint, /启动 OpenCodex/)
assert.match(hint, /MiMo/)

import {
  ocxSupportsComposerToolContinuation,
  parseOcxSemver,
} from '../electron/backend/opencodex-binary.mjs'

assert.equal(parseOcxSemver('opencodex 2.28.0')?.raw, '2.28.0')
assert.equal(ocxSupportsComposerToolContinuation('opencodex 2.28.0'), false)
assert.equal(ocxSupportsComposerToolContinuation('opencodex 2.79.0'), true)

console.log('test-cursor-tool-guidance: ok')
