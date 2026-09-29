#!/usr/bin/env node
import { createHash } from 'node:crypto'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const [piAiVersion, dshCommit] = process.argv.slice(2)
if (!/^\d+\.\d+\.\d+(?:[-+].+)?$/.test(piAiVersion || '')) throw new Error('pi-ai 版本无效')
if (!/^[a-f0-9]{40}$/.test(dshCommit || '')) throw new Error('DSH commit 无效')
const lockFile = path.join(root, 'runtime-lock.json')
const lock = JSON.parse(await fsp.readFile(lockFile, 'utf8'))
const apply = process.argv.includes('--apply')

if (!apply) {
  const candidateFile = path.join(root, 'runtime-upgrade-candidate.json')
  const next = {
    schemaVersion: 1,
    current: { dshCommit: lock.dsh.commit, piAiVersion: lock.piAi.version },
    available: { dshCommit, piAiVersion },
    requiresVendorSync: dshCommit !== lock.dsh.commit,
    requiresRuntimeBuild: dshCommit !== lock.dsh.commit || piAiVersion !== lock.piAi.version,
  }
  let previous = null
  try { previous = JSON.parse(await fsp.readFile(candidateFile, 'utf8')) } catch { /* first check */ }
  if (JSON.stringify(previous) !== JSON.stringify(next)) {
    await fsp.writeFile(candidateFile, `${JSON.stringify(next, null, 2)}\n`)
  }
  console.log(`runtime-candidate: DSH ${dshCommit.slice(0, 12)}, pi-ai ${piAiVersion}`)
  process.exit(0)
}

lock.piAi.version = piAiVersion
lock.dsh.commit = dshCommit
lock.runtimeBuildHash = createHash('sha256')
  .update(`${dshCommit}|${piAiVersion}|${lock.dshApiSchemaVersion}|${lock.overlayVersion}`)
  .digest('hex')
await fsp.writeFile(lockFile, `${JSON.stringify(lock, null, 2)}\n`)
const adapterPackagePath = path.join(root, 'dsh-source', 'packages', 'llm', 'llm-pi-ai', 'package.json')
const adapterPackage = JSON.parse(await fsp.readFile(adapterPackagePath, 'utf8'))
adapterPackage.dependencies['@earendil-works/pi-ai'] = piAiVersion
await fsp.writeFile(adapterPackagePath, `${JSON.stringify(adapterPackage, null, 2)}\n`)
console.log(`runtime-lock applied: DSH ${dshCommit.slice(0, 12)}, pi-ai ${piAiVersion}`)
