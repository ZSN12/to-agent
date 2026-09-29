import { readFile, readFileSync } from 'node:fs'
import { promisify } from 'node:util'
import { WebError } from '@z/dsh-web'
import type { WebSearchProvider, WebSearchRequest, WebSearchResult, WebSearchSource } from '@z/dsh-web'

const readFileAsync = promisify(readFile)
const DEFAULT_CONFIG_PATH_ENV = 'TASKWEAVER_WEB_SEARCH_CONFIG_PATH'
const DEFAULT_ENDPOINT = 'https://qianfan.baidubce.com/v2/ai_search/web_search'

interface TaskWeaverSearchConfig {
  enabled?: boolean
  apiKey?: string
  endpoint?: string
  maxResults?: number
}

function readConfig(pathEnv: string): TaskWeaverSearchConfig | null {
  const configPath = process.env[pathEnv]
  if (!configPath) return null
  try {
    const raw = readFileSync(configPath, 'utf8')
    return JSON.parse(raw) as TaskWeaverSearchConfig
  } catch {
    return null
  }
}

function normalizeEndpoint(endpoint: string | undefined): string {
  return endpoint?.trim() || DEFAULT_ENDPOINT
}

function isBaiduEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint)
    return url.hostname === 'qianfan.baidubce.com'
      && url.pathname.replace(/\/+$/, '').endsWith('/v2/ai_search/web_search')
  } catch {
    return false
  }
}

function apiError(data: Record<string, unknown>): string {
  const message = typeof data.message === 'string' ? data.message : JSON.stringify(data)
  const requestId = typeof data.request_id === 'string' ? ` (request_id ${data.request_id})` : ''
  return `${message}${requestId}`
}

export class TaskWeaverSearchProvider implements WebSearchProvider {
  readonly id = 'taskweaver-baidu'

  constructor(private readonly pathEnv = DEFAULT_CONFIG_PATH_ENV) {}

  available(): boolean {
    const config = readConfig(this.pathEnv)
    const endpoint = normalizeEndpoint(config?.endpoint)
    return config?.enabled === true
      && typeof config.apiKey === 'string'
      && config.apiKey.trim().length > 0
      && isBaiduEndpoint(endpoint)
  }

  async search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult> {
    const configPath = process.env[this.pathEnv]
    if (!configPath) throw new WebError('TaskWeaver 搜索配置文件路径未传入 DSH Host', 'WEB_PROVIDER_UNAVAILABLE')

    let config: TaskWeaverSearchConfig
    try {
      config = JSON.parse(await readFileAsync(configPath, 'utf8')) as TaskWeaverSearchConfig
    } catch (error) {
      throw new WebError('无法读取 TaskWeaver 网页搜索配置', 'WEB_PROVIDER_UNAVAILABLE', { cause: error })
    }
    if (config.enabled !== true) throw new WebError('TaskWeaver 网页搜索尚未启用', 'WEB_PROVIDER_UNAVAILABLE')
    const apiKey = typeof config.apiKey === 'string' ? config.apiKey.trim() : ''
    if (!apiKey) throw new WebError('TaskWeaver 网页搜索 API Key 未配置', 'WEB_PROVIDER_UNAVAILABLE')

    const endpoint = normalizeEndpoint(config.endpoint)
    if (!isBaiduEndpoint(endpoint)) {
      throw new WebError('DSH 中的 TaskWeaver 搜索提供方目前仅支持百度千帆网页搜索接口', 'WEB_PROVIDER_UNAVAILABLE')
    }

    const limit = Math.max(1, Math.min(50, request.maxResults ?? config.maxResults ?? 5))
    let response: Response
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        redirect: 'error',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'X-Appbuilder-Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: request.query }],
          search_source: 'baidu_search_v2',
          resource_type_filter: [{ type: 'web', top_k: limit }],
        }),
        ...(signal ? { signal } : {}),
      })
    } catch (error) {
      throw new WebError(`百度搜索请求失败：${String(error)}`, 'WEB_PROVIDER_ERROR', { cause: error })
    }

    let payload: Record<string, unknown>
    try {
      payload = await response.json() as Record<string, unknown>
    } catch (error) {
      throw new WebError(`百度搜索返回了无效 JSON (HTTP ${response.status})`, 'WEB_PROVIDER_ERROR', { cause: error })
    }
    const code = payload.code
    if (!response.ok || (code !== undefined && code !== 0 && code !== '0' && code !== 'success')) {
      throw new WebError(`百度搜索失败 (HTTP ${response.status}): ${apiError(payload)}`, 'WEB_PROVIDER_ERROR')
    }

    const rawReferences = Array.isArray(payload.references) ? payload.references : []
    const sources: WebSearchSource[] = rawReferences
      .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
      .filter((item) => typeof item.url === 'string' && item.url.trim().length > 0)
      .slice(0, limit)
      .map((item) => ({
        url: item.url as string,
        ...(typeof item.title === 'string' && item.title ? { title: item.title } : {}),
        ...(typeof item.content === 'string' && item.content ? { snippet: item.content } : {}),
        ...(typeof item.date === 'string' && item.date ? { publishedAt: item.date } : {}),
      }))

    return { sources, truncated: rawReferences.length > sources.length }
  }
}
