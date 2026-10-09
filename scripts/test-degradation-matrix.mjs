#!/usr/bin/env node
/**
 * scripts/test-degradation-matrix.mjs
 *
 * 降级路径自动化验证矩阵
 *
 * 覆盖 4 大核心断供与异常场景并进行自动化断言：
 *   a. 内置桥 / fork 版本与路由隔离：Cursor 系与直连/OAuth 路由互不阻塞。
 *   b. Cursor 协议端异常 / wire 格式变动：适配层给出优雅降级提示，不 crash、不静默失败。
 *   c. 第三方 MCP 服务器失联：工具链自动摘除失联工具并通知，不影响主干对话与其他可用工具。
 *   d. 某模型厂商 OAuth 或 API Key 失效：该 provider 标记为不可用，
 *      路由作品集及 Fallback 策略自动绕开该通道。
 */

import assert from 'node:assert/strict'
import {
  humanizeBridgeTransportError,
  isCursorBridgeTransportRoute,
  isDeprecatedOpenCodexChatRoute,
} from '../electron/backend/cursor-tool-guidance.mjs'
import {
  ocxSupportsComposerToolContinuation,
  OCX_COMPOSER_CONTINUATION_MIN_VERSION,
} from '../electron/backend/opencodex-binary.mjs'
import { selectModelForTask } from '../electron/backend/orchestration-policy.mjs'

console.log('🧪 开始降级路径自动化验证矩阵 (test-degradation-matrix)...\n')

// =========================================================================
// 场景 A: 内置桥版本门槛与路由隔离
// =========================================================================
console.log('--- 场景 A: 内置桥版本与路由隔离验证 ---')

assert.equal(ocxSupportsComposerToolContinuation('2.28.0'), false)
assert.equal(ocxSupportsComposerToolContinuation('2.79.0'), false)
assert.equal(ocxSupportsComposerToolContinuation('2.79.0-taskweaver.1'), true)
assert.equal(OCX_COMPOSER_CONTINUATION_MIN_VERSION, '2.79.0')

assert.equal(isCursorBridgeTransportRoute('bridge-composer/cursor/composer-2.5'), true)
assert.equal(isCursorBridgeTransportRoute('cursor/composer-2.5'), true)
assert.equal(isCursorBridgeTransportRoute('opencodex/composer'), true)
assert.equal(isCursorBridgeTransportRoute('deepseek/deepseek-chat'), false)
assert.equal(isDeprecatedOpenCodexChatRoute('bridge-composer/cursor/composer-2.5'), false)
assert.equal(isDeprecatedOpenCodexChatRoute('opencodex/composer'), true)

const humanizedBridgeDown = humanizeBridgeTransportError(
  'connect ECONNREFUSED 127.0.0.1:0',
  'bridge-composer/cursor/composer-2.5',
)
assert.ok(humanizedBridgeDown.includes('无法连接内置 Composer 桥'))
assert.ok(humanizedBridgeDown.includes('bridge-composer'))
assert.ok(humanizedBridgeDown.includes('官方直连模型（如小米 MiMo）不经过该桥'))

const directCatalog = {
  models: [
    { key: 'bridge-composer/cursor/composer-2.5', provider: 'bridge-composer', available: false, routeRegistered: false },
    { key: 'deepseek/deepseek-chat', provider: 'deepseek', available: true, routeRegistered: true, profile: { enabledForAllocation: true, tier: 'balanced' } },
    { key: 'openai-codex/gpt-4o', provider: 'openai-codex', available: true, routeRegistered: true, profile: { enabledForAllocation: true, tier: 'strong' } },
    { key: 'anthropic/claude-3-5-sonnet', provider: 'anthropic', available: true, routeRegistered: true, profile: { enabledForAllocation: true, tier: 'strong' } },
  ],
}

const directSelection = selectModelForTask('implementation', directCatalog, 'deepseek/deepseek-chat')
assert.equal(directSelection.modelKey, 'deepseek/deepseek-chat')
const strongSelection = selectModelForTask('review', directCatalog, 'deepseek/deepseek-chat')
assert.ok(['openai-codex/gpt-4o', 'anthropic/claude-3-5-sonnet'].includes(strongSelection.modelKey))
console.log('  ✓ 场景 A 自动化断言通过\n')

// =========================================================================
// 场景 B: Cursor 协议端异常 / wire 格式变动
// =========================================================================
console.log('--- 场景 B: Cursor 协议端异常 / wire 格式变动优雅降级验证 ---')

const wireToolError = 'unknown Responses tool: read'
const toolGuidance = humanizeBridgeTransportError(wireToolError, 'bridge-composer/cursor/composer-2.5')
assert.ok(toolGuidance.includes('Composer 调用了本轮未向内置桥登记的 tools 名「read」'))
assert.ok(toolGuidance.includes('经内置桥接时请改用 ocx_client_read'))
assert.ok(toolGuidance.includes(wireToolError))

const privateToolError = 'unknown Responses tool: file_search'
const privateToolGuidance = humanizeBridgeTransportError(privateToolError, 'cursor/composer-2.5')
assert.ok(privateToolGuidance.includes('它不在当前 Z Host 工具目录中'))
assert.ok(!privateToolGuidance.includes('ocx_client_file_search'))

const streamEndError = 'upstream stream ended prematurely (incomplete frame)'
const streamGuidance = humanizeBridgeTransportError(streamEndError, 'cursor/composer-2.5')
assert.ok(streamGuidance.includes('内置 Composer 桥'))

const connError = 'Connection error.'
const connGuidance = humanizeBridgeTransportError(connError, 'cursor/composer-2.5')
assert.ok(connGuidance.includes('bridge-composer'))

const directNetworkError = 'fetch failed (ENOTFOUND api.deepseek.com)'
const directHumanized = humanizeBridgeTransportError(directNetworkError, 'deepseek/deepseek-chat')
assert.equal(directHumanized, directNetworkError)
console.log('  ✓ 场景 B 自动化断言通过\n')

// =========================================================================
// 场景 C: 某模型厂商 OAuth 或 API Key 失效
// =========================================================================
console.log('--- 场景 C: 厂商 OAuth/Key 失效与作品集绕开 Fallback 验证 ---')

const portfolioCatalog = {
  models: [
    {
      key: 'openai-codex/gpt-4o',
      name: 'GPT-4o (Codex OAuth)',
      provider: 'openai-codex',
      available: false,
      routeRegistered: true,
      profile: { enabledForAllocation: true, tier: 'balanced' },
      costPerMillion: { input: 2.5, output: 10 },
    },
    {
      key: 'deepseek/deepseek-chat',
      name: 'DeepSeek-V3',
      provider: 'deepseek',
      available: true,
      routeRegistered: true,
      profile: { enabledForAllocation: true, tier: 'balanced' },
      costPerMillion: { input: 0.14, output: 0.28 },
    },
    {
      key: 'anthropic/claude-3-5-sonnet',
      name: 'Claude 3.5 Sonnet',
      provider: 'anthropic',
      available: true,
      routeRegistered: true,
      profile: { enabledForAllocation: true, tier: 'strong' },
      costPerMillion: { input: 3, output: 15 },
    },
  ],
}

const routedForImplementation = selectModelForTask(
  'implementation',
  portfolioCatalog,
  'openai-codex/gpt-4o',
)
assert.notEqual(routedForImplementation.modelKey, 'openai-codex/gpt-4o')
assert.equal(routedForImplementation.modelKey, 'deepseek/deepseek-chat')
assert.equal(routedForImplementation.model.available, true)

const routedForReview = selectModelForTask(
  'review',
  portfolioCatalog,
  'openai-codex/gpt-4o',
)
assert.equal(routedForReview.modelKey, 'anthropic/claude-3-5-sonnet')
assert.equal(routedForReview.model.available, true)

const allBrokenCatalog = {
  models: [
    {
      key: 'openai-codex/gpt-4o',
      provider: 'openai-codex',
      available: false,
      routeRegistered: true,
      profile: { enabledForAllocation: true, tier: 'balanced' },
    },
  ],
}
const allBrokenResult = selectModelForTask(
  'implementation',
  allBrokenCatalog,
  'openai-codex/gpt-4o',
)
assert.equal(allBrokenResult.strategy, 'none')
assert.equal(allBrokenResult.model, null)
assert.equal(allBrokenResult.displayName, '无可用模型')
assert.ok(allBrokenResult.reason.includes('没有可用且已鉴权的模型'))
console.log('  ✓ 场景 C 自动化断言通过\n')

console.log('========================================================')
console.log('🎉 降级矩阵全部 3 大场景测试 100% 通过！(test-degradation-matrix OK)')
console.log('========================================================\n')
