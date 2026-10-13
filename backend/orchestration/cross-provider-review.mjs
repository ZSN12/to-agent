import { selectModelForTask } from '../orchestration-policy.mjs'
import { DAG_NODE_LIMIT_DEFAULT } from './dag-limits.mjs'

const REVIEW_SCOPE_LIMIT = 12
const CROSS_PROVIDER_REVIEW_PHRASE = /(?:跨(?:提供方|供应商|厂商)(?:的)?(?:模型)?(?:自动)?(?:审查|复核)|异提供方(?:审查|复核)|不同(?:提供方|供应商|厂商)(?:的)?(?:模型)?(?:审查|复核)|交叉(?:提供方|厂商|供应商)?审查|cross[\s-]*provider(?:[\s-]+automatic)?[\s-]+review)/iu
const CROSS_PROVIDER_REVIEW_NEGATION = /(?:不要|不需要|无需|无须|禁止|关闭|禁用|跳过|别用|disable|skip|without|no)\s*(?:(?:自动)?(?:启用|开启|打开|添加|追加|执行|进行|使用)\s*)?$/iu
const CROSS_PROVIDER_REVIEW_NEGATION_AFTER = /^\s*(?:不要|不需要|无需|无须|禁止|关闭|禁用|跳过|别用|disable|skip|without|no)/iu

/** Return an explicit per-request override, or null to use the saved preference. */
export function crossProviderReviewRequestOverride(text) {
  const source = String(text ?? '')
  const match = CROSS_PROVIDER_REVIEW_PHRASE.exec(source)
  if (!match) return null
  const before = source.slice(Math.max(0, match.index - 48), match.index)
  const after = source.slice(match.index + match[0].length, match.index + match[0].length + 24)
  if (CROSS_PROVIDER_REVIEW_NEGATION.test(before) || CROSS_PROVIDER_REVIEW_NEGATION_AFTER.test(after)) return false
  return true
}

export function resolveCrossProviderReviewEnabled(text, savedPreference) {
  const override = crossProviderReviewRequestOverride(text)
  return override === null ? savedPreference === true : override
}

/**
 * Add one bounded, read-only review node over the declared implementation scopes.
 * Existing planner review nodes are upgraded in place to avoid consuming a
 * second slot in the configured DAG node limit.
 */
export function prepareCrossProviderReviewTasks(tasks, { maxNodes = DAG_NODE_LIMIT_DEFAULT } = {}) {
  const implementationTasks = tasks.filter((task) => task.taskType === 'implementation')
  if (implementationTasks.length === 0) return { tasks, task: null, reason: 'no_implementation' }

  const scopes = [...new Set(implementationTasks.flatMap((task) =>
    Array.isArray(task.writeScopes) ? task.writeScopes : [],
  ).filter((scope) => typeof scope === 'string' && scope.trim()).map((scope) => scope.trim()))]
  if (implementationTasks.some((task) => !Array.isArray(task.writeScopes) || task.writeScopes.length === 0)) {
    return { tasks, task: null, reason: 'implementation_scope_missing' }
  }
  if (scopes.length === 0 || scopes.length > REVIEW_SCOPE_LIMIT) {
    return { tasks, task: null, reason: 'implementation_scope_limit' }
  }

  const writerDependencies = tasks
    .filter((task) => task.taskType === 'implementation' || task.taskType === 'test')
    .map((task) => task.id)
  const existingReview = tasks.find((task) => task.taskType === 'review')
  if (existingReview) {
    const updated = {
      ...existingReview,
      crossProviderReview: true,
      scopePaths: scopes,
      dependsOn: [...new Set([...(existingReview.dependsOn ?? []), ...writerDependencies])],
      description: `${existingReview.description}\n\n系统交叉审查要求：只读检查所有 implementation 节点声明范围内的改动，核对实现与验收点，给出有路径依据的风险或明确无发现。`,
    }
    return {
      tasks: tasks.map((task) => task.id === existingReview.id ? updated : task),
      task: updated,
      reusedExistingReview: true,
      reason: null,
    }
  }

  if (tasks.length >= maxNodes) return { tasks, task: null, reason: 'dag_node_limit' }
  const ids = new Set(tasks.map((task) => task.id))
  let id = 'TW_AUTO_REVIEW'
  for (let suffix = 2; ids.has(id); suffix += 1) id = `TW_AUTO_REVIEW_${suffix}`
  const reviewTask = {
    id,
    title: '跨提供方代码审查',
    taskType: 'review',
    role: '独立代码审查 Agent',
    description: '只读审查所有 implementation 节点提交的代码改动。逐项核对变更是否满足验收点，检查边界条件、安全问题和回归风险；只使用授权路径，报告可复核的路径与证据。若未发现问题，明确说明审查范围和已检查文件。',
    acceptance: [
      '所有实现节点的声明写入范围均已读取核对，并报告具体问题或明确无发现',
      '审查结论包含可复核的文件路径与证据，不把未验证推测写成缺陷',
    ],
    scopePaths: scopes,
    writeScopes: [],
    dependsOn: writerDependencies,
    reasons: ['偏好已启用：在实现完成后追加不同提供方的独立审查'],
    route: { tier_adjust: 0, needs_vision: false, reason: '' },
    crossProviderReview: true,
  }
  return { tasks: [...tasks, reviewTask], task: reviewTask, reusedExistingReview: false, reason: null }
}

function modelProvider(model) {
  return String(model?.provider || String(model?.key ?? '').split('/')[0] || 'unknown').trim().toLocaleLowerCase()
}

/** Pick only a provider distinct from every implementation provider. */
export function selectCrossProviderReviewRoute({
  catalog,
  primaryModelKey,
  implementationModelKeys,
  routeOptions = {},
  needsVision = false,
}) {
  const implementationProviders = new Set((implementationModelKeys ?? [])
    .map((key) => catalog?.models?.find((model) => model.key === key))
    .filter(Boolean)
    .map(modelProvider))
  if (implementationProviders.size === 0) {
    return { model: null, reason: '没有可核对的实现模型提供方，无法建立交叉审查。', implementationProviders: [] }
  }
  const candidates = (catalog?.models ?? []).filter((model) => !implementationProviders.has(modelProvider(model)))
  if (candidates.length === 0) {
    return {
      model: null,
      reason: '没有可用的不同提供方模型；交叉审查未运行。',
      implementationProviders: [...implementationProviders],
    }
  }
  const decision = selectModelForTask('review', { ...catalog, models: candidates }, primaryModelKey, {
    ...routeOptions,
    needsVision,
  })
  if (!decision.model) {
    return {
      ...decision,
      reason: `没有符合能力与权限门槛的跨提供方审查模型：${decision.reason ?? '无可用模型'}`,
      implementationProviders: [...implementationProviders],
    }
  }
  const provider = modelProvider(decision.model)
  if (implementationProviders.has(provider)) {
    return { model: null, reason: '审查模型与实现节点来自同一提供方；为保证交叉审查，已停止该审查节点。', implementationProviders: [...implementationProviders] }
  }
  return {
    ...decision,
    implementationProviders: [...implementationProviders],
    reviewProvider: provider,
    crossProvider: true,
  }
}
