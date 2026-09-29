import fs from 'node:fs'
import path from 'node:path'

/** Deployed runtime deps dir (not named node_modules — electron-builder strips that from extraResources). */
export const TASKWEAVER_DSH_RUNTIME_PACKAGES = 'runtime-packages'

/** Same layout as DSH deploy; used when loading from `vendor/z-runtime` (Phase 2+). */
export const TASKWEAVER_Z_RUNTIME_PACKAGES = 'runtime-packages'

function runtimeLooksUsable(root) {
  if (!root || !fs.existsSync(root)) return false
  return (
    fs.existsSync(path.join(root, 'lib', 'bin.js'))
    || fs.existsSync(path.join(root, 'apps', 'cli', 'lib', 'bin.js'))
  )
}

/** Deploy output from `TASKWEAVER_USE_Z_RUNTIME=1` uses `@z/*` under runtime-packages. */
export function deployedRuntimeHasZPackages(runtimeRoot) {
  if (!runtimeRoot || !fs.existsSync(runtimeRoot)) return false
  const zScope = path.join(runtimeRoot, TASKWEAVER_Z_RUNTIME_PACKAGES, '@z')
  if (!fs.existsSync(zScope)) return false
  if (fs.existsSync(path.join(zScope, 'dsh', 'package.json'))) return true
  try {
    return fs.readdirSync(zScope).some((name) => {
      if (!name.startsWith('dsh')) return false
      return fs.existsSync(path.join(zScope, name, 'package.json'))
    })
  } catch {
    return false
  }
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @param {{ appPath?: string, resourcesPath?: string | null, isPackaged?: boolean }} [hints]
 * @returns {boolean}
 */
export function useZRuntime(env = process.env, hints = {}) {
  const flag = env.TASKWEAVER_USE_Z_RUNTIME
  if (flag === '0' || flag === 'false') return false
  if (flag === '1' || flag === 'true') return true
  const appPath = hints.appPath ?? env.TASKWEAVER_APP_PATH
  const resourcesPath = hints.resourcesPath
  const isPackaged = hints.isPackaged ?? false
  if (isPackaged && resourcesPath) {
    const bundled = path.join(resourcesPath, 'taskweaver-dsh-runtime')
    if (deployedRuntimeHasZPackages(bundled)) return true
  }
  if (appPath) {
    const deploy = path.join(appPath, 'vendor', 'taskweaver-dsh-runtime')
    if (deployedRuntimeHasZPackages(deploy)) return true
    if (fs.existsSync(path.join(appPath, 'vendor', 'z-runtime', 'apps', 'cli', 'lib', 'bin.js'))) {
      return true
    }
  }
  return false
}

/**
 * Active runtime root for new integration code. Existing `dsh-host` callers keep using
 * `resolveDshRuntimeRoot` until imports move to `z-host` and packaging switches (Phase 2+).
 */
export function resolveTaskWeaverRuntimeRoot(options) {
  const env = options?.env ?? process.env
  return useZRuntime(env, options) ? resolveZRuntimeRoot(options) : resolveDshRuntimeRoot(options)
}

/**
 * Directory Node should resolve packages from for a deployed TaskWeaver runtime.
 * @returns {string | undefined}
 */
export function resolveDshRuntimeNodePath(runtimeRoot) {
  if (!runtimeRoot) return undefined
  const packaged = path.join(runtimeRoot, TASKWEAVER_DSH_RUNTIME_PACKAGES)
  if (fs.existsSync(packaged)) return packaged
  const classic = path.join(runtimeRoot, 'node_modules')
  if (fs.existsSync(classic)) return classic
  return undefined
}

/** @see resolveDshRuntimeNodePath — Z runtime uses the same on-disk layout. */
export function resolveZRuntimeNodePath(runtimeRoot) {
  if (!runtimeRoot) return undefined
  const packaged = path.join(runtimeRoot, TASKWEAVER_Z_RUNTIME_PACKAGES)
  if (fs.existsSync(packaged)) return packaged
  const classic = path.join(runtimeRoot, 'node_modules')
  if (fs.existsSync(classic)) return classic
  return undefined
}

/**
 * @param {{
 *   appPath?: string
 *   resourcesPath?: string | null
 *   isPackaged: boolean
 *   env?: NodeJS.ProcessEnv
 *   bundledResourcesDir: string
 *   envOverrideVar: string
 *   vendorDirName: string
 *   monorepoFallbackSubpath?: string
 *   productLabel: string
 * }} spec
 */
function resolveRuntimeRootFromSpec({
  appPath,
  resourcesPath,
  isPackaged,
  env = process.env,
  bundledResourcesDir,
  envOverrideVar,
  vendorDirName,
  monorepoFallbackSubpath,
  productLabel,
}) {
  if (isPackaged) {
    if (!resourcesPath) {
      throw new Error(
        `TaskWeaver 安装包无法定位 Electron resources 目录；拒绝回退加载外部 ${productLabel} runtime。`,
      )
    }
    const bundled = path.join(resourcesPath, bundledResourcesDir)
    if (runtimeLooksUsable(bundled)) return bundled
    throw new Error(
      `TaskWeaver 安装包缺少 ${productLabel} runtime：${bundled}。请重新构建/安装应用，不能从仓库或用户目录回退加载。`,
    )
  }

  const candidates = []
  const override = env[envOverrideVar]
  if (typeof override === 'string' && override.trim()) {
    candidates.push(path.resolve(override.trim()))
  }
  if (appPath) {
    candidates.push(path.join(appPath, 'vendor', vendorDirName))
    if (monorepoFallbackSubpath) {
      candidates.push(path.join(appPath, monorepoFallbackSubpath))
    }
  }
  for (const root of candidates) {
    if (runtimeLooksUsable(root)) return root
  }
  throw new Error(
    `找不到可运行的 ${productLabel} runtime。已检查：${candidates.length ? candidates.join(', ') : '无候选路径'}。开发/测试可设置 ${envOverrideVar}。`,
  )
}

/**
 * Resolve the DSH runtime. Packaged builds are deliberately hermetic: they may
 * only use the runtime copied into Electron's resources directory. Development
 * and tests may use an explicit override or the in-repository source/build.
 */
export function resolveDshRuntimeRoot({ appPath, resourcesPath, isPackaged, env = process.env }) {
  return resolveRuntimeRootFromSpec({
    appPath,
    resourcesPath,
    isPackaged,
    env,
    bundledResourcesDir: 'taskweaver-dsh-runtime',
    envOverrideVar: 'TASKWEAVER_DSH_RUNTIME',
    vendorDirName: 'taskweaver-dsh-runtime',
    monorepoFallbackSubpath: 'dsh-source',
    productLabel: 'DSH',
  })
}

/**
 * Resolve the Z runtime. Deploy + electron-builder still stage `taskweaver-dsh-runtime`
 * (with `@z/*` in runtime-packages); dev may fall back to the `vendor/z-runtime` monorepo.
 */
export function resolveZRuntimeRoot({ appPath, resourcesPath, isPackaged, env = process.env }) {
  return resolveRuntimeRootFromSpec({
    appPath,
    resourcesPath,
    isPackaged,
    env,
    bundledResourcesDir: 'taskweaver-dsh-runtime',
    envOverrideVar: 'TASKWEAVER_Z_RUNTIME',
    vendorDirName: 'taskweaver-dsh-runtime',
    monorepoFallbackSubpath: path.join('vendor', 'z-runtime'),
    productLabel: 'Z',
  })
}

/** Entry script + process cwd for Node module resolution. */
export function resolveDshHostLaunch(runtimeRoot) {
  const deployedEntry = path.join(runtimeRoot, 'lib', 'entry.js')
  const deployedBin = path.join(runtimeRoot, 'lib', 'bin.js')
  const deployed = fs.existsSync(deployedEntry) ? deployedEntry : deployedBin
  if (fs.existsSync(deployed)) {
    return {
      entrypoint: deployed,
      cwd: runtimeRoot,
      nodePath: resolveDshRuntimeNodePath(runtimeRoot),
    }
  }
  const monorepo = path.join(runtimeRoot, 'apps', 'cli', 'lib', 'bin.js')
  if (fs.existsSync(monorepo)) {
    return {
      entrypoint: monorepo,
      cwd: runtimeRoot,
      nodePath: resolveDshRuntimeNodePath(runtimeRoot),
    }
  }
  throw new Error(`缺少 DSH Host 构建产物（${runtimeRoot} 下无 lib/bin.js 或 apps/cli/lib/bin.js）`)
}

/** Same entry layout as DSH; uses `resolveZRuntimeNodePath` for `@z/*` under `runtime-packages`. */
export function resolveZHostLaunch(runtimeRoot) {
  const deployedEntry = path.join(runtimeRoot, 'lib', 'entry.js')
  const deployedBin = path.join(runtimeRoot, 'lib', 'bin.js')
  const deployed = fs.existsSync(deployedEntry) ? deployedEntry : deployedBin
  if (fs.existsSync(deployed)) {
    return {
      entrypoint: deployed,
      cwd: runtimeRoot,
      nodePath: resolveZRuntimeNodePath(runtimeRoot),
    }
  }
  const monorepo = path.join(runtimeRoot, 'apps', 'cli', 'lib', 'bin.js')
  if (fs.existsSync(monorepo)) {
    return {
      entrypoint: monorepo,
      cwd: runtimeRoot,
      nodePath: resolveZRuntimeNodePath(runtimeRoot),
    }
  }
  throw new Error(`缺少 Z Host 构建产物（${runtimeRoot} 下无 lib/bin.js 或 apps/cli/lib/bin.js）`)
}
