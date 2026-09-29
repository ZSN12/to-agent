#!/usr/bin/env node
/** 确保 vendor/z-runtime 依赖就绪后，走统一的 build-dsh-runtime（@z/dsh deploy）。 */
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit', ...opts })
    child.on('error', reject)
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))))
  })
}

await run(process.execPath, [path.join(root, 'scripts/build-dsh-runtime.mjs')], {
  env: { ...process.env, TASKWEAVER_USE_Z_RUNTIME: '1' },
})
