import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { runOcx } from '../backend/model-sync/ocx-cli.mjs'
import {
  resolveOcxBunExecutable,
  resolveOcxExecutable,
  setOcxRuntimeContext,
} from '../backend/opencodex-binary.mjs'

const candidateApps = process.argv[2]
  ? [path.resolve(process.argv[2])]
  : [
      ...(process.env.TASKWEAVER_APP_BUNDLE ? [path.resolve(process.env.TASKWEAVER_APP_BUNDLE)] : []),
      path.resolve('apps/macos/build/TaskWeaver.app'),
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
const runtimeRoot = path.join(resourcesPath, 'backend', 'runtime')
const runtimePackagesPath = path.join(runtimeRoot, 'runtime-packages')
setOcxRuntimeContext({
  appPath: path.join(resourcesPath, 'app'),
  resourcesPath,
  isPackaged: true,
})

try {
  const ocxPath = resolveOcxExecutable()
  const bunPath = resolveOcxBunExecutable()
  assert.ok(ocxPath.includes(`${path.sep}app${path.sep}vendor${path.sep}opencodex${path.sep}bin${path.sep}ocx.mjs`),
    `expected the bundled TaskWeaver fork, got ${ocxPath}`)
  assert.ok(bunPath, 'packaged Bun runtime is missing')
  assert.ok((await fs.stat(bunPath)).size > 1_000_000, 'packaged Bun file is a placeholder or truncated')
  assert.ok((await fs.stat(bunPath)).mode & 0o111, 'packaged Bun runtime is not executable')
  assert.equal(bunPath, path.join(resourcesPath, 'opencodex-runtime', 'bun'), 'Bun must come from the native app runtime resources')
  const bridgeTransport = path.join(runtimeRoot, 'electron-vendor', 'taskweaver-bridge-transport', 'index.mjs')
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
