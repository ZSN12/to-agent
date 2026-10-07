import assert from 'node:assert/strict'
import { sessionModelMatches } from '../electron/backend/dsh-session-model.mjs'

const config = { provider: 'xiaomi', id: 'mimo-v2.6-flash' }

assert.equal(sessionModelMatches({ provider: 'xiaomi', model: 'mimo-v2.6-flash' }, config, 'high'), false,
  '同路由但 Host 未回读 reasoningEffort，不能证明显式档位已经应用')
assert.equal(sessionModelMatches(
  { provider: 'xiaomi', model: 'mimo-v2.6-flash' },
  config,
  'high',
  { provider: 'xiaomi', model: 'mimo-v2.6-flash', reasoningEffort: 'high' },
), true, '成功应用的显式档位可在 Host 不回读时避免每轮重复 selectModel')
assert.equal(sessionModelMatches(
  { provider: 'xiaomi', model: 'mimo-v2.6-flash' },
  config,
  'high',
  { provider: 'xiaomi', model: 'mimo-v2.6-flash', reasoningEffort: 'low' },
), false, '不同的旧档位不能满足当前请求')
assert.equal(sessionModelMatches({ provider: 'xiaomi', model: 'mimo-v2.6-flash' }, config, null), true)
assert.equal(sessionModelMatches({ provider: 'xiaomi', model: 'mimo-v2.6-flash', reasoningEffort: 'high' }, config, 'high'), true)
assert.equal(sessionModelMatches({ provider: 'xiaomi', model: 'mimo-v2.6-flash', reasoningEffort: 'low' }, config, 'high'), false)
assert.equal(sessionModelMatches({ provider: 'cursor', model: 'composer-2.5' }, config, 'high'), false)

console.log('session model matches regression passed')
