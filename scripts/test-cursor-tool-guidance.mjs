import assert from 'node:assert/strict'
import {
  hostToolToOcxClientWireName,
  humanizeBridgeTransportError,
} from '../backend/cursor-tool-guidance.mjs'

assert.equal(hostToolToOcxClientWireName('read'), 'ocx_client_read')

import { parseProviderLoginFromStatusText } from '../backend/opencodex-service.mjs'

const hint = humanizeBridgeTransportError('fetch failed（底层原因：ECONNREFUSED）', 'bridge-composer/cursor/composer-2.5')
assert.match(hint, /内置 Composer 桥/)
assert.match(hint, /MiMo/)

const readTool = humanizeBridgeTransportError(
  'Cursor requested unknown Responses tool: read',
  'bridge-composer/cursor/composer-2.5',
)
assert.match(readTool, /本轮已登记的工具目录内映射裸名/)
assert.match(readTool, /手动添加前缀不会注册缺失工具/)
assert.doesNotMatch(readTool, /请改用 ocx_client_read/)
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

const missingExecutor = humanizeBridgeTransportError(
  'MCP error -32602: No local executors available to process this request',
  'bridge-composer/cursor/composer-2.5',
)
assert.match(missingExecutor, /没有可用的本地执行端/)
assert.match(missingExecutor, /不代表工作区文件不可读/)

import {
  ocxSupportsComposerToolContinuation,
  parseOcxSemver,
} from '../backend/opencodex-binary.mjs'

assert.equal(parseOcxSemver('opencodex 2.28.0')?.raw, '2.28.0')
assert.equal(ocxSupportsComposerToolContinuation('opencodex 2.28.0'), false)
assert.equal(ocxSupportsComposerToolContinuation('opencodex 2.79.0-taskweaver.1'), true)

assert.deepEqual(parseProviderLoginFromStatusText('cursor     ✓ logged in\nfoo ✗ not logged in\n'), { cursor: true, foo: false })

console.log('test-cursor-tool-guidance: ok')
