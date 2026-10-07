#!/usr/bin/env node
/**
 * v1.2.0 发版前人工步骤提示（不自动 git commit/tag）。
 */
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

console.log(`
TaskWeaver v1.2.0 发版检查（A1）
================================
1. npm run test:roadmap-gate
2. npm run test:z-host-deploy   # 本机终端
3. npm run build:z-runtime && npm run install:app  # 可选
4. 拆 commit（建议）:
   - feat: prompt pipeline + 32KiB
   - feat: multi-agent gate + schedules + hooks
   - chore: docs + roadmap gate
5. git tag v1.2.0 && git push --tags   # 确认后自行执行
`)

const gate = spawnSync('npm run test:roadmap-gate', { cwd: root, shell: true, stdio: 'inherit' })
process.exit(gate.status === 0 ? 0 : 1)
