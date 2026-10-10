import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@taskweaver/cordis'
import { WebRuntime, type WebSearchProvider } from '@taskweaver/dsh-web'
import UserQuestionService from '@taskweaver/dsh-user-questions'
import type { RpcRequest } from '../src/api/rpc.ts'
import { RpcId } from '../src/api/rpc.ts'
import { createApiProxy } from '../src/api-proxy.ts'

let nextRpc = 1
function request<P>(payload: P): RpcRequest<P> {
  return { rpcId: RpcId(`web-${String(nextRpc++)}`), payload }
}

async function harness(provider: WebSearchProvider) {
  const ctx = new Context()
  await ctx.plugin(WebRuntime)
  await ctx.plugin(UserQuestionService)
  ctx.web.registerSearchProvider(provider)
  return createApiProxy(ctx, {
    defaultModelSelection: () => ({ provider: 'p', model: 'm' }),
    cwd: '/tmp',
  })
}

describe('host.searchWeb', () => {
  afterEach(() => {
    delete process.env.TASKWEAVER_WEB_SEARCH_API_KEY_SECRET
  })

  it('delegates to the Host provider and returns structured sources', async () => {
    let observed: { query: string; maxResults?: number } | undefined
    const api = await harness({
      id: 'fixture',
      available: () => true,
      async search(search) {
        observed = search
        return {
          content: 'summary',
          sources: [{ url: 'https://example.com', title: 'Result', snippet: 'Details' }],
          truncated: false,
        }
      },
    })
    const response = await api.host.searchWeb(request({ query: 'TaskWeaver', maxResults: 4 }), new AbortController().signal)
    expect(observed).toEqual({ query: 'TaskWeaver', maxResults: 4 })
    expect(response.result).toEqual({
      ok: true,
      value: {
        content: 'summary',
        sources: [{ url: 'https://example.com', title: 'Result', snippet: 'Details' }],
        truncated: false,
      },
    })
  })

  it('folds provider failures and aborts into stable RPC errors without leaking the key', async () => {
    process.env.TASKWEAVER_WEB_SEARCH_API_KEY_SECRET = 'test-secret'
    let rejectSearch = false
    let holdSearch = false
    const api = await harness({
      id: 'fixture',
      available: () => true,
      async search(_search, signal) {
        if (holdSearch) {
          await new Promise<void>((resolve) => {
            signal?.addEventListener('abort', () => resolve(), { once: true })
          })
          throw new Error('aborted')
        }
        if (rejectSearch) throw new Error('provider returned test-secret')
        return { sources: [], truncated: false }
      },
    })

    rejectSearch = true
    const failed = await api.host.searchWeb(request({ query: 'q' }), new AbortController().signal)
    expect(failed.result).toMatchObject({ ok: false, error: { code: 'internal', message: 'provider returned [redacted]' } })

    rejectSearch = false
    holdSearch = true
    const controller = new AbortController()
    const pending = api.host.searchWeb(request({ query: 'q' }), controller.signal)
    controller.abort()
    expect((await pending).result).toMatchObject({ ok: false, error: { code: 'cancelled' } })
  })
})
