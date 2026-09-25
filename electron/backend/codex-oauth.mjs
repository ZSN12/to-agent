import http from 'node:http'
import crypto from 'node:crypto'

const CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann'
const AUTH_BASE_URL = 'https://auth.openai.com'
const AUTHORIZE_URL = `${AUTH_BASE_URL}/oauth/authorize`
const TOKEN_URL = `${AUTH_BASE_URL}/oauth/token`
const REDIRECT_URI = 'http://localhost:1455/auth/callback'
const SCOPE = 'openid profile email offline_access'
const JWT_CLAIM_PATH = 'https://api.openai.com/auth'

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

function decodeJwt(token) {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const payload = Buffer.from(parts[1], 'base64').toString('utf8')
    return JSON.parse(payload)
  } catch {
    return null
  }
}

function getAccountId(accessToken) {
  const payload = decodeJwt(accessToken)
  const auth = payload?.[JWT_CLAIM_PATH]
  const accountId = auth?.chatgpt_account_id
  return typeof accountId === 'string' && accountId.length > 0 ? accountId : null
}

function renderTaskWeaverSuccessHtml() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>TaskWeaver · 授权成功</title>
  <style>
    :root {
      --bg: #090a0f;
      --card-bg: rgba(22, 27, 34, 0.9);
      --card-border: rgba(16, 185, 129, 0.25);
      --accent: #10b981;
      --accent-soft: rgba(16, 185, 129, 0.15);
      --text: #f0f6fc;
      --text-muted: #8b949e;
      --font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: radial-gradient(circle at 50% 25%, #18202a 0%, var(--bg) 75%);
      color: var(--text);
      font-family: var(--font-family);
      padding: 24px;
      -webkit-font-smoothing: antialiased;
    }
    .auth-card {
      width: 100%;
      max-width: 480px;
      padding: 44px 36px;
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 20px;
      text-align: center;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6), 0 0 40px rgba(16, 185, 129, 0.12);
      backdrop-filter: blur(16px);
    }
    .brand-icon-wrapper {
      width: 68px;
      height: 68px;
      margin: 0 auto 20px;
      display: grid;
      place-items: center;
      border-radius: 18px;
      background: linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(6, 78, 59, 0.4));
      border: 1px solid rgba(16, 185, 129, 0.35);
      color: var(--accent);
      box-shadow: 0 0 24px rgba(16, 185, 129, 0.2);
    }
    .brand-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 12px;
      border-radius: 999px;
      background: var(--accent-soft);
      border: 1px solid rgba(16, 185, 129, 0.3);
      color: var(--accent);
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.04em;
      margin-bottom: 16px;
      text-transform: uppercase;
    }
    h1 {
      font-size: 24px;
      font-weight: 650;
      letter-spacing: -0.02em;
      margin-bottom: 12px;
      color: #fff;
    }
    p {
      color: var(--text-muted);
      font-size: 14.5px;
      line-height: 1.6;
      margin-bottom: 24px;
    }
    .tip {
      padding: 12px 16px;
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.06);
      font-size: 13px;
      color: var(--text-muted);
    }
    .tip strong {
      color: #fff;
    }
  </style>
</head>
<body>
  <div class="auth-card">
    <div class="brand-icon-wrapper">
      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
      </svg>
    </div>
    <div class="brand-badge">TaskWeaver · 官方订阅直连</div>
    <h1>ChatGPT 订阅已授权</h1>
    <p>您的 ChatGPT Plus/Pro (Codex) 订阅已成功绑定至 TaskWeaver 本地安全存储。<br/>GPT-5.5 / GPT-5.4 编程模型已全部就绪。</p>
    <div class="tip">
      授权已完成，您可以直接<strong>关闭此网页标签</strong>并返回 <strong>TaskWeaver</strong>。
    </div>
  </div>
</body>
</html>`
}

function renderTaskWeaverErrorHtml(message) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>TaskWeaver · 授权失败</title>
  <style>
    body { background: #090a0f; color: #f0f6fc; font-family: sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .card { background: #161b22; border: 1px solid #ef4444; border-radius: 16px; padding: 40px; text-align: center; max-width: 440px; }
    h1 { color: #f87171; font-size: 20px; margin-bottom: 12px; }
    p { color: #94a3b8; font-size: 14px; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="card">
    <h1>授权未完成</h1>
    <p>${message}</p>
  </div>
</body>
</html>`
}

export function parseAuthorizationCodeInput(input) {
  const value = String(input ?? '').trim()
  if (!value) return null
  try {
    const url = new URL(value)
    const code = url.searchParams.get('code')
    if (code) return code
  } catch {
    // not url
  }
  if (value.includes('#')) {
    const [code] = value.split('#', 2)
    if (code) return code
  }
  if (value.includes('code=')) {
    const params = new URLSearchParams(value)
    const code = params.get('code')
    if (code) return code
  }
  return value
}

export async function exchangeAuthorizationCode(code, verifier) {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      code,
      code_verifier: verifier,
      redirect_uri: REDIRECT_URI,
    }),
  })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`OpenAI 授权兑换失败 (${response.status}): ${text || response.statusText}`)
  }
  const json = await response.json()
  if (!json?.access_token || !json?.refresh_token || typeof json.expires_in !== 'number') {
    throw new Error(`OpenAI 返回的数据缺少必要凭据字段: ${JSON.stringify(json)}`)
  }
  const accountId = getAccountId(json.access_token)
  return {
    type: 'oauth',
    access: json.access_token,
    refresh: json.refresh_token,
    expires: Date.now() + json.expires_in * 1000,
    accountId: accountId || 'chatgpt-account',
  }
}

export function startTaskWeaverOAuthServer(expectedState) {
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
      const url = new URL(req.url || '', 'http://localhost')
      if (url.pathname !== '/auth/callback') {
        res.statusCode = 404
        res.setHeader('Content-Type', 'text/html; charset=utf-8')
        res.end(renderTaskWeaverErrorHtml('回调路由未找到'))
        return
      }
      if (url.searchParams.get('state') !== expectedState) {
        res.statusCode = 400
        res.setHeader('Content-Type', 'text/html; charset=utf-8')
        res.end(renderTaskWeaverErrorHtml('State 不匹配，可能为非法的重定向请求'))
        return
      }
      const code = url.searchParams.get('code')
      if (!code) {
        res.statusCode = 400
        res.setHeader('Content-Type', 'text/html; charset=utf-8')
        res.end(renderTaskWeaverErrorHtml('未接收到 authorization code'))
        return
      }

      res.statusCode = 200
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.end(renderTaskWeaverSuccessHtml())
      settleWait?.({ code })
    } catch {
      res.statusCode = 500
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.end(renderTaskWeaverErrorHtml('TaskWeaver 本地处理授权时发生内部错误'))
    }
  })

  return new Promise((resolve) => {
    server.listen(1455, '127.0.0.1', () => {
      resolve({
        close: () => {
          try {
            server.close()
          } catch {
            // ignore
          }
        },
        cancelWait: () => {
          settleWait?.(null)
        },
        waitForCode: () => waitForCodePromise,
      })
    }).on('error', (_err) => {
      settleWait?.(null)
      resolve({
        close: () => {
          try {
            server.close()
          } catch {
            // ignore
          }
        },
        cancelWait: () => {},
        waitForCode: async () => null,
      })
    })
  })
}

export function createTaskWeaverAuthorizationUrl() {
  const { verifier, challenge } = generatePKCE()
  const state = createState()
  const url = new URL(AUTHORIZE_URL)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', CLIENT_ID)
  url.searchParams.set('redirect_uri', REDIRECT_URI)
  url.searchParams.set('scope', SCOPE)
  url.searchParams.set('code_challenge', challenge)
  url.searchParams.set('code_challenge_method', 'S256')
  url.searchParams.set('state', state)
  url.searchParams.set('id_token_add_organizations', 'true')
  url.searchParams.set('codex_cli_simplified_flow', 'true')
  url.searchParams.set('originator', 'taskweaver')
  return { verifier, state, url: url.toString() }
}
