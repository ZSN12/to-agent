import { analyzeUserIntent, USER_INTENTS } from './user-intent.mjs'
import { AUTO_ROUTE_MODEL_KEY } from './routing-constants.mjs'

export { AUTO_ROUTE_MODEL_KEY }

/**
 * 历史遗留：曾用于单 Agent 自动选模；现仅保留供迁移检测与测试。
 */
export function inferSingleAgentTaskType(text, workMode = 'code') {
  const clean = String(text ?? '').trim()
  const intent = analyzeUserIntent(clean, workMode)
  if (workMode === 'plan' || intent === USER_INTENTS.PLANNING) return 'research'
  // Explicit review wording carries a task role even though its underlying
  // operation is read-only; evaluate it before the generic read-only fallback.
  if (/审查|review|代码评审|安全审计|漏洞|鉴权风险/i.test(clean)) return 'review'
  if (intent === USER_INTENTS.READ_ONLY) return 'research'
  if (/单元测试|集成测试|跑测试|test suite|npm test|pytest/i.test(clean)) return 'test'
  if (/疑难|调试|debug|卡死|竞态|内存泄漏|跨模块/i.test(clean)) return 'hard_debug'
  return 'implementation'
}

const RESELECT_MESSAGE =
  '请先在 Composer 中选择主对话模型。旧版「智能路由」已移除；多智能体子任务仍可在「路由作品集」中单独分配模型。'

/**
 * 解析本轮主对话 modelKey。不得根据任务类型或成本替换用户选择。
 */
export async function resolveModelKeyForChat({
  requestedKey,
  profileStore,
}) {
  const active = requestedKey || (await profileStore.getActiveModelKey())
  if (!active || active === AUTO_ROUTE_MODEL_KEY) {
    throw new Error(RESELECT_MESSAGE)
  }
  return { modelKey: active, routeMeta: null }
}
