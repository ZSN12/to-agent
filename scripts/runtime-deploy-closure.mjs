/**
 * TaskWeaver Z runtime deploy: heal pnpm-deploy package shells, relayout for electron-builder.
 * @module scripts/runtime-deploy-closure
 */
import { createRequire } from 'node:module'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import {
  resolveTaskWeaverHostLaunch,
  TASKWEAVER_RUNTIME_PACKAGES,
} from '../desktop/agent/z-host/resolve-runtime.mjs'
import { ensureTaskweaverScopeAliases } from './runtime-package-aliases.mjs'

/** Workspace packages that pnpm deploy omits but agent presets import at runtime. */
export function runtimePeerPackageNames(scope = '@taskweaver/') {
  return [`${scope}cosmokit`, `${scope}schemastery`, `${scope}dsh-workflow`]
}

/** Host wiring packages that deploy often ships as package.json-only shells (no lib/). */
export const RUNTIME_WIRING_PACKAGE_NAMES = [
  '@taskweaver/dsh-app-boot',
  '@taskweaver/tool-ui-verify',
  '@taskweaver/ui-verify',
  '@taskweaver/dsh-tool-fs-semantic-search',
  '@taskweaver/dsh-web',
  '@taskweaver/dsh-web-search-taskweaver',
  '@taskweaver/dsh-tool-web',
  '@taskweaver/dsh-tool-document',
  '@taskweaver/dsh-home-paths',
  '@taskweaver/dsh-launch-environment',
]

export function runtimeModulesDir(stagingRoot) {
  return path.join(stagingRoot, 'node_modules')
}

/** pnpm deploy hoists workspace packages under `@z/*`; imports use `@taskweaver/*`. */
function deployPackageDest(stagingRoot, packageName) {
  const shortName = packageName.split('/').pop()
  const modules = runtimeModulesDir(stagingRoot)
  const zScope = path.join(modules, '@z', shortName)
  if (fs.existsSync(path.join(modules, '@z'))) return zScope
  return path.join(modules, ...packageName.split('/'))
}

export function packageHasRunnableEntry(pkgDir) {
  const pkgJsonPath = path.join(pkgDir, 'package.json')
  if (!fs.existsSync(pkgJsonPath)) return false
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'))
    const candidates = []
    if (typeof pkg.main === 'string') candidates.push(pkg.main)
    const dotExport = pkg.exports?.['.']
    if (typeof dotExport === 'string') candidates.push(dotExport)
    else if (dotExport && typeof dotExport.default === 'string') candidates.push(dotExport.default)
    if (!candidates.length) candidates.push('index.js')
    if (candidates.some((rel) => fs.existsSync(path.join(pkgDir, rel)))) return true
    return fs.existsSync(path.join(pkgDir, 'lib/types/index.js'))
  } catch {
    return false
  }
}

function monorepoPackagePaths(scope) {
  return {
    [`${scope}dsh-workflow`]: 'workflow/workflow',
  }
}

/** tsdown/tsc split: prefer `lib/types/*.js` when valid ESM; never replace ESM with tsc CJS stubs. */
async function forceSyncLibEntryFromTypes(packageRoot) {
  const libDir = path.join(packageRoot, 'lib')
  let packageType = 'commonjs'
  try {
    packageType = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8')).type ?? 'commonjs'
  } catch {
    /* ignore */
  }
  for (const name of ['index.js', 'invariant.js']) {
    const from = path.join(libDir, 'types', name)
    const to = path.join(libDir, name)
    if (!fs.existsSync(from)) continue
    const source = await fsp.readFile(from, 'utf8')
    const looksCjs = /Object\.defineProperty\(exports,\s*['"]__esModule['"]/.test(source)
      || (source.includes('exports.') && !/\bexport\b/.test(source))
    if (packageType === 'module' && looksCjs) continue
    const destText = fs.existsSync(to) ? await fsp.readFile(to, 'utf8') : ''
    const destMissingRuntimeHomePath = name === 'index.js'
      && source.includes('runtimeHomePath')
      && !destText.includes('runtimeHomePath')
    if (!fs.existsSync(to) || destMissingRuntimeHomePath) {
      await fsp.copyFile(from, to)
    }
  }
}

/** Mirror `lib/types/**` onto `lib/**` when tsdown leaves runtime chunks under types only. */
/** tsc `lib/types` output often omits `.js` extensions; Node ESM needs them at runtime. */
async function fixEsmRelativeImportsInLib(packageRoot) {
  const libDir = path.join(packageRoot, 'lib')
  if (!fs.existsSync(libDir)) return
  for (const name of await fsp.readdir(libDir)) {
    if (!name.endsWith('.js')) continue
    const file = path.join(libDir, name)
    let text = await fsp.readFile(file, 'utf8')
    const fixed = text.replace(/from '(\.\/[^']+)'/g, (match, rel) => {
      if (rel.endsWith('.js') || rel.endsWith('.json')) return match
      if (fs.existsSync(path.join(libDir, `${rel}.js`))) return `from '${rel}.js'`
      return match
    })
    if (fixed !== text) await fsp.writeFile(file, fixed)
  }
}

async function flattenLibTypesArtifacts(packageRoot) {
  const libDir = path.join(packageRoot, 'lib')
  const typesDir = path.join(libDir, 'types')
  if (!fs.existsSync(typesDir)) return
  const walk = async (fromDir, toDir) => {
    for (const entry of await fsp.readdir(fromDir, { withFileTypes: true })) {
      const from = path.join(fromDir, entry.name)
      const to = path.join(toDir, entry.name)
      if (entry.isDirectory()) {
        await fsp.mkdir(to, { recursive: true })
        await walk(from, to)
      } else if (entry.name.endsWith('.js') && !fs.existsSync(to)) {
        await fsp.copyFile(from, to)
      }
    }
  }
  await walk(typesDir, libDir)
}

async function copyDir(from, to, filter) {
  await fsp.mkdir(to, { recursive: true })
  const entries = await fsp.readdir(from, { withFileTypes: true })
  for (const entry of entries) {
    const src = path.join(from, entry.name)
    const dest = path.join(to, entry.name)
    if (filter && !filter(src)) continue
    if (entry.isDirectory()) await copyDir(src, dest, filter)
    else await fsp.copyFile(src, dest)
  }
}

function countLibJsFiles(packageRoot) {
  const libDir = path.join(packageRoot, 'lib')
  if (!fs.existsSync(libDir)) return 0
  let count = 0
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith('.js')) count += 1
    }
  }
  walk(libDir)
  return count
}

function monorepoLibNewerThan(monorepoPkgDir, deployPkgDir) {
  const srcCount = countLibJsFiles(monorepoPkgDir)
  const destCount = countLibJsFiles(deployPkgDir)
  if (srcCount > destCount) return true
  const srcIndex = path.join(monorepoPkgDir, 'lib', 'index.js')
  const destIndex = path.join(deployPkgDir, 'lib', 'index.js')
  if (!fs.existsSync(srcIndex) || !fs.existsSync(destIndex)) return false
  return fs.statSync(srcIndex).mtimeMs > fs.statSync(destIndex).mtimeMs
}

function resolvePackageDir(monorepoRoot, stagingRoot, packageName, desktopRepoRoot) {
  const candidates = []
  const roots = [stagingRoot, monorepoRoot].filter(Boolean)
  for (const rootDir of roots) {
    try {
      const launch = resolveTaskWeaverHostLaunch(rootDir)
      const require = createRequire(launch.entrypoint)
      candidates.push(path.dirname(require.resolve(`${packageName}/package.json`)))
    } catch {
      /* try next root */
    }
  }
  if (monorepoRoot) {
    const scope = packageName.startsWith('@taskweaver/') ? '@taskweaver/' : '@deepseek-ai/'
    const rel = monorepoPackagePaths(scope)[packageName]
    if (rel) candidates.push(path.join(monorepoRoot, rel))
    const pending = [monorepoRoot]
    while (pending.length) {
      const current = pending.pop()
      if (!current) continue
      const packageJson = path.join(current, 'package.json')
      if (fs.existsSync(packageJson)) {
        try {
          if (JSON.parse(fs.readFileSync(packageJson, 'utf8')).name === packageName) {
            candidates.push(current)
            break
          }
        } catch {
          /* malformed manifest */
        }
      }
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        if (!entry.isDirectory() || ['node_modules', '.git', 'lib', 'dist'].includes(entry.name)) continue
        pending.push(path.join(current, entry.name))
      }
    }
  }
  if (desktopRepoRoot) {
    const npmDir = resolveNpmPackageDir(desktopRepoRoot, packageName)
    if (npmDir) candidates.push(npmDir)
    const short = packageName.split('/').pop()
    const desktopPkg = path.join(desktopRepoRoot, 'packages', short)
    if (fs.existsSync(path.join(desktopPkg, 'package.json'))) candidates.push(desktopPkg)
  }
  for (const dir of candidates) {
    if (packageHasRunnableEntry(dir)) return dir
  }
  return null
}

function resolveNpmPackageDir(desktopRepoRoot, packageName) {
  const candidates = [
    path.join(desktopRepoRoot, 'node_modules', packageName),
    path.join(desktopRepoRoot, 'packages', 'runtime', 'node_modules', packageName),
  ]
  for (const dir of candidates) {
    if (packageHasRunnableEntry(dir)) return dir
  }
  return null
}

/**
 * Copy a built workspace package into deploy `node_modules` (or `runtime-packages` after relayout).
 * Replaces package.json-only shells left by pnpm deploy.
 */
export async function copyPackageIntoStaging(monorepoRoot, stagingRoot, packageName, desktopRepoRoot) {
  const dest = deployPackageDest(stagingRoot, packageName)
  if (packageHasRunnableEntry(dest)) return true
  if (fs.existsSync(dest)) {
    await fsp.rm(dest, { recursive: true, force: true })
  }
  const pkgDir = resolvePackageDir(monorepoRoot, stagingRoot, packageName, desktopRepoRoot)
  if (!pkgDir) return false
  await fsp.mkdir(path.dirname(dest), { recursive: true })
  await copyDir(pkgDir, dest, (p) => {
    const rel = path.relative(pkgDir, p)
    return !rel.split(path.sep).includes('node_modules')
  })
  await forceSyncLibEntryFromTypes(dest)
  await promoteModularTypesLib(dest)
  await flattenLibTypesArtifacts(dest)
  await fixEsmRelativeImportsInLib(dest)
  if (!packageHasRunnableEntry(dest) && fs.existsSync(path.join(dest, 'lib/types/index.js'))) {
    await promoteModularTypesLib(dest)
    await flattenLibTypesArtifacts(dest)
    await fixEsmRelativeImportsInLib(dest)
  }
  return packageHasRunnableEntry(dest)
}

/** tsdown `lib/index.js` bundles can lag `lib/types/`; prefer modular ESM types entry when bundled lib is stale. */
async function promoteModularTypesLib(packageRoot) {
  const typesIndex = path.join(packageRoot, 'lib/types/index.js')
  const libIndex = path.join(packageRoot, 'lib/index.js')
  if (!fs.existsSync(typesIndex) || !fs.existsSync(libIndex)) return
  const typesText = await fsp.readFile(typesIndex, 'utf8')
  const libText = await fsp.readFile(libIndex, 'utf8')
  if (typesText.includes('#region')) return
  const typesModular = typesText.includes('./config/')
    || typesText.includes("export const name = 'taskweaver-api-host'")
  const libStaleBundle = libText.includes('#region')
    || libText.includes('dsh-host-frontend-static')
  if (typesModular && (libStaleBundle || typesText.includes('./config/'))) {
    await fsp.copyFile(typesIndex, libIndex)
  }
}

export function listHostCliDependencyNames(monorepoRoot) {
  const pkgJson = path.join(monorepoRoot, 'host-cli', 'package.json')
  const manifest = JSON.parse(fs.readFileSync(pkgJson, 'utf8'))
  return Object.keys(manifest.dependencies ?? {}).filter((name) => name.startsWith('@taskweaver/'))
}

/**
 * Ensure every Host dependency and known wiring package has a runnable lib/ tree.
 */
export async function healDeployPackageClosure({
  monorepoRoot,
  stagingRoot,
  desktopRepoRoot,
}) {
  const names = new Set([
    ...listHostCliDependencyNames(monorepoRoot),
    ...runtimePeerPackageNames(),
    ...RUNTIME_WIRING_PACKAGE_NAMES,
  ])
  let healed = 0
  for (const packageName of names) {
    const dest = deployPackageDest(stagingRoot, packageName)
    const monorepoBuilt = resolvePackageDir(monorepoRoot, null, packageName, desktopRepoRoot)
    /** Workspace packages: always prefer monorepo `lib/` over pnpm deploy partial trees. */
    const shouldRefreshFromMonorepo = Boolean(
      monorepoBuilt && packageHasRunnableEntry(monorepoBuilt),
    )
    if (shouldRefreshFromMonorepo) {
      if (fs.existsSync(dest)) await fsp.rm(dest, { recursive: true, force: true })
      const copied = await copyPackageIntoStaging(monorepoRoot, stagingRoot, packageName, desktopRepoRoot)
      if (!copied) {
        throw new Error(
          `无法从 monorepo 补齐 ${packageName}（deploy 仅有 package.json 壳或缺少 lib/）。`
          + ' 请先 pnpm --dir packages/runtime run build:host。',
        )
      }
      healed += 1
      console.log(`runtime-deploy-closure: 同步 ${packageName}`)
      continue
    }
    if (!packageHasRunnableEntry(dest)) {
      const copied = await copyPackageIntoStaging(monorepoRoot, stagingRoot, packageName, desktopRepoRoot)
      if (!copied) {
        throw new Error(`无法从 monorepo 补齐 ${packageName}；请先 pnpm --dir packages/runtime run build:host。`)
      }
      healed += 1
      console.log(`runtime-deploy-closure: 补齐 ${packageName}`)
    } else {
      await forceSyncLibEntryFromTypes(dest)
      await promoteModularTypesLib(dest)
      await flattenLibTypesArtifacts(dest)
    }
  }
  await flattenAllStagingLibTypes(stagingRoot)
  if (healed === 0) {
    console.log('runtime-deploy-closure: deploy 包闭包已完整')
  }
  return healed
}

/** Flatten lib/types/*.js for every workspace package in the deploy tree. */
export async function flattenAllStagingLibTypes(stagingRoot) {
  const candidates = [
    path.join(stagingRoot, 'node_modules'),
    path.join(stagingRoot, TASKWEAVER_RUNTIME_PACKAGES),
  ]
  let touched = 0
  for (const modulesRoot of candidates) {
    if (!fs.existsSync(modulesRoot)) continue
    for (const scope of ['@taskweaver', '@z']) {
      const scopeDir = path.join(modulesRoot, scope)
      if (!fs.existsSync(scopeDir)) continue
      for (const name of await fsp.readdir(scopeDir)) {
        if (name === 'node_modules' || name.startsWith('.')) continue
        const pkgRoot = path.join(scopeDir, name)
        const libDir = path.join(pkgRoot, 'lib')
        const typesDir = path.join(libDir, 'types')
        if (!fs.existsSync(typesDir)) continue
        const before = fs.existsSync(libDir) ? await fsp.readdir(libDir) : []
        await forceSyncLibEntryFromTypes(pkgRoot)
        await flattenLibTypesArtifacts(pkgRoot)
        const after = await fsp.readdir(libDir)
        if (after.length > before.length) touched += 1
      }
    }
  }
  if (touched > 0) {
    console.log(`runtime-deploy-closure: 已扁平化 ${touched} 个包的 lib/types → lib`)
  }
}

/**
 * `node_modules` → `runtime-packages` + `@taskweaver/*` → `@z/*` aliases (packaged layout).
 */
export async function finalizeRuntimeLayout(stagingRoot) {
  const nm = path.join(stagingRoot, 'node_modules')
  const rp = path.join(stagingRoot, TASKWEAVER_RUNTIME_PACKAGES)

  const nmStat = await fsp.lstat(nm).catch(() => null)
  if (nmStat?.isSymbolicLink()) {
    const target = await fsp.readlink(nm)
    const resolved = path.resolve(stagingRoot, target)
    if (target === TASKWEAVER_RUNTIME_PACKAGES || resolved === rp) {
      await aliasTaskweaverScope(rp)
      return
    }
  }

  if (!nmStat && fs.existsSync(rp)) {
    if (!fs.existsSync(nm)) {
      await fsp.symlink(TASKWEAVER_RUNTIME_PACKAGES, nm, 'dir')
    }
    await aliasTaskweaverScope(rp)
    return
  }

  if (nmStat?.isDirectory() && !nmStat.isSymbolicLink()) {
    if (fs.existsSync(rp)) await fsp.rm(rp, { recursive: true, force: true })
    await fsp.rename(nm, rp)
    if (!fs.existsSync(nm)) {
      await fsp.symlink(TASKWEAVER_RUNTIME_PACKAGES, nm, 'dir')
      console.log('runtime-deploy-closure: node_modules → runtime-packages')
    }
    const esmSelfLink = path.join(rp, 'node_modules')
    const existing = await fsp.lstat(esmSelfLink).catch(() => null)
    if (existing?.isSymbolicLink()) {
      const target = await fsp.readlink(esmSelfLink).catch(() => '')
      if (target === '.' || target === './') {
        await fsp.rm(esmSelfLink, { force: true })
      }
    }
    await aliasTaskweaverScope(rp)
  }
}

/** Drop stale real `@taskweaver/*` trees when `@z/*` is canonical (pnpm deploy). */
async function reconcileDuplicateScopeTrees(packagesDir) {
  const zDir = path.join(packagesDir, '@z')
  const twDir = path.join(packagesDir, '@taskweaver')
  if (!fs.existsSync(zDir) || !fs.existsSync(twDir)) return
  for (const name of await fsp.readdir(twDir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    if (!fs.existsSync(path.join(zDir, name))) continue
    const twPath = path.join(twDir, name)
    const stat = await fsp.lstat(twPath).catch(() => null)
    if (!stat?.isDirectory() || stat.isSymbolicLink()) continue
    await fsp.rm(twPath, { recursive: true, force: true })
  }
}

async function aliasTaskweaverScope(packagesDir) {
  if (!packagesDir || !fs.existsSync(packagesDir)) return
  await reconcileDuplicateScopeTrees(packagesDir)
  const linked = await ensureTaskweaverScopeAliases(packagesDir)
  if (linked > 0) {
    console.log(`runtime-deploy-closure: @taskweaver/* → @z/*（${linked} 个符号链接）`)
  }
}
