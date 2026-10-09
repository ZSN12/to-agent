#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'

const candidateApps = process.argv[2]
  ? [path.resolve(process.argv[2])]
  : [
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
const runtimeRoot = path.join(resources, 'taskweaver-z-runtime')
const bridgeTransport = path.join(runtimeRoot, 'electron-vendor', 'taskweaver-bridge-transport', 'index.mjs')
const chatRegistry = path.join(runtimeRoot, 'electron-vendor', 'dsh-chat-registry.mjs')
const clientLib = path.join(
  runtimeRoot,
  'electron-vendor',
  'dsh-client-runtime-lib',
  'lib/types/client/sessions/manager.js',
)

await fs.access(bridgeTransport)
await fs.access(chatRegistry)
await fs.access(clientLib)
await fs.access(path.resolve('electron/vendor/dsh-chat-registry.mjs'))

assert.ok((await fs.stat(bridgeTransport)).isFile(), 'taskweaver-bridge-transport missing in packaged runtime')
assert.ok((await fs.stat(chatRegistry)).isFile(), 'dsh-chat-registry missing in packaged runtime electron-vendor')
assert.ok((await fs.stat(clientLib)).isFile(), 'dsh-client-runtime-lib SessionManager missing in packaged runtime')

console.log(`test-packaged-runtime-layout: ok (${appPath})`)
