#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const mainCjs = fs.readFileSync(path.join(root, 'electron/main.cjs'), 'utf8')
const ipcUtils = fs.readFileSync(path.join(root, 'electron/backend/ipc-utils.mjs'), 'utf8')
const hookTrustSources = [
  'electron/backend/register-ipc.mjs',
  'electron/backend/ipc/wire-backend-ipc.mjs',
  'electron/backend/chat-turn-pipeline.mjs',
  'electron/backend/scheduled-job-run.mjs',
].map((rel) => fs.readFileSync(path.join(root, rel), 'utf8')).join('\n')
const hookRunner = fs.readFileSync(path.join(root, 'electron/backend/taskweaver-hook-runner.mjs'), 'utf8')
const viteConfig = fs.readFileSync(path.join(root, 'vite.config.ts'), 'utf8')

assert.match(mainCjs, /setWindowOpenHandler/, 'main.cjs must deny window.open and open externally')
assert.match(mainCjs, /will-navigate/, 'main.cjs must block external navigation')
assert.match(mainCjs, /will-attach-webview/, 'main.cjs must block webview attachment')
assert.match(ipcUtils, /assertTrustedSender|senderFrame/, 'ipc-utils must validate IPC sender frame')
assert.match(viteConfig, /Content-Security-Policy|PACKAGED_CSP/, 'vite build must inject CSP for packaged HTML')
assert.match(hookRunner, /workspaceTrusted/, 'hooks must respect workspace trust')
assert.match(
  hookTrustSources,
  /workspaceTrusted:\s*runtimeContext\.workspaceTrusted|workspaceHooksTrusted/,
  'chat/scheduled IPC paths must gate workspace hooks on trust',
)
assert.match(mainCjs, /sandbox:\s*true/, 'main.cjs should enable renderer sandbox')

console.log('check-electron-hardening: ok')
