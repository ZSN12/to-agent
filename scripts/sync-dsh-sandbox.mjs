import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = path.join(root, 'vendor', 'dsh-sandbox')
const dest = path.join(root, 'electron', 'vendor', 'dsh-sandbox')

async function copyDir(from, to) {
  await fsp.mkdir(to, { recursive: true })
  const entries = await fsp.readdir(from, { withFileTypes: true })
  for (const entry of entries) {
    const s = path.join(from, entry.name)
    const d = path.join(to, entry.name)
    if (entry.isDirectory()) await copyDir(s, d)
    else await fsp.copyFile(s, d)
  }
}

if (!fs.existsSync(src)) {
  console.error('缺少 vendor/dsh-sandbox，无法同步到 electron/vendor')
  process.exit(1)
}

await copyDir(src, dest)
console.log('sync-dsh-sandbox: electron/vendor/dsh-sandbox 已更新')
