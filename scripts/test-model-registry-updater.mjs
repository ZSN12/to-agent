#!/usr/bin/env node
import assert from 'node:assert/strict'
import { generateKeyPairSync, sign, createHash } from 'node:crypto'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createModelRegistryUpdater } from '../electron/backend/model-registry-updater.mjs'

const temp = await fsp.mkdtemp(path.join(os.tmpdir(), 'tw-registry-test-'))
try {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  const publicKeyDer = publicKey.export({ format: 'der', type: 'spki' }).toString('base64')
  const bundled = {
    schemaVersion: 1, registryVersion: '1.0.0', generatedAt: '2026-01-01T00:00:00.000Z',
    expiresAt: '2030-01-01T00:00:00.000Z', minimumTaskWeaverVersion: '1.0.0',
    minimumDshRuntimeVersion: '0.1.0', providers: {}, models: {}, sources: [],
  }
  const remote = {
    ...bundled,
    registryVersion: '1.1.0',
    providers: { demo: { name: 'Demo', protocols: ['openai-completions'] } },
    models: { 'demo/new-model': { provider: 'demo', id: 'new-model', name: 'New Model', api: 'openai-completions' } },
  }
  const bytes = Buffer.from(`${JSON.stringify(remote, null, 2)}\n`)
  const manifest = {
    schemaVersion: 1, registryVersion: remote.registryVersion,
    registryUrl: 'https://test.invalid/registry.json',
    sha256: createHash('sha256').update(bytes).digest('hex'),
    signature: sign(null, bytes, privateKey).toString('base64'),
  }
  const bundledPath = path.join(temp, 'bundled.json')
  const runtimePath = path.join(temp, 'runtime-lock.json')
  await fsp.writeFile(bundledPath, JSON.stringify(bundled))
  await fsp.writeFile(runtimePath, JSON.stringify({ dsh: { version: '1.0.0' }, piAi: { version: '1.0.0' } }))
  let requests = 0
  let now = Date.parse('2026-09-28T10:00:00.000Z')
  const fetchImpl = async (url) => {
    requests += 1
    return new Response(url.endsWith('manifest.json') ? JSON.stringify(manifest) : bytes, { status: 200 })
  }
  const updater = createModelRegistryUpdater({
    userDataPath: temp, bundledRegistryPath: bundledPath, runtimeLockPath: runtimePath,
    currentAppVersion: '1.0.0', manifestUrl: 'https://test.invalid/manifest.json',
    publicKeyDer, fetchImpl, now: () => now, validateMapping: async () => true,
  })
  const updated = await updater.checkForUpdates({ force: true })
  assert.equal(updated.state, 'updated')
  assert.equal(updated.currentVersion, '1.1.0')
  assert.deepEqual(updated.changes.added, ['demo/new-model'])
  const cached = await updater.checkForUpdates({ force: false })
  assert.equal(cached.state, 'cached')
  assert.equal(requests, 2)
  const rolledBack = await updater.rollbackRegistry()
  assert.equal(rolledBack.state, 'rolled-back')
  assert.equal(rolledBack.currentVersion, '1.0.0')
  now += 25 * 60 * 60 * 1000
  manifest.signature = Buffer.alloc(64).toString('base64')
  const failed = await updater.checkForUpdates({ force: true })
  assert.equal(failed.state, 'failed')
  assert.match(failed.error, /签名/)
  assert.equal((await updater.loadActiveRegistry()).registry.registryVersion, '1.0.0')
  console.log('model-registry-updater tests passed')
} finally {
  await fsp.rm(temp, { recursive: true, force: true })
}
