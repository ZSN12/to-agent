import { afterEach, describe, expect, it, vi } from 'vitest'
import { TaskWeaverSearchProvider } from '../src/provider.ts'

const variables = {
  enabled: 'TASKWEAVER_WEB_SEARCH_ENABLED',
  key: 'TASKWEAVER_WEB_SEARCH_API_KEY_SECRET',
  endpoint: 'TASKWEAVER_WEB_SEARCH_ENDPOINT',
  maxResults: 'TASKWEAVER_WEB_SEARCH_MAX_RESULTS',
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('TaskWeaverSearchProvider', () => {
  it('is available when enabled and reports missing provider credentials on use', async () => {
    const provider = new TaskWeaverSearchProvider()
    vi.stubEnv(variables.enabled, 'true')
    vi.stubEnv(variables.endpoint, 'https://qianfan.baidubce.com/v2/ai_search/web_search')
    expect(provider.available()).toBe(true)
    await expect(provider.search({ query: 'missing key' })).rejects.toMatchObject({
      code: 'WEB_PROVIDER_UNAVAILABLE',
    })

    vi.stubEnv(variables.key, 'runtime-only-secret')
    expect(provider.available()).toBe(true)

    vi.stubEnv(variables.enabled, 'false')
    expect(provider.available()).toBe(false)
  })

  it('uses the runtime secret and returns Baidu references as web sources', async () => {
    vi.stubEnv(variables.enabled, 'true')
    vi.stubEnv(variables.key, 'runtime-only-secret')
    vi.stubEnv(variables.endpoint, 'https://qianfan.baidubce.com/v2/ai_search/web_search')
    vi.stubEnv(variables.maxResults, '3')

    let request: { url: string | URL | Request, init?: RequestInit } | undefined
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      request = { url, init }
      return new Response(JSON.stringify({
        references: [
          { title: '文档', url: 'https://example.com/docs', content: '搜索摘要', date: '2026-10-09' },
        ],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }))

    const result = await new TaskWeaverSearchProvider().search({ query: 'TaskWeaver', maxResults: 2 })
    expect(request?.url).toBe('https://qianfan.baidubce.com/v2/ai_search/web_search')
    expect((request?.init?.headers as Record<string, string>)['X-Appbuilder-Authorization'])
      .toBe('Bearer runtime-only-secret')
    expect(JSON.parse(String(request?.init?.body))).toMatchObject({
      messages: [{ role: 'user', content: 'TaskWeaver' }],
      resource_type_filter: [{ type: 'web', top_k: 2 }],
    })
    expect(result.sources).toEqual([{
      url: 'https://example.com/docs',
      title: '文档',
      snippet: '搜索摘要',
      publishedAt: '2026-10-09',
    }])
  })

  it('uses the existing no-key DuckDuckGo fallback when no endpoint is configured', async () => {
    vi.stubEnv(variables.enabled, 'true')
    vi.stubEnv(variables.endpoint, '')
    vi.stubEnv(variables.key, '')
    vi.stubEnv(variables.maxResults, '2')
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input))
      expect(url.origin).toBe('https://api.duckduckgo.com')
      expect(url.searchParams.get('q')).toBe('TaskWeaver query')
      return new Response(JSON.stringify({
        Heading: 'TaskWeaver',
        AbstractText: 'Project overview',
        AbstractURL: 'https://example.com/project',
        RelatedTopics: [{ Text: 'Docs - Documentation', FirstURL: 'https://example.com/docs' }],
      }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const provider = new TaskWeaverSearchProvider()
    expect(provider.available()).toBe(true)
    const result = await provider.search({ query: 'TaskWeaver query' })
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(result.sources).toEqual([
      { url: 'https://example.com/project', title: 'TaskWeaver', snippet: 'Project overview' },
      { url: 'https://example.com/docs', title: 'Docs', snippet: 'Docs - Documentation' },
    ])
    expect(result.truncated).toBe(false)
  })

  it('preserves Tavily endpoint, key, result mapping, and key-prefix selection', async () => {
    vi.stubEnv(variables.enabled, 'true')
    vi.stubEnv(variables.endpoint, 'https://api.tavily.com/search')
    vi.stubEnv(variables.key, 'tvly-configured-key')
    let captured: { url: string | URL | Request; init?: RequestInit } | undefined
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      captured = { url, init }
      return new Response(JSON.stringify({ results: [
        { title: 'Tavily result', url: 'https://example.com/tavily', content: 'Tavily snippet' },
      ] }), { status: 200 })
    }))

    const result = await new TaskWeaverSearchProvider().search({ query: 'Tavily query', maxResults: 4 })
    expect(captured?.url).toBe('https://api.tavily.com/search')
    expect((captured?.init?.headers as Record<string, string>).Authorization).toBe('Bearer tvly-configured-key')
    expect(JSON.parse(String(captured?.init?.body))).toMatchObject({
      query: 'Tavily query',
      max_results: 4,
      api_key: 'tvly-configured-key',
    })
    expect(result.sources).toEqual([{
      url: 'https://example.com/tavily', title: 'Tavily result', snippet: 'Tavily snippet',
    }])

    vi.stubEnv(variables.endpoint, '')
    vi.stubEnv(variables.key, 'tvly-prefix-key')
    await new TaskWeaverSearchProvider().search({ query: 'inferred provider' })
    expect(captured?.url).toBe('https://api.tavily.com/search')
  })

  it('preserves Brave and Serper request formats and response mappings', async () => {
    vi.stubEnv(variables.enabled, 'true')
    vi.stubEnv(variables.key, 'provider-key')
    const calls: Array<{ url: string | URL | Request; init?: RequestInit }> = []
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url, init })
      if (String(url).includes('brave')) {
        return new Response(JSON.stringify({ web: { results: [
          { title: 'Brave result', url: 'https://example.com/brave', description: 'Brave snippet' },
        ] } }), { status: 200 })
      }
      return new Response(JSON.stringify({ organic: [
        { title: 'Serper result', link: 'https://example.com/serper', snippet: 'Serper snippet' },
      ] }), { status: 200 })
    }))

    vi.stubEnv(variables.endpoint, 'https://api.search.brave.com/res/v1/web/search')
    const brave = await new TaskWeaverSearchProvider().search({ query: 'Brave query', maxResults: 3 })
    expect(new URL(String(calls[0].url)).searchParams.get('q')).toBe('Brave query')
    expect((calls[0].init?.headers as Record<string, string>)['X-Subscription-Token']).toBe('provider-key')
    expect(brave.sources).toEqual([{
      url: 'https://example.com/brave', title: 'Brave result', snippet: 'Brave snippet',
    }])

    vi.stubEnv(variables.endpoint, 'https://google.serper.dev/search')
    const serper = await new TaskWeaverSearchProvider().search({ query: 'Serper query', maxResults: 2 })
    expect(calls[1].url).toBe('https://google.serper.dev/search')
    expect((calls[1].init?.headers as Record<string, string>)['X-API-KEY']).toBe('provider-key')
    expect(JSON.parse(String(calls[1].init?.body))).toEqual({ q: 'Serper query', num: 2 })
    expect(serper.sources).toEqual([{
      url: 'https://example.com/serper', title: 'Serper result', snippet: 'Serper snippet',
    }])
  })

  it('preserves generic query-template requests and adaptive response parsing', async () => {
    vi.stubEnv(variables.enabled, 'true')
    vi.stubEnv(variables.endpoint, 'https://search.example/query/{query}')
    vi.stubEnv(variables.key, 'custom-key')
    let captured: { url: string | URL | Request; init?: RequestInit } | undefined
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      captured = { url, init }
      return new Response(JSON.stringify({ data: [
        { name: 'Custom result', href: 'https://example.com/custom', body: 'Custom body' },
      ] }), { status: 200 })
    }))

    const result = await new TaskWeaverSearchProvider().search({ query: 'a query with spaces' })
    expect(captured?.url).toBe('https://search.example/query/a%20query%20with%20spaces')
    expect(captured?.init?.method).toBe('GET')
    expect((captured?.init?.headers as Record<string, string>).Authorization).toBe('Bearer custom-key')
    expect((captured?.init?.headers as Record<string, string>)['X-API-Key']).toBe('custom-key')
    expect(result.sources).toEqual([{
      url: 'https://example.com/custom', title: 'Custom result', snippet: 'Custom body',
    }])
  })
})
