#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (relativePath) => fs.readFile(path.join(root, relativePath), 'utf8')

const bundleScript = await read('scripts/macos/bundle-backend.mjs')
const supervisor = await read('apps/macos/Packages/TaskWeaverKit/Sources/TWRPC/BackendSupervisor.swift')
const runtimeResolver = await read('backend/agent/z-host/resolve-runtime.mjs')
const nodeFetcher = await read('scripts/macos/fetch-node.sh')

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

assert.match(supervisor, /backend\/app-server\.mjs/)
assert.match(supervisor, /proc\.currentDirectoryURL = launch\.appRootURL/)
assert.match(supervisor, /Bundle\.main\.bundleURL\.pathExtension == "app"/)
assert.match(supervisor, /TASKWEAVER_PACKAGED/)
assert.match(supervisor, /TASKWEAVER_RESOURCES_PATH/)
assert.match(supervisor, /TASKWEAVER_HOST_NODE/)

assert.match(runtimeResolver, /path\.join\(packagedResourcesPath, 'backend', 'runtime'\)/)
assert.match(runtimeResolver, /env\.TASKWEAVER_RESOURCES_PATH/)
assert.match(nodeFetcher, /SHASUMS256\.txt/)
assert.match(nodeFetcher, /shasum -a 256 -c/)
assert.match(nodeFetcher, /no host Node fallback is permitted/)
assert.doesNotMatch(nodeFetcher, /command -v node/)

console.log('test-macos-bundle-layout passed')
