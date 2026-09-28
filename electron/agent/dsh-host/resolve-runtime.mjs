import fs from 'node:fs'
import path from 'node:path'

function runtimeLooksUsable(root) {
  if (!root || !fs.existsSync(root)) return false
  return (
    fs.existsSync(path.join(root, 'lib', 'bin.js'))
    || fs.existsSync(path.join(root, 'apps', 'cli', 'lib', 'bin.js'))
  )
}

/**
 * Resolve the DSH runtime. Packaged builds are deliberately hermetic: they may
 * only use the runtime copied into Electron's resources directory. Development
 * and tests may use an explicit override or the in-repository source/build.
 */
export function resolveDshRuntimeRoot({ appPath, resourcesPath, isPackaged, env = process.env }) {
  if (isPackaged) {
    if (!resourcesPath) {
      throw new Error('TaskWeaver 安装包无法定位 Electron resources 目录；拒绝回退加载外部 DSH runtime。')
    }
    const bundled = path.join(resourcesPath, 'taskweaver-dsh-runtime')
    if (runtimeLooksUsable(bundled)) return bundled
    throw new Error(
      `TaskWeaver 安装包缺少 DSH runtime：${bundled}。请重新构建/安装应用，不能从仓库或用户目录回退加载。`,
    )
  }

  const candidates = []
  if (typeof env.TASKWEAVER_DSH_RUNTIME === 'string' && env.TASKWEAVER_DSH_RUNTIME.trim()) {
    candidates.push(path.resolve(env.TASKWEAVER_DSH_RUNTIME.trim()))
  }
  if (appPath) {
    candidates.push(path.join(appPath, 'vendor', 'taskweaver-dsh-runtime'))
    candidates.push(path.join(appPath, 'dsh-source'))
  }
  for (const root of candidates) {
    if (runtimeLooksUsable(root)) return root
  }
  throw new Error(
    `找不到可运行的 DSH runtime。已检查：${candidates.length ? candidates.join(', ') : '无候选路径'}。开发/测试可设置 TASKWEAVER_DSH_RUNTIME。`,
  )
}

/** Entry script + process cwd for Node module resolution. */
export function resolveDshHostLaunch(runtimeRoot) {
  const deployed = path.join(runtimeRoot, 'lib', 'bin.js')
  if (fs.existsSync(deployed)) {
    return { entrypoint: deployed, cwd: runtimeRoot }
  }
  const monorepo = path.join(runtimeRoot, 'apps', 'cli', 'lib', 'bin.js')
  if (fs.existsSync(monorepo)) {
    return { entrypoint: monorepo, cwd: runtimeRoot }
  }
  throw new Error(`缺少 DSH Host 构建产物（${runtimeRoot} 下无 lib/bin.js 或 apps/cli/lib/bin.js）`)
}
