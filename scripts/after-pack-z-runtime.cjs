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
  if (existing) {
    if (!(existing.isSymbolicLink() && await fs.readlink(nodeModulesPath) === '.')) {
      throw new Error(`Unexpected runtime-packages/node_modules entry: ${nodeModulesPath}`)
    }
    console.log('afterPack: verified relocatable Z Runtime ESM dependency self-link')
  } else {
    // Relative and self-contained so the app remains relocatable. ESM ignores
    // NODE_PATH, so the outer runtimeRoot/node_modules link is not sufficient.
    await fs.symlink('.', nodeModulesPath, 'dir')
    console.log('afterPack: added relocatable Z Runtime ESM dependency self-link')
  }

  const deployNodeModules = path.join(runtimeRoot, 'node_modules')
  const deployLink = await fs.lstat(deployNodeModules).catch(() => null)
  if (!deployLink) {
    await fs.symlink('runtime-packages', deployNodeModules, 'dir')
    console.log('afterPack: runtime root node_modules → runtime-packages')
  }
}
