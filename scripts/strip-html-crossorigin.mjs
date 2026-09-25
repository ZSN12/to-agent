import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const htmlPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'index.html')
if (!fs.existsSync(htmlPath)) {
  console.warn('strip-html-crossorigin: dist/index.html not found')
  process.exit(0)
}
const next = fs.readFileSync(htmlPath, 'utf8').replace(/\s+crossorigin(="[^"]*")?/g, '')
fs.writeFileSync(htmlPath, next)
console.log('strip-html-crossorigin: removed crossorigin from dist/index.html')
