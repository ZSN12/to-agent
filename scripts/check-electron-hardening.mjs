#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizeMarkdownUrl } from '../src/shared/markdown-url.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const mainCjs = fs.readFileSync(path.join(root, 'electron/main.cjs'), 'utf8')
const ipcUtils = fs.readFileSync(path.join(root, 'electron/backend/ipc-utils.mjs'), 'utf8')
const preload = fs.readFileSync(path.join(root, 'electron/preload.cjs'), 'utf8')
const markdown = fs.readFileSync(path.join(root, 'src/features/chat/AgentMessageMarkdown.tsx'), 'utf8')
const workspaceTrustUi = fs.readFileSync(path.join(root, 'src/features/composer/ProjectSelector.tsx'), 'utf8')
const verificationPolicy = fs.readFileSync(path.join(root, 'electron/backend/verification-policy.mjs'), 'utf8')
const hookTrustSources = [
  'electron/backend/register-ipc.mjs',
  'electron/backend/ipc/wire-backend-ipc.mjs',
  'electron/backend/chat-turn-pipeline.mjs',
  'electron/backend/scheduled-job-run.mjs',
].map((rel) => fs.readFileSync(path.join(root, rel), 'utf8')).join('\n')
const hookRunner = fs.readFileSync(path.join(root, 'electron/backend/taskweaver-hook-runner.mjs'), 'utf8')
const viteConfig = fs.readFileSync(path.join(root, 'vite.config.ts'), 'utf8')

assert.match(mainCjs, /setWindowOpenHandler/, 'main.cjs must deny window.open and open externally')
assert.match(mainCjs, /https\?:\\\/\\\/\|mailto:/, 'external windows must allow only http(s) and mailto')
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
assert.match(preload, /contextBridge\.exposeInMainWorld/, 'preload must expose a narrow context bridge')
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

const secretPatterns = [
  ['AWS access key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g],
  ['Slack token', /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/g],
  ['OpenAI API key', /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/g],
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
]

function findSecrets(source) {
  return secretPatterns.filter(([, pattern]) => {
    pattern.lastIndex = 0
    return pattern.test(source)
  }).map(([kind]) => kind)
}

const canary = `AKIA${'1234567890ABCDEF'}`
assert.ok(findSecrets(canary).includes('AWS access key'), 'secret scanner must detect its synthetic canary')

function scanSourceTree(directory, relative = '') {
  const findings = []
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const rel = path.join(relative, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue
      findings.push(...scanSourceTree(path.join(directory, entry.name), rel))
      continue
    }
    if (!entry.isFile() || !/\.(?:[cm]?[jt]sx?|json|ya?ml|sh)$/.test(entry.name)) continue
    if (/(?:^|\/)(?:test|tests|__tests__)(?:\/|$)/.test(rel) || /(?:^|\/)test-[^/]+\.[^/]+$/.test(rel)) continue
    const kinds = findSecrets(fs.readFileSync(path.join(root, rel), 'utf8'))
    for (const kind of kinds) findings.push({ path: rel, kind })
  }
  return findings
}

const secretFindings = ['electron', 'src', 'scripts', '.github']
  .flatMap((directory) => scanSourceTree(path.join(root, directory), directory))
if (secretFindings.length) {
  console.error('check-electron-hardening: possible credentials found (values redacted)')
  for (const finding of secretFindings) console.error(`  ${finding.path}: ${finding.kind}`)
  process.exitCode = 1
  process.exit()
}

console.log('check-electron-hardening: ok (link policy, P1 checks, and secret scan)')
