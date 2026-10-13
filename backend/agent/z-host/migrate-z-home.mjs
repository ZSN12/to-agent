import { createHash } from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const LEGACY_HOME_ENV = ['Z_HOME', 'DSH_HOME']
const LEGACY_PACKAGE_SCOPES = ['@z/', '@deepseek-ai/']
const LEGACY_PRESET_NAMESPACE = 'dsh'
/** Shipped `web` profile for embedded API Host (matches dsh-app-boot PROFILE_TEMPLATES.web). */
export const EMBEDDED_WEB_PROFILE_BUNDLES = Object.freeze([
  '@taskweaver/dsh-base',
  '@taskweaver/dsh-taskweaver',
])
const warnedLegacyEnv = new Set()

function warnLegacyEnvironment(name, canonical) {
  if (warnedLegacyEnv.has(name)) return
  warnedLegacyEnv.add(name)
  console.warn(`[TaskWeaver] ${name} 已弃用，请改用 ${canonical}。旧名称将在一个版本后移除。`)
}

function nonBlank(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

/** Read a canonical variable and warn when a compatibility alias is present. */
export function readTaskWeaverEnvironment(env, canonicalName, legacyNames = []) {
  const canonical = nonBlank(env?.[canonicalName])
  let fallback
  for (const legacyName of legacyNames) {
    const value = nonBlank(env?.[legacyName])
    if (!value) continue
    warnLegacyEnvironment(legacyName, canonicalName)
    fallback ??= value
  }
  return canonical ?? fallback
}

function expandHome(value, home = os.homedir()) {
  if (value === '~') return home
  if (value.startsWith('~/') || value.startsWith('~\\')) {
    const suffix = path.sep === '/' ? value.slice(2).replaceAll('\\', '/') : value.slice(2).replaceAll('/', '\\')
    return path.join(home, suffix)
  }
  return value
}

export function resolveTaskWeaverRuntimeHome({ env = process.env, home = os.homedir() } = {}) {
  const configured = nonBlank(env.TASKWEAVER_HOME)
  if (configured) return path.resolve(expandHome(configured, home))
  return path.join(home, '.taskweaver', 'runtime')
}

function canonicalPackageName(name) {
  for (const scope of LEGACY_PACKAGE_SCOPES) {
    if (name.startsWith(scope)) return `@taskweaver/${name.slice(scope.length)}`
  }
  return name
}

function isLegacyWebAppBundle(name) {
  if (typeof name !== 'string') return false
  const canonical = canonicalPackageName(name)
  return canonical === '@taskweaver/dsh-web-app' || canonical.endsWith('/dsh-web-app')
}

/** Map legacy browser-surface bundle names to the API-only Host bundle. */
export function rewriteProfileBundleName(name) {
  if (typeof name !== 'string') return name
  const canonical = canonicalPackageName(name)
  if (isLegacyWebAppBundle(canonical)) return '@taskweaver/dsh-taskweaver'
  return canonical
}

function sameBundleList(left, right) {
  return Array.isArray(left)
    && Array.isArray(right)
    && left.length === right.length
    && left.every((value, index) => value === right[index])
}

function canonicalDependencySpec(spec) {
  if (typeof spec !== 'string') return spec
  return spec.replace(/^(npm:)(@(?:z|deepseek-ai)\/)/, '$1@taskweaver/')
}

function migrateDependencyMap(dependencies) {
  if (!dependencies || typeof dependencies !== 'object' || Array.isArray(dependencies)) {
    return { dependencies, changed: false }
  }
  const migrated = {}
  let changed = false
  for (const [name, spec] of Object.entries(dependencies)) {
    const nextName = canonicalPackageName(name)
    const nextSpec = canonicalDependencySpec(spec)
    if (nextName !== name || nextSpec !== spec) changed = true
    // Prefer an already-canonical entry when both old and new keys exist.
    if (!(nextName in migrated) || name === nextName) migrated[nextName] = nextSpec
  }
  return { dependencies: migrated, changed }
}

async function isDirectory(target) {
  try {
    return (await fsp.stat(target)).isDirectory()
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

async function exists(target) {
  try {
    await fsp.lstat(target)
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

async function treeDigest(root) {
  const entries = []
  async function visit(relativePath) {
    const absolutePath = path.join(root, relativePath)
    const stat = await fsp.lstat(absolutePath)
    const name = relativePath.split(path.sep).join('/')
    if (stat.isSymbolicLink()) {
      entries.push([name, 'link', await fsp.readlink(absolutePath)])
      return
    }
    if (stat.isDirectory()) {
      entries.push([name, 'directory', stat.mode & 0o777])
      const children = (await fsp.readdir(absolutePath)).sort()
      for (const child of children) await visit(path.join(relativePath, child))
      return
    }
    if (!stat.isFile()) throw new Error(`Unsupported filesystem entry in runtime home: ${absolutePath}`)
    const digest = createHash('sha256').update(await fsp.readFile(absolutePath)).digest('hex')
    entries.push([name, 'file', stat.mode & 0o777, digest])
  }
  const children = (await fsp.readdir(root)).sort()
  for (const child of children) await visit(child)
  return JSON.stringify(entries)
}

async function copyAndVerify(source, destination) {
  const parent = path.dirname(destination)
  await fsp.mkdir(parent, { recursive: true })
  const stagingRoot = await fsp.mkdtemp(path.join(parent, '.taskweaver-runtime-migration-'))
  const stagingData = path.join(stagingRoot, 'runtime')
  try {
    // A legacy home can itself be a symlink (some old installs linked
    // userData/z to ~/.dsh). Copy its resolved tree so the new home is an
    // independent rollback-safe copy; symlinks *inside* that tree remain
    // preserved and are included in the verification digest.
    const copySource = await fsp.realpath(source)
    await fsp.cp(copySource, stagingData, {
      recursive: true,
      dereference: false,
      preserveTimestamps: true,
      verbatimSymlinks: true,
      errorOnExist: true,
      force: false,
    })
    const [sourceDigest, copiedDigest] = await Promise.all([
      treeDigest(copySource),
      treeDigest(stagingData),
    ])
    if (sourceDigest !== copiedDigest) {
      throw new Error(`Runtime home copy verification failed for ${source}`)
    }
    // Do not replace a concurrently-created destination. The old source stays
    // untouched if another process wins this first-start race.
    if (await exists(destination)) {
      return { migrated: false, source, destination, reason: 'destination-exists' }
    }
    try {
      await fsp.rename(stagingData, destination)
    } catch (error) {
      // Another Host may finish this same first-start migration after our
      // absence check. Accept its verified destination instead of failing the
      // second Host launch; the legacy source and our staging tree remain safe.
      if (!['EEXIST', 'ENOTEMPTY'].includes(error?.code) || !(await exists(destination))) throw error
      return { migrated: false, source, destination, reason: 'destination-exists' }
    }
    return { migrated: true, source, destination }
  } finally {
    await fsp.rm(stagingRoot, { recursive: true, force: true })
  }
}

/**
 * Copy an old runtime home into the canonical TaskWeaver location on first
 * launch. After a verified copy, the legacy source directory is removed
 * (see {@link removeLegacyRuntimeHome}). A staged copy is content-verified
 * before the destination becomes visible, and existing canonical data always wins.
 */
export async function migrateRuntimeHome({
  env = process.env,
  home = os.homedir(),
  userDataPath,
  runtimeHomePath = resolveTaskWeaverRuntimeHome({ env, home }),
} = {}) {
  const destination = path.resolve(expandHome(runtimeHomePath, home))
  const canonicalEnvHome = nonBlank(env.TASKWEAVER_HOME)
  const candidates = []
  for (const name of LEGACY_HOME_ENV) {
    const value = nonBlank(env[name])
    if (value) {
      warnLegacyEnvironment(name, 'TASKWEAVER_HOME')
      candidates.push({ path: path.resolve(expandHome(value, home)), source: `env:${name}` })
    }
  }
  candidates.push({ path: path.join(home, '.dsh'), source: 'legacy-default:.dsh' })
  if (userDataPath) {
    candidates.push({ path: path.join(userDataPath, 'z'), source: 'legacy-electron:z' })
    candidates.push({ path: path.join(userDataPath, 'dsh'), source: 'legacy-electron:dsh' })
  }

  const targetExists = await exists(destination)
  if (targetExists) {
    if (!(await isDirectory(destination))) {
      throw new Error(`TaskWeaver runtime home exists but is not a directory: ${destination}`)
    }
    await fsp.mkdir(destination, { recursive: true })
    return {
      runtimeHomePath: destination,
      migrated: false,
      source: undefined,
      legacySources: candidates.filter((candidate) => candidate.path !== destination),
      reason: 'destination-exists',
    }
  }

  for (const candidate of candidates) {
    if (candidate.path === destination || !(await isDirectory(candidate.path))) continue
    const result = await copyAndVerify(candidate.path, destination)
    if (result.reason === 'destination-exists') {
      if (!(await isDirectory(destination))) {
        throw new Error(`TaskWeaver runtime home was concurrently created as a non-directory: ${destination}`)
      }
      return { runtimeHomePath: destination, migrated: false, source: candidate.path, reason: result.reason }
    }
    return {
      runtimeHomePath: destination,
      migrated: true,
      source: candidate.path,
      sourceKind: candidate.source,
      canonicalEnvHome: Boolean(canonicalEnvHome),
    }
  }

  await fsp.mkdir(destination, { recursive: true })
  return { runtimeHomePath: destination, migrated: false, source: undefined, reason: 'no-legacy-home' }
}

export const LEGACY_RUNTIME_HOME_RETIRED_SUFFIX = '.taskweaver-retired'

/**
 * After a verified copy into the canonical runtime home, remove the legacy
 * source directory. Rollback is via git / reinstall, not a second on-disk copy.
 */
export async function removeLegacyRuntimeHome(sourcePath, { env = process.env } = {}) {
  const keep = nonBlank(env.TASKWEAVER_KEEP_LEGACY_RUNTIME_HOME)
  if (keep === '1' || keep === 'true' || keep === 'yes') return { removed: false, reason: 'opt-out' }
  if (!sourcePath || !(await isDirectory(sourcePath))) return { removed: false, reason: 'missing-source' }
  try {
    await fsp.rm(sourcePath, { recursive: true, force: true, maxRetries: 3 })
    return { removed: true, sourcePath }
  } catch (error) {
    return {
      removed: false,
      reason: 'remove-failed',
      sourcePath,
      message: error instanceof Error ? error.message : String(error),
    }
  }
}

/** Remove prior `.taskweaver-retired` trees from an earlier app version. */
export async function removeStaleRetiredRuntimeHomes({ home = os.homedir(), userDataPath } = {}) {
  const parents = new Set([home, path.join(home, '.taskweaver')])
  if (userDataPath) parents.add(userDataPath)
  const removed = []
  for (const parent of parents) {
    if (!(await isDirectory(parent))) continue
    const entries = await fsp.readdir(parent, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.endsWith(LEGACY_RUNTIME_HOME_RETIRED_SUFFIX)) continue
      const target = path.join(parent, entry.name)
      try {
        await fsp.rm(target, { recursive: true, force: true, maxRetries: 3 })
        removed.push(target)
      } catch {
        // Best-effort cleanup; Host startup must not fail on leftover archives.
      }
    }
  }
  return { removed }
}

/**
 * Migrate legacy profile manifests and package scopes inside the new runtime
 * home. This operation is safe to repeat and only rewrites changed files.
 */
export async function migrateLegacyProfileManifests(runtimeHomePath, { embedded = false } = {}) {
  const profilesDir = path.join(runtimeHomePath, 'profiles')
  if (!(await isDirectory(profilesDir))) return { changed: false, profiles: [] }

  const changedProfiles = []
  const entries = await fsp.readdir(profilesDir, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (entry.name === 'node_modules') continue
    const pkgPath = path.join(profilesDir, entry.name, 'package.json')
    if (!fs.existsSync(pkgPath)) continue
    let pkg
    try {
      pkg = JSON.parse(await fsp.readFile(pkgPath, 'utf8'))
    } catch (error) {
      if (error?.code === 'ENOENT') continue
      throw new Error(`Unable to read profile manifest ${pkgPath}`, { cause: error })
    }

    let changed = false
    const canonicalDependencies = migrateDependencyMap(pkg.dependencies)
    if (canonicalDependencies.changed) {
      pkg.dependencies = canonicalDependencies.dependencies
      changed = true
    }
    const canonicalPeerDependencies = migrateDependencyMap(pkg.peerDependencies)
    if (canonicalPeerDependencies.changed) {
      pkg.peerDependencies = canonicalPeerDependencies.dependencies
      changed = true
    }
    if (typeof pkg.name === 'string' && pkg.name.startsWith('dsh-profile-')) {
      pkg.name = `taskweaver-profile-${pkg.name.slice('dsh-profile-'.length)}`
      changed = true
    }
    const legacy = pkg[LEGACY_PRESET_NAMESPACE]
    if (legacy && typeof legacy === 'object' && !Array.isArray(legacy)) {
      const current = pkg.taskweaver && typeof pkg.taskweaver === 'object' ? pkg.taskweaver : {}
      const merged = { ...legacy, ...current }
      if (legacy.profile || current.profile) merged.profile = { ...legacy.profile, ...current.profile }
      if (legacy.bundle || current.bundle) merged.bundle = { ...legacy.bundle, ...current.bundle }
      pkg.taskweaver = merged
      delete pkg[LEGACY_PRESET_NAMESPACE]
      changed = true
    }

    const bundles = pkg.taskweaver?.profile?.bundles
    if (embedded && entry.name === 'web') {
      pkg.taskweaver ??= {}
      pkg.taskweaver.profile ??= {}
      if (!sameBundleList(bundles, EMBEDDED_WEB_PROFILE_BUNDLES)) {
        pkg.taskweaver.profile.bundles = [...EMBEDDED_WEB_PROFILE_BUNDLES]
        changed = true
      }
      if (pkg.dependencies && Object.keys(pkg.dependencies).length > 0) {
        delete pkg.dependencies
        changed = true
      }
      if (pkg.peerDependencies && Object.keys(pkg.peerDependencies).length > 0) {
        delete pkg.peerDependencies
        changed = true
      }
    } else if (Array.isArray(bundles)) {
      const rewritten = bundles.map((name) => rewriteProfileBundleName(name))
      if (JSON.stringify(bundles) !== JSON.stringify(rewritten)) {
        pkg.taskweaver.profile.bundles = rewritten
        changed = true
      }
    }
    if (!changed) continue
    await fsp.writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)
    changedProfiles.push(entry.name)
    const profileModules = path.join(profilesDir, entry.name, 'node_modules')
    if (await exists(profileModules)) await fsp.rm(profileModules, { recursive: true, force: true })
  }

  if (changedProfiles.length) {
    const staleModules = path.join(profilesDir, 'node_modules')
    if (await exists(staleModules)) await fsp.rm(staleModules, { recursive: true, force: true })
  }
  return { changed: changedProfiles.length > 0, profiles: changedProfiles }
}

/** @deprecated Use {@link migrateLegacyProfileManifests}. */
export const migrateLegacyDshProfileBundles = migrateLegacyProfileManifests

/**
 * Compatibility adapter for older callers. New Host startup uses
 * {@link migrateRuntimeHome} so user data is copied and verified before use.
 */
export function ensureZHomeDirectory(userDataPath) {
  if (!userDataPath) throw new Error('ensureZHomeDirectory: userDataPath 不能为空')
  const runtimeHome = path.join(userDataPath, 'z')
  const dshHome = path.join(userDataPath, 'dsh')
  if (!fs.existsSync(runtimeHome) && !fs.existsSync(dshHome)) fs.mkdirSync(runtimeHome, { recursive: true })
  return { zHome: runtimeHome, dshHome: dshHome, runtimeHomePath: runtimeHome, migrated: false }
}
