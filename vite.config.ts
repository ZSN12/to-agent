import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

export const PACKAGED_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' http://127.0.0.1:* ws://127.0.0.1:*; font-src 'self' data:; object-src 'none'; base-uri 'none'; frame-src 'none'"

/** file:// 下 crossorigin 会导致 ES module 加载失败 → 封装后白屏 */
function electronHtmlPlugin() {
  return {
    name: 'taskweaver-electron-html',
    transformIndexHtml: {
      order: 'post' as const,
      handler(html, ctx) {
        if (ctx.server) return html
        if (html.includes('Content-Security-Policy')) return html
        const tag = `<meta http-equiv="Content-Security-Policy" content="${PACKAGED_CSP}" />`
        return html.replace('<head>', `<head>\n    ${tag}`)
      },
    },
    closeBundle() {
      const htmlPath = path.join(rootDir, 'dist', 'index.html')
      if (!fs.existsSync(htmlPath)) return
      let html = fs.readFileSync(htmlPath, 'utf8').replace(/\s+crossorigin(="[^"]*")?/g, '')
      if (!html.includes('Content-Security-Policy')) {
        html = html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${PACKAGED_CSP}" />`)
      }
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
  // 依赖预构建只扫描应用入口，避免扫进 vendor/release 里的第三方 HTML
  optimizeDeps: {
    entries: ['index.html'],
  },
})
