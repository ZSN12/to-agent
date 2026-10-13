import fs from 'node:fs/promises'
import path from 'node:path'

function safeUsage(usage) {
  if (!usage || typeof usage !== 'object') return null
  const fields = [
    'inputTokens',
    'outputTokens',
    'promptTokens',
    'completionTokens',
    'cacheReadTokens',
    'cacheWriteTokens',
    'costUsd',
    'elapsedMs',
  ]
  return Object.fromEntries(fields
    .filter((key) => Number.isFinite(Number(usage[key])))
    .map((key) => [key, Number(usage[key])]))
}

/** Append-only, run-scoped execution trace. Prompt and tool text are never stored. */
export class TraceStore {
  constructor({ agentDataPath, now = () => new Date().toISOString() }) {
    this.basePath = path.join(agentDataPath, 'orchestration')
    this.now = now
    this.queues = new Map()
  }

  append(conversationId, runId, event) {
    const key = `${conversationId}/${runId}`
    const previous = this.queues.get(key) ?? Promise.resolve()
    const next = previous.then(async () => {
      const directory = path.join(this.basePath, conversationId, runId)
      await fs.mkdir(directory, { recursive: true })
      const entry = {
        ...event,
        schemaVersion: 1,
        at: event?.at || this.now(),
        conversationId,
        runId,
      }
      if (entry.usage) entry.usage = safeUsage(entry.usage)
      const line = `${JSON.stringify(entry)}\n`
      await fs.appendFile(path.join(directory, 'trace.jsonl'), line, 'utf8')
      return entry
    }).catch((error) => {
      // A diagnostic trace must not stop the task it is observing.
      console.error(`Failed to append DAG trace for ${key}:`, error)
      return null
    })
    this.queues.set(key, next)
    return next.finally(() => {
      if (this.queues.get(key) === next) this.queues.delete(key)
    })
  }

  async flush(conversationId, runId) {
    const key = `${conversationId}/${runId}`
    await this.queues.get(key)
  }
}
