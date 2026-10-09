export type TaskStatus = 'done' | 'running' | 'queued' | 'review' | 'cancelled'

export type ThinkingLevel = string

export type AssistantContentBlock = { id: string; kind: 'thinking' | 'text'; text: string }

export interface ModifiedFileSummary {
  path: string
  addedLines?: number
  deletedLines?: number
  isNewFile?: boolean
}

/** Cursor-style per-turn tool activity (persisted after Host turn completes). */
export interface TurnActivitySummary {
  editedFileCount: number
  exploredFileCount: number
  searchCount: number
  commandCount: number
  addedLines?: number
  deletedLines?: number
  linesComplete?: boolean
}

export interface ModelOption {
  id: string
  name: string
  contextWindow?: number
  displayName?: string
  quality?: string
  reasoning?: boolean
  thinkingLevel?: ThinkingLevel
  supportedThinkingLevels?: ThinkingLevel[]
  reasoningEfforts?: { id: ThinkingLevel; name?: string; description?: string }[]
  defaultThinkingLevel?: ThinkingLevel
  vision?: boolean
}

export interface ChatMessage {
  id: string
  author: 'user' | 'orchestrator' | 'agent'
  name: string
  time: string
  timestamp?: number
  text: string
  thinking?: string
  thinkingDurationMs?: number
  /** 一轮内多段 Think / 正文（工具循环后会有多组） */
  contentBlocks?: AssistantContentBlock[]
  /** 本轮 Host edit/write 结果的轻量文件摘要，不包含源码 diff 正文。 */
  fileChanges?: ModifiedFileSummary[]
  turnActivity?: TurnActivitySummary
  modelKey?: string
  callout?: string
  usage?: ChatUsage
  executionEvidenceSummary?: TaskExecutionEvidenceSummary
  behavior?: 'steer' | 'followUp'
  /** 用户停止或中断的轮次（DSH interrupted 语义） */
  interrupted?: boolean
  compaction?: {
    automatic: boolean
    summary?: string
    tokensBefore?: number | null
  }
  /** 压缩命令等维护操作的用量展示口径（非普通聊天轮次）。 */
  usageKind?: 'compaction'
}

export interface TaskExecutionEvidenceSummary {
  source: 'z-host-tool-events' | 'unknown'
  observedCallCount: number
  successfulReadCount: number
  successfulSearchCount: number
  failedCallCount: number
  runningCallCount: number
  omittedToolCalls: number
  label: string
}

export interface ChatUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  costUsd: number
  elapsedMs: number
  tokensPerSecond: number
  contextTokens: number | null
  contextWindow: number | null
  contextPercent: number | null
  /** 首 token（含 thinking）延迟 */
  ttftMs?: number | null
  /** 本轮工具执行累计耗时 */
  toolMs?: number | null
  /** 近似 LLM 等待时间（elapsed − tool） */
  llmMs?: number | null
}

export interface TaskNode {
  id: string
  /** Orchestration run that owns this task's isolated worktree. */
  runId?: string
  title: string
  role: string
  model: string
  tier: 'low' | 'balanced' | 'high' | 'deterministic'
  status: TaskStatus
  statusLabel: string
  duration: string
  description: string
  detail: string
  reasons: string[]
  confidence: string
  messages: ChatMessage[]
  x: number
  y: number
  taskType?: 'research' | 'implementation' | 'test' | 'review'
  dependsOn?: string[]
  modelKey?: string
  routeReason?: string
  toolProfile?: 'read-only' | 'verification' | 'workspace-write'
  /** Deterministic summary of Host-observed calls; does not certify answer correctness. */
  executionEvidenceSummary?: TaskExecutionEvidenceSummary
  /** 子任务在独立 git worktree 中执行，改动未自动合并 */
  worktreeIsolated?: boolean
  error?: string
}
