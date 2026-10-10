import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GenerateOptions, StreamChunk } from '@taskweaver/dsh-llm'

const streamSimple = vi.hoisted(() => vi.fn())
const responsesStreamSimple = vi.hoisted(() => vi.fn())

// A hand-declared route is built by `createProvider` over the protocol table in
// `src/provider.ts`, so the table's lazy api module is the SDK boundary this
// test can observe. A catalog route dispatches through pi-ai's own provider and
// would not see this mock.
vi.mock('@earendil-works/pi-ai/api/openai-completions.lazy', () => ({
  openAICompletionsApi: () => ({ stream: streamSimple, streamSimple }),
}))
vi.mock('@earendil-works/pi-ai/api/openai-responses.lazy', () => ({
  openAIResponsesApi: () => ({ stream: responsesStreamSimple, streamSimple: responsesStreamSimple }),
}))

import { PiAiAdapter } from '../src/adapter.ts'
import { resolveProfiles } from '../src/config.ts'
import { memoryAuth } from './auth-double.ts'

afterEach(() => { streamSimple.mockReset(); responsesStreamSimple.mockReset() })

/** A hand-declared OpenAI-compatible route with one fully described model. */
function gatewayAdapter(): PiAiAdapter {
  return new PiAiAdapter({
    profiles: () => resolveProfiles({
      'local-gateway': {
        api: 'openai-completions',
        baseURL: 'http://127.0.0.1:9/v1',
        models: [{ id: 'local-model', contextWindow: 8192, maxTokens: 1024 }],
      },
    }),
    resolveApiKey: () => Promise.resolve('test-key'),
    auth: memoryAuth(),
  })
}

function gatewayAdapterFor(api: 'openai-responses' | 'anthropic-messages'): PiAiAdapter {
  return new PiAiAdapter({
    profiles: () => resolveProfiles({
      'local-gateway': {
        api,
        baseURL: 'http://127.0.0.1:9/v1',
        models: [{ id: 'local-model', contextWindow: 8192, maxTokens: 1024 }],
      },
    }),
    resolveApiKey: () => Promise.resolve('test-key'),
    auth: memoryAuth(),
  })
}

async function drain(adapter: PiAiAdapter, request: Partial<GenerateOptions> = {}): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = []
  for await (const chunk of adapter.stream({
    provider: 'local-gateway',
    model: 'local-model',
    messages: [],
    ...request,
  })) chunks.push(chunk)
  return chunks
}

describe('pi-ai SDK retry boundary', () => {
  it('pins one SDK attempt even when the installed provider currently defaults to zero retries', async () => {
    streamSimple.mockImplementation(() => { throw new Error('mock SDK boundary') })

    const chunks = await drain(gatewayAdapter())

    expect(streamSimple).toHaveBeenCalledOnce()
    expect(streamSimple.mock.calls[0]?.[2]).toMatchObject({ maxRetries: 0, apiKey: 'test-key' })
    // pi-ai reports a setup failure as a terminal in-stream error rather than
    // throwing, which the converter turns into the harness error finish.
    expect(chunks.at(-1)).toMatchObject({
      type: 'finish',
      reason: { kind: 'error', failure: { message: 'mock SDK boundary' } },
    })
  })

  it('dispatches a hand-declared route to the endpoint and model its configuration describes', async () => {
    streamSimple.mockImplementation(() => { throw new Error('mock SDK boundary') })

    await drain(gatewayAdapter())

    expect(streamSimple.mock.calls[0]?.[0]).toMatchObject({
      id: 'local-model',
      provider: 'local-gateway',
      api: 'openai-completions',
      baseUrl: 'http://127.0.0.1:9/v1',
      contextWindow: 8192,
      maxTokens: 1024,
    })
  })

  it('maps structured output to OpenAI Completions JSON Schema', async () => {
    streamSimple.mockImplementation(() => { throw new Error('mock SDK boundary') })
    const schema = { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'], additionalProperties: false }

    await drain(gatewayAdapter(), { outputSchema: schema })

    expect(streamSimple.mock.calls[0]?.[2]?.samplingParams).toEqual({
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'taskweaver_output', strict: true, schema },
      },
    })
  })

  it('maps structured output to OpenAI Responses text.format', async () => {
    responsesStreamSimple.mockImplementation(() => { throw new Error('mock SDK boundary') })
    const schema = { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'], additionalProperties: false }

    await drain(gatewayAdapterFor('openai-responses'), { outputSchema: schema })

    expect(responsesStreamSimple.mock.calls[0]?.[2]?.samplingParams).toEqual({
      text: {
        format: { type: 'json_schema', name: 'taskweaver_output', strict: true, schema },
      },
    })
  })

  it('fails closed when a provider protocol cannot carry structured output', async () => {
    const schema = { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] }

    await expect(drain(gatewayAdapterFor('anthropic-messages'), { outputSchema: schema }))
      .rejects.toMatchObject({ code: 'UNSUPPORTED_OPTION' })
    expect(streamSimple).not.toHaveBeenCalled()
    expect(responsesStreamSimple).not.toHaveBeenCalled()
  })
})
