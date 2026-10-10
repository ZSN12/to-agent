import { randomUUID } from 'node:crypto'

const DEFAULT_MAX_ENTRIES = 128
const DEFAULT_MAX_TOTAL_BYTES = 8 * 1024 * 1024
const DEFAULT_MAX_OUTPUT_BYTES = 1024 * 1024

function boundedInteger(value, fallback, max) {
  return Number.isInteger(value) && value > 0 ? Math.min(value, max) : fallback
}

function utf8Prefix(text, maxBytes) {
  const bytes = Buffer.from(text, 'utf8')
  if (bytes.byteLength <= maxBytes) return { text, truncated: false, bytes: bytes.byteLength }
  const clipped = new TextDecoder().decode(bytes.subarray(0, maxBytes))
  return { text: clipped, truncated: true, bytes: Buffer.byteLength(clipped, 'utf8') }
}

/** Bounded, conversation-scoped LRU for transient full tool outputs. */
export function createToolOutputStore(options = {}) {
  const maxEntries = boundedInteger(options.maxEntries, DEFAULT_MAX_ENTRIES, 2048)
  const maxTotalBytes = boundedInteger(options.maxTotalBytes, DEFAULT_MAX_TOTAL_BYTES, 64 * 1024 * 1024)
  const maxOutputBytes = boundedInteger(options.maxOutputBytes, DEFAULT_MAX_OUTPUT_BYTES, maxTotalBytes)
  const entries = new Map()
  let totalBytes = 0

  function evictOldest() {
    const oldest = entries.entries().next().value
    if (!oldest) return false
    const [id, entry] = oldest
    entries.delete(id)
    totalBytes -= entry.bytes
    return true
  }

  function store({ conversationId, text }) {
    if (typeof conversationId !== 'string' || !conversationId || typeof text !== 'string' || !text) return null
    const bounded = utf8Prefix(text, maxOutputBytes)
    const outputId = randomUUID()
    const entry = {
      conversationId,
      text: bounded.text,
      bytes: bounded.bytes,
      truncated: bounded.truncated,
      createdAt: Date.now(),
    }
    entries.set(outputId, entry)
    totalBytes += entry.bytes
    while (entries.size > maxEntries || totalBytes > maxTotalBytes) {
      if (!evictOldest()) break
    }
    return { outputId, truncated: entry.truncated }
  }

  function get({ conversationId, outputId } = {}) {
    if (typeof conversationId !== 'string' || typeof outputId !== 'string') return null
    const entry = entries.get(outputId)
    if (!entry || entry.conversationId !== conversationId) return null
    entries.delete(outputId)
    entries.set(outputId, entry)
    return { text: entry.text, truncated: entry.truncated }
  }

  function clearConversation(conversationId) {
    if (typeof conversationId !== 'string' || !conversationId) return 0
    let removed = 0
    for (const [id, entry] of entries) {
      if (entry.conversationId !== conversationId) continue
      entries.delete(id)
      totalBytes -= entry.bytes
      removed++
    }
    return removed
  }

  function clear() {
    const removed = entries.size
    entries.clear()
    totalBytes = 0
    return removed
  }

  return {
    store,
    get,
    clearConversation,
    clear,
    get stats() { return { entries: entries.size, bytes: totalBytes } },
  }
}
