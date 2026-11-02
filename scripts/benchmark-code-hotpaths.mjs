import { spawnSync } from 'node:child_process'

for (const args of [
  ['scripts/benchmark-markdown-stream.mjs', '--baseline', '--save'],
  ['scripts/benchmark-markdown-stream.mjs', '--save'],
  ['scripts/benchmark-thread-store.mjs'],
]) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}
