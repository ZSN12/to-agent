import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createScheduledJobsStore } from '../electron/backend/scheduled-jobs-store.mjs'

const home = await fs.mkdtemp(path.join(os.tmpdir(), 'tw-jobs-'))
const store = createScheduledJobsStore(home)
const job = await store.upsert({
  title: '巡检',
  prompt: '只读检查',
  intervalMinutes: 60,
})
assert.equal(job.title, '巡检')
const listed = await store.list()
assert.equal(listed.length, 1)
await store.markRun(job.id, { error: 'boom' })
const after = (await store.list())[0]
assert.equal(after.lastError, 'boom')
assert.ok(after.lastRunAt)
assert.equal(await store.remove(job.id), true)
assert.equal((await store.list()).length, 0)
console.log('scheduled-jobs-store tests passed')
