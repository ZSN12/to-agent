#!/usr/bin/env node
/**
 * API-only Z Host：嵌入式启动不依赖 @z/dsh-web-frontend，且 deploy 中应已 prune 该包。
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { TASKWEAVER_Z_RUNTIME_DEPLOY_DIR } from '../electron/agent/z-host/resolve-runtime.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runtimeRoot = process.env.TASKWEAVER_Z_RUNTIME
  ? path.resolve(process.env.TASKWEAVER_Z_RUNTIME)
  : path.join(root, 'vendor', TASKWEAVER_Z_RUNTIME_DEPLOY_DIR)

if (!fs.existsSync(runtimeRoot)) {
  console.log('test-taskweaver-api-only-host: 跳过（无 vendor/taskweaver-z-runtime，先 pnpm run build:z-runtime）')
  process.exit(0)
}

const zPkgs = path.join(runtimeRoot, 'runtime-packages', '@z')
assert.equal(
  fs.existsSync(path.join(zPkgs, 'dsh-web-frontend')),
  false,
  'API-only deploy 不应包含 dsh-web-frontend',
)
if (fs.existsSync(zPkgs)) {
  const uiPkgs = fs.readdirSync(zPkgs).filter((name) => name.startsWith('dsh-client-ui-') && name !== 'dsh-client-ui-slots')
  assert.deepEqual(uiPkgs, [], `API-only deploy 不应包含 UI roster：${uiPkgs.join(', ')}`)
  for (const name of ['dsh-client-hmr', 'dsh-client-modules', 'dsh-cordis-client-runner']) {
    assert.equal(fs.existsSync(path.join(zPkgs, name)), false, `API-only deploy 不应包含 ${name}`)
  }
}

const hostBundleLib = path.join(runtimeRoot, 'runtime-packages', '@z', 'dsh-taskweaver', 'lib', 'index.js')
assert.ok(fs.existsSync(hostBundleLib), 'deploy 应包含 @z/dsh-taskweaver')
const hostBundleText = await fsp.readFile(hostBundleLib, 'utf8')
assert.match(hostBundleText, /taskweaverEmbedded/, 'dsh-taskweaver 需包含嵌入式 API-only 分支')
assert.equal(
  fs.existsSync(path.join(zPkgs, 'dsh-web')),
  false,
  'TaskWeaver deploy 不应包含 in-host @z/dsh-web（web_search 未在 Host 挂载）',
)

const entry = path.join(runtimeRoot, 'lib', 'entry.js')
assert.ok(fs.existsSync(entry), `缺少 runtime entry：${entry}`)

const home = await fsp.mkdtemp(path.join(os.tmpdir(), 'tw-api-only-host-'))
const READY = /(?:z|dsh) web:\s+https?:\/\/127\.0\.0\.1:\d+/i

await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [entry, 'web', '--no-open', '--port', '0'], {
    cwd: runtimeRoot,
    env: {
      ...process.env,
      Z_HOME: path.join(home, 'z'),
      Z_TELEMETRY_DISABLED: '1',
      Z_TASKWEAVER_EMBEDDED: '1',
      DSH_HOME: path.join(home, 'z'),
      DSH_TELEMETRY_DISABLED: '1',
      DSH_TASKWEAVER_EMBEDDED: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let buf = ''
  const timer = setTimeout(() => {
    child.kill('SIGTERM')
    reject(new Error(`Host 未在 45s 内就绪\n${buf.slice(-3000)}`))
  }, 45_000)
  const onData = (chunk) => {
    buf = `${buf}${chunk}`.slice(-32_000)
    if (READY.test(buf)) {
      clearTimeout(timer)
      child.kill('SIGTERM')
      resolve()
    }
  }
  child.stdout?.on('data', onData)
  child.stderr?.on('data', onData)
  child.once('close', (code) => {
    if (READY.test(buf)) return
    clearTimeout(timer)
    reject(new Error(`Host 退出 code=${code}\n${buf.slice(-3000)}`))
  })
})

console.log('test-taskweaver-api-only-host: ok')
