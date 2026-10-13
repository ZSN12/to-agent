import http from 'node:http'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { createReadStream } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { shellEventBus } from './event-bus.mjs'
import { invokeShellChannel } from '../platform/shell-platform.mjs'

const UI_CONTENT_TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
])

function readJson(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    let rejected = false
    req.on('data', (chunk) => {
      if (rejected) return
      size += chunk.length
      if (size <= maxBytes) {
        chunks.push(chunk)
        return
      }
      rejected = true
      req.resume()
      const error = new Error(`请求体超过 ${maxBytes} 字节上限`)
      error.statusCode = 413
      reject(error)
    })
    req.on('end', () => {
      if (rejected) return
      try {
        const raw = Buffer.concat(chunks).toString('utf8')
        resolve(raw ? JSON.parse(raw) : {})
      } catch (error) {
        reject(error)
      }
    })
    req.on('error', reject)
  })
}

export function startShellHttpServer({
  port = 0,
  host = '127.0.0.1',
  uiRoot,
  allowedOrigins,
  allowDevelopmentOrigins = process.env.TASKWEAVER_PACKAGED !== '1' && process.env.TASKWEAVER_PACKAGED !== 'true',
  authToken = process.env.TASKWEAVER_SHELL_TOKEN || null,
  // One 100 MiB PDF is accepted by chat attachments; base64 JSON needs ~134 MiB.
  maxRequestBodyBytes = 144 * 1024 * 1024,
} = {}) {
  if (!isLoopbackHost(host)) {
    throw new Error('Shell HTTP 服务仅允许绑定到 loopback 地址')
  }
  if ((process.env.TASKWEAVER_PACKAGED === '1' || process.env.TASKWEAVER_PACKAGED === 'true')
    && (typeof authToken !== 'string' || authToken.length < 32)) {
    throw new Error('打包版 Shell HTTP 服务必须配置随机访问令牌')
  }

  const explicitAllowedOrigins = allowedOrigins == null ? null : new Set(allowedOrigins)
  let listeningPort = port
  const server = http.createServer(async (req, res) => {
    try {
      if (!isAllowedHost(req.headers.host, listeningPort)) {
        json(res, 403, { ok: false, error: 'forbidden host' })
        return
      }

      const origin = typeof req.headers.origin === 'string' ? req.headers.origin : null
      const trustedOrigins = explicitAllowedOrigins ?? defaultAllowedOrigins(listeningPort, allowDevelopmentOrigins)
      if (origin && !trustedOrigins.has(origin)) {
        json(res, 403, { ok: false, error: 'forbidden origin' })
        return
      }
      const cors = corsHeaders(origin, Boolean(origin))
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? host}`)
      if (req.method === 'OPTIONS') {
        res.writeHead(204, cors)
        res.end()
        return
      }
      if (req.method === 'GET' && url.pathname === '/shell/v1/health') {
        const challenge = req.headers['x-taskweaver-shell-challenge']
        if (authToken && (typeof challenge !== 'string' || challenge.length === 0 || challenge.length > 256)) {
          json(res, 400, { ok: false, error: 'health challenge required' }, origin)
          return
        }
        const health = authToken
          ? { ok: true, proof: createHmac('sha256', authToken).update(challenge).digest('hex') }
          : { ok: true }
        json(res, 200, health, origin)
        return
      }
      if (url.pathname === '/shell/v1/events' || url.pathname === '/shell/v1/invoke') {
        const suppliedToken = req.headers['x-taskweaver-shell-token']
        if (!isAuthorizedToken(suppliedToken, authToken)) {
          json(res, 401, { ok: false, error: 'unauthorized' }, origin)
          return
        }
      }
      if (req.method === 'GET' && url.pathname === '/shell/v1/events') {
        res.writeHead(200, {
          ...cors,
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        })
        res.write('\n')
        const onPush = ({ channel, payload }) => {
          res.write(`event: message\ndata: ${JSON.stringify({ channel, payload })}\n\n`)
        }
        shellEventBus.on('push', onPush)
        res.once('close', () => shellEventBus.off('push', onPush))
        return
      }
      if (req.method === 'POST' && url.pathname === '/shell/v1/invoke') {
        const contentType = String(req.headers['content-type'] ?? '').split(';', 1)[0].trim().toLowerCase()
        if (contentType !== 'application/json') {
          json(res, 415, { ok: false, error: 'content-type must be application/json' }, origin)
          return
        }
        const contentLength = Number(req.headers['content-length'])
        if (Number.isFinite(contentLength) && contentLength > maxRequestBodyBytes) {
          req.resume()
          const error = new Error('request body too large')
          error.statusCode = 413
          throw error
        }
        const body = await readJson(req, maxRequestBodyBytes)
        const channel = body?.channel
        const args = Array.isArray(body?.args) ? body.args : []
        if (typeof channel !== 'string' || !channel) {
          json(res, 400, { ok: false, error: '缺少 channel' }, origin)
          return
        }
        const result = await invokeShellChannel(channel, ...args)
        json(res, 200, result, origin)
        return
      }
      if (uiRoot && (req.method === 'GET' || req.method === 'HEAD')) {
        if (await serveUI(req, res, url, uiRoot, cors)) return
      }
      json(res, 404, { ok: false, error: 'not found' }, origin)
      } catch (error) {
      const status = Number.isInteger(error?.statusCode) ? error.statusCode : 500
      json(res, status, {
        ok: false,
        error: status === 413 ? 'request body too large' : error instanceof Error ? error.message : String(error),
      }, typeof req.headers.origin === 'string' ? req.headers.origin : null)
    }
  })

  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => {
      const address = server.address()
      const boundPort = typeof address === 'object' && address ? address.port : port
      listeningPort = boundPort
      resolve({ server, port: boundPort, baseUrl: `http://${host}:${boundPort}` })
    })
  })
}

function isLoopbackHost(host) {
  const normalized = String(host ?? '').toLowerCase().replace(/^\[|\]$/g, '')
  return normalized === '127.0.0.1' || normalized === 'localhost' || normalized === '::1' || normalized === '::ffff:127.0.0.1'
}

function isAllowedHost(header, listeningPort) {
  if (typeof header !== 'string' || !header) return false
  try {
    const parsed = new URL(`http://${header}`)
    if (parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) return false
    const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '')
    const requestPort = parsed.port ? Number(parsed.port) : 80
    return isLoopbackHost(hostname) && requestPort === listeningPort
  } catch {
    return false
  }
}

function defaultAllowedOrigins(port, allowDevelopmentOrigins) {
  const origins = new Set([
    `http://127.0.0.1:${port}`,
    `http://localhost:${port}`,
    `http://[::1]:${port}`,
  ])
  if (allowDevelopmentOrigins) {
    origins.add('http://127.0.0.1:5173')
    origins.add('http://localhost:5173')
  }
  return origins
}

async function serveUI(req, res, url, uiRoot, cors) {
  let pathname
  try {
    pathname = decodeURIComponent(url.pathname)
  } catch {
    json(res, 400, { ok: false, error: 'invalid UI path' })
    return true
  }

  if (pathname.includes('\0')) {
    json(res, 400, { ok: false, error: 'invalid UI path' })
    return true
  }

  const root = path.resolve(uiRoot)
  const relativePath = pathname.replace(/^\/+/, '') || 'index.html'
  let candidate = path.resolve(root, relativePath)
  if (!isInside(candidate, root)) {
    json(res, 404, { ok: false, error: 'not found' })
    return true
  }

  try {
    const stat = await fs.stat(candidate)
    if (stat.isDirectory()) candidate = path.join(candidate, 'index.html')
  } catch {
    if (pathname.startsWith('/shell/') || !isSpaRoute(pathname)) {
      json(res, 404, { ok: false, error: 'not found' })
      return true
    }
    candidate = path.join(root, 'index.html')
  }

  let realRoot
  let realFile
  let stat
  try {
    [realRoot, realFile] = await Promise.all([fs.realpath(root), fs.realpath(candidate)])
    stat = await fs.stat(realFile)
  } catch {
    json(res, 404, { ok: false, error: 'not found' })
    return true
  }

  if (!isInside(realFile, realRoot) || !stat.isFile()) {
    json(res, 404, { ok: false, error: 'not found' })
    return true
  }

  const extension = path.extname(realFile).toLowerCase()
  res.writeHead(200, {
    ...cors,
    'Cache-Control': path.basename(realFile) === 'index.html' ? 'no-cache' : 'public, max-age=3600',
    'Content-Length': String(stat.size),
    'Content-Type': UI_CONTENT_TYPES.get(extension) ?? 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff',
  })
  if (req.method === 'HEAD') {
    res.end()
    return true
  }

  const stream = createReadStream(realFile)
  stream.on('error', (error) => {
    if (res.headersSent) res.destroy(error)
    else json(res, 500, { ok: false, error: 'failed to read UI asset' })
  })
  stream.pipe(res)
  return true
}

function isSpaRoute(pathname) {
  return !path.extname(pathname)
}

function isInside(candidate, root) {
  return candidate === root || candidate.startsWith(root + path.sep)
}

function corsHeaders(origin, allowOrigin) {
  return {
    ...(origin && allowOrigin ? { 'Access-Control-Allow-Origin': origin } : {}),
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-TaskWeaver-Shell-Token, X-TaskWeaver-Shell-Challenge',
  }
}

function isAuthorizedToken(suppliedToken, expectedToken) {
  if (!expectedToken) return true
  if (typeof suppliedToken !== 'string') return false
  const supplied = Buffer.from(suppliedToken)
  const expected = Buffer.from(expectedToken)
  return supplied.length === expected.length && timingSafeEqual(supplied, expected)
}

function json(res, status, body, origin = null) {
  res.writeHead(status, { ...corsHeaders(origin, Boolean(origin)), 'Content-Type': 'application/json; charset=utf-8' })
  res.end(`${JSON.stringify(body)}\n`)
}
