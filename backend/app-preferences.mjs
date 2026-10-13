import path from 'node:path'
import { createJsonStore } from './json-store.mjs'
import { DEFAULT_OPENUSAGE_URL, normalizeOpenUsageBaseUrl } from './openusage-service.mjs'
import { DAG_NODE_LIMIT_DEFAULT, normalizeDagNodeLimit } from './orchestration/dag-limits.mjs'

const PREFERENCES_VERSION = 1
const DEFAULT = {
  version: PREFERENCES_VERSION,
  worktreeIsolation: false,
  /** auto | workspace-write | read-only | off — DSH Seatbelt/bwrap bash 沙箱 */
  bashSandbox: 'auto',
  /** 每轮用户发送前在 Git 仓库打检查点（需为 git 仓库） */
  autoSnapshotOnTurn: false,
  /** 子任务失败后升级模型的最多次数（0 表示不升级重试） */
  subtaskUpgradeMax: 1,
  /** DAG 计划审批：默认只审批含写入节点的计划。 */
  dagPlanApproval: 'write-only',
  /** DAG 写入计划是否自动追加跨提供方审查，按用户显式启用。 */
  dagCrossProviderReview: false,
  /** DAG 全局并发上限，避免默认同时启动过多模型调用。 */
  maxSubtaskConcurrency: 3,
  /** DAG 节点数量上限；默认值保持旧版 6 节点行为。 */
  maxDagNodes: DAG_NODE_LIMIT_DEFAULT,
  /** DAG 只读节点运行上限；按毫秒存储 */
  dagReadOnlyTimeoutMs: 10 * 60 * 1000,
  /** DAG 写入/测试节点运行上限；按毫秒存储 */
  dagWriteTimeoutMs: 20 * 60 * 1000,
  /** DAG 节点没有任何流事件时的空闲上限；按毫秒存储 */
  dagIdleTimeoutMs: 3 * 60 * 1000,
  /** DAG 单轮 token 预算上限。 */
  dagBudgetTokens: 2_000_000,
  /** DAG 单轮美元成本预算上限。 */
  dagBudgetUsd: 2,
  /** DSH 自动压缩阈值，按当前会话模型上下文窗口的比例。 */
  compactionThresholdRatio: 0.8,
  /** ask 模式下工作区内只读工具免弹窗（DSH auto-review 轻量版） */
  autoReviewReads: true,
  /** 仅在工作区受信任时免除第一次 UI 自验证启动审批。 */
  autoAllowUiVerify: false,
  /** 改代码请求是否在 Host 外追加「运行验证命令」指引；默认关闭以对齐 DSH Web。 */
  autoVerifyAfterMutation: false,
  /** 代码变更后自动静默运行轻量验证，出错时驱动模型闭环自愈（Self-Healing Loop） */
  selfHealingLoop: false,
  /** 闭环自愈的最大自动修复重试轮次（1-3，默认 2） */
  selfHealingMaxRetries: 2,
  /** 启用基于 AST 与 PageRank 的全局代码地图感知 (Repo Map) */
  enableRepoMap: true,
  /** 显式 @file 引用是否允许内联小于 4 KiB 的 UTF-8 文本；默认只发送路径。 */
  inlineSmallFileReferences: false,
  /** Prompt Pipeline 注入系统上下文的最大字节数；实际预算还会按模型窗口动态缩放。 */
  promptInjectionLimitBytes: 128 * 1024,
  /** 灰区任务弹出「是否启用多 Agent」（规则门控，不调用模型） */
  adaptiveOrchestrationGate: true,
  /** 开启后常规消息默认走多 Agent DAG；默认关闭。 */
  preferMultiAgent: false,
  /** 聊天列表以 DSH session transcript 为准（线程库只保留编排扩展行） */
  preferDshTranscript: true,
  /** 本机 OpenUsage HTTP 根地址（仅 loopback，用于余额/刷新看板） */
  openUsageBaseUrl: DEFAULT_OPENUSAGE_URL,
}

const VALID_BASH_SANDBOX = new Set(['auto', 'workspace-write', 'read-only', 'off'])
const PROMPT_INJECTION_LIMIT_MIN_BYTES = 1024
const PROMPT_INJECTION_LIMIT_MAX_BYTES = 128 * 1024
const DAG_TIMEOUT_MIN_MS = 1_000
const DAG_TIMEOUT_MAX_MS = 60 * 60 * 1000
const DAG_BUDGET_TOKENS_MIN = 1_000
const DAG_BUDGET_TOKENS_MAX = 100_000_000
const DAG_BUDGET_USD_MIN = 0.01
const DAG_BUDGET_USD_MAX = 10_000
const COMPACTION_THRESHOLD_MIN = 0.6
const COMPACTION_THRESHOLD_MAX = 0.9
const DAG_CONCURRENCY_MIN = 1
const DAG_CONCURRENCY_MAX = 10
const VALID_DAG_PLAN_APPROVAL = new Set(['always', 'write-only', 'never'])

function normalizeDagPlanApproval(value, fallback = DEFAULT.dagPlanApproval) {
  return VALID_DAG_PLAN_APPROVAL.has(value) ? value : fallback
}

function normalizeDagTimeout(value, fallback) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(DAG_TIMEOUT_MIN_MS, Math.min(DAG_TIMEOUT_MAX_MS, Math.round(parsed)))
}

function normalizeDagConcurrency(value, fallback = DEFAULT.maxSubtaskConcurrency) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(DAG_CONCURRENCY_MIN, Math.min(DAG_CONCURRENCY_MAX, Math.round(parsed)))
}

function normalizeDagBudgetTokens(value, fallback = DEFAULT.dagBudgetTokens) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(DAG_BUDGET_TOKENS_MIN, Math.min(DAG_BUDGET_TOKENS_MAX, Math.round(parsed)))
}

function normalizeDagBudgetUsd(value, fallback = DEFAULT.dagBudgetUsd) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  const clamped = Math.max(DAG_BUDGET_USD_MIN, Math.min(DAG_BUDGET_USD_MAX, parsed))
  return Math.round(clamped * 100) / 100
}

function normalizeCompactionThresholdRatio(value, fallback = DEFAULT.compactionThresholdRatio) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(COMPACTION_THRESHOLD_MIN, Math.min(COMPACTION_THRESHOLD_MAX, parsed))
}

/** Incremental on-disk migrations. Each function advances exactly one version. */
const PREFERENCE_MIGRATIONS = {
  0: (preferences) => ({ ...preferences, version: 1 }),
}

function migratePreferences(raw) {
  const original = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  let preferences = { ...DEFAULT, ...original }
  let version = Number.isInteger(original.version) ? original.version : 0
  if (version > PREFERENCES_VERSION) {
    throw new Error(`偏好文件版本 ${version} 高于当前支持版本 ${PREFERENCES_VERSION}，为避免覆盖新数据已停止加载。`)
  }

  const changed = version !== PREFERENCES_VERSION
  while (version < PREFERENCES_VERSION) {
    const migrate = PREFERENCE_MIGRATIONS[version]
    if (typeof migrate !== 'function') throw new Error(`缺少偏好文件 v${version} 迁移函数。`)
    preferences = migrate(preferences)
    version++
    preferences.version = version
  }
  return { value: { ...DEFAULT, ...preferences, version: PREFERENCES_VERSION }, changed }
}

function normalizePromptInjectionLimitBytes(value, fallback = DEFAULT.promptInjectionLimitBytes) {
  if (!Number.isFinite(value)) return fallback
  return Math.max(
    PROMPT_INJECTION_LIMIT_MIN_BYTES,
    Math.min(PROMPT_INJECTION_LIMIT_MAX_BYTES, Math.round(value)),
  )
}

export function createAppPreferencesStore(userDataPath) {
  const store = createJsonStore(path.join(userDataPath, 'taskweaver-preferences.json'), DEFAULT)

  async function readPreferences() {
    const migrated = migratePreferences(await store.read())
    if (!migrated.changed) return migrated.value
    // Serialize migration with concurrent writes and apply it to the latest
    // persisted value so a settings update cannot be lost between read/write.
    return store.update((latest) => migratePreferences(latest).value)
  }

  return {
    async get() {
      const raw = await readPreferences()
      return {
        worktreeIsolation: raw.worktreeIsolation === true,
        bashSandbox: VALID_BASH_SANDBOX.has(raw.bashSandbox) ? raw.bashSandbox : DEFAULT.bashSandbox,
        autoSnapshotOnTurn: raw.autoSnapshotOnTurn === true,
        subtaskUpgradeMax: Number.isFinite(raw.subtaskUpgradeMax) ? Math.max(0, Math.min(3, raw.subtaskUpgradeMax)) : DEFAULT.subtaskUpgradeMax,
        dagPlanApproval: normalizeDagPlanApproval(raw.dagPlanApproval),
        dagCrossProviderReview: raw.dagCrossProviderReview === true,
        maxSubtaskConcurrency: normalizeDagConcurrency(raw.maxSubtaskConcurrency),
        maxDagNodes: normalizeDagNodeLimit(raw.maxDagNodes),
        dagReadOnlyTimeoutMs: normalizeDagTimeout(raw.dagReadOnlyTimeoutMs, DEFAULT.dagReadOnlyTimeoutMs),
        dagWriteTimeoutMs: normalizeDagTimeout(raw.dagWriteTimeoutMs, DEFAULT.dagWriteTimeoutMs),
        dagIdleTimeoutMs: normalizeDagTimeout(raw.dagIdleTimeoutMs, DEFAULT.dagIdleTimeoutMs),
        dagBudgetTokens: normalizeDagBudgetTokens(raw.dagBudgetTokens),
        dagBudgetUsd: normalizeDagBudgetUsd(raw.dagBudgetUsd),
        compactionThresholdRatio: normalizeCompactionThresholdRatio(raw.compactionThresholdRatio),
        autoReviewReads: raw.autoReviewReads !== false,
        autoAllowUiVerify: raw.autoAllowUiVerify === true,
        autoVerifyAfterMutation: raw.autoVerifyAfterMutation === true,
        selfHealingLoop: raw.selfHealingLoop === true,
        selfHealingMaxRetries: Number.isFinite(raw.selfHealingMaxRetries) ? Math.max(1, Math.min(3, raw.selfHealingMaxRetries)) : DEFAULT.selfHealingMaxRetries,
        enableRepoMap: raw.enableRepoMap !== false,
        inlineSmallFileReferences: raw.inlineSmallFileReferences === true,
        promptInjectionLimitBytes: normalizePromptInjectionLimitBytes(raw.promptInjectionLimitBytes),
        adaptiveOrchestrationGate: raw.adaptiveOrchestrationGate !== false,
        preferMultiAgent: raw.preferMultiAgent === true,
        preferDshTranscript: raw.preferDshTranscript !== false,
        openUsageBaseUrl: normalizeOpenUsageBaseUrl(raw.openUsageBaseUrl) ?? DEFAULT.openUsageBaseUrl,
      }
    },
    async set(patch) {
      const next = await store.update((raw) => {
        const prev = migratePreferences(raw).value
        return {
          version: PREFERENCES_VERSION,
          worktreeIsolation: patch.worktreeIsolation ?? prev.worktreeIsolation ?? false,
          bashSandbox: VALID_BASH_SANDBOX.has(patch.bashSandbox)
            ? patch.bashSandbox
            : (VALID_BASH_SANDBOX.has(prev.bashSandbox) ? prev.bashSandbox : DEFAULT.bashSandbox),
          autoSnapshotOnTurn: patch.autoSnapshotOnTurn ?? prev.autoSnapshotOnTurn ?? false,
          subtaskUpgradeMax: patch.subtaskUpgradeMax !== undefined
            ? Math.max(0, Math.min(3, Number(patch.subtaskUpgradeMax)))
            : (Number.isFinite(prev.subtaskUpgradeMax) ? prev.subtaskUpgradeMax : DEFAULT.subtaskUpgradeMax),
          dagPlanApproval: patch.dagPlanApproval !== undefined
            ? normalizeDagPlanApproval(patch.dagPlanApproval, normalizeDagPlanApproval(prev.dagPlanApproval))
            : normalizeDagPlanApproval(prev.dagPlanApproval),
          dagCrossProviderReview: typeof patch.dagCrossProviderReview === 'boolean'
            ? patch.dagCrossProviderReview
            : prev.dagCrossProviderReview === true,
          maxSubtaskConcurrency: patch.maxSubtaskConcurrency !== undefined
            ? normalizeDagConcurrency(patch.maxSubtaskConcurrency)
            : normalizeDagConcurrency(prev.maxSubtaskConcurrency),
          maxDagNodes: patch.maxDagNodes !== undefined
            ? normalizeDagNodeLimit(patch.maxDagNodes, normalizeDagNodeLimit(prev.maxDagNodes))
            : normalizeDagNodeLimit(prev.maxDagNodes),
          dagReadOnlyTimeoutMs: patch.dagReadOnlyTimeoutMs !== undefined
            ? normalizeDagTimeout(patch.dagReadOnlyTimeoutMs, normalizeDagTimeout(prev.dagReadOnlyTimeoutMs, DEFAULT.dagReadOnlyTimeoutMs))
            : normalizeDagTimeout(prev.dagReadOnlyTimeoutMs, DEFAULT.dagReadOnlyTimeoutMs),
          dagWriteTimeoutMs: patch.dagWriteTimeoutMs !== undefined
            ? normalizeDagTimeout(patch.dagWriteTimeoutMs, normalizeDagTimeout(prev.dagWriteTimeoutMs, DEFAULT.dagWriteTimeoutMs))
            : normalizeDagTimeout(prev.dagWriteTimeoutMs, DEFAULT.dagWriteTimeoutMs),
          dagIdleTimeoutMs: patch.dagIdleTimeoutMs !== undefined
            ? normalizeDagTimeout(patch.dagIdleTimeoutMs, normalizeDagTimeout(prev.dagIdleTimeoutMs, DEFAULT.dagIdleTimeoutMs))
            : normalizeDagTimeout(prev.dagIdleTimeoutMs, DEFAULT.dagIdleTimeoutMs),
          dagBudgetTokens: patch.dagBudgetTokens !== undefined
            ? normalizeDagBudgetTokens(patch.dagBudgetTokens, normalizeDagBudgetTokens(prev.dagBudgetTokens))
            : normalizeDagBudgetTokens(prev.dagBudgetTokens),
          dagBudgetUsd: patch.dagBudgetUsd !== undefined
            ? normalizeDagBudgetUsd(patch.dagBudgetUsd, normalizeDagBudgetUsd(prev.dagBudgetUsd))
            : normalizeDagBudgetUsd(prev.dagBudgetUsd),
          compactionThresholdRatio: patch.compactionThresholdRatio !== undefined
            ? normalizeCompactionThresholdRatio(
              patch.compactionThresholdRatio,
              normalizeCompactionThresholdRatio(prev.compactionThresholdRatio),
            )
            : normalizeCompactionThresholdRatio(prev.compactionThresholdRatio),
          autoReviewReads: patch.autoReviewReads !== undefined
            ? patch.autoReviewReads === true
            : (prev.autoReviewReads !== false),
          autoAllowUiVerify: patch.autoAllowUiVerify !== undefined
            ? patch.autoAllowUiVerify === true
            : (prev.autoAllowUiVerify === true),
          autoVerifyAfterMutation: patch.autoVerifyAfterMutation !== undefined
            ? patch.autoVerifyAfterMutation === true
            : (prev.autoVerifyAfterMutation === true),
          selfHealingLoop: patch.selfHealingLoop !== undefined
            ? patch.selfHealingLoop === true
            : (prev.selfHealingLoop === true),
          selfHealingMaxRetries: patch.selfHealingMaxRetries !== undefined
            ? Math.max(1, Math.min(3, Number(patch.selfHealingMaxRetries)))
            : (Number.isFinite(prev.selfHealingMaxRetries) ? prev.selfHealingMaxRetries : DEFAULT.selfHealingMaxRetries),
          enableRepoMap: patch.enableRepoMap !== undefined
            ? patch.enableRepoMap === true
            : (prev.enableRepoMap !== false),
          inlineSmallFileReferences: patch.inlineSmallFileReferences !== undefined
            ? (typeof patch.inlineSmallFileReferences === 'boolean'
              ? patch.inlineSmallFileReferences
              : prev.inlineSmallFileReferences === true)
            : (prev.inlineSmallFileReferences === true),
          promptInjectionLimitBytes: patch.promptInjectionLimitBytes !== undefined
            ? normalizePromptInjectionLimitBytes(patch.promptInjectionLimitBytes, normalizePromptInjectionLimitBytes(prev.promptInjectionLimitBytes))
            : normalizePromptInjectionLimitBytes(prev.promptInjectionLimitBytes),
          adaptiveOrchestrationGate: patch.adaptiveOrchestrationGate !== undefined
            ? patch.adaptiveOrchestrationGate === true
            : (prev.adaptiveOrchestrationGate !== false),
          preferMultiAgent: patch.preferMultiAgent !== undefined
            ? patch.preferMultiAgent === true
            : (prev.preferMultiAgent === true),
          preferDshTranscript: patch.preferDshTranscript !== undefined
            ? patch.preferDshTranscript === true
            : (prev.preferDshTranscript !== false),
          openUsageBaseUrl: patch.openUsageBaseUrl !== undefined
            ? (normalizeOpenUsageBaseUrl(patch.openUsageBaseUrl)
              ?? normalizeOpenUsageBaseUrl(prev.openUsageBaseUrl)
              ?? DEFAULT.openUsageBaseUrl)
            : (normalizeOpenUsageBaseUrl(prev.openUsageBaseUrl) ?? DEFAULT.openUsageBaseUrl),
        }
      })
      return Object.fromEntries(Object.entries(next).filter(([key]) => key !== 'version'))
    },
  }
}
