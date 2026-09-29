/** Map DSH chat projection nodes → TaskWeaver transcript rows (display-only). */

function textFromContent(content) {
  if (!Array.isArray(content)) return ''
  return content
    .filter((part) => part?.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text)
    .join('\n')
    .trim()
}

function partsFromBlocks(blocks) {
  if (!Array.isArray(blocks)) return { text: '', thinking: '' }
  let text = ''
  let thinking = ''
  for (const block of blocks) {
    if (block?.kind === 'text' && typeof block.text === 'string') text += block.text
    if (block?.kind === 'reasoning' && typeof block.text === 'string') thinking += block.text
  }
  return { text: text.trim(), thinking: thinking.trim() }
}

function sumUsage(left, right) {
  if (!left) return right
  if (!right) return left
  const contextTokens = right.contextTokens ?? left.contextTokens
  const contextWindow = right.contextWindow ?? left.contextWindow
  return {
    inputTokens: left.inputTokens + right.inputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    cacheReadTokens: left.cacheReadTokens + right.cacheReadTokens,
    cacheWriteTokens: left.cacheWriteTokens + right.cacheWriteTokens,
    costUsd: left.costUsd + right.costUsd,
    elapsedMs: Math.max(left.elapsedMs, right.elapsedMs),
    tokensPerSecond: right.tokensPerSecond || left.tokensPerSecond,
    contextTokens,
    contextWindow,
    contextPercent: contextTokens && contextWindow
      ? Math.round(contextTokens / contextWindow * 100)
      : null,
  }
}

function modelKeyFromClosing(closing) {
  const provenance = closing?.finalNode?.provenance ?? closing?.finalNode?.requestConfig
  if (!provenance || typeof provenance !== 'object') return undefined
  const provider = typeof provenance.provider === 'string' ? provenance.provider : ''
  const model = typeof provenance.model === 'string' ? provenance.model : ''
  if (provider && model) return `${provider}/${model}`
  return model || undefined
}

function collectTurnUsage(chat, turnNumber, closing) {
  let combined = null
  const order = chat?.order
  const store = chat?.nodes
  if (Array.isArray(order) && store && typeof store.get === 'function') {
    for (const key of order) {
      const node = store.get(key)
      if (node?.kind !== 'assistant-step' || node.data?.turn !== turnNumber) continue
      combined = sumUsage(combined, normalizeUsage(node.data.usage ?? node.data.finalNode?.usage))
    }
  }
  const result = combined ?? normalizeUsage(closing?.usage ?? closing?.finalNode?.usage)

  // 诊断日志：缓存命中率为 0 的问题
  if (!result || (result.cacheReadTokens === 0 && result.cacheWriteTokens === 0)) {
    console.log('[CACHE DEBUG] Turn', turnNumber, {
      hasClosingUsage: !!closing?.usage,
      hasFinalNodeUsage: !!closing?.finalNode?.usage,
      rawUsage: closing?.usage ?? closing?.finalNode?.usage,
      normalized: result
    })
  }

  return result
}

function normalizeUsage(usage) {
  if (!usage || typeof usage !== 'object') return undefined
  const cost = typeof usage.cost === 'number' ? usage.cost : usage.cost?.total
  const inputTokens = Number(usage.inputTokens ?? usage.uncachedInputTokens ?? usage.input ?? 0) || 0
  const outputTokens = Number(usage.outputTokens ?? usage.output ?? 0) || 0
  const cacheReadTokens = Number(usage.cacheReadTokens ?? usage.cacheRead ?? usage.cache_read_tokens ?? 0) || 0
  const cacheWriteTokens = Number(usage.cacheWriteTokens ?? usage.cacheWrite ?? usage.cache_write_tokens ?? 0) || 0
  const contextTokens = Number(usage.contextTokens ?? usage.totalTokens ?? 0) || null
  const contextWindow = Number(usage.contextWindow ?? 0) || null
  return {
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    costUsd: Number(cost ?? 0) || 0,
    elapsedMs: 0,
    tokensPerSecond: 0,
    contextTokens,
    contextWindow,
    contextPercent: contextTokens && contextWindow
      ? Math.round(contextTokens / contextWindow * 100)
      : null,
  }
}

/**
 * @param {import('@z/dsh-client-runtime').ConversationSnapshot | Record<string, unknown>} snapshot
 * @returns {Array<Record<string, unknown>>}
 */
export function extractDshChatTranscript(snapshot) {
  const chat = snapshot?.chat
  if (!chat?.order || typeof chat.nodes?.get !== 'function') return []
  const rows = []
  for (const key of chat.order) {
    const node = chat.nodes.get(key)
    if (!node?.kind) continue
    const data = node.data
    switch (node.kind) {
      case 'user':
      case 'steering': {
        const text = textFromContent(data?.content)
        if (!text) continue
        rows.push({
          dshKey: String(key),
          role: 'user',
          text,
          timestamp: typeof data?.time === 'number' ? data.time : undefined,
          behavior: node.kind === 'steering' ? 'steer' : undefined,
        })
        break
      }
      case 'turn-tail': {
        const closing = data?.closing
        if (!closing) break
        const parts = partsFromBlocks(closing.blocks)
        const status = closing.status
        rows.push({
          dshKey: String(key),
          role: 'assistant',
          text: parts.text || (status === 'interrupted' ? '（已中断）' : ''),
          thinking: parts.thinking || undefined,
          interrupted: status === 'interrupted',
          timestamp: typeof (closing.time ?? data?.time) === 'number' ? (closing.time ?? data.time) : undefined,
          usage: collectTurnUsage(chat, data?.turn ?? closing.turn, closing),
          modelKey: modelKeyFromClosing(closing),
        })
        break
      }
      case 'compaction': {
        const summaryText = typeof data?.summary === 'string'
          ? data.summary
          : (typeof data?.summary?.summary === 'string' ? data.summary.summary : '')
        if (!summaryText) continue
        rows.push({
          dshKey: String(key),
          role: 'compaction',
          automatic: true,
          summary: summaryText,
          tokensBefore: data?.tokensBefore ?? data?.summary?.tokensBefore ?? null,
          timestamp: typeof data?.time === 'number' ? data.time : undefined,
        })
        break
      }
      default:
        break
    }
  }
  return rows
}
