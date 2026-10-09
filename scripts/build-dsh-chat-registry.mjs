#!/usr/bin/env node
/**
 * Bundle ui-conversation standalone definitions for Node (Electron main).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const entry = path.join(
  root,
  'vendor/z-runtime/packages/client/ui-conversation/src/client/conversation-nodes/standalone-bundle.ts',
)
const outDir = path.join(root, 'electron/vendor')
const outfile = path.join(outDir, 'dsh-chat-registry.mjs')

if (!fs.existsSync(entry)) {
  if (fs.existsSync(outfile)) {
    console.log(`跳过 dsh-chat-registry 重建（ui-conversation 已瘦身）；沿用 ${outfile}`)
    process.exit(0)
  }
  console.error('缺少 standalone-bundle.ts，且 electron/vendor/dsh-chat-registry.mjs 不存在')
  process.exit(1)
}

await fs.promises.mkdir(outDir, { recursive: true })

const esbuildCandidates = [
  path.join(root, 'node_modules', 'esbuild', 'bin', 'esbuild'),
  path.join(root, 'vendor', 'z-runtime', 'node_modules', 'esbuild', 'bin', 'esbuild'),
]
let esbuildBin = esbuildCandidates.find((candidate) => fs.existsSync(candidate))
const useNpx = !esbuildBin
if (useNpx) esbuildBin = 'npx'

const tsconfig = path.join(root, 'vendor/z-runtime/tsconfig.base.client.json')

await new Promise((resolve, reject) => {
  const args = [
    entry,
    '--bundle',
    '--platform=node',
    '--format=esm',
    '--minify',
    `--outfile=${outfile}`,
    ...(fs.existsSync(tsconfig) ? [`--tsconfig=${tsconfig}`] : []),
  ]
  const spawnArgs = useNpx ? ['--yes', 'esbuild@0.25.0', ...args] : args
  const child = spawn(esbuildBin, spawnArgs, { cwd: root, stdio: 'inherit', shell: useNpx })
  child.on('error', reject)
  child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`esbuild exited ${code}`))))
})

console.log(`Wrote ${outfile}`)
