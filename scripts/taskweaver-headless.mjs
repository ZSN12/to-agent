#!/usr/bin/env node
/**
 * 无头单轮：复用 run-agent-read-smoke 管线（需已配置模型与 Z Host）。
 *
 *   node scripts/taskweaver-headless.mjs --text "只读列出根目录" [--preset taskweaver-readonly]
 */
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = ['scripts/run-agent-read-smoke.mjs', '--local', ...process.argv.slice(2)]
if (!args.includes('--text')) {
  console.error('Usage: node scripts/taskweaver-headless.mjs --text "<prompt>" [--preset taskweaver-readonly]')
  process.exit(1)
}
const child = spawn(process.execPath, args, { cwd: root, stdio: 'inherit', env: process.env })
child.on('exit', (code) => process.exit(code ?? 1))
