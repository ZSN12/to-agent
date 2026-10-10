#!/usr/bin/env node
/**
 * TaskWeaver.app — Swift WKWebView shell + Node backend (no Electron runtime).
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outApp = path.join(root, 'release/mac-arm64/TaskWeaver.app')

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', ...opts })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

function copyDir(src, dest, filter) {
  if (!fs.existsSync(src)) return
  fs.mkdirSync(dest, { recursive: true })
  for (const name of fs.readdirSync(src)) {
    const from = path.join(src, name)
    const to = path.join(dest, name)
    if (filter && !filter(from, name)) continue
    const stat = fs.statSync(from)
    if (stat.isDirectory()) copyDir(from, to, filter)
    else fs.copyFileSync(from, to)
  }
}

console.log('[build-macos-shell-app] build web + host runtime…')
run('pnpm', ['run', 'build'])
run('node', ['scripts/validate-model-registry.mjs'])
if (!fs.existsSync(path.join(root, 'packages/runtime/host-cli/lib/bin.js'))) {
  console.error('需要先 pnpm run build:host')
  process.exit(1)
}
run('node', ['scripts/build-host-runtime.mjs'])
run('node', ['scripts/ensure-host-node.mjs'])

console.log('[build-macos-shell-app] swift build…')
const swiftBin = path.join(root, 'apps/macos/TaskWeaverShell/.build/release/TaskWeaverShell')
run('swift', ['build', '-c', 'release'], { cwd: path.join(root, 'apps/macos/TaskWeaverShell') })
if (!fs.existsSync(swiftBin)) {
  console.error('Swift 产物缺失:', swiftBin)
  process.exit(1)
}

const payloadRoot = path.join(root, 'release/shell-app-payload/app')
fs.rmSync(path.join(root, 'release/shell-app-payload'), { recursive: true, force: true })
fs.mkdirSync(payloadRoot, { recursive: true })

const copyNames = ['dist', 'desktop', 'pricing', 'registry', 'runtime-lock.json', 'package.json']
for (const name of copyNames) {
  const src = path.join(root, name)
  if (fs.existsSync(src)) {
    const dest = path.join(payloadRoot, name)
    if (fs.statSync(src).isDirectory()) copyDir(src, dest)
    else fs.copyFileSync(src, dest)
  }
}

console.log('[build-macos-shell-app] 复制 node_modules（生产依赖）…')
copyDir(path.join(root, 'node_modules'), path.join(payloadRoot, 'node_modules'))

const resourcesVendor = path.join(root, 'release/shell-app-payload')
copyDir(path.join(root, 'vendor/host-node'), path.join(resourcesVendor, 'host-node'))
copyDir(path.join(root, 'vendor/taskweaver-z-runtime'), path.join(resourcesVendor, 'taskweaver-z-runtime'))
copyDir(path.join(root, 'vendor/taskweaver-z-runtime'), path.join(payloadRoot, 'vendor/taskweaver-z-runtime'))

const scheduledRunner = path.join(root, 'scripts/run-scheduled-job-cli.mjs')
if (fs.existsSync(scheduledRunner)) {
  fs.mkdirSync(resourcesVendor, { recursive: true })
  fs.copyFileSync(scheduledRunner, path.join(resourcesVendor, 'taskweaver-scheduled-runner.mjs'))
}

fs.rmSync(outApp, { recursive: true, force: true })
fs.mkdirSync(path.join(outApp, 'Contents/MacOS'), { recursive: true })
fs.mkdirSync(path.join(outApp, 'Contents/Resources'), { recursive: true })

fs.copyFileSync(swiftBin, path.join(outApp, 'Contents/MacOS/TaskWeaver'))
fs.chmodSync(path.join(outApp, 'Contents/MacOS/TaskWeaver'), 0o755)
copyDir(path.join(root, 'release/shell-app-payload'), path.join(outApp, 'Contents/Resources'))

fs.writeFileSync(
  path.join(outApp, 'Contents/Info.plist'),
  `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleExecutable</key><string>TaskWeaver</string>
  <key>CFBundleIdentifier</key><string>com.taskweaver.desktop</string>
  <key>CFBundleName</key><string>TaskWeaver</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>1.2.1</string>
  <key>CFBundleVersion</key><string>1.2.1</string>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
  <key>NSHighResolutionCapable</key><true/>
</dict></plist>`,
)

console.log(`[build-macos-shell-app] 完成: ${outApp}`)
