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
assert.match(help.stderr, /--permission-mode/, 'help should document the bounded permission mode')

const smokeScript = path.join(root, 'scripts/diagnose/run-agent-read-smoke.mjs')
const fixture = spawnSync(process.execPath, [smokeScript, '--fixture', '--text', 'permission smoke', '--permission-mode', 'on-risk'], { encoding: 'utf8' })
assert.equal(fixture.status, 0, 'fixture should run without starting a Host')
const completed = fixture.stdout.split('\n').map((line) => {
  try { return JSON.parse(line) } catch { return null }
}).find((event) => event?.status === 'completed')
assert.equal(completed?.permissionMode, 'on-risk', 'fixture should report the selected mode')

const fullMode = spawnSync(process.execPath, [smokeScript, '--fixture', '--text', 'permission smoke', '--permission-mode', 'full'], { encoding: 'utf8' })
assert.notEqual(fullMode.status, 0, 'headless smoke must reject full-access mode')
assert.match(fullMode.stderr, /--permission-mode must be readonly, ask, or on-risk/)

console.log('headless-cli tests passed')
