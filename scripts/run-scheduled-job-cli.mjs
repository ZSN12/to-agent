#!/usr/bin/env node
/**
 * launchd / 手动触发：从 taskweaver-scheduled-jobs.json 读取任务并执行一轮。
 */
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createScheduledJobsStore } from '../electron/backend/scheduled-jobs-store.mjs'
import { spawn } from 'node:child_process'

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
if (!job.enabled) {
  console.error(`Job disabled: ${jobId}`)
  process.exit(0)
}

const script = path.join(root, 'scripts/taskweaver-headless.mjs')
const headlessArgs = [
  script,
  '--text',
  job.prompt,
  '--preset',
  job.multiAgent ? 'taskweaver-code' : 'taskweaver-readonly',
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
  await store.markRun(job.id, { error: null })
  console.log(`[scheduled-job] completed ${job.id}`)
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  await store.markRun(job.id, { error: message })
  console.error(`[scheduled-job] failed ${job.id}:`, message)
  process.exit(1)
}
