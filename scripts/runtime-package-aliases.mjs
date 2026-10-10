/**
 * pnpm deploy 有时把 workspace 包落在 runtime-packages/@z/*，而编译产物仍 import @taskweaver/*。
 * 在 runtime-packages/@taskweaver/<name> → ../@z/<name> 建立目录符号链接，供 Node ESM 解析。
 */
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'

export async function ensureTaskweaverScopeAliases(runtimePackagesDir) {
  const zDir = path.join(runtimePackagesDir, '@z')
  const twDir = path.join(runtimePackagesDir, '@taskweaver')
  if (!fs.existsSync(zDir)) return 0
  await fsp.mkdir(twDir, { recursive: true })
  let linked = 0
  for (const name of await fsp.readdir(zDir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const dest = path.join(twDir, name)
    const existing = await fsp.lstat(dest).catch(() => null)
    if (existing) continue
    const relativeTarget = path.join('..', '@z', name)
    await fsp.symlink(relativeTarget, dest, 'dir')
    linked += 1
  }
  return linked
}
