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
assert.doesNotMatch(googleSource, /tsx|TASKWEAVER_OPENCODEX_ROOT|vendor\/opencodex/i, 'Antigravity adapter must not load vendored TypeScript at runtime')
assert.match(googleSource, /google-antigravity-adapter\.mjs/, 'Antigravity adapter must load the Node-native implementation')

const nodeBin = scriptHostNodeExecutable()
const snippet = `
import { loadCreateGoogleAdapter } from ${JSON.stringify(googleLoader)};
const createGoogleAdapter = await loadCreateGoogleAdapter();
if (typeof createGoogleAdapter !== 'function') throw new Error('native Google adapter export missing');
const adapter = createGoogleAdapter({ apiKey: 'token-for-test', baseUrl: 'https://example.test', project: 'project-for-test' });
const request = await adapter.buildRequest({
  modelId: 'gemini-test', stream: true,
  context: { systemPrompt: ['system'], messages: [{ role: 'user', content: 'hello' }] },
  options: {},
});
if (!request.url.endsWith('/v1internal:streamGenerateContent?alt=sse')) throw new Error('unexpected CCA request URL');
console.log('native-google-adapter-ok');
`
const result = spawnSync(nodeBin, ['--input-type=module', '-e', snippet], {
  env: process.env,
  encoding: 'utf8',
})
assert.equal(result.status, 0, `Host Node Antigravity adapter load failed:\n${result.stderr}\n${result.stdout}`)
assert.match(result.stdout, /native-google-adapter-ok/)

console.log('test-bridge-tsx-loader: Cursor and Antigravity adapters load without runtime TypeScript')
