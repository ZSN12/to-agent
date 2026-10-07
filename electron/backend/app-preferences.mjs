import path from 'node:path'
import { createJsonStore } from './json-store.mjs'

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
  /** 启用基于 AST 与 PageRank 的全局代码地图感知 (Repo Map) */
  enableRepoMap: true,
  /** Prompt Pipeline 注入系统上下文的最大字节数（默认 32 KiB，暂定防护上限而非最优值） */
  promptInjectionLimitBytes: 32 * 1024,
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
        enableRepoMap: raw.enableRepoMap !== false,
        promptInjectionLimitBytes: normalizePromptInjectionLimitBytes(raw.promptInjectionLimitBytes),
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
        enableRepoMap: patch.enableRepoMap !== undefined
          ? patch.enableRepoMap === true
          : (prev.enableRepoMap !== false),
        promptInjectionLimitBytes: patch.promptInjectionLimitBytes !== undefined
          ? normalizePromptInjectionLimitBytes(patch.promptInjectionLimitBytes, normalizePromptInjectionLimitBytes(prev.promptInjectionLimitBytes))
          : normalizePromptInjectionLimitBytes(prev.promptInjectionLimitBytes),
      }
      await store.write(next)
      return next
    },
  }
}
