import assert from 'node:assert/strict'
import {
  configureGitHubMcpOAuthNetwork,
  createGitHubAuthorizationUrl,
  exchangeGitHubAuthorizationCode,
  requestGitHubDeviceCode,
  runGitHubMcpOAuthLogin,
  startGitHubOAuthCallbackServer,
} from '../backend/github-mcp-oauth.mjs'
import { isGitHubMcpOAuthConfigured } from '../backend/github-mcp-oauth-app.mjs'

const hadClientId = process.env.TASKWEAVER_GITHUB_OAUTH_CLIENT_ID
const hadClientSecret = process.env.TASKWEAVER_GITHUB_OAUTH_CLIENT_SECRET
process.env.TASKWEAVER_GITHUB_OAUTH_CLIENT_ID = 'test_client_id'
process.env.TASKWEAVER_GITHUB_OAUTH_CLIENT_SECRET = 'test_secret'

assert.equal(isGitHubMcpOAuthConfigured(), true)

const auth = createGitHubAuthorizationUrl({
  redirectUri: 'http://127.0.0.1:54321/callback',
  clientId: 'test_client_id',
})
assert.match(auth.url, /github\.com\/login\/oauth\/authorize/)
assert.ok(auth.verifier.length >= 40)
assert.ok(auth.state.length >= 16)

let lastTokenBody = ''
configureGitHubMcpOAuthNetwork({
  fetch: async (input, init) => {
    const url = String(input)
    if (url.includes('/login/device/code')) {
      return new Response(JSON.stringify({
        device_code: 'dc',
        user_code: 'ABCD-1234',
        verification_uri: 'https://github.com/login/device',
        expires_in: 60,
        interval: 1,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    if (url.includes('/login/oauth/access_token')) {
      lastTokenBody = String(init?.body ?? '')
      const params = new URLSearchParams(lastTokenBody)
      if (params.get('grant_type') === 'authorization_code') {
        return new Response(JSON.stringify({ access_token: 'oauth_at', token_type: 'bearer' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    }
    return new Response('{}', { status: 404 })
  },
})

const device = await requestGitHubDeviceCode({ clientId: 'test_client_id' })
assert.equal(device.userCode, 'ABCD-1234')

const exchanged = await exchangeGitHubAuthorizationCode({
  code: 'auth_code',
  verifier: auth.verifier,
  redirectUri: 'http://127.0.0.1:54321/callback',
  clientId: 'test_client_id',
  clientSecret: 'test_secret',
})
assert.equal(exchanged.accessToken, 'oauth_at')
assert.match(lastTokenBody, /code_verifier=/)

const callbackServer = await startGitHubOAuthCallbackServer('expected-state', '/callback', { timeoutMs: 120 })
const pendingCode = callbackServer.waitForCode()
let callbackSettled = false
void pendingCode.then(() => { callbackSettled = true })
const invalidStateResponse = await fetch(`${callbackServer.redirectUri}?state=invalid-state&error=access_denied`)
assert.equal(invalidStateResponse.status, 400)
assert.match(await invalidStateResponse.text(), /State 不匹配/)
await new Promise(resolve => setTimeout(resolve, 10))
assert.equal(callbackSettled, false, 'state 不匹配只显示错误页，不应结束仍在等待的授权')
assert.equal(await pendingCode, null, '回调服务器达到配置的超时后应结束等待')
callbackServer.close()

let browserOpenCount = 0
const loginStatuses = []
const login = await runGitHubMcpOAuthLogin({
  onStatus: status => loginStatuses.push(status),
  openExternal: async authorizationUrl => {
    browserOpenCount++
    const authorization = new URL(authorizationUrl)
    const callbackUrl = new URL(authorization.searchParams.get('redirect_uri'))
    callbackUrl.searchParams.set('state', authorization.searchParams.get('state'))
    callbackUrl.searchParams.set('code', 'callback_code')
    const response = await fetch(callbackUrl)
    assert.equal(response.status, 200)
  },
})
assert.equal(login.accessToken, 'oauth_at')
assert.equal(browserOpenCount, 1)
assert.ok(loginStatuses.some(status => status.status === 'auth_url' && status.url))

const mcpIpcSource = await (await import('node:fs/promises')).readFile(
  new URL('../backend/ipc/register-mcp-ipc.mjs', import.meta.url),
  'utf8',
)
assert.doesNotMatch(mcpIpcSource, /if\s*\(statusInfo\?\.url\)\s*shell\.openExternal/)

if (hadClientId) process.env.TASKWEAVER_GITHUB_OAUTH_CLIENT_ID = hadClientId
else delete process.env.TASKWEAVER_GITHUB_OAUTH_CLIENT_ID
if (hadClientSecret) process.env.TASKWEAVER_GITHUB_OAUTH_CLIENT_SECRET = hadClientSecret
else delete process.env.TASKWEAVER_GITHUB_OAUTH_CLIENT_SECRET

console.log('github-mcp-oauth unit checks passed')
