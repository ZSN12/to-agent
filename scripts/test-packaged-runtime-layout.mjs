#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'

const candidateApps = process.argv[2]
  ? [path.resolve(process.argv[2])]
  : [
      ...(process.env.TASKWEAVER_APP_BUNDLE ? [path.resolve(process.env.TASKWEAVER_APP_BUNDLE)] : []),
      path.resolve('apps/macos/build/TaskWeaver.app'),
      path.resolve('release/mac-arm64/TaskWeaver.app'),
      path.resolve('release/mac/TaskWeaver.app'),
      path.resolve('release/mac-universal/TaskWeaver.app'),
    ]

let appPath = null
for (const candidate of candidateApps) {
  const stat = await fs.stat(candidate).catch(() => null)
  if (stat?.isDirectory()) {
    appPath = candidate
    break
  }
}

if (!appPath) {
  console.log('test-packaged-runtime-layout: skip (no TaskWeaver.app bundle; run app:builder first)')
  process.exit(0)
}

const resources = path.join(appPath, 'Contents', 'Resources')
const bundledHostNode = path.join(resources, 'host-node', 'bin', 'node')
const bundledBun = path.join(resources, 'opencodex-runtime', 'bun')
const runtimeRoot = path.join(resources, 'backend', 'runtime')
const bridgeTransport = path.join(runtimeRoot, 'electron-vendor', 'taskweaver-bridge-transport', 'index.mjs')
const chatRegistry = path.join(runtimeRoot, 'electron-vendor', 'dsh-chat-registry.mjs')
const clientLib = path.join(
  runtimeRoot,
  'electron-vendor',
  'dsh-client-runtime-lib',
  'lib/types/client/sessions/manager.js',
)

await fs.access(bundledHostNode)
const bunStat = await fs.stat(bundledBun)
assert.ok(bunStat.isFile() && bunStat.size > 1_000_000, 'packaged Bun runtime is missing or truncated')
assert.ok((bunStat.mode & 0o111) !== 0, 'packaged Bun runtime is not executable')
await fs.access(path.join(resources, 'app', 'backend', 'shell', 'run.mjs'))
await fs.access(path.join(resources, 'app', 'contract', 'channels.mjs'))
await fs.access(path.join(resources, 'app', 'dist', 'index.html'))
await fs.access(path.join(resources, 'AppIcon.icns'))
await fs.access(bridgeTransport)
await fs.access(chatRegistry)
await fs.access(clientLib)
await fs.access(path.resolve('backend/vendor/dsh-chat-registry.mjs'))

const cursorLoader = path.join(runtimeRoot, 'electron-vendor', 'taskweaver-bridge-transport', 'cursor-adapter-loader.mjs')
const cursorLoaderSource = await fs.readFile(cursorLoader, 'utf8')
assert.match(cursorLoaderSource, /@taskweaver\/provider-bridge/, 'packaged Cursor loader must use compiled @taskweaver/provider-bridge')
assert.doesNotMatch(cursorLoaderSource, /src\/adapters\/cursor\.ts/, 'packaged Cursor loader must not import OpenCodex TypeScript sources')

const providerBridgeLibCandidates = [
  path.join(runtimeRoot, 'runtime-packages', '@taskweaver', 'provider-bridge', 'lib'),
  path.join(runtimeRoot, 'runtime-packages', 'node_modules', '@taskweaver', 'provider-bridge', 'lib'),
]
let providerBridgeEntry = null
for (const providerBridgeLib of providerBridgeLibCandidates) {
  for (const name of ['index.mjs', 'index.js']) {
    const candidate = path.join(providerBridgeLib, name)
    if (await fs.stat(candidate).catch(() => null)) {
      providerBridgeEntry = candidate
      break
    }
  }
  if (providerBridgeEntry) break
}
assert.ok(providerBridgeEntry, 'packaged @taskweaver/provider-bridge entry missing (expected lib/index.mjs or lib/index.js)')

assert.ok((await fs.stat(bridgeTransport)).isFile(), 'taskweaver-bridge-transport missing in packaged runtime')
assert.ok((await fs.stat(chatRegistry)).isFile(), 'dsh-chat-registry missing in packaged runtime electron-vendor')
assert.ok((await fs.stat(clientLib)).isFile(), 'dsh-client-runtime-lib SessionManager missing in packaged runtime')

console.log(`test-packaged-runtime-layout: ok (${appPath})`)
