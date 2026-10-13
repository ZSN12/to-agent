#!/usr/bin/env node
/**
 * Start TaskWeaver shell HTTP backend (no Electron window).
 */
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const port = process.env.TASKWEAVER_SHELL_PORT || '31981'
const shellToken = process.env.TASKWEAVER_SHELL_TOKEN || randomBytes(32).toString('hex')

const child = spawn(process.execPath, [path.join(root, 'backend/shell/run.mjs')], {
  cwd: root,
  env: {
    ...process.env,
    TASKWEAVER_SHELL_PORT: port,
    TASKWEAVER_SHELL_TOKEN: shellToken,
    TASKWEAVER_DEV_HTTP: '1',
  },
  stdio: 'inherit',
})

child.on('exit', (code) => process.exit(code ?? 0))
