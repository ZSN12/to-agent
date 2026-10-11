/**
 * TaskWeaver 自有「本地官方 Agent → 内置桥」注册表。
 * 扫描/刷新只做：发现 → 写入 taskweaver-bridge → DSH Host 路由。
 * `ocx export` / `ocx login` 是当前 discovery+auth 适配器，不是用户可见产品。
 */

/** @typedef {'ocx-export' | 'ocx-login'} LocalAgentAdapterKind */

/**
 * @typedef {Object} LocalAgentIntegration
 * @property {string} agentId 稳定产品 id（UI / IPC）
 * @property {string} label 设置里展示名
 * @property {string} routeId models.json / Host 提供方 id（bridge-*）
 * @property {string} bridgeKind taskweaver-bridge transport
 * @property {string} providerDisplayName 写入 models.json 的 name
 * @property {string[]} exportProviderIds ocx export 里的 providers 键
 * @property {string | null} loginProvider ocx login 子命令；null 表示无需 OAuth
 * @property {string} modelNamespace 扫描结果分组（cursor / google-antigravity / …）
 */

/** @type {readonly LocalAgentIntegration[]} */
export const LOCAL_AGENT_INTEGRATIONS = Object.freeze([
  {
    agentId: 'cursor-composer',
    label: 'Cursor（Composer 订阅）',
    routeId: 'bridge-composer',
    bridgeKind: 'cursor',
    providerDisplayName: 'Composer（内置桥）',
    exportProviderIds: ['opencodex'],
    loginProvider: 'cursor',
    modelNamespace: 'cursor',
  },
  {
    agentId: 'google-antigravity',
    label: 'Google Antigravity',
    routeId: 'bridge-antigravity',
    bridgeKind: 'google-antigravity',
    providerDisplayName: 'Antigravity（内置桥）',
    exportProviderIds: ['google-antigravity'],
    loginProvider: 'google-antigravity',
    modelNamespace: 'google-antigravity',
  },
])

/** @deprecated use LOCAL_AGENT_INTEGRATIONS */
export const BRIDGE_EXPORT_MAPPINGS = LOCAL_AGENT_INTEGRATIONS.map((row) => ({
  routeId: row.routeId,
  bridgeKind: row.bridgeKind,
  name: row.providerDisplayName,
  exportProviderIds: row.exportProviderIds,
}))

export function integrationByRouteId(routeId) {
  return LOCAL_AGENT_INTEGRATIONS.find((row) => row.routeId === routeId) ?? null
}

export function integrationByLoginProvider(loginProvider) {
  return LOCAL_AGENT_INTEGRATIONS.find((row) => row.loginProvider === loginProvider) ?? null
}
