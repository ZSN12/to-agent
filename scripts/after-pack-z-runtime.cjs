const fs = require('node:fs/promises')
const path = require('node:path')

module.exports = async function afterPack(context) {
  const resourcesPath = context.electronPlatformName === 'darwin'
    ? path.join(context.appOutDir, 'TaskWeaver.app', 'Contents', 'Resources')
    : path.join(context.appOutDir, 'resources')
  const runtimeRoot = path.join(resourcesPath, 'taskweaver-z-runtime')
  const runtimePackagesPath = path.join(runtimeRoot, 'runtime-packages')
  const runtimePackagesStat = await fs.stat(runtimePackagesPath).catch(() => null)
  if (!runtimePackagesStat?.isDirectory()) {
    throw new Error(`Packaged Z Runtime dependencies not found: ${runtimePackagesPath}`)
  }

  const nodeModulesPath = path.join(runtimePackagesPath, 'node_modules')
  const existing = await fs.lstat(nodeModulesPath).catch(() => null)
  if (existing?.isSymbolicLink()) {
    const target = await fs.readlink(nodeModulesPath)
    if (target === '.' || target === './') {
      await fs.rm(nodeModulesPath, { force: true })
      console.log('afterPack: removed runtime-packages/node_modules self-link (avoids ELOOP with root node_modules)')
    } else if (!existing.isDirectory()) {
      throw new Error(`Unexpected runtime-packages/node_modules symlink: ${nodeModulesPath} → ${target}`)
    }
  } else if (existing?.isDirectory()) {
    // pnpm deploy may leave a real nested node_modules tree; keep it.
    console.log('afterPack: kept runtime-packages/node_modules directory')
  }

  const deployNodeModules = path.join(runtimeRoot, 'node_modules')
  const deployLink = await fs.lstat(deployNodeModules).catch(() => null)
  if (!deployLink) {
    await fs.symlink('runtime-packages', deployNodeModules, 'dir')
    console.log('afterPack: runtime root node_modules → runtime-packages')
  }

  const ocxRuntimeDir = path.join(resourcesPath, 'opencodex-runtime')
  await fs.mkdir(ocxRuntimeDir, { recursive: true })
  const bunCandidates = [
    path.join(resourcesPath, 'opencodex-runtime', 'bun.exe'),
    path.join(resourcesPath, 'opencodex-runtime', 'bun'),
    path.join(resourcesPath, 'app.asar.unpacked', 'node_modules', 'bun', 'bin', 'bun.exe'),
    path.join(resourcesPath, 'app.asar.unpacked', 'node_modules', 'bun', 'bin', 'bun'),
  ]
  let sourceBun = null
  for (const candidate of bunCandidates) {
    const stat = await fs.stat(candidate).catch(() => null)
    if (stat?.isFile() && stat.size > 1_000_000) {
      sourceBun = candidate
      break
    }
  }
  if (!sourceBun) {
    throw new Error('afterPack: packaged Bun runtime not found (install optional dependency bun@1.4.0)')
  }
  for (const name of ['bun', 'bun.exe']) {
    const dest = path.join(ocxRuntimeDir, name)
    const existing = await fs.stat(dest).catch(() => null)
    if (existing?.isFile() && existing.size > 1_000_000) continue
    await fs.copyFile(sourceBun, dest)
    await fs.chmod(dest, 0o755)
  }
  console.log(`afterPack: opencodex-runtime Bun ← ${sourceBun}`)
}
