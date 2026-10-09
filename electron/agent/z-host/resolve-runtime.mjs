import fs from 'node:fs'
import path from 'node:path'

/** Staged deploy + electron-builder extraResources directory name. */
export const TASKWEAVER_Z_RUNTIME_DEPLOY_DIR = 'taskweaver-z-runtime'

/** API client types staged beside deploy output. */
export const TASKWEAVER_Z_RUNTIME_CLIENT_DIR = 'taskweaver-z-client'

/** Deployed runtime deps dir (electron-builder strips `node_modules` from extraResources). */
export const TASKWEAVER_RUNTIME_PACKAGES = 'runtime-packages'

function runtimeLooksUsable(root) {
  if (!root || !fs.existsSync(root)) return false
  return (
    fs.existsSync(path.join(root, 'lib', 'bin.js'))
    || fs.existsSync(path.join(root, 'apps', 'cli', 'lib', 'bin.js'))
  )
}

/**
 * Directory Node should resolve packages from for a deployed TaskWeaver runtime.
 * @returns {string | undefined}
 */
export function resolveRuntimeNodePath(runtimeRoot) {
  if (!runtimeRoot) return undefined
  const packaged = path.join(runtimeRoot, TASKWEAVER_RUNTIME_PACKAGES)
  if (fs.existsSync(packaged)) return packaged
  const classic = path.join(runtimeRoot, 'node_modules')
  if (fs.existsSync(classic)) return classic
  return undefined
}

/**
 * Resolve Z runtime for TaskWeaver. Packaged builds only use Resources copy;
 * dev may override or use deploy / `vendor/z-runtime` monorepo.
 */
export function resolveTaskWeaverRuntimeRoot({
  appPath,
  resourcesPath,
  isPackaged,
  env = process.env,
}) {
  if (isPackaged) {
    if (!resourcesPath) {
      throw new Error(
        'TaskWeaver 安装包无法定位 Electron resources 目录；拒绝回退加载外部 Z runtime。',
      )
    }
    const bundled = path.join(resourcesPath, TASKWEAVER_Z_RUNTIME_DEPLOY_DIR)
    if (runtimeLooksUsable(bundled)) return bundled
    throw new Error(
      `TaskWeaver 安装包缺少 Z runtime：${bundled}。请重新构建/安装应用，不能从仓库或用户目录回退加载。`,
    )
  }

  const candidates = []
  const override = env.TASKWEAVER_Z_RUNTIME || env.TASKWEAVER_DSH_RUNTIME
  if (typeof override === 'string' && override.trim()) {
    candidates.push(path.resolve(override.trim()))
  }
  if (appPath) {
    candidates.push(path.join(appPath, 'vendor', TASKWEAVER_Z_RUNTIME_DEPLOY_DIR))
    const legacyDeploy = path.join(appPath, 'vendor', 'taskweaver-dsh-runtime')
    if (legacyDeploy !== candidates[candidates.length - 1]) {
      candidates.push(legacyDeploy)
    }
    candidates.push(path.join(appPath, 'vendor', 'z-runtime'))
  }
  for (const root of candidates) {
    if (runtimeLooksUsable(root)) return root
  }
  throw new Error(
    `找不到可运行的 Z runtime。已检查：${candidates.length ? candidates.join(', ') : '无候选路径'}。开发/测试可设置 TASKWEAVER_Z_RUNTIME（兼容 TASKWEAVER_DSH_RUNTIME）。`,
  )
}


/** Entry script + process cwd for Node module resolution. */
export function resolveTaskWeaverHostLaunch(runtimeRoot) {
  const deployedEntry = path.join(runtimeRoot, 'lib', 'entry.js')
  const deployedBin = path.join(runtimeRoot, 'lib', 'bin.js')
  const deployed = fs.existsSync(deployedEntry) ? deployedEntry : deployedBin
  if (fs.existsSync(deployed)) {
    return {
      entrypoint: deployed,
      cwd: runtimeRoot,
      nodePath: resolveRuntimeNodePath(runtimeRoot),
    }
  }
  const monorepo = path.join(runtimeRoot, 'apps', 'cli', 'lib', 'bin.js')
  if (fs.existsSync(monorepo)) {
    return {
      entrypoint: monorepo,
      cwd: runtimeRoot,
      nodePath: resolveRuntimeNodePath(runtimeRoot),
    }
  }
  throw new Error(`缺少 Z Host 构建产物（${runtimeRoot} 下无 lib/bin.js 或 apps/cli/lib/bin.js）`)
}
