/** 与 electron/preload 暴露的模型 API 对齐，供前端类型检查 */

export type ModelTier = 'cheap' | 'balanced' | 'strong'
export type ThinkingLevel = 'off' | 'low' | 'medium' | 'high'

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

export interface ModelRegistryManifest {
  schemaVersion: 1
  registryVersion: string
  registryUrl: string
  sha256: string
  signature: string
  keyId: string
  publishedAt: string
}

export interface RegistryProvider {
  id?: string
  name: string
  protocols: string[]
  defaultEndpointRef?: string
  authTypes?: string[]
}

export interface RegistryModel {
  provider: string
  id: string
  name: string
  api: string
  contextWindow?: number
  maxTokens?: number
  input?: string[]
  deprecated?: boolean
  replacementModel?: string
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
  available: boolean
  profile: ModelProfile | null
  supportedThinkingLevels?: ('off' | 'low' | 'medium' | 'high')[]
  defaultThinkingLevel?: 'off' | 'low' | 'medium' | 'high'
  source?: ModelCatalogSource
  deprecated?: boolean
  replacementModelKey?: string | null
  capabilityCompleteness?: number
  registryVersion?: string | null
  capabilitySummary?: string
  taskTags?: string[]
  verificationStatus?: 'verified' | 'unverified' | 'bundled'
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
  | { ok: false; error: string }

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

export interface ScanLocalModelsResult {
  proxyUrl: string | null
  providerIds: string[]
  syncedAt: string
  models: ScannedLocalModel[]
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
  listProvidersAuth: () => Promise<IpcResult<ProviderAuthStatus[]>>
  setProviderApiKey: (
    providerId: string,
    apiKey: string,
  ) => Promise<IpcResult<ModelCatalog>>
  add: (modelKey: string) => Promise<IpcResult<ModelCatalog>>
  remove: (modelKey: string) => Promise<IpcResult<ModelCatalog>>
  removeProviderCredentials: (providerId: string) => Promise<IpcResult<ModelCatalog>>
  getActive: () => Promise<IpcResult<string | null>>
  setActive: (modelKey: string) => Promise<IpcResult<string | null>>
  getThinkingLevel: () => Promise<IpcResult<ThinkingLevel>>
  setThinkingLevel: (level: ThinkingLevel) => Promise<IpcResult<ThinkingLevel>>
  getBusyEnterMode: () => Promise<IpcResult<'steer' | 'followUp'>>
  setBusyEnterMode: (mode: 'steer' | 'followUp') => Promise<IpcResult<'steer' | 'followUp'>>
  upsertProfile: (
    modelKey: string,
    patch: ModelProfilePatch,
  ) => Promise<IpcResult<ModelProfile>>
  removeProfile: (modelKey: string) => Promise<IpcResult<void>>
  resolve: (modelKey: string) => Promise<IpcResult<unknown>>
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
