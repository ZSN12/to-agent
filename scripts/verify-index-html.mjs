import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const htmlPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'index.html')
const html = fs.readFileSync(htmlPath, 'utf8')
if (!html.includes('/src/main.tsx')) {
  console.error('index.html 被改成了构建产物格式，已阻止构建。请恢复为 Vite 入口（/src/main.tsx）。')
  process.exit(1)
}
