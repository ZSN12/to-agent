import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const checks = [
  'test-navigation-queue.mjs',
  'test-thread-actions-navigation.mjs',
  'test-workbench-file-state.mjs',
  'test-model-add-workflow.mjs',
  'test-model-metadata-routing.mjs',
  'test-conversation-run-reliability.mjs',
  'test-conversation-run-lifecycle.mjs',
]
for (const check of checks) {
  const result = spawnSync(process.execPath, ['--import', 'tsx', `scripts/${check}`], {
    cwd: root,
    env: { ...process.env },
    stdio: 'inherit',
  })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}
console.log(`functional reliability: ${checks.length} focused suites passed`)
