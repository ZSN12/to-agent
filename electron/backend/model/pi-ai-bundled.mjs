import fs from 'node:fs'
import path from 'node:path'

export function piAiProviderModels(dshRuntimeRoot, providerId) {
  if (!dshRuntimeRoot) return null
  const packageSuffix = path.join('@earendil-works', 'pi-ai', 'dist', 'providers', 'data')
  const candidates = [
    path.join(dshRuntimeRoot, 'runtime-packages', packageSuffix, `${providerId}.json`),
    path.join(dshRuntimeRoot, 'node_modules', packageSuffix, `${providerId}.json`),
    path.join(dshRuntimeRoot, 'node_modules', '.pnpm', 'node_modules', packageSuffix, `${providerId}.json`),
  ]
  const pnpmRoot = path.join(dshRuntimeRoot, 'node_modules', '.pnpm')
  try {
    for (const entry of fs.readdirSync(pnpmRoot)) {
      if (entry.startsWith('@earendil-works+pi-ai@')) {
        candidates.push(path.join(pnpmRoot, entry, 'node_modules', packageSuffix, `${providerId}.json`))
      }
    }
  } catch { /* packed runtime may not use pnpm's virtual store */ }
  for (const file of candidates) {
    try {
      if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'))
    } catch { /* try the next packaged layout */ }
  }
  return null
}
