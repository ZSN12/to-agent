import path from 'node:path'
import { createJsonStore } from './json-store.mjs'
import { DEFAULT_OPENUSAGE_URL, normalizeOpenUsageBaseUrl } from './openusage-service.mjs'

const DEFAULT = {
  worktreeIsolation: false,
  /** auto | workspace-write | read-only | off — DSH Seatbelt/bwrap bash 沙箱 */
  bashSandbox: 'auto',
  /** 每轮用户发送前在 Git 仓库打检查点（需为 git 仓库） */
  autoSnapshotOnTurn: false,
  /** 子任务失败后升级模型的最多次数（0 表示不升级重试） */
  subtaskUpgradeMax: 1,
  /** ask 模式下工作区内只读工具免弹窗（DSH auto-review 轻量版） */
  autoReviewReads: true,
  /** 改代码请求是否在 Host 外追加「运行验证命令」指引；默认关闭以对齐 DSH Web。 */
  autoVerifyAfterMutation: false,
  /** 代码变更后自动静默运行轻量验证，出错时驱动模型闭环自愈（Self-Healing Loop） */
  selfHealingLoop: false,
  /** 闭环自愈的最大自动修复重试轮次（1-3，默认 2） */
  selfHealingMaxRetries: 2,
  /** 启用基于 AST 与 PageRank 的全局代码地图感知 (Repo Map) */
  enableRepoMap: true,
  /** Prompt Pipeline 注入系统上下文的最大字节数（默认 32 KiB，暂定防护上限而非最优值） */
  promptInjectionLimitBytes: 32 * 1024,
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

function normalizePromptInjectionLimitBytes(value, fallback = DEFAULT.promptInjectionLimitBytes) {
  if (!Number.isFinite(value)) return fallback
  return Math.max(
    PROMPT_INJECTION_LIMIT_MIN_BYTES,
    Math.min(PROMPT_INJECTION_LIMIT_MAX_BYTES, Math.round(value)),
  )
}

export function createAppPreferencesStore(userDataPath) {
  const store = createJsonStore(path.join(userDataPath, 'taskweaver-preferences.json'), DEFAULT)
  return {
    async get() {
      const raw = await store.read()
      return {
        worktreeIsolation: raw.worktreeIsolation === true,
        bashSandbox: VALID_BASH_SANDBOX.has(raw.bashSandbox) ? raw.bashSandbox : DEFAULT.bashSandbox,
        autoSnapshotOnTurn: raw.autoSnapshotOnTurn === true,
        subtaskUpgradeMax: Number.isFinite(raw.subtaskUpgradeMax) ? Math.max(0, Math.min(3, raw.subtaskUpgradeMax)) : DEFAULT.subtaskUpgradeMax,
        autoReviewReads: raw.autoReviewReads !== false,
        autoVerifyAfterMutation: raw.autoVerifyAfterMutation === true,
        selfHealingLoop: raw.selfHealingLoop === true,
        selfHealingMaxRetries: Number.isFinite(raw.selfHealingMaxRetries) ? Math.max(1, Math.min(3, raw.selfHealingMaxRetries)) : DEFAULT.selfHealingMaxRetries,
        enableRepoMap: raw.enableRepoMap !== false,
        promptInjectionLimitBytes: normalizePromptInjectionLimitBytes(raw.promptInjectionLimitBytes),
        adaptiveOrchestrationGate: raw.adaptiveOrchestrationGate !== false,
        preferMultiAgent: raw.preferMultiAgent === true,
        preferDshTranscript: raw.preferDshTranscript !== false,
        openUsageBaseUrl: normalizeOpenUsageBaseUrl(raw.openUsageBaseUrl) ?? DEFAULT.openUsageBaseUrl,
      }
    },
    async set(patch) {
      const prev = await store.read()
      const next = {
        worktreeIsolation: patch.worktreeIsolation ?? prev.worktreeIsolation ?? false,
        bashSandbox: VALID_BASH_SANDBOX.has(patch.bashSandbox)
          ? patch.bashSandbox
          : (VALID_BASH_SANDBOX.has(prev.bashSandbox) ? prev.bashSandbox : DEFAULT.bashSandbox),
        autoSnapshotOnTurn: patch.autoSnapshotOnTurn ?? prev.autoSnapshotOnTurn ?? false,
        subtaskUpgradeMax: patch.subtaskUpgradeMax !== undefined
          ? Math.max(0, Math.min(3, Number(patch.subtaskUpgradeMax)))
          : (Number.isFinite(prev.subtaskUpgradeMax) ? prev.subtaskUpgradeMax : DEFAULT.subtaskUpgradeMax),
        autoReviewReads: patch.autoReviewReads !== undefined
          ? patch.autoReviewReads === true
          : (prev.autoReviewReads !== false),
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
      await store.write(next)
      return next
    },
  }
}
