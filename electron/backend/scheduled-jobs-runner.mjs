/**
 * 应用运行期间的轻量定时任务（进程内 setInterval，非系统 cron）。
 */

export function createScheduledJobsRunner({ store, runJob, tickMs = 60_000 }) {
  let timer = null
  let running = false

  async function tick() {
    if (running) return
    running = true
    try {
      const jobs = await store.list()
      const now = Date.now()
      for (const job of jobs) {
        if (!job.enabled || !job.prompt?.trim()) continue
        const dueMs = (job.intervalMinutes ?? 60) * 60_000
        const last = job.lastRunAt ?? 0
        if (now - last < dueMs) continue
        try {
          await runJob(job)
          await store.markRun(job.id, { error: null })
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          await store.markRun(job.id, { error: message })
        }
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
      await runJob(job)
      await store.markRun(job.id, { error: null })
      return job
    },
  }
}
