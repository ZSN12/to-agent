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
      const prev = await store.read()
      const jobs = Array.isArray(prev.jobs) ? prev.jobs.map((job) => normalizeJob(job)) : []
      const nextJob = normalizeJob(patch)
      const index = jobs.findIndex((job) => job.id === nextJob.id)
      if (index >= 0) {
        jobs[index] = { ...jobs[index], ...nextJob, updatedAt: Date.now() }
      } else {
        jobs.unshift(nextJob)
      }
      await store.write({ jobs })
      return nextJob
    },
    async remove(jobId) {
      const prev = await store.read()
      const jobs = (prev.jobs ?? []).filter((job) => job.id !== jobId)
      await store.write({ jobs })
      return jobs.length !== (prev.jobs ?? []).length
    },
    async markRun(jobId, { error = null } = {}) {
      const prev = await store.read()
      const jobs = (prev.jobs ?? []).map((job) => {
        if (job.id !== jobId) return job
        return normalizeJob({
          ...job,
          lastRunAt: Date.now(),
          lastError: error,
        })
      })
      await store.write({ jobs })
    },
  }
}
