#!/usr/bin/env node
import assert from 'node:assert/strict'
import {
  harnessMessagesToOcxContext,
  harnessToolsToOcx,
  resolveCursorReasoningOption,
  createAdapterEventChunkMapper,
  buildCursorParsedRequest,
} from '../packages/taskweaver-bridge-transport/index.mjs'

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

console.log('test-taskweaver-bridge-transport: ok')
