#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (relativePath) => fs.readFile(path.join(root, relativePath), 'utf8')

const bundleScript = await read('scripts/macos/bundle-backend.mjs')
const backendLauncher = await read('apps/macos/TaskWeaverShell/Sources/TaskWeaverShell/BackendLauncher.swift')
const shellApp = await read('apps/macos/TaskWeaverShell/Sources/TaskWeaverShell/TaskWeaverShellApp.swift')
const runtimeResolver = await read('backend/agent/z-host/resolve-runtime.mjs')
const nodeFetcher = await read('scripts/macos/fetch-node.sh')
const appBuilder = await read('scripts/macos/build-app.sh')
const opencodexBinary = await read('backend/opencodex-binary.mjs')
const packaging = await read('packaging/mac-shell-resources.yml')
const shellPlatform = await read('backend/platform/shell-platform.mjs')
const keychainBridge = await read('backend/platform/keychain-secrets.mjs')
const keychainHelper = await read('apps/macos/TaskWeaverShell/Sources/TaskWeaverKeychain/main.swift')
const packageJson = JSON.parse(await read('package.json'))

assert.match(packageJson.scripts.dev, /dev:mac/)
assert.match(packageJson.scripts['dev:mac'], /TaskWeaverShell --product TaskWeaverShell/)
assert.match(packageJson.scripts['dev:mac'], /TaskWeaverKeychain/)
assert.match(packageJson.scripts.app, /pnpm run build && pnpm run check:ipc && TASKWEAVER_REPLACE_EXISTING=1 bash scripts\/macos\/build-app\.sh/)
assert.doesNotMatch(packageJson.scripts.app, /build-macos-shell-app/)
assert.equal(Object.hasOwn(packageJson.scripts, 'ensure:host-node'), false)
assert.match(packageJson.scripts['dev:browser'], /dev:shell-server/)

for (const obsoleteBuilder of [
  'scripts/ensure-host-node.mjs',
  'scripts/build-macos-shell-app.mjs',
  'scripts/make-mac-app.sh',
]) {
  await assert.rejects(fs.access(path.join(root, obsoleteBuilder)), { code: 'ENOENT' })
}

assert.match(bundleScript, /TASKWEAVER_STAGE_DIR/)
assert.match(bundleScript, /apps\/macos\/build\/stage\/backend/)
assert.match(bundleScript, /path\.join\(stageDir, 'node'\)/)
assert.match(bundleScript, /path\.join\(stageDir, 'app'\)/)
assert.match(bundleScript, /src: 'backend', dest: 'backend', appRelative: true/)
assert.match(bundleScript, /src: 'contract', dest: 'contract', appRelative: true/)
assert.match(bundleScript, /src: 'registry', dest: 'registry', appRelative: true/)
assert.match(bundleScript, /src: 'pricing', dest: 'pricing', appRelative: true/)
assert.match(bundleScript, /src: 'runtime-lock\.json', dest: 'runtime-lock\.json', appRelative: true/)
assert.match(bundleScript, /src: 'vendor\/opencodex', dest: 'vendor\/opencodex', appRelative: true/)
assert.match(bundleScript, /TASKWEAVER_RUNTIME_DIR/)
assert.match(bundleScript, /vendor\/taskweaver-z-runtime/)
assert.match(bundleScript, /path\.join\(stageDir, 'runtime'\)/)
assert.doesNotMatch(bundleScript, /path\.join\(rootDir, 'packages\/runtime'\)/)

assert.match(backendLauncher, /backend\/shell\/run\.mjs/)
assert.match(backendLauncher, /proc\.currentDirectoryURL = paths\.appRoot/)
assert.match(backendLauncher, /TASKWEAVER_PACKAGED/)
assert.match(backendLauncher, /TASKWEAVER_RESOURCES_PATH/)
assert.match(backendLauncher, /TASKWEAVER_HOST_NODE/)
assert.match(backendLauncher, /terminationHandler/)
assert.match(backendLauncher, /let parentEnvironment = ProcessInfo\.processInfo\.environment[\s\S]*?for key in \[[^\]]+\][\s\S]*?proc\.environment = env/,
  'the backend must receive a curated environment instead of the entire parent environment')
assert.match(shellApp, /后端进程意外退出/)
assert.match(shellPlatform, /const secrets = createKeychainSecrets/)
assert.match(keychainBridge, /child\.stdin\.end\(JSON\.stringify\(request\)\)/)
assert.match(keychainBridge, /spawnProcess\(helperPath, \[\]/)
assert.match(keychainHelper, /SecItemCopyMatching/)
assert.match(keychainHelper, /SecItemUpdate/)
assert.match(keychainHelper, /SecItemAdd/)
assert.match(appBuilder, /--product TaskWeaverKeychain/)
assert.match(appBuilder, /HELPERS_DIR="\$\{CONTENTS_DIR\}\/Helpers"/)
assert.match(packaging, /from: apps\/macos\/build\/node[\s\S]*?to: host-node/)
assert.match(appBuilder, /cp -R "\$\{NODE_DIR\}\/\." "\$\{RESOURCES_DIR\}\/host-node\/"/)
assert.match(appBuilder, /node_modules\/bun\/bin\/bun/)
assert.match(appBuilder, /opencodex-runtime\/bun/)
assert.match(appBuilder, /BUN_SOURCE[\s\S]*?--version/)
assert.match(opencodexBinary, /resourcesPath, 'opencodex-runtime', 'bun'/)

assert.match(runtimeResolver, /path\.join\(packagedResourcesPath, 'backend', 'runtime'\)/)
assert.match(runtimeResolver, /env\.TASKWEAVER_RESOURCES_PATH/)
assert.match(nodeFetcher, /SHASUMS256\.txt/)
assert.match(nodeFetcher, /shasum -a 256 -c/)
assert.match(nodeFetcher, /no host Node fallback is permitted/)
assert.doesNotMatch(nodeFetcher, /command -v node/)

console.log('test-macos-bundle-layout passed')
