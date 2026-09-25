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
  const fromRelease = findAppBundle(releaseDir)
  const localApp = path.join(root, 'TaskWeaver.app')
  if (fromRelease) return fromRelease
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
  console.error('未找到 TaskWeaver.app，请先运行: npm run app')
  process.exit(1)
}

const systemApps = '/Applications/TaskWeaver.app'
const userApps = path.join(process.env.HOME ?? '', 'Applications', 'TaskWeaver.app')

function installTo(dest) {
  if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true })
  // Electron frameworks contain relative symlinks (for example
  // Versions/Current -> A). Node's default copy behavior rewrites these to
  // absolute paths in the build directory, leaving the installed app tied to
  // this repository and breaking Chromium helper processes on launch.
  fs.cpSync(bundle, dest, { recursive: true, verbatimSymlinks: true })
}

let installedPath = null
try {
  installTo(systemApps)
  installedPath = systemApps
} catch (error) {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : ''
  if (code !== 'EACCES' && code !== 'EPERM') throw error
  console.warn('无法写入 /Applications（需要管理员权限），将安装到用户「应用程序」文件夹。')
  installTo(userApps)
  installedPath = userApps
}

console.log(`已安装: ${installedPath}`)
console.log('Finder 侧边栏「应用程序」对应 /Applications；若在用户目录安装，请打开：')
console.log(`  ${userApps}`)
console.log('或在访达按 ⌘⇧G，输入上述路径。')
console.log('项目内也可双击: ' + path.join(root, 'TaskWeaver.app'))

if (process.platform === 'darwin') {
  spawnSync('open', [installedPath], { stdio: 'inherit' })
}
