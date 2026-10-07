/**
 * Map Host / llm model directory reasoning metadata to TaskWeaver catalog fields.
 * UI must only offer efforts the provider actually advertises — no synthetic four-level fallback.
 */

export function normalizeEffortId(id) {
  return String(id ?? '').trim().toLowerCase()
}

/**
 * @param {{ reasoning?: { efforts?: { id?: string, name?: string, description?: string }[], defaultEffort?: string } }} model
 */
export function reasoningCatalogFromHostModel(model) {
  const raw = model?.reasoning?.efforts ?? []
  const reasoningEfforts = []
  const seen = new Set()
  for (const effort of raw) {
    const id = normalizeEffortId(effort?.id)
    if (!id || seen.has(id)) continue
    seen.add(id)
    reasoningEfforts.push({
      id,
      ...(effort?.name ? { name: String(effort.name) } : {}),
      ...(effort?.description ? { description: String(effort.description) } : {}),
    })
  }
  const supportedThinkingLevels = reasoningEfforts.map((row) => row.id)
  const defaultRaw = model?.reasoning?.defaultEffort
  const defaultThinkingLevel = defaultRaw
    ? normalizeEffortId(defaultRaw)
    : undefined
  const resolvedDefault = defaultThinkingLevel && supportedThinkingLevels.includes(defaultThinkingLevel)
    ? defaultThinkingLevel
    : supportedThinkingLevels[0]

  return {
    reasoning: supportedThinkingLevels.length > 0,
    reasoningEfforts,
    supportedThinkingLevels,
    defaultThinkingLevel: resolvedDefault,
  }
}
