#!/usr/bin/env node
/**
 * launchd / 手动触发：从 taskweaver-scheduled-jobs.json 读取任务并执行一轮。
 */
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { createScheduledJobsStore } from '../electron/backend/scheduled-jobs-store.mjs'
import { withScheduledJobLock } from '../electron/backend/scheduled-job-lock.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function arg(name) {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : null
}

const jobId = arg('--job-id')
if (!jobId) {
  console.error('Usage: node scripts/run-scheduled-job-cli.mjs --job-id <id> [--user-data <path>]')
  process.exit(1)
}

const userData = arg('--user-data')
  || process.env.TASKWEAVER_USER_DATA
  || path.join(os.homedir(), 'Library/Application Support/taskweaver-desktop')

const store = createScheduledJobsStore(userData)
const jobs = await store.list()
const job = jobs.find((row) => row.id === jobId)
if (!job) {
  console.error(`Job not found: ${jobId}`)
  process.exit(1)
}

try {
  const locked = await withScheduledJobLock({
    lockDirectory: path.join(userData, 'scheduled-job-locks'),
    jobId,
  }, async () => {
    const current = (await store.list()).find((row) => row.id === jobId)
    if (!current || !current.enabled) return { skipped: 'disabled' }
    if (current.multiAgent) {
      const message = 'LaunchAgent headless runner does not support DAG execution'
      await store.markRun(current.id, { error: message })
      throw new Error(message)
    }
    if (!current.workspacePath) throw new Error('scheduled job has no workspace; edit and save it again in TaskWeaver')
    const dueMs = current.intervalMinutes * 60_000
    const lastRunAt = current.lastRunAt ?? current.createdAt ?? Date.now()
    if (Date.now() - lastRunAt < dueMs) return { skipped: 'not-due' }

    const script = path.join(root, 'scripts/taskweaver-headless.mjs')
    const headlessArgs = [
      script,
      '--text',
      current.prompt,
      '--preset',
      current.multiAgent ? 'taskweaver-code' : 'taskweaver-readonly',
      '--workspace',
      current.workspacePath,
    ]
    try {
      await new Promise((resolve, reject) => {
        const child = spawn(process.execPath, headlessArgs, {
          cwd: root,
          stdio: 'inherit',
          env: { ...process.env, TASKWEAVER_USER_DATA: userData },
        })
        child.on('error', reject)
        child.on('exit', (code) => {
          if (code === 0) resolve()
          else reject(new Error(`headless exit ${code}`))
        })
      })
      await store.markRun(current.id, { error: null })
      return { completed: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await store.markRun(current.id, { error: message }).catch(() => {})
      throw error
    }
  })

  if (!locked.acquired) {
    console.log(`[scheduled-job] skipped ${jobId}: already running`)
    process.exit(0)
  }
  if (locked.value?.skipped) {
    console.log(`[scheduled-job] skipped ${jobId}: ${locked.value.skipped}`)
    process.exit(0)
  }
  console.log(`[scheduled-job] completed ${jobId}`)
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[scheduled-job] failed ${jobId}:`, message)
  process.exit(1)
}
