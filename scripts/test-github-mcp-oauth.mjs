import assert from 'node:assert/strict'
import {
  configureGitHubMcpOAuthNetwork,
  createGitHubAuthorizationUrl,
  exchangeGitHubAuthorizationCode,
  requestGitHubDeviceCode,
} from '../electron/backend/github-mcp-oauth.mjs'
import { isGitHubMcpOAuthConfigured } from '../electron/backend/github-mcp-oauth-app.mjs'

const hadClientId = process.env.TASKWEAVER_GITHUB_OAUTH_CLIENT_ID
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

if (hadClientId) process.env.TASKWEAVER_GITHUB_OAUTH_CLIENT_ID = hadClientId
else delete process.env.TASKWEAVER_GITHUB_OAUTH_CLIENT_ID
delete process.env.TASKWEAVER_GITHUB_OAUTH_CLIENT_SECRET

console.log('github-mcp-oauth unit checks passed')
