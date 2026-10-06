import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createCustomProviderService } from '../electron/backend/custom-provider-service.mjs'

const requests = []
let toolSupported = true
const server = createServer(async (req, res) => {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const raw = Buffer.concat(chunks).toString('utf8')
  const body = raw ? JSON.parse(raw) : {}
  requests.push({ method: req.method, url: req.url, body })
  res.setHeader('content-type', 'application/json')

  if (req.url === '/v1/models') {
    res.end(JSON.stringify({ data: [{ id: 'fixture-model' }] }))
    return
  }
  if (req.url === '/v1/chat/completions') {
    const hasTool = Array.isArray(body.tools) && body.tools.length > 0
    const message = hasTool && toolSupported
      ? { role: 'assistant', tool_calls: [{ id: 'call-test', type: 'function', function: { name: 'taskweaver_probe', arguments: '{"ok":true}' } }] }
      : { role: 'assistant', content: 'OK' }
    res.end(JSON.stringify({ choices: [{ message, finish_reason: hasTool && toolSupported ? 'tool_calls' : 'stop' }] }))
    return
  }
  if (req.url === '/v1/responses') {
    res.end(JSON.stringify({ output: [{ type: 'function_call', name: 'taskweaver_probe', arguments: '{"ok":true}' }] }))
    return
  }
  res.statusCode = 404
  res.end(JSON.stringify({ error: { message: 'not found' } }))
})

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const baseUrl = `http://127.0.0.1:${server.address().port}/v1`
const service = createCustomProviderService({
  modelsPath: '/tmp/taskweaver-custom-provider-test-models.json',
  credentials: { read: async () => null, modify: async () => null, delete: async () => {} },
  refreshRuntime: async () => {},
})

try {
  const generation = await service.testCustomProvider({ baseUrl, apiKey: 'fixture-secret', modelId: 'fixture-model' })
  assert.equal(generation.ok, true)
  assert.equal(generation.method, 'POST /chat/completions')
  assert.equal(requests.at(-1).url, '/v1/chat/completions', 'connection test must verify model generation, not only /models')
  assert.equal(requests.some((row) => row.url === '/v1/models'), false)

  const tools = await service.testCustomProviderToolCall({ baseUrl, apiKey: 'fixture-secret', modelId: 'fixture-model' })
  assert.deepEqual({ ok: tools.ok, supported: tools.supported }, { ok: true, supported: true })
  assert.equal(requests.at(-1).body.tool_choice, 'required')
  assert.equal(requests.at(-1).body.tools[0].function.name, 'taskweaver_probe')

  toolSupported = false
  const noTools = await service.testCustomProviderToolCall({ baseUrl, apiKey: 'fixture-secret', modelId: 'fixture-model' })
  assert.deepEqual({ ok: noTools.ok, supported: noTools.supported }, { ok: true, supported: false },
    'HTTP 200 without a function call must not be reported as tool support')

  const responses = await service.testCustomProviderToolCall({
    baseUrl, apiKey: 'fixture-secret', modelId: 'fixture-model', api: 'openai-responses',
  })
  assert.deepEqual({ ok: responses.ok, supported: responses.supported }, { ok: true, supported: true })
  assert.equal(requests.at(-1).url, '/v1/responses')
  assert.equal(requests.at(-1).body.tools[0].name, 'taskweaver_probe')

  console.log('custom provider capability tests passed: generation, Chat Completions tool call, unsupported-tool detection, Responses tool call')
} finally {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
}
