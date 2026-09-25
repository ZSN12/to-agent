import type { ChatMessage, TaskNode } from '../types'
import type { TaskweaverModelsApi, IpcResult } from './model-api'

export interface AppState {
  workspacePath: string | null
  conversationId: string
  threadTitle: string
  currentThreadId: string
  threads: ThreadSummary[]
  permissionMode: PermissionMode
  messages: ChatMessage[]
  tasks: TaskNode[]
  outputLogs: OutputLogEntry[]
}

export interface ThreadSummary {
  id: string
  conversationId: string
  workspacePath: string | null
  title: string
  permissionMode: PermissionMode
  updatedAt: number
  messageCount: number
  pinned?: boolean
  current?: boolean
}

export interface OutputLogEntry extends ToolTraceItem {
  inputSummary: string
  resultSummary: string
}

export type PermissionMode = 'ask' | 'on-risk' | 'full'

export interface FileDiffData {
  path: string
  diff: string
  type: string
  firstChangedLine?: number
  reverseEdits?: Array<{ oldText: string; newText: string }>
  addedLines?: number
  deletedLines?: number
  isNewFile?: boolean
}

export interface ToolTraceItem {
  id: string
  toolName: string
  status: 'running' | 'done' | 'error' | 'blocked'
  inputSummary?: string
  resultSummary?: string
  durationMs?: number | null
  taskId?: string
  startedAt?: number
  fileDiff?: FileDiffData | null
}

export interface PromptQueueSnapshot {
  steering: string[]
  followUp: string[]
}

export type ChatStreamEvent =
  | { type: 'start' }
  | { type: 'thinking_start' }
  | { type: 'thinking_delta'; delta: string; fullThinking: string }
  | { type: 'thinking_end'; fullThinking: string; durationMs?: number }
  | { type: 'delta'; delta: string; full: string }
  | { type: 'done'; full: string; fullThinking?: string }
  | { type: 'error'; message: string }
  | { type: 'tasks'; tasks: TaskNode[] }
  | { type: 'orchestration'; mode: 'single-agent' | 'multi-agent'; reason: string }
  | { type: 'progress'; text: string }
  | { type: 'steering_queued'; text: string }
  | { type: 'followup_queued'; text: string }
  | { type: 'queue_update'; steering: string[]; followUp: string[] }
  | { type: 'compaction'; automatic: boolean; summary?: string; tokensBefore?: number | null }
  | { type: 'retry'; phase: 'start' | 'end'; attempt: number; maxAttempts?: number; delayMs?: number; success?: boolean; message?: string }
  | ({ type: 'tool' } & ToolTraceItem)

export interface ChatSendResult {
  user?: ChatMessage
  assistant?: ChatMessage
  needsOrchestrationChoice?: boolean
  reason?: string
  suggestedMode?: 'multi-agent' | 'single-agent'
}

export interface SkillOption {
  name: string
  description: string
  path: string
  source: 'app' | 'workspace'
  multiAgent: boolean
}

export interface TaskweaverSkillsApi {
  list: () => Promise<IpcResult<SkillOption[]>>
}

export interface TaskweaverAppApi {
  getState: () => Promise<IpcResult<AppState>>
  listOutputLogs: (options?: { query?: string; status?: ToolTraceItem['status']; limit?: number }) => Promise<IpcResult<OutputLogEntry[]>>
  setWorkspace: (workspacePath: string | null) => Promise<IpcResult<AppState>>
  pickWorkspace: () => Promise<IpcResult<{ cancelled: boolean; state: AppState }>>
  createThread: (options?: { workspacePath?: string | null }) => Promise<IpcResult<AppState>>
  listThreads: () => Promise<IpcResult<ThreadSummary[]>>
  switchThread: (threadId: string) => Promise<IpcResult<AppState>>
  renameThread: (threadId: string, title: string) => Promise<IpcResult<ThreadSummary[]>>
  togglePinThread: (threadId: string) => Promise<IpcResult<ThreadSummary[]>>
  deleteThread: (threadId: string) => Promise<IpcResult<AppState>>
  forkThread: (threadId: string, messageId: string) => Promise<IpcResult<AppState>>
  clearConversation: (options?: { workspacePath?: string | null }) => Promise<IpcResult<AppState>>
  setPermissionMode: (mode: PermissionMode) => Promise<IpcResult<AppState>>
}

export interface WorkspaceEntry {
  path: string
  kind: 'file' | 'directory'
}

export interface WorkspaceReference extends WorkspaceEntry {
  token: string
}

export interface TaskweaverWorkspaceApi {
  listContext: (query?: string, limit?: number) => Promise<IpcResult<WorkspaceEntry[]>>
  createReference: (droppedPath: string) => Promise<IpcResult<WorkspaceReference>>
  getDroppedFilePath: (file: File) => string
  getTrust: () => Promise<IpcResult<WorkspaceTrustState>>
  setTrust: (trusted: boolean) => Promise<IpcResult<WorkspaceTrustState>>
  revertDiff: (payload: { path: string; reverseEdits?: Array<{ oldText: string; newText: string }>; originalContent?: string }) => Promise<IpcResult<{ success: boolean; message: string }>>
  openPath: (relativePath: string) => Promise<IpcResult<{ ok: boolean; error?: string; path?: string; isDirectory?: boolean }>>
  gitStatus: () => Promise<IpcResult<GitStatusResult>>
  gitSuggestCommit: () => Promise<IpcResult<GitCommitSuggestion>>
  createGitCheckpoint: (options?: { summary?: string }) => Promise<IpcResult<{ isRepo: boolean; checkpoint?: GitCheckpoint }>>
  listGitCheckpoints: () => Promise<IpcResult<GitCheckpoint[]>>
  getGitCheckpointDiff: (checkpointId: string) => Promise<IpcResult<GitCheckpointDiffResult>>
  restoreGitCheckpoint: (payload: { checkpointId: string; force?: boolean }) => Promise<IpcResult<GitRestoreResult>>
}

export interface GitCheckpoint {
  id: string
  conversationId?: string | null
  taskId?: string | null
  timestamp: number
  headCommit: string
  stashCommit?: string | null
  branch: string
  hasDirtyChanges: boolean
  changedFilesCount: number
  summary: string
}

export interface GitCheckpointDiffResult {
  checkpoint: GitCheckpoint
  diff: string
  stat: string
}

export interface GitRestoreResult {
  success: boolean
  message: string
  requireConfirm?: boolean
  hasChanges?: boolean
  changedFilesCount?: number
  willAdd?: string[]
  willOverwrite?: string[]
  willDelete?: string[]
  backupCheckpointId?: string | null
  stat?: string
  checkpoint?: GitCheckpoint
}

export interface GitStatusResult {
  isRepo: boolean
  branch: string | null
  staged: Array<{ file: string; status: string }>
  unstaged: Array<{ file: string; status: string }>
  untracked: string[]
  stat: string
  hasChanges: boolean
}

export interface GitCommitSuggestion {
  message: string
  branch?: string | null
  changedCount?: number
  stat?: string
  untrackedCount?: number
  summary?: string
}

export interface WorkspaceTrustState {
  workspacePath: string
  trusted: boolean
  updatedAt: number | null
}

export interface OrchestrationChoicePrompt {
  text: string
  modelKey?: string
  skillName?: string
  reason: string
  suggestedMode: 'multi-agent' | 'single-agent'
}

export type WorkMode = 'code' | 'plan' | 'goal'

export type BusyEnterMode = 'steer' | 'followUp'

export type PermissionPromptPayload = {
  id: string
  reason: string
  detail: string
  tool: string
  allowAlways?: boolean
}

export interface TaskweaverChatApi {
  send: (
    text: string,
    modelKey?: string | null,
    skillName?: string | null,
    executionModeOverride?: 'single-agent' | 'multi-agent' | null,
    workMode?: WorkMode | null,
  ) => Promise<IpcResult<ChatSendResult>>
  cancel: () => Promise<IpcResult<{ stopped: boolean }>>
  steer: (text: string) => Promise<IpcResult<any>>
  followUp: (text: string) => Promise<IpcResult<any>>
  queueMutate: (payload: {
    kind: 'steering' | 'followUp'
    index: number
    action: 'remove' | 'update'
    text?: string
  }) => Promise<IpcResult<{ ok: boolean; error?: string; steering?: string[]; followUp?: string[] }>>
  getLiveContext: () => Promise<IpcResult<LiveContextUsage>>
  getSessionStats: () => Promise<IpcResult<SessionStatsSnapshot | null>>
  onStream: (listener: (event: ChatStreamEvent) => void) => () => void
}

export interface SessionStatsSnapshot {
  userMessages: number
  assistantMessages: number
  toolCalls: number
  toolResults: number
  tokens: {
    input: number
    output: number
    cacheRead: number
    cacheWrite: number
    total: number
  }
  cost: number
  contextTokens?: number | null
  contextWindow?: number | null
  contextPercent?: number | null
}

export interface LiveContextUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  contextTokens: number | null
  contextWindow: number | null
  contextPercent: number | null
}

export interface TaskweaverTasksApi {
  sendMessage: (taskId: string, text: string) => Promise<IpcResult<ChatSendResult>>
}

export interface McpServerConfig {
  id: string
  command: string
  args: string[]
  env?: Record<string, string>
  enabled: boolean
}

export interface McpServerStatus {
  id: string
  command: string
  args: string[]
  envKeys: string[]
  enabled: boolean
  status: 'disconnected' | 'connecting' | 'connected' | 'error'
  toolCount: number
  error: string | null
}

export interface TaskweaverMcpApi {
  list: () => Promise<IpcResult<McpServerStatus[]>>
  save: (server: McpServerConfig) => Promise<IpcResult<McpServerStatus>>
  remove: (id: string) => Promise<IpcResult<boolean>>
  disconnect: (id: string) => Promise<IpcResult<void>>
  refresh: () => Promise<IpcResult<McpServerStatus[]>>
}

export interface PricingSyncStatus {
  registryPath: string
  synced_at: string | null
  stale_days: number | null
  stale: boolean
  model_count: number
  last_run: Record<string, unknown> | null
}

export interface TaskweaverPricingApi {
  getStatus: () => Promise<IpcResult<PricingSyncStatus>>
  sync: () => Promise<IpcResult<{ changed: string[]; modelCount: number; status: PricingSyncStatus }>>
}

export interface UsageRecordItem {
  id: string
  timestamp: number
  modelKey: string
  modelName?: string
  conversationId?: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  totalTokens: number
  costUsd: number
  elapsedMs: number
}

export interface ModelUsageTotals {
  totalCalls: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  totalTokens: number
  costUsd: number
  totalDurationMs: number
}

export interface ModelUsageByModel {
  modelKey: string
  modelName: string
  callCount: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  totalTokens: number
  costUsd: number
}

export interface ModelUsageDaily {
  date: string
  calls: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
  costUsd: number
}

export interface ModelUsageStats {
  totals: ModelUsageTotals
  byModel: ModelUsageByModel[]
  daily: ModelUsageDaily[]
  recent: UsageRecordItem[]
}

export interface TaskweaverUsageApi {
  getStats: () => Promise<IpcResult<ModelUsageStats>>
  getReport: (query?: { model?: string; start?: number | null; end?: number | null }) => Promise<IpcResult<any>>
  clear: () => Promise<IpcResult<{ ok: boolean }>>
}

export interface PermissionRule {
  id: string
  tool: string
  type: 'command' | 'path' | 'tool'
  pattern: string
  decision: 'allow' | 'deny'
  scope: 'workspace' | 'global'
  workspacePath?: string | null
  createdAt: number
  description?: string
}

export interface TaskweaverPermissionApi {
  listRules: () => Promise<IpcResult<PermissionRule[]>>
  addRule: (rule: Omit<PermissionRule, 'id' | 'createdAt'> & { id?: string }) => Promise<IpcResult<PermissionRule>>
  removeRule: (id: string) => Promise<IpcResult<boolean>>
  clearRules: (options?: { workspaceOnly?: boolean; globalOnly?: boolean }) => Promise<IpcResult<boolean>>
  respondPrompt: (id: string, response: { action: 'allow-once' | 'allow-always' | 'deny' }) => Promise<IpcResult<{ ok: boolean }>>
  onPrompt: (listener: (payload: PermissionPromptPayload) => void) => () => void
}

export interface TaskweaverBridge {
  app: TaskweaverAppApi
  pricing?: TaskweaverPricingApi
  workspace: TaskweaverWorkspaceApi
  models: TaskweaverModelsApi
  skills: TaskweaverSkillsApi
  mcp: TaskweaverMcpApi
  permission?: TaskweaverPermissionApi
  chat: TaskweaverChatApi
  tasks: TaskweaverTasksApi
  usage?: TaskweaverUsageApi
}

declare global {
  interface Window {
    taskweaver?: TaskweaverBridge
  }
}

export {}

