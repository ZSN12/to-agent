import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const outputDir = process.env.TASKWEAVER_VITE_OUT_DIR
  ? path.resolve(root, process.env.TASKWEAVER_VITE_OUT_DIR)
  : path.join(root, 'dist')
const htmlPath = path.join(outputDir, 'index.html')
if (!fs.existsSync(htmlPath)) {
  console.warn('strip-html-crossorigin: dist/index.html not found')
  process.exit(0)
}
const next = fs.readFileSync(htmlPath, 'utf8').replace(/\s+crossorigin(="[^"]*")?/g, '')
fs.writeFileSync(htmlPath, next)
console.log(`strip-html-crossorigin: removed crossorigin from ${htmlPath}`)
