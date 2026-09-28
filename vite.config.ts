import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

/** file:// 下 crossorigin 会导致 ES module 加载失败 → 封装后白屏 */
function electronHtmlPlugin() {
  return {
    name: 'taskweaver-electron-html',
    closeBundle() {
      const htmlPath = path.join(rootDir, 'dist', 'index.html')
      if (!fs.existsSync(htmlPath)) return
      const html = fs.readFileSync(htmlPath, 'utf8').replace(/\s+crossorigin(="[^"]*")?/g, '')
      fs.writeFileSync(htmlPath, html)
    },
  }
}

export default defineConfig({
  base: './',
  plugins: [react(), electronHtmlPlugin()],
  build: {
    modulePreload: false,
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
})
