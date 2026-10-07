#!/usr/bin/env node
/**
 * Headless CLI contract smoke (no Z Host): usage errors and --help.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const script = path.join(root, 'scripts/taskweaver-headless.mjs')

const missingText = spawnSync(process.execPath, [script], { encoding: 'utf8' })
assert.equal(missingText.status, 1, 'expected exit 1 without --text')
assert.match(missingText.stderr, /--text/, 'stderr should mention --text')

const help = spawnSync(process.execPath, [script, '--help'], { encoding: 'utf8' })
assert.equal(help.status, 0, 'expected exit 0 for --help')
assert.match(help.stderr, /taskweaver-headless/, 'help should name the wrapper')

console.log('headless-cli tests passed')
