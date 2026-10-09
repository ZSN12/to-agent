import {
  bridgeProviderBlocksFromExport,
  listModelsFromBridgeDoc,
} from './bridge-catalog.mjs'
import { LOCAL_AGENT_INTEGRATIONS } from './local-agent-registry.mjs'

/**
 * @param {Record<string, unknown>} exportDoc
 * @param {Record<string, boolean | undefined>} logins from ocx status / fetchOpenCodexProviderLogins
 */
export function discoverAgentsFromExport(exportDoc, logins = {}) {
  const blocks = bridgeProviderBlocksFromExport(exportDoc)
  return LOCAL_AGENT_INTEGRATIONS.map((spec) => {
    const block = blocks[spec.routeId]
    const modelCount = Array.isArray(block?.models) ? block.models.length : 0
    const needsLogin = Boolean(spec.loginProvider)
    const loggedIn = !needsLogin || logins[spec.loginProvider] === true
    return {
      agentId: spec.agentId,
      label: spec.label,
      routeId: spec.routeId,
      bridgeKind: spec.bridgeKind,
      modelNamespace: spec.modelNamespace,
      modelCount,
      loggedIn,
      loginRequired: needsLogin && modelCount > 0 && !loggedIn,
      discovered: modelCount > 0,
    }
  })
}

/**
 * 从已写入的 models.json 汇报当前集成的本地 Agent（不重新 export）。
 */
export function discoverAgentsFromModelsDoc(modelsDoc, logins = {}) {
  const rows = listModelsFromBridgeDoc(modelsDoc)
  const byRoute = new Map()
  for (const row of rows) {
    const list = byRoute.get(row.provider) ?? []
    list.push(row)
    byRoute.set(row.provider, list)
  }
  return LOCAL_AGENT_INTEGRATIONS.map((spec) => {
    const models = byRoute.get(spec.routeId) ?? []
    const needsLogin = Boolean(spec.loginProvider)
    const loggedIn = !needsLogin || logins[spec.loginProvider] === true
    return {
      agentId: spec.agentId,
      label: spec.label,
      routeId: spec.routeId,
      bridgeKind: spec.bridgeKind,
      modelNamespace: spec.modelNamespace,
      modelCount: models.length,
      loggedIn,
      loginRequired: needsLogin && models.length > 0 && !loggedIn,
      discovered: models.length > 0,
    }
  })
}

/**
 * @param {Record<string, unknown>} exportDoc
 * @param {Record<string, boolean | undefined>} logins
 * @returns {{ agentId: string, loginProvider: string } | null}
 */
export function firstMissingLoginForExport(exportDoc, logins, loginPolicy) {
  if (loginPolicy !== 'open-browser') return null
  const agents = discoverAgentsFromExport(exportDoc, logins)
  const hit = agents.find((a) => a.loginRequired)
  if (!hit) return null
  const spec = LOCAL_AGENT_INTEGRATIONS.find((s) => s.agentId === hit.agentId)
  if (!spec?.loginProvider) return null
  return { agentId: hit.agentId, loginProvider: spec.loginProvider, label: hit.label }
}
