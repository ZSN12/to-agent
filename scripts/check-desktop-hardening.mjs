#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizeMarkdownUrl } from '../src/shared/markdown-url.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ipcUtils = fs.readFileSync(path.join(root, 'desktop/backend/ipc-utils.mjs'), 'utf8')
const shellPlatform = fs.readFileSync(path.join(root, 'desktop/platform/shell-platform.mjs'), 'utf8')
const bootstrap = fs.readFileSync(path.join(root, 'src/shell/bootstrap.ts'), 'utf8')
const shellBridge = fs.readFileSync(path.join(root, 'src/shell/taskweaver-shell-bridge.generated.ts'), 'utf8')
const markdown = fs.readFileSync(path.join(root, 'src/features/chat/AgentMessageMarkdown.tsx'), 'utf8')
const workspaceTrustUi = fs.readFileSync(path.join(root, 'src/features/composer/ProjectSelector.tsx'), 'utf8')
const verificationPolicy = fs.readFileSync(path.join(root, 'desktop/backend/verification-policy.mjs'), 'utf8')
const hookTrustSources = [
  'desktop/backend/register-ipc.mjs',
  'desktop/backend/ipc/wire-backend-ipc.mjs',
  'desktop/backend/chat-turn-pipeline.mjs',
  'desktop/backend/scheduled-job-run.mjs',
].map((rel) => fs.readFileSync(path.join(root, rel), 'utf8')).join('\n')
const hookRunner = fs.readFileSync(path.join(root, 'desktop/backend/taskweaver-hook-runner.mjs'), 'utf8')
const viteConfig = fs.readFileSync(path.join(root, 'vite.config.ts'), 'utf8')
const httpServer = fs.readFileSync(path.join(root, 'desktop/shell/http-server.mjs'), 'utf8')

assert.match(ipcUtils, /assertTrustedSender|senderFrame/, 'ipc-utils must validate IPC sender frame')
assert.match(ipcUtils, /isShellBackend/, 'ipc-utils must allow trusted shell HTTP invoke path')
assert.match(shellPlatform, /isEncryptionAvailable:\s*\(\)\s*=>\s*false/, 'shell platform must not fake Chromium safeStorage')
assert.match(bootstrap, /installNativeShellBridge/, 'renderer must install shell HTTP bridge when preload is absent')
assert.match(shellBridge, /\/shell\/v1\/invoke/, 'generated shell bridge must call shell HTTP API')
assert.match(httpServer, /127\.0\.0\.1|host/, 'shell HTTP server must bind loopback by default')
assert.match(viteConfig, /Content-Security-Policy|PACKAGED_CSP/, 'vite build must inject CSP for packaged HTML')
assert.match(hookRunner, /workspaceTrusted/, 'hooks must respect workspace trust')
assert.match(
  hookTrustSources,
  /workspaceTrusted:\s*runtimeContext\.workspaceTrusted|workspaceHooksTrusted/,
  'chat/scheduled IPC paths must gate workspace hooks on trust',
)
assert.match(markdown, /urlTransform=\{normalizeMarkdownUrl\}/, 'Markdown must transform every URL before rendering')
assert.match(workspaceTrustUi, /project-trust-confirm/, 'workspace trust changes must require UI confirmation')
assert.match(verificationPolicy, /VERIFICATION_ENV_ALLOWLIST/, 'verification commands must use an environment allowlist')
assert.doesNotMatch(verificationPolicy, /OPENAI_API_KEY|ANTHROPIC_API_KEY|GITHUB_TOKEN/, 'verification environment must not forward credentials')
assert.doesNotMatch(hookTrustSources, /assertNotBusy\(\s*\)/, 'assertNotBusy calls must include a conversation ID')

for (const [value, expected] of [
  ['https://example.com/path', 'https://example.com/path'],
  ['http://example.com', 'http://example.com/'],
  ['mailto:person@example.com', 'mailto:person@example.com'],
  ['javascript:alert(1)', ''],
  ['data:text/html,unsafe', ''],
  ['file:///etc/passwd', ''],
  ['//example.com/path', ''],
  ['../relative/path', ''],
  ['https://user:password@example.com', ''],
]) {
  assert.equal(normalizeMarkdownUrl(value), expected, `unexpected Markdown URL handling for ${value.split(':')[0]}`)
}

console.log('check-desktop-hardening: ok')
