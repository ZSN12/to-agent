#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  HOST_NODE_RESOURCE_DIR,
  compareSemver,
  resolveBundledHostNodeExecutable,
  resolveHostNodeExecutable,
} from '../backend/agent/z-host/resolve-host-executable.mjs'

assert.equal(compareSemver([22, 18, 0], [22, 17, 9]), 1)
assert.equal(compareSemver([22, 18, 0], [22, 18, 0]), 0)

const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'tw-host-node-'))
const bundledBin = path.join(temp, HOST_NODE_RESOURCE_DIR, 'bin', 'node')
await fs.mkdir(path.dirname(bundledBin), { recursive: true })
const realNode = resolveHostNodeExecutable({ isPackaged: false, env: process.env }).executable
await fs.copyFile(realNode, bundledBin)
assert.equal(resolveBundledHostNodeExecutable(temp), bundledBin)

const canonicalNode = path.join(temp, 'backend', 'node')
await fs.mkdir(path.dirname(canonicalNode), { recursive: true })
await fs.copyFile(realNode, canonicalNode)
assert.equal(resolveHostNodeExecutable({
  env: { TASKWEAVER_HOST_NODE: canonicalNode },
  resourcesPath: temp,
  isPackaged: true,
}).executable, canonicalNode, 'Swift packaged backend passes the canonical Resources/backend/node path')

const fromPath = resolveHostNodeExecutable({ isPackaged: false, env: process.env })
assert.equal(fromPath.source, 'path')
assert.ok(fromPath.executable.includes('node') || fromPath.executable.endsWith('node'))

const packaging = await fs.readFile(path.resolve('packaging/mac-shell-resources.yml'), 'utf8')
assert.match(packaging, /vendor\/host-node/)
assert.match(packaging, /to: host-node/)

console.log('test-host-node-executable passed')
