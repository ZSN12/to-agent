/** 与 electron/preload 暴露的模型 API 对齐，供前端类型检查 */

export type ModelTier = 'cheap' | 'balanced' | 'strong'
/** Host-advertised reasoning effort id (provider-specific; not a fixed four-level enum). */
export type ThinkingLevel = string

export type ReasoningEffortOption = {
  id: ThinkingLevel
  name?: string
  description?: string
}

export interface ModelProfilePatch {
  tier?: ModelTier
  thinkingLevel?: ThinkingLevel
  capabilitySummary?: string
  enabledForAllocation?: boolean
  notes?: string
}

export interface ModelProfile extends ModelProfilePatch {
  tier: ModelTier
  thinkingLevel?: ThinkingLevel
  capabilitySummary: string
  enabledForAllocation: boolean
  notes: string
}

export interface ModelCostPerMillion {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

export interface ModelPriceMeta {
  source?: string
  adapter?: string | null
  confidence?: string
  currency?: string
  stale?: boolean
  synced_at?: string | null
  hasInputPrice?: boolean
  hasOutputPrice?: boolean
}

export type ModelCatalogSource = 'user' | 'remote' | 'bundled' | 'live'
export type ModelUpdateState = 'idle' | 'checking' | 'up-to-date' | 'updated' | 'cached' | 'failed' | 'rolled-back'

export interface ModelUpdateStatus {
  state: ModelUpdateState
  currentVersion: string | null
  previousVersion: string | null
  source: 'remote' | 'bundled'
  lastCheckedAt: string | null
  updatedAt: string | null
  error: string | null
  changes: { added: string[]; deprecated: string[]; changed: string[] }
  runtime?: {
    dsh?: { version?: string; commit?: string }
    piAi?: { version?: string }
    overlayVersion?: number
    runtimeBuildHash?: string
  } | null
}

export interface CatalogModel {
  key: string
  provider: string
  id: string
  name: string
  api: string
  reasoning: boolean
  contextWindow: number
  maxTokens: number
  costPerMillion: ModelCostPerMillion
  priceMeta?: ModelPriceMeta
  available: boolean
  profile: ModelProfile | null
  supportedThinkingLevels?: ThinkingLevel[]
  reasoningEfforts?: ReasoningEffortOption[]
  defaultThinkingLevel?: ThinkingLevel
  source?: ModelCatalogSource
  deprecated?: boolean
  replacementModelKey?: string | null
  capabilityCompleteness?: number
  registryVersion?: string | null
  capabilitySummary?: string
  taskTags?: string[]
  verificationStatus?: 'verified' | 'unverified' | 'bundled'
  /** Whether DSH llm.models has confirmed this model is routable. */
  routeRegistered?: boolean
}

export interface ModelCatalog {
  models: CatalogModel[]
  candidateModels: CatalogModel[]
  providers: string[]
  activeModelKey: string | null
  /** 刚从旧版「智能路由」迁移，需用户在 Composer 重新选主模型 */
  primaryModelReselectRequired?: boolean
  activeThinkingLevel?: ThinkingLevel
}

export interface ProviderAuthStatus {
  id: string
  name: string
  configured: boolean
  authType: string | null
  writable: boolean
  source: string | null
  authorizationMethods?: Array<{ id: string; label: string }>
  authorizationKey?: string | null
  authorizationInFlight?: boolean
}

export type IpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; turnId?: string; runContinues?: boolean }

export interface OAuthStatusInfo {
  status: 'auth_url' | 'device_code' | 'prompt' | 'progress' | 'completed' | 'error'
  url?: string
  instructions?: string
  userCode?: string
  verificationUri?: string
  error?: string
  providerId?: string
  attemptId?: string
  promptId?: string
  prompt?: { kind: 'text' | 'secret' | 'select'; message: string; placeholder?: string; options?: Array<{ id: string; label: string; description?: string }> }
}

export interface ScannedLocalModel {
  key: string
  name: string
  id: string
  provider: string
  source: string
  available: boolean
  alreadyAdded: boolean
}

export interface LocalAgentDiscovery {
  agentId: string
  label: string
  routeId: string
  bridgeKind: string
  modelNamespace: string
  modelCount: number
  loggedIn: boolean
  loginRequired: boolean
  discovered: boolean
}

export interface LocalAgentBridgeStatus {
  logins?: Record<string, boolean>
  localAgents?: LocalAgentDiscovery[]
  bridgeProviderIds?: string[]
  legacyOpenCodex?: boolean
  bridgeModelCount?: number
  discoveryAdapter?: string
}

export interface ScanLocalModelsResult {
  proxyUrl: string | null
  providerIds: string[]
  syncedAt: string
  models: ScannedLocalModel[]
  /** 扫描未完成时的说明（IPC 仍可能 ok: true） */
  error?: string
  cursorLoginStarted?: boolean
  antigravityLoginStarted?: boolean
  /** 默认走内置桥导出（无 10100）；遗留路径为 false */
  bridgeMode?: boolean
  localAgents?: LocalAgentDiscovery[]
}

export interface MigrateLegacyOpenCodexResult {
  changed: boolean
  migrated: { from: string; to: string }[]
  hostRegistered: string[]
  hostSkipped: { modelKey: string; reason: string }[]
}

export interface ModelLoadBundle {
  catalog: ModelCatalog
  auth: ProviderAuthStatus[]
  hostReady: boolean
  providerCount: number
}

export interface TaskweaverModelsApi {
  list: () => Promise<IpcResult<ModelCatalog>>
  loadBundle: () => Promise<IpcResult<ModelLoadBundle>>
  refresh: () => Promise<IpcResult<ModelCatalog>>
  getUpdateStatus: () => Promise<IpcResult<ModelUpdateStatus>>
  checkForUpdates: (options?: { force?: boolean }) => Promise<IpcResult<ModelUpdateStatus>>
  rollbackRegistry: () => Promise<IpcResult<ModelUpdateStatus>>
  scanLocal: () => Promise<IpcResult<ScanLocalModelsResult>>
  bridgeGetStatus: () => Promise<IpcResult<LocalAgentBridgeStatus>>
  bridgeLogin: (kind: 'cursor' | 'google-antigravity') => Promise<IpcResult<{ ok: boolean; message?: string }>>
  migrateLegacyOpenCodexRoutes: () => Promise<IpcResult<MigrateLegacyOpenCodexResult>>
  listProvidersAuth: () => Promise<IpcResult<ProviderAuthStatus[]>>
  setProviderApiKey: (
    providerId: string,
    apiKey: string,
  ) => Promise<IpcResult<ModelCatalog>>
  add: (modelKey: string) => Promise<IpcResult<ModelCatalog>>
  remove: (modelKey: string) => Promise<IpcResult<ModelCatalog>>
  removeProviderCredentials: (providerId: string) => Promise<IpcResult<ModelCatalog>>
  setActive: (modelKey: string) => Promise<IpcResult<string | null>>
  getThinkingLevel: () => Promise<IpcResult<ThinkingLevel>>
  setThinkingLevel: (level: ThinkingLevel) => Promise<IpcResult<ThinkingLevel>>
  getBusyEnterMode: () => Promise<IpcResult<'steer' | 'followUp'>>
  setBusyEnterMode: (mode: 'steer' | 'followUp') => Promise<IpcResult<'steer' | 'followUp'>>
  upsertProfile: (
    modelKey: string,
    patch: ModelProfilePatch,
  ) => Promise<IpcResult<ModelProfile>>
  startOAuth: (providerId?: string) => Promise<IpcResult<ModelCatalog>>
  cancelOAuth: () => Promise<IpcResult<boolean>>
  submitOAuthCode: (code: string) => Promise<IpcResult<boolean>>
  logoutOAuth: (providerId: string) => Promise<IpcResult<ModelCatalog>>
  onOAuthStatus: (listener: (status: OAuthStatusInfo) => void) => () => void
  onUpdateStatus: (listener: (status: ModelUpdateStatus) => void) => () => void
  listCustomProviders: () => Promise<IpcResult<CustomProviderEntry[]>>
  upsertCustomProvider: (payload: CustomProviderUpsertPayload) => Promise<
    IpcResult<{ providerId: string; modelKey: string; catalog: ModelCatalog }>
  >
  removeCustomProvider: (providerId: string) => Promise<IpcResult<ModelCatalog>>
  testCustomProvider: (payload: CustomProviderTestPayload) => Promise<IpcResult<{ ok: boolean; method?: string; status?: number }>>
  testCustomProviderToolCall: (payload: CustomProviderTestPayload) => Promise<IpcResult<{ ok: boolean; supported: boolean; method?: string; status?: number }>>
  probeProviderModels: (payload: { providerId?: string; baseUrl?: string; apiKey?: string }) => Promise<IpcResult<ProbeModelsResult>>
  batchAddCustomModels: (payload: BatchAddCustomModelsPayload) => Promise<
    IpcResult<{ ok: boolean; addedCount: number; addedKeys: string[]; catalog: ModelCatalog }>
  >
}

export interface ProbedModelItem {
  id: string
  name: string
  contextWindow: number
  reasoning: boolean
  installed: boolean
}

export interface ProbeModelsResult {
  ok: boolean
  providerId: string
  total: number
  newCount: number
  models: ProbedModelItem[]
}

export interface BatchAddCustomModelsPayload {
  providerId: string
  models: Array<{
    id: string
    name?: string
    contextWindow?: number
    reasoning?: boolean
  }>
}

export interface CustomProviderEntry {
  id: string
  name: string
  baseUrl: string
  api: string
  models: Array<{ id: string; name: string }>
}

export interface CustomProviderUpsertPayload {
  providerId?: string
  name?: string
  baseUrl: string
  apiKey: string
  modelId?: string
  modelName?: string
  api?: 'openai-completions' | 'openai-responses'
  contextWindow?: number
  maxTokens?: number
}

export interface CustomProviderTestPayload {
  baseUrl: string
  apiKey: string
  modelId?: string
  api?: 'openai-completions' | 'openai-responses'
}
