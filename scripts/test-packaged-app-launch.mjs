#!/usr/bin/env node
/**
 * 打包 .app 冷启动冒烟：进程在数秒内不崩溃即通过（不替代 pkg-manual-smoke UI 清单）。
 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const appCandidates = [
  path.join(root, 'release/mac-arm64/TaskWeaver.app'),
  path.join(root, 'release/mac/TaskWeaver.app'),
  path.join(root, 'release/mac-universal/TaskWeaver.app'),
]

const appPath = appCandidates.find((candidate) => fs.existsSync(candidate))
if (!appPath) {
  console.log('test-packaged-app-launch: skip (no TaskWeaver.app; run npm run app:builder first)')
  process.exit(0)
}

const binary = path.join(appPath, 'Contents/MacOS/TaskWeaver')
assert.ok(fs.existsSync(binary), `missing binary: ${binary}`)

const tmpRoot = path.join(root, '.tmp-packaged-launch-smoke')
const userData = path.join(tmpRoot, `userData-${process.pid}`)
await fs.promises.mkdir(userData, { recursive: true })
const rmTmp = () => fs.promises.rm(tmpRoot, { recursive: true, force: true }).catch(() => {})

const env = {
  ...process.env,
  TASKWEAVER_PACKAGED: '1',
  ELECTRON_RUN_AS_NODE: undefined,
}
delete env.ELECTRON_RUN_AS_NODE

/** @type {import('node:child_process').ChildProcess | null} */
let child = null
let earlyExit = null

const cleanup = () => {
  if (!child?.pid) return
  try {
    process.kill(child.pid, 'SIGTERM')
  } catch {
    /* already dead */
  }
}

process.on('exit', cleanup)
process.on('SIGINT', () => {
  cleanup()
  process.exit(130)
})

child = spawn(binary, [`--user-data-dir=${userData}`], {
  env,
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: false,
})

child.stdout?.on('data', () => {})
child.stderr?.on('data', () => {})

child.on('exit', (code, signal) => {
  earlyExit = { code, signal, at: Date.now() }
})

const start = Date.now()
const minAliveMs = 4000
const maxWaitMs = 12000

while (Date.now() - start < maxWaitMs) {
  if (earlyExit && Date.now() - start < minAliveMs) {
    cleanup()
    await rmTmp()
    throw new Error(
      `TaskWeaver exited too early (${earlyExit.code ?? earlyExit.signal}) within ${Date.now() - start}ms`,
    )
  }
  if (Date.now() - start >= minAliveMs && child.exitCode === null && !earlyExit) {
    cleanup()
    await rmTmp()
    console.log(`test-packaged-app-launch: ok (${appPath}, alive ≥${minAliveMs}ms)`)
    process.exit(0)
  }
  await new Promise((r) => setTimeout(r, 250))
}

cleanup()
await rmTmp()
throw new Error(`TaskWeaver did not stay alive for ${minAliveMs}ms (last exit: ${JSON.stringify(earlyExit)})`)
