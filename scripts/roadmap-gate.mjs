#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const steps = [
  ['npm run test:prompt-pipeline', 'A4 prompt pipeline'],
  ['npm run test:workspace-context', 'A4 workspace context'],
  ['npm run test:orchestration', 'multi-agent orchestration'],
  ['npm run test:dsh-lifecycle', 'C fork / session lifecycle'],
  ['npm run test:usage', 'B usage + compaction policy'],
  ['node scripts/test-transcript-display-policy.mjs', 'C transcript policy'],
  ['node scripts/test-scheduled-jobs-store.mjs', 'D scheduled jobs'],
  ['node scripts/test-taskweaver-hooks.mjs', 'E hooks'],
  ['node scripts/test-launchd-scheduler.mjs', 'D launchd plist'],
  ['node scripts/test-github-pull-requests.mjs', 'PR remote parse'],
  ['node --test tests/fork-thread-smoke.test.mjs', 'C fork smoke'],
  ['npx tsc -b', 'TypeScript build'],
]

let failed = 0
for (const [cmd, label] of steps) {
  const res = spawnSync(cmd, { cwd: root, shell: true, stdio: 'inherit', env: process.env })
  if (res.status !== 0) {
    console.error(`✗ ${label}`)
    failed += 1
  } else {
    console.log(`✓ ${label}`)
  }
}
if (failed) {
  console.error(`\nroadmap-gate: ${failed} step(s) failed (test:z-host-deploy 需在本机终端单独跑)`)
  process.exit(1)
}
console.log('\nroadmap-gate: core checks passed')
