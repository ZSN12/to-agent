#!/usr/bin/env node
import assert from 'node:assert/strict'
import {
  createGoogleAdapter,
  resolveAntigravityModelRoute,
} from '../packages/provider-bridge-transport/google-antigravity-adapter.mjs'

const antigravityProfile = {
  models: [{
    id: 'gemini-3.8-flash',
    thinkingLevelMap: { low: 'low', medium: 'medium', high: 'high' },
    defaultThinkingLevel: 'medium',
  }],
}

for (const effort of ['low', 'medium', 'high']) {
  assert.deepEqual(resolveAntigravityModelRoute({
    modelId: 'gemini-3.8-flash',
    options: { reasoning: effort },
  }, antigravityProfile), {
    modelId: `gemini-3.8-flash-${effort}`,
    reasoning: undefined,
  }, `the ${effort} UI tier must route to Antigravity's matching model id`)
}

const provider = {
  apiKey: 'oauth-secret',
  baseUrl: 'https://cloudcode-pa.googleapis.com/',
  project: 'test-project',
}

const toolParameters = {
  type: 'object',
  properties: {
    q: { type: 'string', 'x-mcp-header': { source: 'transport' } },
    options: {
      type: 'object',
      properties: {
        value: { type: 'string', 'x-mcp-header': { source: 'nested transport' } },
      },
    },
    items: {
      type: 'array',
      items: { type: 'object', properties: { id: { type: 'string', 'x-mcp-header': true } } },
    },
    nested: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          first: { type: 'string' },
          second: { type: 'string' },
          third: { type: 'string' },
          maybe: { type: ['string', 'null'], title: 'Optional text', 'x-mcp-header': true },
        },
        required: ['maybe', 'unknown'],
      },
      'x-transport-note': 'must not cross the provider boundary',
    },
  },
  required: ['q'],
}

const parsed = {
  modelId: 'gemini-test',
  stream: true,
  context: {
    systemPrompt: ['Be concise.'],
    messages: [
      { role: 'user', content: 'Run the tool.' },
      {
        role: 'assistant',
        content: [{ type: 'toolCall', id: 'call-1', name: 'lookup', arguments: { q: 'test' } }],
      },
      { role: 'toolResult', toolCallId: 'call-1', toolName: 'lookup', content: 'found' },
    ],
    tools: [{ name: 'lookup', description: 'Look up a value', parameters: toolParameters }],
  },
  options: { maxOutputTokens: 128, temperature: 0.2, reasoning: 'high' },
}

const adapter = createGoogleAdapter(provider)
const request = await adapter.buildRequest(parsed)
assert.equal(request.url, 'https://cloudcode-pa.googleapis.com/v1internal:streamGenerateContent?alt=sse')
assert.equal(request.method, 'POST')
assert.equal(request.headers.Authorization, 'Bearer oauth-secret')
assert.match(request.headers['User-Agent'], /^antigravity\/ide\//)
const envelope = JSON.parse(request.body)
assert.equal(envelope.model, 'gemini-test')
assert.equal(envelope.userAgent, 'antigravity')
assert.equal(envelope.project, 'test-project')
assert.match(envelope.requestId, /^agent-/)
assert.equal(envelope.request.systemInstruction.parts[0].text, 'Be concise.')
assert.equal(envelope.request.contents[0].parts[0].text, 'Run the tool.')
assert.deepEqual(envelope.request.contents[1].parts[0].functionCall, {
  name: 'lookup', id: 'call-1', args: { q: 'test' },
})
assert.deepEqual(envelope.request.contents[2].parts[0].functionResponse, {
  name: 'lookup', id: 'call-1', response: { result: 'found' },
})
assert.deepEqual(envelope.request.tools[0].functionDeclarations[0].parameters, {
  type: 'object',
  properties: {
    q: { type: 'string' },
    options: { type: 'object', properties: { value: { type: 'string' } } },
    items: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' } } } },
    nested: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          first: { type: 'string' },
          second: { type: 'string' },
          third: { type: 'string' },
          maybe: { type: 'string', nullable: true },
        },
        required: ['maybe'],
      },
    },
  },
  required: ['q'],
})
assert.deepEqual(toolParameters.properties.q['x-mcp-header'], { source: 'transport' })
const assertGeminiSchemaIsWireSafe = schema => {
  const allowedKeys = new Set(['type', 'nullable', 'description', 'format', 'enum', 'properties', 'items', 'required'])
  if (!schema || typeof schema !== 'object') return
  if (Array.isArray(schema)) {
    for (const item of schema) assertGeminiSchemaIsWireSafe(item)
    return
  }
  assert.ok(!Array.isArray(schema.type), 'Gemini Schema.type must be a scalar enum')
  for (const key of Object.keys(schema)) assert.ok(allowedKeys.has(key), `unsupported Gemini schema field: ${key}`)
  if (schema.properties && typeof schema.properties === 'object') {
    for (const child of Object.values(schema.properties)) assertGeminiSchemaIsWireSafe(child)
  }
  if (schema.items) assertGeminiSchemaIsWireSafe(schema.items)
}
assertGeminiSchemaIsWireSafe(envelope.request.tools[0].functionDeclarations[0].parameters)
assert.equal(envelope.request.generationConfig.maxOutputTokens, 128)
assert.deepEqual(envelope.request.generationConfig.thinkingConfig, {
  thinkingLevel: 'high',
  includeThoughts: true,
})

const frames = [
  { response: { candidates: [{ content: { parts: [{ text: 'Answer ' }, { text: 'reasoning', thought: true }] } }] } },
  { response: { candidates: [{ content: { parts: [{ functionCall: { name: 'lookup', args: { q: 'next' }, id: 'call-2' } }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 5, cachedContentTokenCount: 3, candidatesTokenCount: 7, thoughtsTokenCount: 2 } } },
]
const sse = frames.map(value => `data: ${JSON.stringify(value)}\r\n\r\n`).join('')
const bytes = new TextEncoder().encode(sse)
const splitStream = new ReadableStream({
  start(controller) {
    controller.enqueue(bytes.slice(0, 17))
    controller.enqueue(bytes.slice(17, 81))
    controller.enqueue(bytes.slice(81))
    controller.close()
  },
})
const events = []
for await (const event of adapter.parseStream(new Response(splitStream))) events.push(event)
assert.deepEqual(events.filter(event => event.type === 'text_delta').map(event => event.text), ['Answer '])
assert.deepEqual(events.filter(event => event.type === 'thinking_delta').map(event => event.thinking), ['reasoning'])
assert.deepEqual(events.filter(event => event.type === 'tool_call_start').map(({ id, name }) => ({ id, name })), [
  { id: 'call-2', name: 'lookup' },
])
assert.deepEqual(events.filter(event => event.type === 'tool_call_delta').map(event => event.arguments), ['{"q":"next"}'])
assert.deepEqual(events.at(-1), {
  type: 'done',
  usage: { inputTokens: 2, outputTokens: 9, cacheReadTokens: 3, reasoningOutputTokens: 2 },
})

const truncated = []
for await (const event of adapter.parseStream(new Response('data: {"response":{"candidates":[]}}\n\n'))) truncated.push(event)
assert.equal(truncated.at(-1)?.type, 'error')
assert.match(truncated.at(-1)?.message, /without a terminal signal/)

const malformed = []
for await (const event of adapter.parseStream(new Response('data: {broken}\n\n'))) malformed.push(event)
assert.equal(malformed.at(-1)?.type, 'error')
assert.match(malformed.at(-1)?.message, /malformed SSE/)

console.log('test-google-antigravity-native-adapter: request envelope and SSE parsing ok')
