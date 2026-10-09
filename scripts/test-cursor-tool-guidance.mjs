import assert from 'node:assert/strict'
import {
  shouldInjectCursorToolGuidance,
  CURSOR_TOOL_GUIDANCE_TEXT,
  hostToolToOcxClientWireName,
} from '../electron/backend/cursor-tool-guidance.mjs'

assert.equal(shouldInjectCursorToolGuidance('bridge-composer/cursor/composer-2.5'), true)
assert.equal(shouldInjectCursorToolGuidance('opencodex/cursor/composer-2.5'), true)
assert.equal(shouldInjectCursorToolGuidance('cursor/composer-2.5'), true)
assert.equal(shouldInjectCursorToolGuidance('opencodex/some-model'), true)
assert.equal(shouldInjectCursorToolGuidance('xiaomi/mimo-v2.6-flash'), false)
assert.equal(hostToolToOcxClientWireName('read'), 'ocx_client_read')
assert.match(CURSOR_TOOL_GUIDANCE_TEXT, /read、grep/)
assert.match(CURSOR_TOOL_GUIDANCE_TEXT, /勿用.*CallDynamicTool/)
assert.match(CURSOR_TOOL_GUIDANCE_TEXT, /GetDynamicTool/)
assert.match(CURSOR_TOOL_GUIDANCE_TEXT, /read 优先用 file_path（兼容接受 path）/)
assert.match(CURSOR_TOOL_GUIDANCE_TEXT, /bash 用必填 command 和 description/)
assert.match(CURSOR_TOOL_GUIDANCE_TEXT, /get_creds.*不可尝试读取或索取凭据/)
assert.match(CURSOR_TOOL_GUIDANCE_TEXT, /最多重试一次/)
assert.match(CURSOR_TOOL_GUIDANCE_TEXT, /文件名已给出时不要先扫全仓/)
assert.match(CURSOR_TOOL_GUIDANCE_TEXT, /证据充分后停止/)
assert.ok(Buffer.byteLength(CURSOR_TOOL_GUIDANCE_TEXT, 'utf8') < 1500, 'cursor guidance should stay compact')

import { humanizeBridgeTransportError } from '../electron/backend/cursor-tool-guidance.mjs'
import { parseProviderLoginFromStatusText } from '../electron/backend/opencodex-service.mjs'

const hint = humanizeBridgeTransportError('fetch failed（底层原因：ECONNREFUSED）', 'bridge-composer/cursor/composer-2.5')
assert.match(hint, /内置 Composer 桥/)
assert.match(hint, /MiMo/)

const readTool = humanizeBridgeTransportError(
  'Cursor requested unknown Responses tool: read',
  'bridge-composer/cursor/composer-2.5',
)
assert.match(readTool, /ocx_client_read/)
assert.match(readTool, /unknown Responses tool/i)

const unknownCursorInternalTool = humanizeBridgeTransportError(
  'Cursor requested unknown Responses tool: get_creds',
  'bridge-composer/cursor/composer-2.5',
)
assert.match(unknownCursorInternalTool, /不在当前 Z Host 工具目录中/)
assert.match(unknownCursorInternalTool, /不要猜测添加 ocx_client_/)
assert.doesNotMatch(unknownCursorInternalTool, /改用 ocx_client_get_creds/)

const conn = humanizeBridgeTransportError('Connection error.', 'bridge-composer/cursor/composer-2.5')
assert.match(conn, /bridge-composer/)

import {
  ocxSupportsComposerToolContinuation,
  parseOcxSemver,
} from '../electron/backend/opencodex-binary.mjs'

assert.equal(parseOcxSemver('opencodex 2.28.0')?.raw, '2.28.0')
assert.equal(ocxSupportsComposerToolContinuation('opencodex 2.28.0'), false)
assert.equal(ocxSupportsComposerToolContinuation('opencodex 2.79.0-taskweaver.1'), true)

assert.deepEqual(parseProviderLoginFromStatusText('cursor     ✓ logged in\nfoo ✗ not logged in\n'), { cursor: true, foo: false })

console.log('test-cursor-tool-guidance: ok')
