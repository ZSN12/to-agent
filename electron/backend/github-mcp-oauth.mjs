import http from 'node:http'
import crypto from 'node:crypto'
import {
  assertGitHubMcpOAuthConfigured,
  GITHUB_MCP_OAUTH_SCOPES,
  resolveGitHubMcpOAuthCredentials,
} from './github-mcp-oauth-app.mjs'

const GITHUB_HOST = 'https://github.com'
const AUTHORIZE_URL = `${GITHUB_HOST}/login/oauth/authorize`
const TOKEN_URL = `${GITHUB_HOST}/login/oauth/access_token`
const DEVICE_CODE_URL = `${GITHUB_HOST}/login/device/code`

/** @type {(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>} */
let oauthFetch = globalThis.fetch.bind(globalThis)

export function configureGitHubMcpOAuthNetwork({ fetch } = {}) {
  if (typeof fetch === 'function') oauthFetch = fetch
}

function base64url(buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function generatePKCE() {
  const verifier = base64url(crypto.randomBytes(32))
  const challenge = base64url(crypto.createHash('sha256').update(verifier).digest())
  return { verifier, challenge }
}

function createState() {
  return crypto.randomBytes(16).toString('hex')
}

function renderSuccessHtml() {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"/><title>TaskWeaver · GitHub 已授权</title>
<style>body{font-family:system-ui;background:#0d1117;color:#e6edf3;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.card{max-width:420px;padding:32px;border:1px solid #238636;border-radius:16px;text-align:center;background:#161b22}h1{font-size:20px;color:#3fb950}</style></head>
<body><div class="card"><h1>GitHub 授权成功</h1><p>可以关闭此页并返回 TaskWeaver。</p></div></body></html>`
}

function renderErrorHtml(message) {
  const safe = String(message ?? '授权失败').replace(/</g, '&lt;')
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"/><title>TaskWeaver · 授权失败</title></head>
<body style="font-family:system-ui;background:#0d1117;color:#f0f6fc;display:flex;align-items:center;justify-content:center;min-height:100vh">
<div style="max-width:420px;padding:32px;border:1px solid #f85149;border-radius:16px;text-align:center;background:#161b22"><h1>授权未完成</h1><p>${safe}</p></div></body></html>`
}

async function parseJsonResponse(response) {
  const text = await response.text().catch(() => '')
  try {
    return { json: JSON.parse(text), text }
  } catch {
    return { json: null, text }
  }
}

function formatTokenExchangeError(status, text, json) {
  const desc = json?.error_description || json?.error || text || responseStatusText(status)
  return `GitHub 授权兑换失败 (${status})${desc ? `：${desc}` : ''}`
}

function responseStatusText(status) {
  return status === 401 ? '未授权' : ''
}

export function createGitHubAuthorizationUrl({ redirectUri, clientId, verifier, state, scopes = GITHUB_MCP_OAUTH_SCOPES }) {
  const pkce = verifier ? { verifier, challenge: base64url(crypto.createHash('sha256').update(verifier).digest()) } : generatePKCE()
  const oauthState = state ?? createState()
  const url = new URL(AUTHORIZE_URL)
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('scope', scopes)
  url.searchParams.set('state', oauthState)
  url.searchParams.set('code_challenge', pkce.challenge)
  url.searchParams.set('code_challenge_method', 'S256')
  return { verifier: pkce.verifier, state: oauthState, url: url.toString(), redirectUri }
}

export function startGitHubOAuthCallbackServer(expectedState, redirectPath = '/callback') {
  let settleWait = null
  const waitForCodePromise = new Promise((resolve) => {
    let settled = false
    settleWait = (value) => {
      if (settled) return
      settled = true
      resolve(value)
    }
  })

  const server = http.createServer((req, res) => {
    try {
      const url = new URL(req.url || '', 'http://127.0.0.1')
      if (url.pathname !== redirectPath) {
        res.statusCode = 404
        res.setHeader('Content-Type', 'text/html; charset=utf-8')
        res.end(renderErrorHtml('回调路径不匹配'))
        return
      }
      if (url.searchParams.get('error')) {
        res.statusCode = 400
        res.setHeader('Content-Type', 'text/html; charset=utf-8')
        res.end(renderErrorHtml(url.searchParams.get('error_description') || url.searchParams.get('error')))
        settleWait?.(null)
        return
      }
      if (url.searchParams.get('state') !== expectedState) {
        res.statusCode = 400
        res.setHeader('Content-Type', 'text/html; charset=utf-8')
        res.end(renderErrorHtml('State 不匹配'))
        settleWait?.(null)
        return
      }
      const code = url.searchParams.get('code')
      if (!code) {
        res.statusCode = 400
        res.setHeader('Content-Type', 'text/html; charset=utf-8')
        res.end(renderErrorHtml('未收到 authorization code'))
        settleWait?.(null)
        return
      }
      res.statusCode = 200
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.end(renderSuccessHtml())
      settleWait?.({ code })
    } catch {
      res.statusCode = 500
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.end(renderErrorHtml('本地回调处理失败'))
      settleWait?.(null)
    }
  })

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      const redirectUri = `http://127.0.0.1:${port}${redirectPath}`
      resolve({
        redirectUri,
        close: () => {
          try {
            server.close()
          } catch {
            // ignore
          }
        },
        cancelWait: () => settleWait?.(null),
        waitForCode: () => waitForCodePromise,
      })
    }).on('error', () => {
      settleWait?.(null)
      resolve({
        redirectUri: null,
        close: () => {},
        cancelWait: () => {},
        waitForCode: async () => null,
      })
    })
  })
}

export async function exchangeGitHubAuthorizationCode({ code, verifier, redirectUri, clientId, clientSecret }) {
  const body = new URLSearchParams({
    client_id: clientId,
    code,
    code_verifier: verifier,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  })
  if (clientSecret) body.set('client_secret', clientSecret)

  const response = await oauthFetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })
  const { json, text } = await parseJsonResponse(response)
  if (!response.ok || !json?.access_token) {
    throw new Error(formatTokenExchangeError(response.status, text, json))
  }
  return {
    accessToken: String(json.access_token),
    tokenType: json.token_type ?? 'bearer',
    scope: json.scope ?? '',
  }
}

export async function requestGitHubDeviceCode({ clientId, scopes = GITHUB_MCP_OAUTH_SCOPES }) {
  const response = await oauthFetch(DEVICE_CODE_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: clientId,
      scope: scopes,
    }),
  })
  const { json, text } = await parseJsonResponse(response)
  if (!response.ok || !json?.device_code) {
    throw new Error(formatTokenExchangeError(response.status, text, json))
  }
  return {
    deviceCode: String(json.device_code),
    userCode: String(json.user_code),
    verificationUri: String(json.verification_uri || `${GITHUB_HOST}/login/device`),
    expiresIn: Number(json.expires_in) || 900,
    interval: Math.max(5, Number(json.interval) || 5),
  }
}

export async function pollGitHubDeviceToken({ deviceCode, clientId, clientSecret, intervalSec, expiresAtMs, signal }) {
  const bodyBase = new URLSearchParams({
    client_id: clientId,
    device_code: deviceCode,
    grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
  })
  if (clientSecret) bodyBase.set('client_secret', clientSecret)

  while (Date.now() < expiresAtMs) {
    if (signal?.aborted) throw new Error('GitHub 授权已取消')
    await new Promise((r) => setTimeout(r, intervalSec * 1000))
    if (signal?.aborted) throw new Error('GitHub 授权已取消')

    const response = await oauthFetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(bodyBase),
    })
    const { json, text } = await parseJsonResponse(response)
    if (json?.access_token) {
      return {
        accessToken: String(json.access_token),
        tokenType: json.token_type ?? 'bearer',
        scope: json.scope ?? '',
      }
    }
    const err = json?.error
    if (err === 'authorization_pending') continue
    if (err === 'slow_down') {
      intervalSec += 5
      continue
    }
    if (err === 'expired_token') throw new Error('设备码已过期，请重新登录')
    if (err === 'access_denied') throw new Error('你已在 GitHub 拒绝了授权')
    throw new Error(formatTokenExchangeError(response.status, text, json))
  }
  throw new Error('GitHub 设备授权超时，请重试')
}

/**
 * PKCE 浏览器登录；loopback 失败时自动回退 Device Flow。
 * @param {{ onStatus: (info: object) => void, openExternal: (url: string) => Promise<void>|void, signal?: AbortSignal }} options
 */
export async function runGitHubMcpOAuthLogin({ onStatus, openExternal, signal } = {}) {
  assertGitHubMcpOAuthConfigured()
  const { clientId, clientSecret } = resolveGitHubMcpOAuthCredentials()

  const pkce = generatePKCE()
  const state = createState()
  const server = await startGitHubOAuthCallbackServer(state)
  if (server.redirectUri) {
    const { verifier, url, redirectUri } = createGitHubAuthorizationUrl({
      redirectUri: server.redirectUri,
      clientId,
      verifier: pkce.verifier,
      state,
    })

    onStatus?.({
      status: 'auth_url',
      url,
      instructions: '已在浏览器打开 GitHub 登录页；完成授权后返回 TaskWeaver。',
    })
    try {
      await openExternal?.(url)
    } catch {
      // user can open manually
    }

    const abortPromise = signal
      ? new Promise((_, reject) => {
        if (signal.aborted) reject(new Error('GitHub 授权已取消'))
        signal.addEventListener('abort', () => reject(new Error('GitHub 授权已取消')), { once: true })
      })
      : null

    let codeResult
    try {
      codeResult = await Promise.race([
        server.waitForCode(),
        abortPromise ?? new Promise(() => {}),
      ])
    } finally {
      server.close()
    }

    if (codeResult?.code) {
      onStatus?.({ status: 'progress', instructions: '正在兑换访问令牌…' })
      const token = await exchangeGitHubAuthorizationCode({
        code: codeResult.code,
        verifier,
        redirectUri,
        clientId,
        clientSecret,
      })
      onStatus?.({ status: 'completed', instructions: 'GitHub 已连接。' })
      return token
    }
  } else {
    server.close()
  }

  return runDeviceFlowLogin({ onStatus, openExternal, signal, clientId, clientSecret })
}

async function runDeviceFlowLogin({ onStatus, openExternal, signal, clientId, clientSecret }) {
  onStatus?.({ status: 'device_flow', instructions: '本机无法使用浏览器回调，改用设备码登录。' })
  const device = await requestGitHubDeviceCode({ clientId })
  const verifyUrl = device.verificationUri.includes('?')
    ? device.verificationUri
    : `${device.verificationUri}`
  onStatus?.({
    status: 'device_code',
    userCode: device.userCode,
    verificationUri: verifyUrl,
    instructions: `在浏览器打开 ${verifyUrl} 并输入代码 ${device.userCode}`,
    url: verifyUrl,
  })
  try {
    await openExternal?.(verifyUrl)
  } catch {
    // ignore
  }
  onStatus?.({ status: 'progress', instructions: '等待你在 GitHub 完成授权…' })
  const token = await pollGitHubDeviceToken({
    deviceCode: device.deviceCode,
    clientId,
    clientSecret,
    intervalSec: device.interval,
    expiresAtMs: Date.now() + device.expiresIn * 1000,
    signal,
  })
  onStatus?.({ status: 'completed', instructions: 'GitHub 已连接。' })
  return token
}
