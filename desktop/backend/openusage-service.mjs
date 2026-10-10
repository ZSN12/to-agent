import http from 'node:http'

export const DEFAULT_OPENUSAGE_URL = 'http://127.0.0.1:6736'

function isLoopbackHost(hostname) {
  return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '[::1]'
}

/** 仅允许本机 HTTP；无效输入返回 null。 */
export function normalizeOpenUsageBaseUrl(value, fallback = DEFAULT_OPENUSAGE_URL) {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  const fallbackOrigin = String(fallback).trim().replace(/\/+$/, '') || DEFAULT_OPENUSAGE_URL
  if (!trimmed) return fallbackOrigin
  try {
    const url = new URL(trimmed.includes('://') ? trimmed : `http://${trimmed}`)
    if (url.protocol !== 'http:'
      || !isLoopbackHost(url.hostname)
      || url.username
      || url.password) return null
    return url.origin
  } catch {
    return null
  }
}

/**
 * GET {baseUrl}/v1/limits — loopback only, fails closed to null.
 */
export async function fetchOpenUsageSnapshot({ baseUrl = DEFAULT_OPENUSAGE_URL, timeoutMs = 400 } = {}) {
  return new Promise((resolve) => {
    let settled = false
    const done = (val) => {
      if (!settled) {
        settled = true
        resolve(val)
      }
    }

    try {
      const url = new URL('/v1/limits', baseUrl)
      if (url.protocol !== 'http:'
        || !isLoopbackHost(url.hostname)
        || url.username
        || url.password) return done(null)

      const boundedTimeoutMs = Math.min(Math.max(Number(timeoutMs) || 400, 50), 2_000)
      const req = http.get(url, { timeout: boundedTimeoutMs }, (res) => {
        if (res.statusCode !== 200) {
          res.resume()
          return done(null)
        }
        let raw = ''
        res.setEncoding('utf8')
        res.on('data', (chunk) => {
          raw += chunk
          if (Buffer.byteLength(raw, 'utf8') > 256 * 1024) {
            req.destroy()
            done(null)
          }
        })
        res.on('end', () => {
          try {
            const data = JSON.parse(raw)
            done(data?.schema === 'openusage.limits.v1'
              && data.providers
              && typeof data.providers === 'object'
              && !Array.isArray(data.providers)
              ? data
              : null)
          } catch {
            done(null)
          }
        })
        res.on('aborted', () => done(null))
        res.on('error', () => done(null))
      })

      req.on('timeout', () => {
        req.destroy()
        done(null)
      })
      req.on('error', () => done(null))
    } catch {
      done(null)
    }
  })
}

export function createOpenUsageService({ resolveBaseUrl } = {}) {
  let cachedLimits = null
  let cachedLimitsAt = 0
  let cachedForBaseUrl = null
  const CACHE_TTL_MS = 3000

  async function currentBaseUrl() {
    if (typeof resolveBaseUrl === 'function') {
      const resolved = await resolveBaseUrl()
      const normalized = normalizeOpenUsageBaseUrl(resolved)
      if (normalized) return normalized
    }
    return DEFAULT_OPENUSAGE_URL
  }

  async function getLimits({ force = false } = {}) {
    const baseUrl = await currentBaseUrl()
    const now = Date.now()
    if (!force && cachedLimits && cachedForBaseUrl === baseUrl && now - cachedLimitsAt < CACHE_TTL_MS) {
      return { ok: true, active: true, data: cachedLimits, baseUrl }
    }

    const data = await fetchOpenUsageSnapshot({ baseUrl, timeoutMs: 1000 })
    if (data) {
      cachedLimits = data
      cachedLimitsAt = now
      cachedForBaseUrl = baseUrl
      return { ok: true, active: true, data, baseUrl }
    }

    return {
      ok: false,
      active: false,
      data: cachedForBaseUrl === baseUrl ? (cachedLimits ?? null) : null,
      baseUrl,
      error: `无法在 ${baseUrl} 读取 OpenUsage；请确认服务已启动。`,
    }
  }

  return { getLimits }
}
