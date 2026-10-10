#!/usr/bin/env node
/** One-shot: electron/ app tree → desktop/ (skip electron-vendor, electron-builder). */
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const SKIP_DIRS = new Set(['node_modules', '.git', 'vendor', 'release', '.pnpm-store', 'packages/runtime/cordis', 'desktop/.build'])
const REPLACEMENTS = [
  ['desktop/backend/', 'desktop/backend/'],
  ['desktop/agent/', 'desktop/agent/'],
  ['desktop/shell/', 'desktop/shell/'],
  ['desktop/platform/', 'desktop/platform/'],
  ['desktop/ipc/', 'desktop/ipc/'],
  ['desktop/vendor/', 'desktop/vendor/'],
  ['desktop/application-menu.cjs', 'desktop/application-menu.cjs'],
  ['desktop/main-process-stability.cjs', 'desktop/main-process-stability.cjs'],
  ['desktop/main.cjs', 'desktop/main.cjs'],
  ['desktop/preload.cjs', 'desktop/preload.cjs'],
  ['desktop/startup-trace.cjs', 'desktop/startup-trace.cjs'],
  ["from '../desktop/", "from '../desktop/"],
  ["from '../../desktop/", "from '../../desktop/"],
  ["from '../../../desktop/", "from '../../../desktop/"],
  ['"desktop/backend/', '"desktop/backend/'],
  ['"desktop/agent/', '"desktop/agent/'],
  ['"desktop/shell/', '"desktop/shell/'],
  ['"desktop/ipc/', '"desktop/ipc/'],
  ['`desktop/backend/', '`desktop/backend/'],
  ['`desktop/shell/', '`desktop/shell/'],
]

const EXT = new Set(['.mjs', '.cjs', '.js', '.ts', '.tsx', '.json', '.md', '.yml', '.yaml', '.swift', '.sh', '.plist'])

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name)
    const rel = path.relative(root, full)
    if (SKIP_DIRS.has(rel) || SKIP_DIRS.has(name)) continue
    if (rel.startsWith('vendor/') || rel.includes('/node_modules/') || rel.startsWith('.pnpm-store')) continue
    let stat
    try { stat = fs.statSync(full) } catch { continue }
    if (stat.isDirectory()) walk(full, out)
    else if (EXT.has(path.extname(name))) out.push(full)
  }
  return out
}

let files = 0
let hits = 0
for (const file of walk(root)) {
  let text = fs.readFileSync(file, 'utf8')
  let next = text
  for (const [from, to] of REPLACEMENTS) {
    if (next.includes(from)) next = next.split(from).join(to)
  }
  if (next !== text) {
    fs.writeFileSync(file, next)
    files += 1
    hits += 1
  }
}
console.log(`rewrite-desktop-paths: updated ${files} files`)
