#!/usr/bin/env node
/**
 * Start TaskWeaver shell HTTP backend (no Electron window).
 */
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const port = process.env.TASKWEAVER_SHELL_PORT || '31981'

const child = spawn(process.execPath, [path.join(root, 'desktop/shell/run.mjs')], {
  cwd: root,
  env: { ...process.env, TASKWEAVER_SHELL_PORT: port },
  stdio: 'inherit',
})

child.on('exit', (code) => process.exit(code ?? 0))
