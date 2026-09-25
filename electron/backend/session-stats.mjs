function nonNegative(value) {
  return Math.max(0, Number.isFinite(value) ? value : 0)
}

function addUsage(totals, usage) {
  if (!usage || typeof usage !== 'object') return
  totals.input += nonNegative(usage.input)
  totals.output += nonNegative(usage.output)
  totals.cacheRead += nonNegative(usage.cacheRead)
  totals.cacheWrite += nonNegative(usage.cacheWrite)
  const cost = usage.cost
  if (cost && typeof cost === 'object' && typeof cost.total === 'number') {
    totals.cost += nonNegative(cost.total)
  } else if (typeof cost === 'number') {
    totals.cost += nonNegative(cost)
  }
}

/**
 * Fold pi session jsonl entries the same way AgentSession.getSessionStats does
 * (includes compaction / branch_summary usage).
 */
export function aggregateSessionEntries(entries) {
  let userMessages = 0
  let assistantMessages = 0
  let toolResults = 0
  let toolCalls = 0
  const tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0, cost: 0 }

  for (const entry of entries) {
    if ((entry.type === 'branch_summary' || entry.type === 'compaction') && entry.usage) {
      addUsage(tokens, entry.usage)
    }
    if (entry.type !== 'message') continue
    const message = entry.message
    if (!message || typeof message !== 'object') continue
    if (message.role === 'user') {
      userMessages += 1
    } else if (message.role === 'toolResult') {
      toolResults += 1
      addUsage(tokens, message.usage)
    } else if (message.role === 'assistant') {
      assistantMessages += 1
      const content = message.content
      if (Array.isArray(content)) {
        toolCalls += content.filter((c) => c && c.type === 'toolCall').length
      }
      addUsage(tokens, message.usage)
    }
  }

  tokens.total = tokens.input + tokens.output + tokens.cacheRead + tokens.cacheWrite
  return {
    userMessages,
    assistantMessages,
    toolCalls,
    toolResults,
    tokens: {
      input: tokens.input,
      output: tokens.output,
      cacheRead: tokens.cacheRead,
      cacheWrite: tokens.cacheWrite,
      total: tokens.total,
    },
    cost: tokens.cost,
  }
}

export function mapPiSessionStats(stats) {
  if (!stats) return null
  const tokens = stats.tokens ?? {}
  return {
    userMessages: stats.userMessages ?? 0,
    assistantMessages: stats.assistantMessages ?? 0,
    toolCalls: stats.toolCalls ?? 0,
    toolResults: stats.toolResults ?? 0,
    tokens: {
      input: tokens.input ?? 0,
      output: tokens.output ?? 0,
      cacheRead: tokens.cacheRead ?? 0,
      cacheWrite: tokens.cacheWrite ?? 0,
      total: tokens.total ?? (tokens.input ?? 0) + (tokens.output ?? 0) + (tokens.cacheRead ?? 0) + (tokens.cacheWrite ?? 0),
    },
    cost: typeof stats.cost === 'number' ? stats.cost : 0,
    contextTokens: stats.contextUsage?.tokens ?? null,
    contextWindow: stats.contextUsage?.contextWindow ?? null,
    contextPercent: stats.contextUsage?.percent ?? null,
  }
}
