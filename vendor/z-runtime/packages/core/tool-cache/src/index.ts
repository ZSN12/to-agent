import type { Context } from '@z/cordis'
import type { Agent } from '@z/dsh-agent'
import type { Session } from '@z/dsh-session'
import type { ToolCall, ToolResult } from '@z/dsh-tools'
import z from '@z/schemastery'
import { createHash } from 'node:crypto'

export const name = 'tool-cache'

/**
 * Tool result cache configuration.
 */
export interface Config {
  /**
   * Enable tool result caching. Default: true.
   */
  enabled?: boolean
  /**
   * Maximum number of cached results per session. Default: 128.
   */
  maxEntriesPerSession?: number
  /** Maximum serialized size of one cached result. Default: 65536 bytes. */
  maxResultBytes?: number
  /** Maximum serialized cache size per session. Default: 4194304 bytes. */
  maxCacheBytesPerSession?: number
  /**
   * Tool names to cache (if empty, cache all read-only tools). Default: [].
   */
  allowedTools?: string[]
  /**
   * Tool names to never cache. Default: [].
   */
  blockedTools?: string[]
}

export const Config: z<Config> = z.object({
  enabled: z.boolean().default(true),
  maxEntriesPerSession: z.number().step(1).min(1).default(128),
  maxResultBytes: z.number().step(1).min(1).default(65_536),
  maxCacheBytesPerSession: z.number().step(1).min(1).default(4_194_304),
  allowedTools: z.array(z.string()).default([]),
  blockedTools: z.array(z.string()).default([]),
})

interface CacheEntry {
  result: ToolResult
  bytes: number
}

interface SessionCache {
  entries: Map<string, CacheEntry>
  bytes: number
  hits: number
  misses: number
}

const READ_ONLY_TOOLS = new Set([
  'read',
  'grep',
  'find_files',
  'glob',
  'list_directory',
  'get_file_info',
])

/** Sort object keys recursively so nested argument differences cannot collide. */
function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (typeof value !== 'object' || value === null) return value
  return Object.fromEntries(
    Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, stableValue(nested)]),
  )
}

/**
 * Compute cache key from tool call.
 */
function computeCacheKey(call: ToolCall): string {
  const normalized = JSON.stringify({
    tool: call.tool_name,
    args: stableValue(call.tool_input),
  })
  return createHash('sha256').update(normalized, 'utf8').digest('hex')
}

/**
 * Check if a tool call is cacheable based on tool name and configuration.
 */
function isCacheable(toolName: string, config: Config): boolean {
  if (!READ_ONLY_TOOLS.has(toolName)) return false
  if (!config.enabled) return false
  if (config.blockedTools && config.blockedTools.includes(toolName)) return false

  // If allowedTools is specified, only cache those
  if (config.allowedTools && config.allowedTools.length > 0) {
    return config.allowedTools.includes(toolName)
  }

  return true
}

/**
 * Check if tool arguments indicate a read-only operation.
 */
function isReadOnlyOperation(toolName: string): boolean {
  return READ_ONLY_TOOLS.has(toolName)
}

/**
 * Tool result cache plugin for DAG subtask deduplication.
 *
 * Caches results of read-only tool calls within a session to eliminate
 * redundant operations. The cache is session-scoped and automatically
 * cleared when the session resets.
 *
 * @example
 * ```yaml
 * # In cordis.yml
 * - name: '@z/dsh-tool-cache'
 *   config:
 *     enabled: true
 *     maxEntriesPerSession: 128
 *     maxResultBytes: 65536
 *     allowedTools: ['read', 'grep', 'find_files']
 * ```
 */
export function apply(ctx: Context, config: Config) {
  const sessionCaches = new Map<string, SessionCache>()

  /**
   * Get or create cache for a session.
   */
  function getSessionCache(sessionId: string): SessionCache {
    let cache = sessionCaches.get(sessionId)
    if (!cache) {
      cache = { entries: new Map(), bytes: 0, hits: 0, misses: 0 }
      sessionCaches.set(sessionId, cache)
    }
    return cache
  }

  /**
   * Clear cache for a session.
   */
  function clearSessionCache(sessionId: string) {
    sessionCaches.delete(sessionId)
  }

  function invalidateSessionCache(cache: SessionCache) {
    cache.entries.clear()
    cache.bytes = 0
  }

  // Listen for tool calls and check cache
  ctx.on('agent/tool/call', async (agent: Agent, call: ToolCall, next) => {
    if (!config.enabled) return next()

    const session = agent.session as Session
    if (!session?.sessionId) return next()

    const { tool_name, tool_input } = call

    const cache = getSessionCache(session.sessionId)

    // Any non-read-only tool can mutate workspace state. Invalidate prior
    // reads after it settles, including the partial-write-then-error case.
    if (!isReadOnlyOperation(tool_name)) {
      try {
        return await next()
      } finally {
        invalidateSessionCache(cache)
      }
    }
    if (!isCacheable(tool_name, config)) return next()

    const cacheKey = computeCacheKey(call)

    // Check cache
    const cached = cache.entries.get(cacheKey)
    if (cached) {
      cache.hits++
      cache.entries.delete(cacheKey)
      cache.entries.set(cacheKey, cached)
      ctx.logger?.debug(`[tool-cache] Cache HIT for ${tool_name} (key: ${cacheKey.slice(0, 8)}...)`)

      // Return cached result without calling next()
      // The tool execution will be skipped
      return cached.result
    }

    cache.misses++
    ctx.logger?.debug(`[tool-cache] Cache MISS for ${tool_name} (key: ${cacheKey.slice(0, 8)}...)`)

    // Execute the tool and cache the result
    const result = await next()

    // Only cache successful results
    if (result && !result.is_error) {
      let serializedResult: string | undefined
      try {
        serializedResult = JSON.stringify(result)
      } catch {
        return result
      }
      if (serializedResult === undefined) return result
      const resultBytes = Buffer.byteLength(serializedResult, 'utf8')
      const maxResultBytes = config.maxResultBytes ?? 65_536
      const maxCacheBytes = config.maxCacheBytesPerSession ?? 4_194_304
      if (resultBytes > maxResultBytes || resultBytes > maxCacheBytes) return result

      // Bound both entry count and total retained memory with LRU eviction.
      while (
        cache.entries.size >= (config.maxEntriesPerSession ?? 128)
        || cache.bytes + resultBytes > maxCacheBytes
      ) {
        const oldestKey = cache.entries.keys().next().value
        if (!oldestKey) break
        const oldest = cache.entries.get(oldestKey)
        cache.entries.delete(oldestKey)
        if (oldest) cache.bytes -= oldest.bytes
      }

      cache.entries.set(cacheKey, { result, bytes: resultBytes })
      cache.bytes += resultBytes
      ctx.logger?.debug(`[tool-cache] Cached result for ${tool_name}`)
    }

    return result
  })

  // Clear cache when session resets
  ctx.on('session/reset', (session: Session) => {
    if (session.sessionId) {
      clearSessionCache(session.sessionId)
      ctx.logger?.debug(`[tool-cache] Cleared cache for session ${session.sessionId}`)
    }
  })

  // Clear cache when session ends
  ctx.on('session/end', (session: Session) => {
    if (session.sessionId) {
      const cache = sessionCaches.get(session.sessionId)
      if (cache) {
        ctx.logger?.info(
          `[tool-cache] Session ${session.sessionId} stats: ` +
          `${cache.hits} hits, ${cache.misses} misses, ` +
          `hit rate: ${cache.hits + cache.misses > 0 ? ((cache.hits / (cache.hits + cache.misses)) * 100).toFixed(1) : 0}%`
        )
      }
      clearSessionCache(session.sessionId)
    }
  })

  // Expose cache stats for monitoring
  ctx.effect(() => {
    ctx.provide('tool-cache', {
      getStats(sessionId: string) {
        const cache = sessionCaches.get(sessionId)
        if (!cache) return null
        return {
          entries: cache.entries.size,
          bytes: cache.bytes,
          hits: cache.hits,
          misses: cache.misses,
          hitRate: cache.hits + cache.misses > 0
            ? cache.hits / (cache.hits + cache.misses)
            : 0,
        }
      },
      clear(sessionId: string) {
        clearSessionCache(sessionId)
      },
      clearAll() {
        sessionCaches.clear()
      },
    })
  })
}
