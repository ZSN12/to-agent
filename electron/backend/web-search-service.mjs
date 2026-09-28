import path from 'node:path'
import { createJsonStore } from './json-store.mjs'
import {
  WEB_SEARCH_DUCKDUCKGO_TIMEOUT_MS,
  WEB_SEARCH_TAVILY_TIMEOUT_MS,
  WEB_SEARCH_SERPER_TIMEOUT_MS,
  WEB_SEARCH_GENERIC_TIMEOUT_MS,
  WEB_SEARCH_MAX_RESULTS,
  WEB_SEARCH_DEFAULT_RESULTS,
  WEB_SEARCH_ERROR_MESSAGE_MAX_LENGTH,
} from './config.mjs'

const DEFAULT = { enabled: false, apiKey: '', endpoint: '', maxResults: WEB_SEARCH_DEFAULT_RESULTS }

/**
 * 格式化搜索结果条目
 */
function formatResults(query, items) {
  if (!items || !items.length) {
    return `未找到与「${query}」相关的公开检索结果，请尝试更换关键词。`
  }
  const lines = [`### 检索结果：「${query}」\n`]
  items.forEach((it, idx) => {
    const title = it.title?.trim() || `结果 ${idx + 1}`
    const url = it.url || it.link || it.href || ''
    const content = it.content || it.snippet || it.description || it.text || ''
    lines.push(`**${idx + 1}. [${title}](${url})**`)
    if (content) lines.push(content.trim())
    lines.push('')
  })
  return lines.join('\n').trim()
}

/**
 * 默认 DuckDuckGo 免 Key 检索
 */
async function searchDuckDuckGo(query, maxResults) {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&skip_disambig=1`
  const res = await fetch(url, { signal: AbortSignal.timeout(WEB_SEARCH_DUCKDUCKGO_TIMEOUT_MS) })
  if (!res.ok) throw new Error(`DuckDuckGo 检索 HTTP ${res.status}`)
  const data = await res.json()
  const results = []

  if (data.AbstractText) {
    results.push({
      title: data.Heading || '概要',
      url: data.AbstractURL || '',
      content: data.AbstractText,
    })
  }

  const topics = Array.isArray(data.RelatedTopics) ? data.RelatedTopics : []
  for (const item of topics) {
    if (results.length >= maxResults) break
    if (item.Text && item.FirstURL) {
      results.push({
        title: item.Text.split(' - ')[0] || '相关主题',
        url: item.FirstURL,
        content: item.Text,
      })
    } else if (Array.isArray(item.Topics)) {
      for (const sub of item.Topics) {
        if (results.length >= maxResults) break
        if (sub.Text && sub.FirstURL) {
          results.push({
            title: sub.Text.split(' - ')[0] || '相关主题',
            url: sub.FirstURL,
            content: sub.Text,
          })
        }
      }
    }
  }

  return formatResults(query, results)
}

/**
 * 自定义 / 多引擎搜索执行器
 */
async function executeWebSearch({ query, maxResults = 5, endpoint = '', apiKey = '' }) {
  const trimmedEndpoint = String(endpoint || '').trim()
  const trimmedKey = String(apiKey || '').trim()
  const limit = Math.min(WEB_SEARCH_MAX_RESULTS, Math.max(1, Number(maxResults) || WEB_SEARCH_DEFAULT_RESULTS))

  // 1. Tavily 搜索接口 (当 endpoint 包含 tavily 或未填 endpoint 但有 tvly- 开头的 key)
  if (trimmedEndpoint.includes('tavily') || (!trimmedEndpoint && trimmedKey.startsWith('tvly-'))) {
    const targetUrl = trimmedEndpoint || 'https://api.tavily.com/search'
    const headers = { 'Content-Type': 'application/json' }
    if (trimmedKey) headers.Authorization = `Bearer ${trimmedKey}`
    const res = await fetch(targetUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        query,
        max_results: limit,
        api_key: trimmedKey || undefined,
        search_depth: 'basic',
      }),
      signal: AbortSignal.timeout(WEB_SEARCH_TAVILY_TIMEOUT_MS),
    })
    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      throw new Error(`Tavily 检索失败 HTTP ${res.status}: ${errText.slice(0, WEB_SEARCH_ERROR_MESSAGE_MAX_LENGTH)}`)
    }
    const data = await res.json()
    const items = (data.results || []).slice(0, limit).map((r) => ({
      title: r.title,
      url: r.url,
      content: r.content,
    }))
    return formatResults(query, items)
  }

  // 2. Brave Search 接口
  if (trimmedEndpoint.includes('brave') || trimmedEndpoint.includes('search.brave.com')) {
    const targetUrl = new URL(trimmedEndpoint || 'https://api.search.brave.com/res/v1/web/search')
    targetUrl.searchParams.set('q', query)
    targetUrl.searchParams.set('count', String(limit))
    const headers = { Accept: 'application/json' }
    if (trimmedKey) headers['X-Subscription-Token'] = trimmedKey
    const res = await fetch(targetUrl.toString(), {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(WEB_SEARCH_GENERIC_TIMEOUT_MS),
    })
    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      throw new Error(`Brave 检索失败 HTTP ${res.status}: ${errText.slice(0, WEB_SEARCH_ERROR_MESSAGE_MAX_LENGTH)}`)
    }
    const data = await res.json()
    const items = (data.web?.results || []).slice(0, limit).map((r) => ({
      title: r.title,
      url: r.url,
      content: r.description,
    }))
    return formatResults(query, items)
  }

  // 3. Serper 接口 (google.serper.dev)
  if (trimmedEndpoint.includes('serper')) {
    const targetUrl = trimmedEndpoint || 'https://google.serper.dev/search'
    const headers = { 'Content-Type': 'application/json' }
    if (trimmedKey) headers['X-API-KEY'] = trimmedKey
    const res = await fetch(targetUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ q: query, num: limit }),
      signal: AbortSignal.timeout(WEB_SEARCH_SERPER_TIMEOUT_MS),
    })
    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      throw new Error(`Serper 检索失败 HTTP ${res.status}: ${errText.slice(0, WEB_SEARCH_ERROR_MESSAGE_MAX_LENGTH)}`)
    }
    const data = await res.json()
    const items = (data.organic || []).slice(0, limit).map((r) => ({
      title: r.title,
      url: r.link,
      content: r.snippet,
    }))
    return formatResults(query, items)
  }

  // 4. 自定义通用 HTTP API
  if (trimmedEndpoint) {
    const headers = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    }
    if (trimmedKey) {
      headers.Authorization = `Bearer ${trimmedKey}`
      headers['X-API-Key'] = trimmedKey
    }

    let res
    // 若配置的 endpoint 带查询参或显式声明 GET，尝试 GET
    if (trimmedEndpoint.includes('{query}') || trimmedEndpoint.includes('?')) {
      const formattedUrl = trimmedEndpoint.includes('{query}')
        ? trimmedEndpoint.replace('{query}', encodeURIComponent(query))
        : `${trimmedEndpoint}&q=${encodeURIComponent(query)}`
      res = await fetch(formattedUrl, { method: 'GET', headers, signal: AbortSignal.timeout(WEB_SEARCH_GENERIC_TIMEOUT_MS) })
    } else {
      // 默认尝试以 POST 发送常见结构
      try {
        res = await fetch(trimmedEndpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            query,
            q: query,
            maxResults: limit,
            limit,
            apiKey: trimmedKey || undefined,
          }),
          signal: AbortSignal.timeout(WEB_SEARCH_GENERIC_TIMEOUT_MS),
        })
      } catch (_postErr) {
        // 若 POST 出错，降级尝试 GET query 参数
        const fallbackUrl = `${trimmedEndpoint}${trimmedEndpoint.includes('?') ? '&' : '?'}q=${encodeURIComponent(query)}&limit=${limit}`
        res = await fetch(fallbackUrl, { method: 'GET', headers, signal: AbortSignal.timeout(WEB_SEARCH_GENERIC_TIMEOUT_MS) })
      }
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      throw new Error(`自定义检索接口 HTTP ${res.status}: ${errText.slice(0, WEB_SEARCH_ERROR_MESSAGE_MAX_LENGTH)}`)
    }

    const data = await res.json()
    // 通用自适应解析常见的数组结构
    const rawList = Array.isArray(data)
      ? data
      : Array.isArray(data.results)
        ? data.results
        : Array.isArray(data.data)
          ? data.data
          : Array.isArray(data.organic)
            ? data.organic
            : Array.isArray(data.items)
              ? data.items
              : []

    if (rawList.length > 0) {
      const items = rawList.slice(0, limit).map((r) => ({
        title: r.title || r.name || r.heading,
        url: r.url || r.link || r.href,
        content: r.content || r.snippet || r.description || r.text || r.body,
      }))
      return formatResults(query, items)
    }

    // 若无法解析成数组结构，直接提取文本
    if (typeof data.text === 'string') return data.text
    if (typeof data.content === 'string') return data.content
    return JSON.stringify(data, null, 2)
  }

  // 5. 默认免配置 DuckDuckGo 兜底
  return searchDuckDuckGo(query, limit)
}

function createWebSearchTool(config) {
  if (!config?.enabled) return null
  return {
    name: 'web_search',
    label: 'Web 搜索',
    description:
      '在互联网上检索与编程、框架技术、最新文档或报错相关的公开信息。支持自定义提供方与 API Key。',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '检索关键词或完整技术提问' },
        maxResults: { type: 'number', description: '最多返回条目数，默认 5' },
      },
      required: ['query'],
    },
    execute: async (_id, params) => {
      const query = String(params?.query ?? '').trim()
      if (!query) throw new Error('query 不能为空')
      const limit = Math.min(20, Math.max(1, Number(params?.maxResults) || config.maxResults || 5))
      const text = await executeWebSearch({
        query,
        maxResults: limit,
        endpoint: config.endpoint,
        apiKey: config.apiKey,
      })
      return { content: [{ type: 'text', text }] }
    },
  }
}

/** 扩展 Web 搜索服务（支持自定义 API、凭据脱敏保护与连通性测试）。 */
export function createWebSearchService({ userData }) {
  const store = createJsonStore(path.join(userData, 'taskweaver-web-search.json'), DEFAULT)

  return {
    async getConfig() {
      const raw = await store.read()
      const hasKey = Boolean(raw.apiKey && String(raw.apiKey).trim())
      return {
        enabled: raw.enabled === true,
        hasKey,
        endpoint: raw.endpoint || '',
        maxResults: Number.isFinite(raw.maxResults) ? raw.maxResults : 5,
      }
    },
    async setConfig(patch) {
      const prev = await store.read()
      let nextKey = prev.apiKey ?? ''
      if (patch.clearKey === true) {
        nextKey = ''
      } else if (typeof patch.apiKey === 'string' && patch.apiKey.trim()) {
        nextKey = patch.apiKey.trim()
      }

      const next = {
        enabled: patch.enabled !== undefined ? patch.enabled === true : prev.enabled ?? false,
        apiKey: nextKey,
        endpoint: typeof patch.endpoint === 'string' ? patch.endpoint.trim() : prev.endpoint ?? '',
        maxResults: Number.isFinite(patch.maxResults)
          ? Math.min(20, Math.max(1, patch.maxResults))
          : prev.maxResults ?? 5,
      }
      await store.write(next)
      return {
        enabled: next.enabled,
        hasKey: Boolean(next.apiKey),
        endpoint: next.endpoint,
        maxResults: next.maxResults,
      }
    },
    async testSearch(query = 'test') {
      const cfg = await store.read()
      try {
        const text = await executeWebSearch({
          query,
          maxResults: cfg.maxResults || 3,
          endpoint: cfg.endpoint,
          apiKey: cfg.apiKey,
        })
        return { ok: true, text }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    },
    async getCustomTools() {
      const cfg = await store.read()
      const tool = createWebSearchTool(cfg)
      return tool ? [tool] : []
    },
  }
}

