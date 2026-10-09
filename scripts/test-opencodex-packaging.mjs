import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { openCodexEnvironment, runOcx } from '../electron/backend/model-sync/ocx-cli.mjs'
import {
  resolveOcxBunExecutable,
  resolveOcxExecutable,
  setOcxRuntimeContext,
} from '../electron/backend/opencodex-binary.mjs'

const candidateApps = process.argv[2]
  ? [path.resolve(process.argv[2])]
  : [
      path.resolve('release/mac-arm64/TaskWeaver.app'),
      path.resolve('release/mac/TaskWeaver.app'),
      path.resolve('release/mac-universal/TaskWeaver.app'),
    ]
let resolvedAppPath = null
for (const candidate of candidateApps) {
  const stat = await fs.stat(candidate).catch(() => null)
  if (stat?.isDirectory()) {
    resolvedAppPath = candidate
    break
  }
}
assert.ok(resolvedAppPath, `TaskWeaver app bundle not found; checked: ${candidateApps.join(', ')}`)

const resourcesPath = path.join(resolvedAppPath, 'Contents', 'Resources')
const runtimePackagesPath = path.join(resourcesPath, 'taskweaver-z-runtime', 'runtime-packages')
setOcxRuntimeContext({
  appPath: path.join(resourcesPath, 'app.asar'),
  resourcesPath,
  isPackaged: true,
})

let tempHome
let proxy
let stderr = ''
try {
  const ocxPath = resolveOcxExecutable()
  const bunPath = resolveOcxBunExecutable()
  assert.ok(ocxPath.includes(`${path.sep}app.asar.unpacked${path.sep}node_modules${path.sep}@taskweaver${path.sep}opencodex${path.sep}`),
    `expected the unpacked TaskWeaver fork, got ${ocxPath}`)
  assert.ok(bunPath, 'packaged Bun runtime is missing')
  assert.ok((await fs.stat(bunPath)).size > 1_000_000, 'packaged Bun file is a placeholder or truncated')
  const esmNodeModulesLink = path.join(runtimePackagesPath, 'node_modules')
  const esmNodeModulesStat = await fs.lstat(esmNodeModulesLink)
  assert.ok(esmNodeModulesStat.isSymbolicLink(), 'packaged runtime-packages/node_modules self-link is missing')
  assert.equal(await fs.readlink(esmNodeModulesLink), '.', 'runtime ESM self-link must be relocatable')
  const bridgeTransport = path.join(resourcesPath, 'taskweaver-z-runtime', 'electron-vendor', 'taskweaver-bridge-transport', 'index.mjs')
  await fs.access(bridgeTransport)
  await import(pathToFileURL(path.join(
    runtimePackagesPath,
    '@earendil-works',
    'pi-ai',
    'dist',
    'api',
    'openai-completions.js',
  )).href)
  const version = (await runOcx(['--version'], { timeoutMs: 30_000 })).stdout.trim()
  assert.match(version, /2\.79\.0-taskweaver\.1/, `unexpected packaged OpenCodex version: ${version}`)

  tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-opencodex-package-'))
  await fs.chmod(tempHome, 0o700)
  const ocxHome = path.join(tempHome, 'opencodex')
  const codexHome = path.join(tempHome, 'codex')
  await fs.mkdir(ocxHome, { mode: 0o700 })
  await fs.mkdir(codexHome, { mode: 0o700 })
  await fs.writeFile(path.join(ocxHome, 'config.json'), JSON.stringify({ codexAutoStart: false }), { mode: 0o600 })
  const port = await allocateLoopbackPort()
  proxy = spawn(ocxPath, ['start', '--port', String(port)], {
    detached: true,
    stdio: ['ignore', 'ignore', 'pipe'],
    env: openCodexEnvironment({ OPENCODEX_HOME: ocxHome, CODEX_HOME: codexHome }),
  })
  proxy.stderr.on('data', (chunk) => { stderr += chunk.toString() })
  await new Promise((resolve, reject) => {
    proxy.once('spawn', resolve)
    proxy.once('error', reject)
  })

  const deadline = Date.now() + 30_000
  let health = { ok: false, version: null }
  while (Date.now() < deadline) {
    health = await fetchProxyHealthz('127.0.0.1', port)
    if (health.ok) break
    if (proxy.exitCode !== null || proxy.signalCode !== null) break
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  assert.equal(health.ok, true, `packaged proxy did not become healthy${stderr ? `: ${stderr.slice(-500)}` : ''}`)
  assert.match(String(health.version), /2\.79\.0-taskweaver\.1/)
  console.log(`test-opencodex-packaging: ok (${version}; isolated /healthz on ${port})`)
} finally {
  if (proxy && proxy.exitCode === null && proxy.signalCode === null) {
    try { process.kill(-proxy.pid, 'SIGTERM') } catch { proxy.kill('SIGTERM') }
    await Promise.race([
      new Promise((resolve) => proxy.once('close', resolve)),
      new Promise((resolve) => setTimeout(resolve, 3_000)),
    ])
  }
  setOcxRuntimeContext(null)
  if (tempHome) await fs.rm(tempHome, { recursive: true, force: true })
}

async function fetchProxyHealthz(host, port, timeoutMs = 4000) {
  const url = `http://${host}:${port}/healthz`
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
    if (!res.ok) return { ok: false, version: null, pid: null }
    const json = await res.json()
    const version = typeof json?.version === 'string' ? json.version : null
    return {
      ok: json?.status === 'ok',
      version,
      pid: typeof json?.pid === 'number' ? json.pid : null,
    }
  } catch {
    return { ok: false, version: null, pid: null }
  }
}

async function allocateLoopbackPort() {
  const server = net.createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  return address.port
}
