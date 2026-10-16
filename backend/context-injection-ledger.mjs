const TRACKED_CONTEXT_LAYERS = new Set(['sandbox-policy', 'workspace-rules'])
const MAX_CONVERSATIONS = 512

function clearingMessage(layerId) {
  return layerId === 'sandbox-policy'
    ? '【上下文更新】此前提供的沙箱策略说明已失效；请以当前 Host 的实际权限与审批结果为准。'
    : '【上下文更新】此前提供的项目规则已不再适用；请勿继续依赖旧版本。'
}

function normalizeLayers(layers) {
  return (Array.isArray(layers) ? layers : []).filter((layer) =>
    layer && typeof layer.id === 'string' && typeof layer.text === 'string' && layer.text.length > 0,
  )
}

/** Count durable user turns without relying on intent classification. */
export function countUserTurns(messages) {
  return (Array.isArray(messages) ? messages : []).filter((message) =>
    message?.author === 'user' || message?.role === 'user',
  ).length
}

/**
 * Avoid resending stable project rules and sandbox descriptions to the primary
 * Host session. A receipt is committed only after the Host accepts a completed
 * prompt, so failed/queued sends never poison the ledger.
 */
export function createContextInjectionLedger({ maxConversations = MAX_CONVERSATIONS } = {}) {
  const entries = new Map()

  function touch(conversationId, entry) {
    entries.delete(conversationId)
    entries.set(conversationId, entry)
    while (entries.size > maxConversations) {
      const oldest = entries.keys().next().value
      if (oldest === undefined) break
      entries.delete(oldest)
    }
  }

  function prepare({
    conversationId,
    sessionId = null,
    historyUserTurns = null,
    prefixLayers = [],
    suffixLayers = [],
  } = {}) {
    const prefix = normalizeLayers(prefixLayers)
    const suffix = normalizeLayers(suffixLayers)
    if (typeof conversationId !== 'string' || !conversationId) {
      return { prefixLayers: prefix, suffixLayers: suffix, receipt: null }
    }

    let entry = entries.get(conversationId)
    const historyRolledBack = entry
      && Number.isInteger(historyUserTurns)
      && Number.isInteger(entry.historyUserTurns)
      && historyUserTurns < entry.historyUserTurns
    const hostSessionChanged = entry
      && sessionId != null
      && entry.sessionId !== sessionId
    if (historyRolledBack || hostSessionChanged) entry = null
    entry ??= { sessionId, historyUserTurns, sent: new Map() }

    const seen = new Set()
    const updates = new Map()
    const includeOrSuppress = (layer, position) => {
      seen.add(layer.id)
      if (!TRACKED_CONTEXT_LAYERS.has(layer.id)) return { layer, include: true }
      const prior = entry.sent.get(layer.id)
      if (prior?.text === layer.text) return { layer, include: false }
      updates.set(layer.id, { text: layer.text, position })
      return { layer, include: true }
    }

    const nextPrefix = prefix.map((layer) => includeOrSuppress(layer, 'prefix'))
      .filter((item) => item.include).map((item) => item.layer)
    const nextSuffix = suffix.map((layer) => includeOrSuppress(layer, 'suffix'))
      .filter((item) => item.include).map((item) => item.layer)

    for (const [layerId, prior] of entry.sent) {
      if (seen.has(layerId) || prior.text == null) continue
      updates.set(layerId, { text: null, position: prior.position })
      const invalidationLayer = {
        id: layerId,
        text: clearingMessage(layerId),
        required: true,
        priority: 0,
      }
      if (prior.position === 'prefix') nextPrefix.push(invalidationLayer)
      else nextSuffix.push(invalidationLayer)
    }

    touch(conversationId, entry)
    return {
      prefixLayers: nextPrefix,
      suffixLayers: nextSuffix,
      receipt: {
        conversationId,
        sessionId,
        historyUserTurns,
        updates: [...updates.entries()].map(([id, value]) => ({ id, ...value })),
      },
    }
  }

  function commit(receipt, includedLayerIds, currentSessionId = null) {
    if (!receipt || typeof receipt.conversationId !== 'string') return false
    if (receipt.sessionId != null && currentSessionId != null && receipt.sessionId !== currentSessionId) {
      entries.delete(receipt.conversationId)
      return false
    }
    const included = new Set(Array.isArray(includedLayerIds) ? includedLayerIds : [])
    let entry = entries.get(receipt.conversationId)
    if (!entry
      || (entry.sessionId != null && currentSessionId != null && entry.sessionId !== currentSessionId)) {
      entry = { sessionId: currentSessionId ?? receipt.sessionId, historyUserTurns: null, sent: new Map() }
    }
    for (const update of receipt.updates ?? []) {
      if (!included.has(update.id)) continue
      entry.sent.set(update.id, { text: update.text, position: update.position })
    }
    if (currentSessionId != null) entry.sessionId = currentSessionId
    if (Number.isInteger(receipt.historyUserTurns)) entry.historyUserTurns = receipt.historyUserTurns
    touch(receipt.conversationId, entry)
    return true
  }

  function invalidateConversation(conversationId) {
    if (typeof conversationId !== 'string' || !conversationId) return false
    return entries.delete(conversationId)
  }

  function clear() {
    entries.clear()
  }

  return Object.freeze({ prepare, commit, invalidateConversation, clear })
}
