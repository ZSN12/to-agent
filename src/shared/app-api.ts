import type { ChatMessage, TaskNode } from '../types'
import type { TaskweaverModelsApi, IpcResult, ThinkingLevel } from './model-api'

export interface AppState {
  workspacePath: string | null
  conversationId: string
  threadTitle: string
  currentThreadId: string
  threads: ThreadSummary[]
  permissionMode: PermissionMode
  modelKey?: string | null
  thinkingLevel?: ThinkingLevel | null
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
  modelKey?: string | null
  thinkingLevel?: ThinkingLevel | null
  updatedAt: number
  messageCount: number
  pinned?: boolean
  archived?: boolean
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
  status: 'running' | 'done' | 'error' | 'blocked' | 'cancelled'
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
  | ({ conversationId?: string } & (
  | { type: 'start'; startedAt?: number }
  | { type: 'thinking_start' }
  | { type: 'thinking_delta'; delta: string; fullThinking: string }
  | { type: 'thinking_end'; fullThinking: string; durationMs?: number }
  | { type: 'delta'; delta: string; full: string }
  | { type: 'blocks'; segments: Array<{ id: string; kind: 'thinking' | 'text'; text: string }> }
  | {
    type: 'done'
    full: string
    fullThinking?: string
    thinkingDurationMs?: number
    contentBlocks?: Array<{ id: string; kind: 'thinking' | 'text'; text: string }>
  }
  | { type: 'error'; message: string }
  | { type: 'tasks'; tasks: TaskNode[] }
  | { type: 'orchestration'; mode: 'single-agent' | 'multi-agent'; reason: string }
  | { type: 'progress'; text: string }
  | { type: 'model_route'; taskType?: string; displayName?: string; reason?: string; reasons?: string[] }
  | { type: 'steering_queued'; text: string }
  | { type: 'followup_queued'; text: string }
  | { type: 'queue_update'; steering: string[]; followUp: string[] }
  | { type: 'compaction'; id?: string; automatic: boolean; summary?: string; tokensBefore?: number | null }
  | { type: 'retry'; phase: 'start' | 'end'; attempt: number; maxAttempts?: number; delayMs?: number; success?: boolean; message?: string }
  | ({ type: 'tool' } & ToolTraceItem)))

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
  source: 'app' | 'workspace' | 'dsh'
  /** Composer 来源标签；未设置时由 source 推导。 */
  sourceLabel?: string
  multiAgent: boolean
}

export function skillOptionSourceLabel(skill: SkillOption): string {
  if (skill.sourceLabel) return skill.sourceLabel
  if (skill.source === 'workspace') return '工作区'
  if (skill.source === 'dsh') return 'DSH'
  return '应用'
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
  toggleArchiveThread: (threadId: string) => Promise<IpcResult<ThreadSummary[]>>
  searchThreads: (query: string, options?: { workspacePath?: string | null }) => Promise<IpcResult<ThreadSummary[]>>
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
  previewManualGitCommit: () => Promise<IpcResult<ManualGitCommitPreview>>
  createManualGitCommit: (options?: {
    message?: string
    expectedPreviewFingerprint?: string
  }) => Promise<IpcResult<ManualGitCommitResult>>
  listGitCheckpoints: () => Promise<IpcResult<GitCheckpoint[]>>
  getGitCheckpointDiff: (checkpointId: string) => Promise<IpcResult<GitCheckpointDiffResult>>
  restoreGitCheckpoint: (payload: { checkpointId: string; force?: boolean; expectedStateFingerprint?: string }) => Promise<IpcResult<GitRestoreResult>>
  deleteGitCheckpoint: (checkpointId: string) => Promise<IpcResult<{ deletedId: string }>>
}

export type GitCheckpointKind = 'internal_protection' | 'git_commit'

export interface GitCheckpoint {
  id: string
  kind?: GitCheckpointKind
  conversationId?: string | null
  taskId?: string | null
  timestamp: number
  headCommit: string
  stashCommit?: string | null
  commitSha?: string
  commitMessage?: string
  branch: string
  hasDirtyChanges: boolean
  changedFilesCount: number
  summary: string
  gitRef?: string | null
}

export interface ManualGitCommitPreview {
  ok: boolean
  isRepo: boolean
  detached?: boolean
  error?: string
  branch?: string | null
  headCommit?: string | null
  headShortSha?: string | null
  hasCommittableChanges?: boolean
  clean?: boolean
  defaultMessage?: string
  files?: Array<{ file: string; change: string }>
  stagedCount?: number
  unstagedCount?: number
  untrackedCount?: number
  stateFingerprint?: string
  notice?: string
  stalePreview?: boolean
  preview?: ManualGitCommitPreview
}

export interface ManualGitCommitResult {
  ok: boolean
  isRepo: boolean
  clean?: boolean
  headShortSha?: string | null
  headCommit?: string | null
  message?: string
  checkpoint?: GitCheckpoint
  commitSha?: string
  branch?: string
  commitMessage?: string
  changedFilesCount?: number
  workspaceClean?: boolean
  error?: string
  stalePreview?: boolean
  preview?: ManualGitCommitPreview
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
  stateMismatch?: boolean
  stateFingerprint?: string
  hasChanges?: boolean
  changedFilesCount?: number
  willAdd?: string[]
  willOverwrite?: string[]
  willDelete?: string[]
  backupCheckpointId?: string | null
  stat?: string
  checkpoint?: GitCheckpoint
  restoreMode?: 'git_reset_hard' | 'workspace_files'
  commitsDropped?: number
  targetCommitSha?: string
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
  conversationId?: string
  reason: string
  detail: string
  tool: string
  allowAlways?: boolean
  sandboxEscalation?: {
    effectiveMode: string
    targets: Array<'workspace-write' | 'danger-full-access'>
  }
}

export type SandboxModeEvent = {
  type: 'sandbox/mode'
  time: number
  data: { mode: string; source: string }
}

export type SandboxEffectivePolicy = {
  workspaceRoot: string
  file: { mode: string }
  bash: { mode: string }
  standingMode?: string
}

export interface TaskweaverChatApi {
  send: (
    text: string,
    modelKey?: string | null,
    skillName?: string | null,
    executionModeOverride?: 'single-agent' | 'multi-agent' | null,
    workMode?: WorkMode | null,
    conversationId?: string | null,
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
  getLiveContext: (conversationId?: string | null) => Promise<IpcResult<LiveContextUsage | null>>
  getSessionStats: (conversationId?: string | null) => Promise<IpcResult<SessionStatsSnapshot | null>>
  listRunningConversations: () => Promise<IpcResult<string[]>>
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

export interface ContextBreakdownEstimate {
  systemTokens: number
  toolsTokens: number
  messageTokens: number
}

export interface LiveContextUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  contextTokens: number | null
  contextWindow: number | null
  contextPercent: number | null
  contextBreakdown?: ContextBreakdownEstimate
}

export interface TaskweaverTasksApi {
  sendMessage: (taskId: string, text: string, conversationId?: string | null) => Promise<IpcResult<ChatSendResult>>
}

export interface McpServerConfig {
  id: string
  transport?: 'stdio' | 'http'
  command?: string
  url?: string
  args: string[]
  env?: Record<string, string>
  enabled: boolean
}

export interface McpServerStatus {
  id: string
  transport: 'stdio' | 'http'
  command?: string
  url?: string
  args: string[]
  envKeys: string[]
  enabled: boolean
  status: 'disconnected' | 'connecting' | 'connected' | 'error'
  toolCount: number
  error: string | null
}

export interface McpCatalogEntry {
  id: string
  title: string
  description: string
  command: string
  args: string[]
  docsUrl?: string
  envKeys?: string[]
  iconKey?: string
  color?: string
}

export interface McpMarketplaceManifest {
  id: string
  version: string
  updatedAt: string
  description: string
  entryCount: number
}

export interface McpMarketplaceEntry extends McpCatalogEntry {
  marketplaceId: string
  installable: boolean
}

export interface McpDshRuntimeBinding {
  dshWired: boolean
  executionNote: string
}

export interface TaskweaverMcpApi {
  getRuntimeBinding: () => Promise<IpcResult<McpDshRuntimeBinding>>
  list: () => Promise<IpcResult<McpServerStatus[]>>
  catalog: () => Promise<IpcResult<McpCatalogEntry[]>>
  marketplace: () => Promise<IpcResult<{ manifest: McpMarketplaceManifest; entries: McpMarketplaceEntry[] }>>
  installCatalog: (id: string, env?: Record<string, string>) => Promise<IpcResult<McpServerStatus>>
  installMarketplace?: (id: string, env?: Record<string, string>) => Promise<IpcResult<McpServerStatus>>
  save: (server: McpServerConfig) => Promise<IpcResult<McpServerStatus>>
  remove: (id: string) => Promise<IpcResult<boolean>>
  setEnabled: (id: string, enabled: boolean) => Promise<IpcResult<McpServerStatus>>
  disconnect: (id: string) => Promise<IpcResult<void>>
  testConnection: (id: string) => Promise<IpcResult<McpServerStatus>>
  configureGitHub: (token: string) => Promise<IpcResult<McpServerStatus>>
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
  respondPrompt: (
    id: string,
    response: {
      action: 'allow-once' | 'allow-always' | 'deny' | 'escalate-once'
      sandboxMode?: 'workspace-write' | 'danger-full-access'
    },
  ) => Promise<IpcResult<{ ok: boolean }>>
  onPrompt: (listener: (payload: PermissionPromptPayload) => void) => () => void
  listApprovalAudit: (conversationId?: string | null) => Promise<IpcResult<ApprovalAuditEntry[]>>
}

export interface ApprovalAuditEntry {
  type: string
  time: number
  conversationId?: string
  id?: string
  toolName?: string
  callId?: string
  reason?: string
  outcome?: string
  risk?: string
  decision?: string
  verdict?: string
}

export interface TerminalSessionInfo {
  id: string
  cwd: string
  title: string
  isPty?: boolean
  shell?: string
}

export interface TaskweaverTerminalApi {
  create: (options?: { id?: string; cwd?: string; title?: string; cols?: number; rows?: number }) => Promise<IpcResult<TerminalSessionInfo>>
  write: (id: string, data: string) => Promise<IpcResult<boolean>>
  resize: (id: string, cols: number, rows: number) => Promise<IpcResult<boolean>>
  kill: (id: string) => Promise<IpcResult<boolean>>
  list: () => Promise<IpcResult<TerminalSessionInfo[]>>
  onData: (listener: (payload: { id: string; data: string }) => void) => () => void
  onExit: (listener: (payload: { id: string; code: number | null }) => void) => () => void
}

export interface ToolDiagnosticInfo {
  name: string
  installed: boolean
  resolvedPath: string | null
  version: string | null
  error: string | null
  fixGuide: string | null
}

export interface EnvDiagnosticsInfo {
  platform: string
  arch: string
  isDockLaunch: boolean
  rawPath: string
  effectivePath: string
  standardToolDirs: string[]
  tools: Record<string, ToolDiagnosticInfo>
  launchMode: string
  summary: string
}

export interface TaskweaverSystemApi {
  getEnvDiagnostics: (customDirs?: string[]) => Promise<IpcResult<EnvDiagnosticsInfo>>
  diagnoseTool: (name: string) => Promise<IpcResult<ToolDiagnosticInfo>>
}

export interface RoutingPortfolio {
  version: number
  display_names?: Record<string, string>
  subscriptions?: Array<{
    id: string
    label: string
    note?: string
    prefer_models: string[]
    deprioritize_models?: string[]
    marginal_cost?: number
  }>
  metered_surge?: Array<{
    provider: string
    match_model_keys?: string[]
    timezone?: string
    windows: Array<{
      days: string[]
      hours: [number, number]
      surcharge_factor: number
    }>
    action?: string
  }>
  task_affinity?: Record<string, {
    prefer?: string[]
    avoid?: string[]
    reason?: string
    min_capability?: string
  }>
  capabilities?: Record<string, {
    match_model_ids?: string[]
    tags?: string[]
  }>
  quota_cycles?: {
    enabled: boolean
    source?: string
    base_url?: string
    policies?: Array<{
      provider_id: string
      resource_id: string
      rollover: boolean | string
      use_before_reset: boolean
    }>
  }
}

export interface TaskweaverPortfolioApi {
  get: () => Promise<IpcResult<RoutingPortfolio>>
  save: (portfolio: RoutingPortfolio) => Promise<IpcResult<{ ok: boolean; path: string }>>
  resetToBundled: () => Promise<IpcResult<{ ok: boolean; portfolio: RoutingPortfolio }>>
  getBundledTemplate: () => Promise<IpcResult<RoutingPortfolio>>
  getDisplayName: (modelKey: string) => Promise<IpcResult<string>>
}

export type BashSandboxPreference = 'auto' | 'workspace-write' | 'read-only' | 'off'

export interface AppPreferences {
  worktreeIsolation: boolean
  bashSandbox?: BashSandboxPreference
  autoSnapshotOnTurn?: boolean
  subtaskUpgradeMax?: number
  autoReviewReads?: boolean
}

export interface SessionMemorySnapshot {
  conversation_id: string
  user_goal?: string
  rolling_summary?: string
  dependency_outputs?: Record<string, unknown>
  updated_at?: string
}

export interface WorktreeDiffResult {
  taskId: string
  path: string
  stat: string
  patch: string
}

export interface WorktreeMergePreview {
  canApply: boolean
  conflict: boolean
  taskId: string
  stat: string
  files?: string[]
  conflicts?: string[]
  reason?: string
}

export interface WorktreeMergeResult {
  applied: boolean
  taskId: string
  stat: string
  files?: string[]
  worktreeRemoved: boolean
  cleanupSuccess?: boolean
  cleanupError?: string
}

export interface SandboxProbeResult {
  platform: string
  seatbelt: boolean
  bwrap: boolean
  landlock?: boolean
  windowsAcl?: boolean
  runner?: string | null
  available: boolean
  note?: string
}

export interface WebSearchConfig {
  enabled: boolean
  apiKey?: string
  hasKey?: boolean
  endpoint?: string
  maxResults: number
  clearKey?: boolean
}

export interface TaskweaverPreferencesApi {
  get: () => Promise<IpcResult<AppPreferences>>
  set: (patch: Partial<AppPreferences>) => Promise<IpcResult<AppPreferences>>
}

export interface TaskweaverSandboxApi {
  probe: () => Promise<IpcResult<SandboxProbeResult>>
  getEffective: () => Promise<IpcResult<SandboxEffectivePolicy>>
  setSessionMode: (mode: 'default' | 'read-only' | 'workspace-write' | 'danger-full-access' | null) => Promise<IpcResult<SandboxModeEvent>>
  onMode: (listener: (event: SandboxModeEvent) => void) => () => void
}

export interface TaskweaverWebSearchApi {
  getConfig: () => Promise<IpcResult<WebSearchConfig>>
  setConfig: (patch: Partial<WebSearchConfig>) => Promise<IpcResult<WebSearchConfig>>
  testSearch?: (query: string) => Promise<IpcResult<{ ok: boolean; text?: string; error?: string }>>
}

export interface WorktreeEntry {
  taskId: string
  path: string
}

export interface TaskweaverWorktreeApi {
  list: () => Promise<IpcResult<WorktreeEntry[]>>
  remove: (taskId: string, force?: boolean) => Promise<IpcResult<{ removed: boolean }>>
  diff: (taskId: string) => Promise<IpcResult<WorktreeDiffResult>>
  previewMerge: (taskId: string) => Promise<IpcResult<WorktreeMergePreview>>
  applyMerge: (taskId: string, options?: { removeAfter?: boolean }) => Promise<IpcResult<WorktreeMergeResult>>
}

export interface TaskweaverMemoryApi {
  get: () => Promise<IpcResult<SessionMemorySnapshot | null>>
  clear: () => Promise<IpcResult<{ ok: boolean }>>
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
  terminal?: TaskweaverTerminalApi
  system?: TaskweaverSystemApi
  portfolio?: TaskweaverPortfolioApi
  preferences?: TaskweaverPreferencesApi
  sandbox?: TaskweaverSandboxApi
  webSearch?: TaskweaverWebSearchApi
  worktree?: TaskweaverWorktreeApi
  memory?: TaskweaverMemoryApi
}

declare global {
  interface Window {
    taskweaver?: TaskweaverBridge
  }
}

export {}
