#!/usr/bin/env node
import assert from 'node:assert/strict'
import {
  harnessMessagesToOcxContext,
  harnessToolsToOcx,
  resolveCursorReasoningOption,
  createAdapterEventChunkMapper,
  buildCursorParsedRequest,
  createCursorBackend,
  UI_VERIFY_APPROVAL_FIXTURE,
  UI_VERIFY_MOCK_REPLY,
  isUiVerifyApprovalFixture,
  resolveRuntimeRootOverride,
} from '../packages/provider-bridge-transport/index.mjs'

const oldWarn = console.warn
const runtimeWarnings = []
console.warn = (message) => runtimeWarnings.push(String(message))
try {
  assert.equal(resolveRuntimeRootOverride({ TASKWEAVER_RUNTIME: '/runtime/canonical', TASKWEAVER_Z_RUNTIME: '/runtime/legacy' }), '/runtime/canonical')
  assert.equal(resolveRuntimeRootOverride({ TASKWEAVER_DSH_RUNTIME: '/runtime/dsh-legacy' }), '/runtime/dsh-legacy')
} finally {
  console.warn = oldWarn
}
assert.ok(runtimeWarnings.some((message) => message.includes('TASKWEAVER_Z_RUNTIME') && message.includes('TASKWEAVER_RUNTIME')))
assert.ok(runtimeWarnings.some((message) => message.includes('TASKWEAVER_DSH_RUNTIME') && message.includes('TASKWEAVER_RUNTIME')))

const profile = {
  bridgeKind: 'cursor',
  displayName: 'Composer',
  models: [{
    id: 'cursor/composer-2.5-fast',
    thinkingLevelMap: { low: 'minimal', high: 'max' },
    defaultThinkingLevel: 'medium',
  }],
}

const messages = [
  {
    id: 's1',
    role: 'system',
    content: [{ type: 'text', text: 'sys-a' }],
    source: { kind: 'plugin', plugin: 'test' },
  },
  {
    id: 'u1',
    role: 'user',
    content: [{ type: 'text', text: 'hello' }],
    source: { kind: 'user' },
  },
  {
    id: 'a1',
    role: 'assistant',
    content: [
      { type: 'reasoning', text: 'think' },
      { type: 'text', text: 'hi' },
      { type: 'tool-call', id: 'call_1', name: 'echo', arguments: '{"x":1}' },
    ],
    source: { kind: 'model', provider: 'bridge-composer', model: 'cursor/composer-2.5-fast' },
  },
  {
    id: 'u2',
    role: 'user',
    content: [{ type: 'tool-result', toolCallId: 'call_1', content: [{ type: 'text', text: 'ok' }] }],
    source: { kind: 'tool', callId: 'call_1' },
  },
]

const ctx = harnessMessagesToOcxContext(messages, 'host-system')
assert.deepEqual(ctx.systemPrompt, ['host-system', 'sys-a'])
assert.equal(ctx.messages.length, 3)
assert.equal(ctx.messages[0].role, 'user')
assert.equal(ctx.messages[0].content, 'hello')
assert.equal(ctx.messages[1].role, 'assistant')
assert.equal(ctx.messages[1].content[0].type, 'thinking')
assert.equal(ctx.messages[2].role, 'toolResult')
assert.equal(ctx.messages[2].toolName, 'echo')
assert.equal(ctx.messages[2].toolCallId, 'call_1')

const tools = harnessToolsToOcx([{ name: 'echo', description: 'd', parameters: { type: 'object' } }])
assert.equal(tools.length, 1)
assert.equal(tools[0].name, 'echo')

assert.equal(resolveCursorReasoningOption({ model: 'cursor/composer-2.5-fast', reasoningEffort: 'high' }, profile), 'max')

const parsed = buildCursorParsedRequest({
  providerId: 'bridge-composer',
  profile,
  options: {
    provider: 'bridge-composer',
    model: 'cursor/composer-2.5-fast',
    messages,
    system: 'host-system',
    tools: [{ name: 'echo', description: 'd', parameters: { type: 'object' } }],
    reasoningEffort: 'high',
    maxTokens: 512,
  },
  harnessHome: '/tmp',
})
assert.equal(parsed.modelId, 'cursor/composer-2.5-fast')
assert.ok(parsed.context.tools?.length === 1)
assert.equal(parsed.options.reasoning, 'max')
assert.equal(parsed.options.maxOutputTokens, 512)
assert.ok(parsed.context.messages.length >= 3, 'must not flatten to single user message')

const mapper = createAdapterEventChunkMapper()
const chunks = []
for (const ev of [
  { type: 'text_delta', text: 'a' },
  { type: 'thinking_delta', thinking: 'b' },
  { type: 'tool_call_start', id: 'c1', name: 'echo' },
  { type: 'tool_call_delta', arguments: '{"a":' },
  { type: 'tool_call_delta', arguments: '1}' },
  { type: 'tool_call_end' },
  { type: 'done', usage: { inputTokens: 1, outputTokens: 2 }, stopReason: 'tool_calls' },
]) {
  chunks.push(...mapper.push(ev))
}

assert.ok(chunks.some((c) => c.type === 'reasoning-delta' && c.text === 'b'))
assert.ok(chunks.some((c) => c.type === 'tool-call-delta'))
assert.ok(chunks.some((c) => c.type === 'finish' && c.reason.kind === 'tool-calls'))
assert.ok(chunks.some((c) => c.type === 'usage'))

const fixtureContext = {
  options: {
    messages: [{ role: 'user', content: [{ type: 'text', text: UI_VERIFY_APPROVAL_FIXTURE }] }],
  },
}
const uiVerifyEnv = {
  TASKWEAVER_E2E: '1',
  TASKWEAVER_UI_VERIFY: '1',
  TASKWEAVER_UI_VERIFY_MOCK: '1',
}
assert.equal(isUiVerifyApprovalFixture(fixtureContext, uiVerifyEnv), true)
assert.equal(isUiVerifyApprovalFixture(fixtureContext, { ...uiVerifyEnv, TASKWEAVER_PACKAGED: '1' }), false)
assert.equal(isUiVerifyApprovalFixture(fixtureContext, { ...uiVerifyEnv, TASKWEAVER_UI_VERIFY_MOCK: '0' }), false)
assert.equal(isUiVerifyApprovalFixture({
  options: { messages: [{ role: 'user', content: `Please ${UI_VERIFY_APPROVAL_FIXTURE}` }] },
}, uiVerifyEnv), false)

const oldMock = process.env.BRIDGE_SMOKE_MOCK
const oldE2e = process.env.TASKWEAVER_E2E
const oldUiVerify = process.env.TASKWEAVER_UI_VERIFY
const oldUiVerifyMock = process.env.TASKWEAVER_UI_VERIFY_MOCK
try {
  process.env.BRIDGE_SMOKE_MOCK = '1'
  process.env.TASKWEAVER_E2E = '1'
  process.env.TASKWEAVER_UI_VERIFY = '1'
  process.env.TASKWEAVER_UI_VERIFY_MOCK = '1'
  const mockBackend = createCursorBackend()
  const fixtureChunks = []
  for await (const chunk of mockBackend.stream(fixtureContext)) fixtureChunks.push(chunk)
  assert.ok(fixtureChunks.some((chunk) => chunk.type === 'tool-call-delta' && chunk.name === 'bash'))
  assert.equal(fixtureChunks.at(-1)?.reason?.kind, 'tool-calls')
  const replyChunks = []
  for await (const chunk of mockBackend.stream({ options: { messages: [{ role: 'user', content: 'hello' }] } })) replyChunks.push(chunk)
  assert.ok(replyChunks.some((chunk) => chunk.type === 'text-delta' && chunk.text === UI_VERIFY_MOCK_REPLY))
} finally {
  if (oldMock === undefined) delete process.env.BRIDGE_SMOKE_MOCK
  else process.env.BRIDGE_SMOKE_MOCK = oldMock
  if (oldE2e === undefined) delete process.env.TASKWEAVER_E2E
  else process.env.TASKWEAVER_E2E = oldE2e
  if (oldUiVerify === undefined) delete process.env.TASKWEAVER_UI_VERIFY
  else process.env.TASKWEAVER_UI_VERIFY = oldUiVerify
  if (oldUiVerifyMock === undefined) delete process.env.TASKWEAVER_UI_VERIFY_MOCK
  else process.env.TASKWEAVER_UI_VERIFY_MOCK = oldUiVerifyMock
}

console.log('test-taskweaver-bridge-transport: ok')
