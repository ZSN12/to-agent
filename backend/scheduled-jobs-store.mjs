import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { createJsonStore } from './json-store.mjs'

const DEFAULT = { jobs: [] }

function normalizeJob(raw) {
  const intervalMinutes = Number.isFinite(raw.intervalMinutes)
    ? Math.max(5, Math.min(7 * 24 * 60, Math.round(raw.intervalMinutes)))
    : 60
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : randomUUID(),
    conversationId: typeof raw.conversationId === 'string' && raw.conversationId ? raw.conversationId : null,
    title: typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim().slice(0, 120) : '定时任务',
    prompt: typeof raw.prompt === 'string' ? raw.prompt.slice(0, 16_000) : '',
    workspacePath: typeof raw.workspacePath === 'string' ? raw.workspacePath : null,
    intervalMinutes,
    enabled: raw.enabled !== false,
    multiAgent: raw.multiAgent === true,
    createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now(),
    updatedAt: Date.now(),
    lastRunAt: Number.isFinite(raw.lastRunAt) ? raw.lastRunAt : null,
    lastError: typeof raw.lastError === 'string' ? raw.lastError.slice(0, 500) : null,
  }
}

export function createScheduledJobsStore(userDataPath) {
  const store = createJsonStore(path.join(userDataPath, 'taskweaver-scheduled-jobs.json'), DEFAULT)
  return {
    async list() {
      const raw = await store.read()
      return (raw.jobs ?? []).map((job) => normalizeJob(job))
    },
    async upsert(patch) {
      let saved
      await store.update((prev) => {
        const jobs = Array.isArray(prev.jobs) ? prev.jobs.map((job) => normalizeJob(job)) : []
        const candidate = normalizeJob({ ...patch, conversationId: patch?.conversationId || randomUUID() })
        const index = jobs.findIndex((job) => job.id === candidate.id)
        if (index >= 0) {
          const existing = jobs[index]
          saved = normalizeJob({
            ...existing,
            ...candidate,
            conversationId: existing.conversationId || candidate.conversationId,
            updatedAt: Date.now(),
          })
          jobs[index] = saved
        } else {
          saved = candidate
          jobs.unshift(saved)
        }
        return { ...prev, jobs }
      })
      return saved
    },
    async ensureConversationId(jobId) {
      let conversationId
      await store.update((prev) => {
        const jobs = Array.isArray(prev.jobs) ? prev.jobs.map((job) => normalizeJob(job)) : []
        const index = jobs.findIndex((job) => job.id === jobId)
        if (index < 0) throw new Error('找不到定时任务')
        const existing = jobs[index]
        conversationId = existing.conversationId || randomUUID()
        jobs[index] = normalizeJob({ ...existing, conversationId, updatedAt: Date.now() })
        return { ...prev, jobs }
      })
      return conversationId
    },
    async remove(jobId) {
      let removed = false
      await store.update((prev) => {
        const jobs = (prev.jobs ?? []).filter((job) => job.id !== jobId)
        removed = jobs.length !== (prev.jobs ?? []).length
        return { ...prev, jobs }
      })
      return removed
    },
    async markRun(jobId, { error = null } = {}) {
      await store.update((prev) => {
        const jobs = (prev.jobs ?? []).map((job) => {
          if (job.id !== jobId) return job
          return normalizeJob({ ...job, lastRunAt: Date.now(), lastError: error })
        })
        return { ...prev, jobs }
      })
    },
  }
}
