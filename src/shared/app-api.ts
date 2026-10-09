import type { ChatMessage, ChatUsage, ModifiedFileSummary, TaskNode, TurnActivitySummary } from '../types'
import type { IpcResult, ThinkingLevel } from './model-api'

export type { InvokeChannel } from './ipc-invoke-channels'

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

/** Sidebar-only search result with an optional transcript excerpt. */
export interface ThreadSearchResult extends ThreadSummary {
  searchSnippet?: string
}

export interface OutputLogEntry extends ToolTraceItem {
  inputSummary: string
  resultSummary: string
}

export type PermissionMode = 'readonly' | 'ask' | 'on-risk' | 'full'

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
  /** Parent run_code call for host-dispatched child tools. */
  parentCallId?: string | null
  /** Host model turn/step used to group live calls like the native transcript. */
  turn?: number
  step?: number
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
  | { type: 'start'; startedAt?: number; turnId?: string }
  | { type: 'thinking_start' }
  | { type: 'thinking_delta'; delta: string; fullThinking?: string; durationMs?: number }
  | { type: 'thinking_end'; fullThinking?: string; durationMs?: number }
  | { type: 'delta'; delta: string; full?: string }
  | { type: 'blocks'; segments: Array<{ id: string; kind: 'thinking' | 'text'; text: string }> }
  | {
    type: 'done'
    full: string
    /** Stable identity shared by the completed stream and IPC assistant. */
    turnId?: string
    startedAt?: number
    /** The turn ended, but accepted follow-up turns still belong to this run. */
    continuing?: boolean
    fullThinking?: string
    thinkingDurationMs?: number
    /** True when DSH closed this turn as interrupted/cancelled, not completed. */
    interrupted?: boolean
    contentBlocks?: Array<{ id: string; kind: 'thinking' | 'text'; text: string }>
    fileChanges?: ModifiedFileSummary[]
    turnActivity?: TurnActivitySummary
  }
  | { type: 'error'; message: string; turnId?: string; startedAt?: number;
      full?: string; fullThinking?: string; thinkingDurationMs?: number; usage?: ChatUsage;
      contentBlocks?: Array<{ id: string; kind: 'thinking' | 'text'; text: string }>; fileChanges?: ModifiedFileSummary[];
      turnActivity?: TurnActivitySummary }
  | { type: 'tasks'; tasks: TaskNode[] }
  | { type: 'orchestration'; mode: 'single-agent' | 'multi-agent'; reason: string }
  | { type: 'progress'; text: string }
  | { type: 'activity'; message: string; phase?: 'tools' | 'llm' | 'step' }
  | { type: 'connection'; state: 'reconnecting' | 'restored' | 'unavailable'; message: string }
  | { type: 'model_route'; taskType?: string; displayName?: string; reason?: string; reasons?: string[] }
  | { type: 'steering_queued'; text: string }
  | { type: 'followup_queued'; text: string }
  | { type: 'queue_update'; steering: string[]; followUp: string[] }
  | { type: 'compaction'; id?: string; automatic: boolean; summary?: string; tokensBefore?: number | null }
  | { type: 'retry'; phase: 'start' | 'end'; attempt: number; maxAttempts?: number; delayMs?: number; success?: boolean; message?: string }
  | ({ type: 'tool' } & ToolTraceItem)))

export interface ChatSendResult {
  accepted?: boolean
  queued?: boolean
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
  if (skill.source === 'dsh') return 'Z'
  return '应用'
}

export interface TaskweaverSkillsApi {
  list: () => Promise<IpcResult<SkillOption[]>>
}

export interface ForkThreadResult {
  state: AppState
  /** 分支保留的轮数（用户轮次）；无法换算时为 null。 */
  completedTurns: number | null
  /** DSH `sessions.fork` 实际使用的 atSeq；全量继承时为 null。 */
  atSeq: number | null
}

export interface TaskweaverAppApi {
  getState: () => Promise<IpcResult<AppState>>
  listOutputLogs: (options?: { query?: string; status?: ToolTraceItem['status']; limit?: number }) => Promise<IpcResult<OutputLogEntry[]>>
  setWorkspace: (workspacePath: string | null) => Promise<IpcResult<AppState>>
  pickWorkspace: () => Promise<IpcResult<{ cancelled: boolean; state: AppState }>>
  listThreads: () => Promise<IpcResult<ThreadSummary[]>>
  switchThread: (threadId: string) => Promise<IpcResult<AppState>>
  renameThread: (threadId: string, title: string) => Promise<IpcResult<ThreadSummary[]>>
  togglePinThread: (threadId: string) => Promise<IpcResult<ThreadSummary[]>>
  toggleArchiveThread: (threadId: string) => Promise<IpcResult<ThreadSummary[]>>
  searchThreads: (query: string, options?: { workspacePath?: string | null }) => Promise<IpcResult<ThreadSearchResult[]>>
  deleteThread: (threadId: string) => Promise<IpcResult<AppState>>
  forkThread: (threadId: string, messageId: string) => Promise<IpcResult<ForkThreadResult>>
  clearConversation: (options?: { workspacePath?: string | null }) => Promise<IpcResult<AppState>>
  setPermissionMode: (mode: PermissionMode) => Promise<IpcResult<AppState>>
  setModelKey: (modelKey: string) => Promise<IpcResult<AppState>>
  setThinkingLevel: (thinkingLevel: string) => Promise<IpcResult<AppState>>
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
  saveClipboardImage?: (payload: { base64: string; mimeType: string; filename?: string }) => Promise<IpcResult<WorkspaceReference & { fullPath?: string }>>
  getDroppedFilePath: (file: File) => string
  getTrust: () => Promise<IpcResult<WorkspaceTrustState>>
  setTrust: (trusted: boolean) => Promise<IpcResult<WorkspaceTrustState>>
  revertDiff: (payload: { path: string; reverseEdits?: Array<{ oldText: string; newText: string }>; originalContent?: string }) => Promise<IpcResult<{ success: boolean; message: string }>>
  openPath: (relativePath: string) => Promise<IpcResult<{ ok: boolean; error?: string; path?: string; isDirectory?: boolean }>>
  gitStatus: () => Promise<IpcResult<GitStatusResult>>
  gitSuggestCommit: () => Promise<IpcResult<GitCommitSuggestion>>
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
  /** 仅当前会话记忆，不写盘。 */
  allowAlwaysSession?: boolean
  sandboxEscalation?: {
    effectiveMode: string
    targets: Array<'workspace-write' | 'danger-full-access'>
  }
}

export type UserQuestionItem = {
  id: string
  question: string
  header?: string
  detail?: string
  options?: Array<{ label: string; description?: string }>
  multiSelect?: boolean
  intent?: { kind: 'plan-review'; approve: string }
}

export type UserQuestionAnswer = {
  answers: Array<{ id: string; selected: string[]; custom?: string }>
}

export type UserQuestionPromptPayload = {
  id: string
  conversationId: string
  questions: UserQuestionItem[]
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

/** Serialized {@link serializeDshConversationView} payload from main-process Session projection. */
export interface DshConversationPartialBlock {
  kind: string
  preview?: string
  length?: number
  name?: string
  callId?: string
  argsPreview?: string
}

export interface DshConversationPartial {
  turn?: number
  step?: number
  blocks: DshConversationPartialBlock[]
}

export interface DshConversationRunningCall {
  callId: string
  parentCallId?: string | null
  toolName: string
  status: 'running'
  turn?: number
  step?: number
  startedAt?: number | null
}

/** One root tool-call row from DSH chat projection (`tool-call` node). */
export interface DshProjectedToolCall {
  callId: string
  /** Parent run_code call for host-dispatched child tools. */
  parentCallId?: string | null
  toolName: string
  argsRaw: string
  status: 'running' | 'done' | 'error' | 'stopped'
  turn: number
  step: number
  startedAt?: number
  durationMs?: number
  resultPreview?: string
  isError?: boolean
}

export interface DshTranscriptRow {
  dshKey: string
  role: 'user' | 'assistant' | 'compaction' | 'context'
  text?: string
  thinking?: string
  interrupted?: boolean
  behavior?: 'steer' | 'followUp'
  automatic?: boolean
  summary?: string
  tokensBefore?: number | null
  timestamp?: number
  usage?: ChatMessage['usage']
  modelKey?: string
  /** Restricted provenance copied only from source.kind === 'plugin'. */
  plugin?: string
  /** Producer-declared context form; unknown values remain opaque display labels. */
  form?: string
}

/** Display-only metadata present on projected Host context rows, never assistant turns. */
export type DshTranscriptChatMessage = ChatMessage & {
  dshContext?: {
    plugin: string
    form?: string
  }
}

export type HostPlanProjection = {
  /** Plan state committed to the Host session log. */
  active: boolean
  /** A logged Host command is waiting for its next accepted in-turn step. */
  pending: boolean
}

export type HostTodoItem = {
  content: string
  status: 'pending' | 'in_progress' | 'completed'
}

export type HostConversationProjections = Record<string, unknown> & {
  plan?: HostPlanProjection
  todos?: HostTodoItem[] | null
}

export interface DshConversationView {
  conversationId: string | null
  sessionId: string | null
  running: boolean
  partial: DshConversationPartial | null
  runningCalls: DshConversationRunningCall[]
  /** Current-turn tool rows (DSH ui-conversation tool nodes). */
  toolRows: DshProjectedToolCall[]
  /** Full in-flight assistant text from projection partial blocks. */
  streamingText?: string
  /** Full in-flight reasoning text from projection partial blocks. */
  streamingReasoning?: string
  /** Settled chat rows from DSH projection (user / turn-tail / compaction). */
  transcript: DshTranscriptRow[]
  queue: { steering: string[]; followUp: string[] }
  projections: HostConversationProjections
  activityLabel: string | null
  openState: string
  hasMore?: boolean
  blank?: boolean
}

/** Raw Z Host mux frame forwarded for native DSH conversation projection (see docs/DSH内嵌集成原则.md). */
export type DshMuxFramePayload = {
  conversationId: string
  rpcId?: string
  frame: {
    type: string
    sessionId?: string
    event?: { type: string; seq?: number; time?: number; data?: unknown }
    key?: string
    value?: unknown
    seq?: number
    items?: unknown[]
    jobs?: unknown[]
    lastSeq?: number
  }
}

export interface TaskweaverChatApi {
  send: (
    text: string,
    modelKey?: string | null,
    skillName?: string | null,
    executionModeOverride?: 'single-agent' | 'multi-agent' | null,
    workMode?: WorkMode | null,
    conversationId?: string | null,
    attachments?: { mediaType: string, data: string, name: string }[] | null,
  ) => Promise<IpcResult<ChatSendResult>>
  cancel: (conversationId?: string | null) => Promise<IpcResult<{ stopped: boolean }>>
  steer: (text: string, conversationId?: string | null) => Promise<IpcResult<any>>
  followUp: (text: string, conversationId?: string | null) => Promise<IpcResult<any>>
  queueMutate: (payload: {
    kind: 'steering' | 'followUp'
    index: number
    action: 'remove' | 'update'
    text?: string
    conversationId?: string | null
  }) => Promise<IpcResult<{ ok: boolean; error?: string; steering?: string[]; followUp?: string[] }>>
  getLiveContext: (conversationId?: string | null) => Promise<IpcResult<LiveContextUsage | null>>
  getSessionStats: (conversationId?: string | null) => Promise<IpcResult<SessionStatsSnapshot | null>>
  onPromptBudget: (listener: (snapshot: PromptBudgetSnapshot) => void) => () => void
  listRunningConversations: () => Promise<IpcResult<string[]>>
  subscribeMux?: (conversationId: string) => Promise<IpcResult<{ ok: boolean }>>
  unsubscribeMux?: (conversationId: string) => Promise<IpcResult<{ ok: boolean }>>
  onMux?: (listener: (payload: DshMuxFramePayload) => void) => () => void
  getDshView?: (conversationId?: string | null) => Promise<IpcResult<DshConversationView | null>>
  onDshView?: (listener: (view: DshConversationView) => void) => () => void
  onStream: (listener: (event: ChatStreamEvent) => void) => () => void
}

/** Estimated prompt-injection budget for the latest turn in one conversation. */
export interface PromptBudgetSnapshot {
  conversationId: string
  budgetBytes: number
  injectedBytes: number
  injectedEstimatedTokens: number
  estimatedTokens: number
  remainingBudgetBytes: number
  /** 0–1，本轮 TaskWeaver 显式注入占预算比例（不含 Host 历史）。 */
  utilization?: number
  /** 工作区预载是否因预算被截断。 */
  contextTruncated?: boolean
  layerBytes: Record<string, number>
  droppedLayers: string[]
}

export interface SessionStatsSnapshot {
  /** Durable Host composition bound to this conversation's native session. */
  agentPreset?: string | null
  userMessages: number
  assistantMessages: number
  toolCalls: number
  /** Whole-session fields copied from Host's durable sessionStats projection. */
  llmMs: number
  toolMs: number
  ttftMs: number
  ttftSteps: number
  decodeMs: number
  decodeTokens: number
  tokens: {
    input: number
    output: number
    cacheRead: number
    cacheWrite: number
    total: number
  }
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
  cancel?: (taskId: string, conversationId?: string | null) => Promise<IpcResult<{ cancelled: boolean }>>
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
  authMethod?: 'oauth' | 'pat' | null
}

export interface GitHubMcpOAuthStatus {
  status: 'auth_url' | 'device_flow' | 'device_code' | 'progress' | 'completed' | 'error'
  url?: string
  userCode?: string
  verificationUri?: string
  instructions?: string
  error?: string
}

export interface GitHubMcpOAuthLoginResult {
  server: McpServerStatus
  connection: McpServerStatus
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
  getGitHubOAuthAvailability: () => Promise<IpcResult<{ configured: boolean }>>
  startGitHubOAuth: () => Promise<IpcResult<GitHubMcpOAuthLoginResult>>
  cancelGitHubOAuth: () => Promise<IpcResult<boolean>>
  onGitHubOAuthStatus?: (listener: (status: GitHubMcpOAuthStatus) => void) => () => void
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

export interface OpenUsageResourceData {
  kind?: string
  limit?: number
  max?: number
  remaining?: number
  used?: number
  utilization?: number
  unit?: string
  resetsAt?: string
  resetAt?: string
  windowSeconds?: number
  available?: number
  expiresAt?: string | string[]
}

export interface OpenUsageProviderData {
  displayName?: string
  plan?: string
  fetchedAt?: string
  expiresAt?: string
  stale?: boolean
  resources?: Record<string, OpenUsageResourceData>
}

export interface OpenUsageLimitsSnapshot {
  schema?: string
  generatedAt?: string
  providers?: Record<string, OpenUsageProviderData>
  errors?: string[]
}

export interface TaskweaverOpenUsageApi {
  getLimits: (options?: { force?: boolean }) => Promise<IpcResult<{ ok: boolean; active: boolean; data: OpenUsageLimitsSnapshot | null; baseUrl?: string; error?: string }>>
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
  /** Command `*` is literal unless a user explicitly enables wildcard matching. */
  allowWildcards?: boolean
}

export interface TaskweaverPermissionApi {
  listRules: () => Promise<IpcResult<PermissionRule[]>>
  addRule: (rule: Omit<PermissionRule, 'id' | 'createdAt'> & { id?: string }) => Promise<IpcResult<PermissionRule>>
  removeRule: (id: string) => Promise<IpcResult<boolean>>
  clearRules: (options?: { workspaceOnly?: boolean; globalOnly?: boolean }) => Promise<IpcResult<boolean>>
  respondPrompt: (
    id: string,
    response: {
      action: 'allow-once' | 'allow-always' | 'allow-always-session' | 'deny' | 'escalate-once'
      sandboxMode?: 'workspace-write' | 'danger-full-access'
    },
  ) => Promise<IpcResult<{ ok: boolean }>>
  onPrompt: (listener: (payload: PermissionPromptPayload) => void) => () => void
  listApprovalAudit: (conversationId?: string | null) => Promise<IpcResult<ApprovalAuditEntry[]>>
}

export interface TaskweaverUserQuestionsApi {
  answer: (id: string, answer: UserQuestionAnswer) => Promise<IpcResult<{ ok: boolean }>>
  cancel: (id: string) => Promise<IpcResult<{ ok: boolean }>>
  onPrompt: (listener: (payload: UserQuestionPromptPayload) => void) => () => void
  onResolved: (listener: (payload: { id: string; conversationId: string }) => void) => () => void
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

export interface RoutingPortfolio {
  version: number
  display_names?: Record<string, string>
  /** Exact/glob model keys that this user can call through a zero-price route. */
  free_model_patterns?: string[]
  subscriptions?: Array<{
    id: string
    label: string
    note?: string
    prefer_models: string[]
    deprioritize_models?: string[]
    marginal_cost?: number
  }>
  routing_weights?: {
    subscription_bonus?: number
    free_model_bonus?: number
    cost_penalty_per_usd_per_million?: number
    max_cost_penalty?: number
    surge_penalty?: number
  }
  usage_source?: {
    provider?: string
    enabled?: boolean
    base_url?: string
    timeout_ms?: number
  }
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
    auto_discover?: boolean
    base_url?: string
    max_snapshot_age_ms?: number
    reset_within_ms?: number
    min_remaining_ratio_for_bonus?: number
    scarce_remaining_ratio?: number
    scarce_penalty_points?: number
    abundance_bonus_points?: number
    bonus_points?: number
    dag_allocation_penalty_points?: number
    policies?: Array<{
      provider_id: string
      resource_id: string
      enabled?: boolean
      match_model_keys?: string[]
      rollover?: boolean | 'true' | 'false' | 'unknown'
      use_before_reset?: boolean
      reset_within_ms?: number
      min_remaining_ratio_for_bonus?: number
      scarce_remaining_ratio?: number
      scarce_penalty_points?: number
      bonus_points?: number
      exhausted_action?: 'exclude' | 'penalize'
    }>
  }
  /** API balance routing only activates for explicit user-defined thresholds. */
  balance_policies?: Array<{
    provider_id: string
    resource_id: string
    enabled?: boolean
    match_model_keys: string[]
    unit?: string
    low_balance_threshold?: number
    low_balance_penalty_points?: number
    exhausted_penalty_points?: number
    exhausted_action?: 'exclude' | 'penalize'
  }>
}

export interface TaskweaverPortfolioApi {
  get: () => Promise<IpcResult<RoutingPortfolio>>
  save: (portfolio: RoutingPortfolio) => Promise<IpcResult<{ ok: boolean; path: string }>>
  resetToBundled: () => Promise<IpcResult<{ ok: boolean; portfolio: RoutingPortfolio }>>
}

export type BashSandboxPreference = 'auto' | 'workspace-write' | 'read-only' | 'off'

export interface AppPreferences {
  worktreeIsolation: boolean
  bashSandbox?: BashSandboxPreference
  autoSnapshotOnTurn?: boolean
  subtaskUpgradeMax?: number
  autoReviewReads?: boolean
  /** 改代码时在 Host 外追加验证命令指引；默认关闭。 */
  autoVerifyAfterMutation?: boolean
  /** 代码变更后自动运行项目验证并尝试静默修复；需显式开启。 */
  selfHealingLoop?: boolean
  /** 自愈循环最多重试次数（1–3）。 */
  selfHealingMaxRetries?: number
  /** 首轮是否注入仓库结构图（repo map）。 */
  enableRepoMap?: boolean
  /** 每轮 Prompt Pipeline 注入的系统上下文上限，单位为字节；默认 32 KiB。 */
  promptInjectionLimitBytes?: number
  /** 规则门控：灰区是否询问启用多 Agent（不调用模型）。 */
  adaptiveOrchestrationGate?: boolean
  /** 开启后常规消息默认走多 Agent DAG；默认关闭。 */
  preferMultiAgent?: boolean
  /** 消息列表优先 DSH transcript 投影。 */
  preferDshTranscript?: boolean
  /** 本机 OpenUsage API 根地址（http://127.0.0.1:端口，仅 loopback） */
  openUsageBaseUrl?: string
}

export interface ScheduledJob {
  id: string
  /** 持久化的后台会话，用于恢复任务上下文与执行记录。 */
  conversationId?: string | null
  title: string
  prompt: string
  workspacePath: string | null
  intervalMinutes: number
  enabled: boolean
  multiAgent: boolean
  createdAt: number
  updatedAt: number
  lastRunAt: number | null
  lastError: string | null
}

export interface GithubPullRequestSummary {
  number: number
  title: string
  state: string
  url: string
  branch?: string | null
  updatedAt?: string
  draft?: boolean
  author?: string | null
}

export type GithubListPullRequestsResult =
  | {
      ok: true
      owner: string
      repo: string
      source: 'gh-cli' | 'github-api'
      pullRequests: GithubPullRequestSummary[]
    }
  | {
      ok: false
      reason: string
      owner?: string
      repo?: string
      hint?: string
      error?: string
      detail?: string
      remote?: string
    }

export interface TaskweaverGithubApi {
  listPullRequests: (workspacePath: string | null) => Promise<IpcResult<GithubListPullRequestsResult>>
}

export interface TaskweaverJobsApi {
  list: () => Promise<IpcResult<ScheduledJob[]>>
  upsert: (job: Partial<ScheduledJob> & { prompt: string }) => Promise<IpcResult<ScheduledJob>>
  remove: (jobId: string) => Promise<IpcResult<{ removed: boolean }>>
  runNow: (jobId: string) => Promise<IpcResult<{ ok: boolean }>>
  installLaunchAgent?: (jobId: string) => Promise<IpcResult<{ ok: boolean; label?: string; plistPath?: string; reason?: string }>>
  removeLaunchAgent?: (jobId: string) => Promise<IpcResult<{ ok: boolean; reason?: string }>>
  launchAgentInstalled?: (jobId: string) => Promise<IpcResult<{ installed: boolean; platform: string }>>
}

export interface SessionMemorySnapshot {
  conversation_id: string
  user_goal?: string
  rolling_summary?: string
  runs?: Record<string, Record<string, unknown>>
  run_order?: string[]
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
  conversationId?: string
  runId?: string
}

export interface TaskweaverWorktreeApi {
  list: (conversationId?: string | null) => Promise<IpcResult<WorktreeEntry[]>>
  remove: (taskId: string, force?: boolean, conversationId?: string | null, runId?: string | null) => Promise<IpcResult<{ removed: boolean }>>
  diff: (taskId: string, conversationId?: string | null, runId?: string | null) => Promise<IpcResult<WorktreeDiffResult>>
  previewMerge: (taskId: string, conversationId?: string | null, runId?: string | null) => Promise<IpcResult<WorktreeMergePreview>>
  applyMerge: (
    taskId: string,
    options?: { removeAfter?: boolean; files?: string[] },
    conversationId?: string | null,
    runId?: string | null,
  ) => Promise<IpcResult<WorktreeMergeResult>>
}

export interface TaskweaverMemoryApi {
  get: () => Promise<IpcResult<SessionMemorySnapshot | null>>
  clear: () => Promise<IpcResult<{ ok: boolean }>>
}

export interface TaskweaverBackendApi {
  backendReady: () => Promise<IpcResult<{ ready: boolean; error?: string }>>
}

/** Available only in development when TASKWEAVER_DEVTOOLS=1. */
export interface TaskweaverDebugApi {
  shadowTranscript: (conversationId?: string | null) => Promise<IpcResult<unknown | null>>
}

export {}
