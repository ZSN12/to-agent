import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const releaseDir = path.join(root, 'release')

function findAppBundle(dir) {
  if (!fs.existsSync(dir)) return null
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name)
    if (name.endsWith('.app') && fs.statSync(full).isDirectory()) return full
    if (fs.statSync(full).isDirectory()) {
      const nested = findAppBundle(full)
      if (nested) return nested
    }
  }
  return null
}

function resolveSourceBundle() {
  const configuredBundle = process.env.TASKWEAVER_APP_BUNDLE
  if (configuredBundle) {
    return path.isAbsolute(configuredBundle)
      ? path.resolve(configuredBundle)
      : path.resolve(root, configuredBundle)
  }
  // `pnpm run app` builds the current Swift shell + bundled React UI here.
  const currentNativeBundle = path.join(root, 'apps/macos/build/TaskWeaver.app')
  if (fs.existsSync(currentNativeBundle)) return currentNativeBundle
  const localApp = path.join(root, 'TaskWeaver.app')
  if (fs.existsSync(localApp)) {
    try {
      const stat = fs.lstatSync(localApp)
      if (stat.isSymbolicLink()) return fs.realpathSync(localApp)
    } catch {
      /* ignore */
    }
    if (fs.statSync(localApp).isDirectory()) return localApp
  }
  return null
}

const bundle = resolveSourceBundle()
if (!bundle) {
  console.error('未找到当前原生 TaskWeaver.app，请先运行: pnpm run app')
  process.exit(1)
}

const systemApps = '/Applications/TaskWeaver.app'
const userApps = path.join(process.env.HOME ?? '', 'Applications', 'TaskWeaver.app')

function installTo(dest) {
  const parent = path.dirname(dest)
  fs.mkdirSync(parent, { recursive: true })
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
  const staging = path.join(parent, `.${path.basename(dest)}.installing-${process.pid}`)
  const previous = path.join(parent, `${path.basename(dest)}.previous-${stamp}`)
  if (fs.existsSync(staging) || fs.existsSync(previous)) {
    throw new Error(`安装临时路径已存在，拒绝覆盖：${staging}`)
  }
  // Electron frameworks contain relative symlinks (for example
  // Versions/Current -> A). Node's default copy behavior rewrites these to
  // absolute paths in the build directory, leaving the installed app tied to
  // this repository and breaking Chromium helper processes on launch.
  fs.cpSync(bundle, staging, { recursive: true, verbatimSymlinks: true })
  let movedCurrent = false
  if (fs.existsSync(dest)) {
    fs.renameSync(dest, previous)
    movedCurrent = true
  }
  try {
    fs.renameSync(staging, dest)
  } catch (error) {
    if (movedCurrent && fs.existsSync(previous) && !fs.existsSync(dest)) {
      fs.renameSync(previous, dest)
    }
    throw error
  }
  return movedCurrent ? previous : null
}

let installedPath = null
let previousPath = null
try {
  previousPath = installTo(systemApps)
  installedPath = systemApps
} catch (error) {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : ''
  if (code !== 'EACCES' && code !== 'EPERM') throw error
  console.warn('无法写入 /Applications（需要管理员权限），将安装到用户「应用程序」文件夹。')
  previousPath = installTo(userApps)
  installedPath = userApps
}

console.log(`已安装: ${installedPath}`)
if (previousPath) console.log(`旧版本已保留，可用于回退: ${previousPath}`)
console.log('Finder 侧边栏「应用程序」对应 /Applications；若在用户目录安装，请打开：')
console.log(`  ${userApps}`)
console.log('或在访达按 ⌘⇧G，输入上述路径。')
console.log('项目内也可双击: ' + path.join(root, 'TaskWeaver.app'))

if (process.platform === 'darwin' && process.env.TASKWEAVER_INSTALL_OPEN !== '0') {
  spawnSync('open', [installedPath], { stdio: 'inherit' })
}
