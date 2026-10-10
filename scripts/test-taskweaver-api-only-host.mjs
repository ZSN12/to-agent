#!/usr/bin/env node
/**
 * TaskWeaver API-only Host：deploy 不含 browser UI package，readiness 后 `/api` 已接通。
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { TASKWEAVER_RUNTIME_DEPLOY_DIR } from '../desktop/agent/z-host/resolve-runtime.mjs'
import { scriptHostNodeExecutable } from './lib/host-node-executable.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runtimeRoot = process.env.TASKWEAVER_RUNTIME
  ? path.resolve(process.env.TASKWEAVER_RUNTIME)
  : path.join(root, 'vendor', TASKWEAVER_RUNTIME_DEPLOY_DIR)

if (!fs.existsSync(runtimeRoot)) {
  console.log('test-taskweaver-api-only-host: 跳过（无 vendor/taskweaver-z-runtime，先 pnpm run build:z-runtime）')
  process.exit(0)
}

const zPkgs = path.join(runtimeRoot, 'runtime-packages', '@taskweaver')
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

const hostBundleLib = path.join(runtimeRoot, 'runtime-packages', '@taskweaver', 'dsh-taskweaver', 'lib', 'index.js')
assert.ok(fs.existsSync(hostBundleLib), 'deploy 应包含 @taskweaver/dsh-taskweaver')
const hostBundleText = await fsp.readFile(hostBundleLib, 'utf8')
assert.match(hostBundleText, /z web:/, 'dsh-taskweaver 需发布 API Host readiness')
assert.doesNotMatch(hostBundleText, /taskweaverEmbedded|frontend-static|openBrowser|surfaceContext|TASKWEAVER_WEB_URL/)
for (const name of ['dsh-web', 'dsh-web-search-taskweaver', 'dsh-tool-web', 'dsh-host-directory-picker-native']) {
  assert.ok(fs.existsSync(path.join(zPkgs, name)), `TaskWeaver Host 组合应包含 @taskweaver/${name}`)
}
const hostBundleManifest = JSON.parse(await fsp.readFile(
  path.join(runtimeRoot, 'runtime-packages', '@taskweaver', 'dsh-taskweaver', 'package.json'),
  'utf8',
))
for (const name of ['@taskweaver/dsh-web', '@taskweaver/dsh-web-search-taskweaver', '@taskweaver/dsh-tool-web', '@taskweaver/dsh-host-directory-picker-native']) {
  assert.ok(hostBundleManifest.dependencies?.[name], `TaskWeaver bundle should own dependency ${name}`)
}
for (const name of ['@taskweaver/dsh-host-directory-picker-auto', '@taskweaver/dsh-host-directory-picker-browse']) {
  assert.equal(hostBundleManifest.dependencies?.[name], undefined, `TaskWeaver bundle must not mount ${name}`)
}
const taskWeaverPatch = await fsp.readFile(
  path.join(runtimeRoot, 'runtime-packages', '@taskweaver', 'dsh-taskweaver', 'cordis.patch.yml'),
  'utf8',
)
assert.match(taskWeaverPatch, /id: directory-picker\s+name: '@taskweaver\/dsh-host-directory-picker-native'/)
assert.doesNotMatch(taskWeaverPatch, /dsh-host-directory-picker-(?:auto|browse)/)
assert.doesNotMatch(taskWeaverPatch, /id: web\s+name: '@taskweaver\/dsh-web'/, 'web seam rows live in dsh-base, not the TaskWeaver bundle patch')

const basePatchPath = path.join(runtimeRoot, 'runtime-packages', '@taskweaver', 'dsh-base', 'cordis.patch.yml')
assert.ok(fs.existsSync(basePatchPath), 'deploy 应包含 @taskweaver/dsh-base/cordis.patch.yml')
const basePatch = await fsp.readFile(basePatchPath, 'utf8')
assert.match(basePatch, /id: web\s+name: '@taskweaver\/dsh-web'/)
assert.match(basePatch, /id: web-search-taskweaver\s+name: '@taskweaver\/dsh-web-search-taskweaver'/)
assert.match(basePatch, /id: tool-web\s+name: '@taskweaver\/dsh-tool-web'/)

const entry = path.join(runtimeRoot, 'lib', 'entry.js')
assert.ok(fs.existsSync(entry), `缺少 runtime entry：${entry}`)

const home = await fsp.mkdtemp(path.join(os.tmpdir(), 'tw-api-only-host-'))
const READY = /(?:z|dsh) web:\s+(https?:\/\/127\.0\.0\.1:\d+)/i

await new Promise((resolve, reject) => {
  const child = spawn(scriptHostNodeExecutable(), [entry, '--profile', 'web', '--host', '127.0.0.1', '--port', '0'], {
    cwd: runtimeRoot,
    env: {
      ...process.env,
      TASKWEAVER_HOME: path.join(home, 'z'),
      TASKWEAVER_TELEMETRY_DISABLED: '1',
      TASKWEAVER_EMBEDDED: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let buf = ''
  let apiProbeStarted = false
  let completed = false
  const timer = setTimeout(() => {
    completed = true
    child.kill('SIGTERM')
    reject(new Error(`Host 未在 45s 内就绪\n${buf.slice(-3000)}`))
  }, 45_000)
  const onData = (chunk) => {
    buf = `${buf}${chunk}`.slice(-32_000)
    const match = buf.match(READY)
    if (!match || apiProbeStarted) return
    apiProbeStarted = true
    void (async () => {
      try {
        const response = await fetch(`${match[1]}/api/__taskweaver_readiness_probe__`)
        assert.equal(response.status, 404, '/api probe should reach the Host route registry')
        assert.equal(await response.text(), 'not found', '/api probe should be handled by the Host API route')
        completed = true
        clearTimeout(timer)
        child.kill('SIGTERM')
        resolve()
      } catch (error) {
        completed = true
        clearTimeout(timer)
        child.kill('SIGTERM')
        reject(error)
      }
    })()
  }
  child.stdout?.on('data', onData)
  child.stderr?.on('data', onData)
  child.once('close', (code) => {
    if (completed) return
    completed = true
    clearTimeout(timer)
    reject(new Error(`Host 退出 code=${code}\n${buf.slice(-3000)}`))
  })
})

console.log('test-taskweaver-api-only-host: ok')
