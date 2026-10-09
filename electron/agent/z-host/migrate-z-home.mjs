import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'

/**
 * Legacy TaskWeaver installs wrote `@deepseek-ai/dsh-*` into DSH_HOME profile bundles.
 * Z runtime only ships `@z/*`; rewrite manifests before booting the host CLI.
 */
export async function migrateLegacyDshProfileBundles(dshHome) {
  const profilesDir = path.join(dshHome, 'profiles')
  if (!fs.existsSync(profilesDir)) return { changed: false, profiles: [] }

  const changedProfiles = []
  const entries = await fsp.readdir(profilesDir, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const pkgPath = path.join(profilesDir, entry.name, 'package.json')
    if (!fs.existsSync(pkgPath)) continue
    let raw
    try {
      raw = await fsp.readFile(pkgPath, 'utf8')
    } catch {
      continue
    }
    if (!raw.includes('@deepseek-ai/')) continue
    const pkg = JSON.parse(raw)
    const bundles = pkg?.dsh?.profile?.bundles
    if (!Array.isArray(bundles)) continue
    const next = bundles.map((name) =>
      typeof name === 'string' ? name.replace(/^@deepseek-ai\//, '@z/') : name,
    )
    if (JSON.stringify(bundles) === JSON.stringify(next)) continue
    pkg.dsh.profile.bundles = next
    await fsp.writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)
    changedProfiles.push(entry.name)
  }

  if (changedProfiles.length) {
    const staleModules = path.join(profilesDir, 'node_modules')
    if (fs.existsSync(staleModules)) {
      await fsp.rm(staleModules, { recursive: true, force: true })
    }
  }

  return { changed: changedProfiles.length > 0, profiles: changedProfiles }
}

/**
 * Ensure Z data directory exists under userDataPath and is safely linked/migrated
 * with legacy DSH data directory.
 */
export function ensureZHomeDirectory(userDataPath) {
  if (!userDataPath) {
    throw new Error('ensureZHomeDirectory: userDataPath 不能为空')
  }
  const zDir = path.join(userDataPath, 'z')
  const dshDir = path.join(userDataPath, 'dsh')

  const zExists = fs.existsSync(zDir)
  const dshExists = fs.existsSync(dshDir)
  let migrated = false

  const linkType = process.platform === 'win32' ? 'junction' : 'dir'

  if (!zExists && !dshExists) {
    fs.mkdirSync(zDir, { recursive: true })
    try {
      fs.symlinkSync(zDir, dshDir, linkType)
    } catch {
      try { fs.mkdirSync(dshDir, { recursive: true }) } catch { /* ignore */ }
    }
  } else if (!zExists && dshExists) {
    try {
      fs.symlinkSync(dshDir, zDir, linkType)
      migrated = true
    } catch {
      try { fs.mkdirSync(zDir, { recursive: true }) } catch { /* ignore */ }
    }
  } else if (zExists && !dshExists) {
    try {
      fs.symlinkSync(zDir, dshDir, linkType)
    } catch {
      try { fs.mkdirSync(dshDir, { recursive: true }) } catch { /* ignore */ }
    }
  }

  return {
    zHome: zExists || !dshExists ? zDir : dshDir,
    dshHome: dshExists ? dshDir : zDir,
    migrated,
  }
}
