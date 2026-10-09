#!/usr/bin/env node
/**
 * tsx ESM register breaks under Electron; bridge transport must use the CJS entry.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const loader = path.join(root, 'packages/taskweaver-bridge-transport/cursor-adapter-loader.mjs')
const source = fs.readFileSync(loader, 'utf8')
assert.match(source, /dist', 'cjs', 'api', 'index\.cjs'/, 'cursor-adapter-loader must prefer tsx CJS register for Electron')

const deployTsx = path.join(root, 'vendor/taskweaver-z-runtime/runtime-packages/tsx')
const monorepoTsx = path.join(root, 'vendor/z-runtime/node_modules/tsx')
const tsxDir = fs.existsSync(deployTsx) ? deployTsx : monorepoTsx
assert.ok(fs.existsSync(path.join(tsxDir, 'dist/cjs/api/index.cjs')), `missing tsx package at ${tsxDir}`)

const electronCandidates = [
  path.join(root, 'release/mac-arm64/TaskWeaver.app/Contents/MacOS/TaskWeaver'),
  path.join(root, 'release/mac/TaskWeaver.app/Contents/MacOS/TaskWeaver'),
  '/Applications/TaskWeaver.app/Contents/MacOS/TaskWeaver',
]
const electron = electronCandidates.find((p) => fs.existsSync(p))
if (!electron) {
  console.log('test-bridge-tsx-loader: skip Electron spawn (no TaskWeaver.app); source check passed')
  process.exit(0)
}

const snippet = `
import { ensureNodeTypescriptLoader } from ${JSON.stringify(loader)};
ensureNodeTypescriptLoader();
console.log('tsx-loader-ok');
`
const result = spawnSync(electron, ['--input-type=module', '-e', snippet], {
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  encoding: 'utf8',
})
assert.equal(result.status, 0, `Electron tsx loader failed:\n${result.stderr}\n${result.stdout}`)
assert.match(result.stdout, /tsx-loader-ok/)

console.log('test-bridge-tsx-loader: ok')
