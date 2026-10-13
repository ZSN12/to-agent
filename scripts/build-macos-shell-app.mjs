#!/usr/bin/env node
/**
 * TaskWeaver.app — Swift WKWebView shell + Node backend (no Electron runtime).
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
function resolveConfiguredPath(value, fallback) {
  if (!value) return fallback
  return path.isAbsolute(value) ? path.resolve(value) : path.resolve(root, value)
}

const outApp = resolveConfiguredPath(
  process.env.TASKWEAVER_APP_OUTPUT_PATH,
  path.join(root, 'release/mac-arm64/TaskWeaver.app'),
)
const payloadRoot = resolveConfiguredPath(
  process.env.TASKWEAVER_APP_PAYLOAD_DIR,
  path.join(root, 'release/shell-app-payload'),
)
const viteOutDir = resolveConfiguredPath(process.env.TASKWEAVER_VITE_OUT_DIR, path.join(root, 'dist'))
const runtimeDeployDir = resolveConfiguredPath(
  process.env.TASKWEAVER_RUNTIME_OUTPUT_DIR,
  path.join(root, 'vendor/taskweaver-z-runtime'),
)
const isolatedOutputRequested = Boolean(
  process.env.TASKWEAVER_APP_OUTPUT_PATH
  || process.env.TASKWEAVER_APP_PAYLOAD_DIR
  || process.env.TASKWEAVER_VITE_OUT_DIR,
)

if (isolatedOutputRequested) {
  for (const outputPath of [outApp, payloadRoot, viteOutDir]) {
    if (fs.existsSync(outputPath)) {
      console.error(`拒绝覆盖已存在的隔离构建输出: ${outputPath}`)
      process.exit(1)
    }
  }
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', ...opts })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

function copyDir(src, dest, filter) {
  let stat
  try {
    stat = fs.lstatSync(src)
  } catch {
    return
  }
  if (stat.isSymbolicLink()) {
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.symlinkSync(fs.readlinkSync(src), dest)
    return
  }
  fs.mkdirSync(dest, { recursive: true })
  if (!stat.isDirectory()) {
    fs.copyFileSync(src, dest)
    return
  }
  for (const name of fs.readdirSync(src)) {
    const from = path.join(src, name)
    const to = path.join(dest, name)
    if (filter && !filter(from, name)) continue
    const entryStat = fs.lstatSync(from)
    if (entryStat.isSymbolicLink() || entryStat.isDirectory()) copyDir(from, to, filter)
    else fs.copyFileSync(from, to)
  }
}

console.log('[build-macos-shell-app] build web + host runtime…')
run('node', ['scripts/gen-shell-bridge.mjs'])
run('node', ['scripts/gen-ipc-types.mjs'])
run('node', ['scripts/verify-index-html.mjs'])
run(path.join(root, 'node_modules/.bin/tsc'), ['-b', 'tsconfig.app.json', 'tsconfig.node.json'])
run(path.join(root, 'node_modules/.bin/vite'), ['build'], {
  env: { ...process.env, TASKWEAVER_VITE_OUT_DIR: viteOutDir },
})
run('node', ['scripts/strip-html-crossorigin.mjs'], {
  env: { ...process.env, TASKWEAVER_VITE_OUT_DIR: viteOutDir },
})
run('node', ['scripts/build-host-runtime.mjs'])
run('node', ['scripts/validate-model-registry.mjs'])
if (!fs.existsSync(path.join(root, 'packages/runtime/host-cli/lib/bin.js'))) {
  console.error('需要先 pnpm run build:host')
  process.exit(1)
}
if (!fs.existsSync(runtimeDeployDir)) {
  console.error('Z Runtime 构建产物缺失:', runtimeDeployDir)
  process.exit(1)
}
run('node', ['scripts/ensure-host-node.mjs'])

console.log('[build-macos-shell-app] swift build…')
const swiftBin = path.join(root, 'apps/macos/TaskWeaverShell/.build/release/TaskWeaverShell')
run('swift', ['build', '-c', 'release'], { cwd: path.join(root, 'apps/macos/TaskWeaverShell') })
if (!fs.existsSync(swiftBin)) {
  console.error('Swift 产物缺失:', swiftBin)
  process.exit(1)
}

const payloadAppRoot = path.join(payloadRoot, 'app')
// This is a generated staging tree. Clear stale partial files from an earlier
// failed build so symlinks and repeated copies cannot collide with new payloads.
fs.rmSync(payloadRoot, { recursive: true, force: true })
fs.mkdirSync(payloadAppRoot, { recursive: true })

const copyNames = ['dist', 'backend', 'contract', 'pricing', 'registry', 'runtime-lock.json', 'package.json']
for (const name of copyNames) {
  const src = name === 'dist' ? viteOutDir : path.join(root, name)
  if (fs.existsSync(src)) {
    const dest = path.join(payloadAppRoot, name)
    if (fs.statSync(src).isDirectory()) copyDir(src, dest)
    else fs.copyFileSync(src, dest)
  }
}

console.log('[build-macos-shell-app] 复制 node_modules（生产依赖）…')
copyDir(path.join(root, 'node_modules'), path.join(payloadAppRoot, 'node_modules'))

const resourcesVendor = payloadRoot
copyDir(path.join(root, 'vendor/host-node'), path.join(resourcesVendor, 'host-node'))
copyDir(runtimeDeployDir, path.join(resourcesVendor, 'backend/runtime'))

const scheduledRunner = path.join(root, 'scripts/run-scheduled-job-cli.mjs')
if (fs.existsSync(scheduledRunner)) {
  fs.mkdirSync(resourcesVendor, { recursive: true })
  fs.copyFileSync(scheduledRunner, path.join(resourcesVendor, 'taskweaver-scheduled-runner.mjs'))
}

const requiredPackagePaths = [
  path.join(payloadAppRoot, 'backend/shell/run.mjs'),
  path.join(payloadAppRoot, 'contract/channels.mjs'),
  path.join(payloadAppRoot, 'dist/index.html'),
  path.join(resourcesVendor, 'host-node/bin/node'),
  path.join(resourcesVendor, 'backend/runtime/lib/entry.js'),
]
for (const requiredPath of requiredPackagePaths) {
  if (!fs.existsSync(requiredPath)) {
    throw new Error(`macOS 包缺少运行必需文件: ${requiredPath}`)
  }
}

fs.mkdirSync(path.dirname(outApp), { recursive: true })
fs.rmSync(outApp, { recursive: true, force: true })
fs.mkdirSync(path.join(outApp, 'Contents/MacOS'), { recursive: true })
fs.mkdirSync(path.join(outApp, 'Contents/Resources'), { recursive: true })

fs.copyFileSync(swiftBin, path.join(outApp, 'Contents/MacOS/TaskWeaver'))
fs.chmodSync(path.join(outApp, 'Contents/MacOS/TaskWeaver'), 0o755)
copyDir(payloadRoot, path.join(outApp, 'Contents/Resources'))

const appIconSource = path.join(root, 'apps/macos/TaskWeaverShell/Resources/AppIcon.icns')
if (!fs.existsSync(appIconSource)) {
  throw new Error(`macOS 应用图标缺失: ${appIconSource}`)
}
fs.copyFileSync(appIconSource, path.join(outApp, 'Contents/Resources/AppIcon.icns'))

fs.writeFileSync(
  path.join(outApp, 'Contents/Info.plist'),
  `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleExecutable</key><string>TaskWeaver</string>
  <key>CFBundleIdentifier</key><string>com.taskweaver.desktop</string>
  <key>CFBundleName</key><string>TaskWeaver</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleIconFile</key><string>AppIcon.icns</string>
  <key>CFBundleShortVersionString</key><string>1.2.1</string>
  <key>CFBundleVersion</key><string>1.2.1</string>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
  <key>NSHighResolutionCapable</key><true/>
</dict></plist>`,
)

console.log(`[build-macos-shell-app] 完成: ${outApp}`)
