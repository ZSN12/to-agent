import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { runOcx } from '../desktop/backend/model-sync/ocx-cli.mjs'
import {
  resolveOcxBunExecutable,
  resolveOcxExecutable,
  setOcxRuntimeContext,
} from '../desktop/backend/opencodex-binary.mjs'

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

try {
  const ocxPath = resolveOcxExecutable()
  const bunPath = resolveOcxBunExecutable()
  assert.ok(ocxPath.includes(`${path.sep}app.asar.unpacked${path.sep}node_modules${path.sep}@taskweaver${path.sep}opencodex${path.sep}`),
    `expected the unpacked TaskWeaver fork, got ${ocxPath}`)
  assert.ok(bunPath, 'packaged Bun runtime is missing')
  assert.ok((await fs.stat(bunPath)).size > 1_000_000, 'packaged Bun file is a placeholder or truncated')
  const runtimeRoot = path.join(resourcesPath, 'taskweaver-z-runtime')
  const deployNodeModules = path.join(runtimeRoot, 'node_modules')
  const deployStat = await fs.lstat(deployNodeModules)
  assert.ok(deployStat.isSymbolicLink(), 'packaged runtime root node_modules → runtime-packages link is missing')
  const target = await fs.readlink(deployNodeModules)
  assert.ok(
    target === 'runtime-packages' || path.basename(target) === 'runtime-packages',
    `runtime node_modules must point at runtime-packages, got ${target}`,
  )
  const selfLink = path.join(runtimePackagesPath, 'node_modules')
  const selfStat = await fs.lstat(selfLink).catch(() => null)
  if (selfStat?.isSymbolicLink()) {
    const selfTarget = await fs.readlink(selfLink)
    assert.notEqual(selfTarget, '.', 'runtime-packages/node_modules must not self-link (ELOOP with root node_modules)')
  }
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
  const bunVersion = await runExecutable(bunPath, ['--version'])
  assert.match(bunVersion, /^1\.4\./, `unexpected packaged Bun version: ${bunVersion}`)
  console.log(`test-opencodex-packaging: ok (${version}; Bun ${bunVersion.trim()})`)
} finally {
  setOcxRuntimeContext(null)
}

function runExecutable(executable, args, timeoutMs = 30_000) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error(`${executable} ${args.join(' ')} timed out`))
    }, timeoutMs)
    child.stdout.on('data', (chunk) => { stdout += chunk.toString() })
    child.stderr.on('data', (chunk) => { stderr += chunk.toString() })
    child.on('error', reject)
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve(stdout.trim())
      else reject(new Error((stderr || stdout).trim().slice(0, 400) || `exit ${code}`))
    })
  })
}
