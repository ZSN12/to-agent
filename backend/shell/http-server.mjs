import http from 'node:http'
import { shellEventBus } from './event-bus.mjs'
import { invokeShellChannel } from '../platform/shell-platform.mjs'

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
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

export function startShellHttpServer({ port = 0, host = '127.0.0.1' } = {}) {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? host}`)
      if (req.method === 'OPTIONS') {
        res.writeHead(204, corsHeaders())
        res.end()
        return
      }
      if (req.method === 'GET' && url.pathname === '/shell/v1/health') {
        json(res, 200, { ok: true })
        return
      }
      if (req.method === 'GET' && url.pathname === '/shell/v1/events') {
        res.writeHead(200, {
          ...corsHeaders(),
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        })
        res.write('\n')
        const onPush = ({ channel, payload }) => {
          res.write(`event: message\ndata: ${JSON.stringify({ channel, payload })}\n\n`)
        }
        shellEventBus.on('push', onPush)
        req.on('close', () => shellEventBus.off('push', onPush))
        return
      }
      if (req.method === 'POST' && url.pathname === '/shell/v1/invoke') {
        const body = await readJson(req)
        const channel = body?.channel
        const args = Array.isArray(body?.args) ? body.args : []
        if (typeof channel !== 'string' || !channel) {
          json(res, 400, { ok: false, error: '缺少 channel' })
          return
        }
        const result = await invokeShellChannel(channel, ...args)
        json(res, 200, result)
        return
      }
      json(res, 404, { ok: false, error: 'not found' })
    } catch (error) {
      json(res, 500, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  })

  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => {
      const address = server.address()
      const boundPort = typeof address === 'object' && address ? address.port : port
      resolve({ server, port: boundPort, baseUrl: `http://${host}:${boundPort}` })
    })
  })
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}

function json(res, status, body) {
  res.writeHead(status, { ...corsHeaders(), 'Content-Type': 'application/json; charset=utf-8' })
  res.end(`${JSON.stringify(body)}\n`)
}
