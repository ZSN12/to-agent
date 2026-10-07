#!/usr/bin/env node
/**
 * 发版前人工步骤提示 + roadmap-gate（不自动 git commit/tag）。
 * VERSION 来自环境变量或第一个 CLI 参数，默认 1.2.0。
 */
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const version = process.env.VERSION || process.argv[2] || '1.2.0'

console.log(`
TaskWeaver v${version} 发版检查
================================
1. npm run test:roadmap-gate
2. npm run test:z-host-deploy   # 本机终端
3. npm run build:z-runtime && npm run install:app  # 可选
4. 拆 commit（建议）:
   - feat: prompt pipeline + 32KiB
   - feat: multi-agent gate + schedules + hooks
   - chore: docs + roadmap gate
5. git tag v${version} && git push --tags   # 确认后自行执行
`)

const gate = spawnSync('node', ['scripts/roadmap-gate.mjs'], { cwd: root, stdio: 'inherit' })
process.exit(gate.status === 0 ? 0 : gate.status ?? 1)
