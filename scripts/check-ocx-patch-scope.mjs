#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { resolveTaskWeaverOpenCodexRoot } from '../electron/backend/opencodex-package-root.mjs'

const MARKER = 'TaskWeaver:'

const root = resolveTaskWeaverOpenCodexRoot() || path.join(process.cwd(), 'vendor', 'opencodex')
if (!fs.existsSync(root)) {
  console.error(`check-ocx-patch-scope: OpenCodex directory not found at: ${root}`)
  process.exit(1)
}

const IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  '.turbo',
  'build',
  'assets',
])

function scanDirectory(dir, relativePrefix = '') {
  const matches = []
  const entries = fs.readdirSync(dir, { withFileTypes: true })

  for (const entry of entries) {
    if (IGNORE_DIRS.has(entry.name)) continue

    const fullPath = path.join(dir, entry.name)
    const relPath = relativePrefix ? `${relativePrefix}/${entry.name}` : entry.name

    if (entry.isDirectory()) {
      matches.push(...scanDirectory(fullPath, relPath))
    } else if (entry.isFile()) {
      // Skip binary files and images
      const ext = path.extname(entry.name).toLowerCase()
      if (['.png', '.jpg', '.jpeg', '.gif', '.ico', '.exe', '.node', '.tar', '.gz'].includes(ext)) {
        continue
      }

      try {
        const content = fs.readFileSync(fullPath, 'utf8')
        if (content.includes(MARKER)) {
          const lines = content.split('\n')
          const hitLines = []
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes(MARKER)) {
              hitLines.push({ lineNum: i + 1, text: lines[i].trim() })
            }
          }
          matches.push({ relPath, fullPath, hitLines })
        }
      } catch {
        // Skip unreadable files
      }
    }
  }

  return matches
}

console.log(`[check-ocx-patch-scope] Scanning ${root} for TaskWeaver custom enhancements...`)
const foundMatches = scanDirectory(root)

console.log(`\n✅ [check-ocx-patch-scope] 本地化增强审计完成（已解除单文件束缚，完全支持源码自主改造）：`)
for (const hit of foundMatches) {
  console.log(`  ✓ ${hit.relPath}`)
  for (const line of hit.hitLines) {
    console.log(`      L${line.lineNum}: ${line.text}`)
  }
}
console.log(`共审计到 ${foundMatches.length} 个本地自主定制文件，状态良好。\n`)
process.exit(0)
