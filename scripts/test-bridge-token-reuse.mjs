#!/usr/bin/env node
import assert from 'node:assert/strict'
import {
  createOAuthTokenCache,
  isUnauthorizedError,
} from '../packages/provider-bridge-transport/oauth-token-cache.mjs'

let helperCalls = 0
let now = 1_000
const tokenCache = createOAuthTokenCache({
  now: () => now,
  refreshSkewMs: 60_000,
})

async function mockTokenHelper() {
  helperCalls += 1
  // 返回不透明 token（触发 5 分钟保守 TTL）
  return `mock-secret-token-${helperCalls}`
}

async function getToken() {
  return tokenCache.get('cursor', mockTokenHelper)
}

function simulateTurn(turnIndex, { return401 = false } = {}) {
  return (async () => {
    const token = await getToken()
    assert.ok(token, `第 ${turnIndex} 轮获取到了有效凭据对象`)
    if (return401) {
      const err = new Error('HTTP 401 Unauthorized')
      err.status = 401
      if (isUnauthorizedError(err)) {
        tokenCache.invalidate('cursor')
      }
      throw err
    }
    return { ok: true }
  })()
}

// 轮次 1: 首次调用，应触发 token helper
await simulateTurn(1)
assert.equal(helperCalls, 1, '第 1 轮冷启动应调用 1 次 token helper')

// 轮次 2: 缓存命中，不应调用 helper
await simulateTurn(2)
assert.equal(helperCalls, 1, '第 2 轮应复用缓存 token')

// 轮次 3: 请求发生 401，应自动作废缓存
await assert.rejects(simulateTurn(3, { return401: true }), /401/)
assert.equal(helperCalls, 1, '第 3 轮执行失败前复用 token，此时 helper 仍为 1 次')

// 轮次 4: 缓存已被作废，应触发重新获取 token
await simulateTurn(4)
assert.equal(helperCalls, 2, '第 4 轮 401 后恢复应重新获取 token，helper 调用 2 次')

// 轮次 5: 再次复用新获取的 token
await simulateTurn(5)
assert.equal(helperCalls, 2, '第 5 轮继续复用新 token，helper 累计保持 2 次')

console.log('test-bridge-token-reuse: ok (5 rounds of Cursor requests invoked helper exactly 2 times with 401 re-auth)')
