import assert from 'node:assert/strict'
import { AUTO_ROUTE_MODEL_KEY, inferSingleAgentTaskType, resolveModelKeyForChat } from '../electron/backend/chat-model-resolver.mjs'

assert.equal(inferSingleAgentTaskType('帮我找一下 login 在哪'), 'research')
assert.equal(inferSingleAgentTaskType('实现登录接口并写单元测试'), 'test')
assert.equal(inferSingleAgentTaskType('审查这段鉴权代码'), 'review')

const profileStore = {
  async getActiveModelKey() {
    return 'balanced'
  },
}

const manual = await resolveModelKeyForChat({
  requestedKey: 'balanced',
  profileStore,
})
assert.equal(manual.modelKey, 'balanced')
assert.equal(manual.routeMeta, null)

const fromProfile = await resolveModelKeyForChat({ profileStore })
assert.equal(fromProfile.modelKey, 'balanced')

const autoProfile = {
  async getActiveModelKey() {
    return AUTO_ROUTE_MODEL_KEY
  },
}

await assert.rejects(
  () => resolveModelKeyForChat({ profileStore: autoProfile }),
  /请先在 Composer 中选择主对话模型/,
)

console.log('chat-model-resolver checks passed: primary model only, no single-agent auto route')
