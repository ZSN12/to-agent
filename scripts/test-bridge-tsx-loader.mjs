#!/usr/bin/env node
/**
 * Bridge transport must load compiled provider-bridge without Electron-as-node.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { scriptHostNodeExecutable } from './lib/host-node-executable.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const cursorLoader = path.join(root, 'packages/provider-bridge-transport/cursor-adapter-loader.mjs')
const cursorSource = fs.readFileSync(cursorLoader, 'utf8')
assert.doesNotMatch(cursorSource, /tsx|TASKWEAVER_OPENCODEX_ROOT/i, 'Cursor adapter loading must not depend on the vendored source or a TS runtime')
assert.match(cursorSource, /@taskweaver\/provider-bridge/, 'Cursor adapter must load the owned package')

const googleLoader = path.join(root, 'packages/provider-bridge-transport/google-adapter-loader.mjs')
const googleSource = fs.readFileSync(googleLoader, 'utf8')
assert.match(googleSource, /dist', 'cjs', 'api', 'index\.cjs'/, 'transitional Google adapter loader must prefer tsx CJS register')

const workspaceTsx = path.join(root, 'node_modules/tsx')
assert.ok(fs.existsSync(path.join(workspaceTsx, 'dist/cjs/api/index.cjs')), `missing root workspace tsx package at ${workspaceTsx}`)

const nodeBin = scriptHostNodeExecutable()
const snippet = `
import { ensureGoogleAdapterLoader } from ${JSON.stringify(googleLoader)};
ensureGoogleAdapterLoader();
console.log('tsx-loader-ok');
`
const result = spawnSync(nodeBin, ['--input-type=module', '-e', snippet], {
  env: process.env,
  encoding: 'utf8',
})
assert.equal(result.status, 0, `Host Node tsx loader failed:\n${result.stderr}\n${result.stdout}`)
assert.match(result.stdout, /tsx-loader-ok/)

console.log('test-bridge-tsx-loader: Cursor package is loader-free; transitional Google loader ok')
