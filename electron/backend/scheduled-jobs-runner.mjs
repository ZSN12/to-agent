import { withScheduledJobLock } from './scheduled-job-lock.mjs'

/**
 * 应用运行期间的轻量定时任务（进程内 setInterval，非系统 cron）。
 */

export function createScheduledJobsRunner({ store, runJob, tickMs = 60_000, lockDirectory = null }) {
  let timer = null
  let running = false
  const inFlightJobs = new Set()

  async function execute(job) {
    if (inFlightJobs.has(job.id)) throw new Error('该定时任务已在运行')
    inFlightJobs.add(job.id)
    try {
      const executeLocked = async () => {
        const conversationId = await store.ensureConversationId?.(job.id)
        try {
          await runJob(conversationId ? { ...job, conversationId } : job)
          await store.markRun(job.id, { error: null })
          return job
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          await store.markRun(job.id, { error: message }).catch(() => {})
          throw error
        }
      }
      const result = lockDirectory
        ? await withScheduledJobLock({ lockDirectory, jobId: job.id }, executeLocked)
        : { acquired: true, value: await executeLocked() }
      if (!result.acquired) return null
      return result.value
    } finally {
      inFlightJobs.delete(job.id)
    }
  }

  async function tick() {
    if (running) return
    running = true
    try {
      const jobs = await store.list()
      const now = Date.now()
      for (const job of jobs) {
        if (!job.enabled || !job.prompt?.trim()) continue
        const dueMs = (job.intervalMinutes ?? 60) * 60_000
        const last = job.lastRunAt ?? job.createdAt ?? now
        if (now - last < dueMs) continue
        try {
          await execute(job)
        } catch { /* The failure is recorded by execute; the next due run can retry. */ }
      }
    } finally {
      running = false
    }
  }

  return {
    start() {
      if (timer) return
      timer = setInterval(() => { void tick() }, tickMs)
      void tick()
    },
    stop() {
      if (timer) clearInterval(timer)
      timer = null
    },
    async runNow(jobId) {
      const jobs = await store.list()
      const job = jobs.find((row) => row.id === jobId)
      if (!job) throw new Error('找不到定时任务')
      const result = await execute(job)
      if (!result) throw new Error('该定时任务已在其他进程中运行')
      return result
    },
  }
}
