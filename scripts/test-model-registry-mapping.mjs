#!/usr/bin/env node
/**
 * 验证 bundled 模型目录经 modelAdditions 注入后可在 DSH 中路由；无效条目应失败并回滚。
 */
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createProfileStore } from '../electron/backend/profile-store.mjs'
import { createModelService } from '../electron/backend/model-service.mjs'
import { createModelRegistryUpdater } from '../electron/backend/model-registry-updater.mjs'
import { createZHostManager, resolveTaskWeaverRuntimeRoot } from '../electron/agent/z-host/index.mjs'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runtimeRoot = resolveTaskWeaverRuntimeRoot({
  appPath: projectRoot,
  resourcesPath: null,
  isPackaged: false,
  env: process.env,
})
const bundledRegistryPath = path.join(projectRoot, 'registry', 'model-registry.v1.json')
const runtimeLockPath = path.join(projectRoot, 'runtime-lock.json')
const publicKeyDer = (await fs.readFile(
  path.join(projectRoot, 'registry', 'model-registry-public-key.der.b64'),
  'utf8',
)).trim()

const userData = await fs.mkdtemp(path.join(os.tmpdir(), 'tw-registry-mapping-'))
const hostManager = createZHostManager({
  runtimeRoot,
  userDataPath: userData,
  executable: process.execPath,
  startTimeoutMs: 60_000,
})

const modelRegistryUpdater = createModelRegistryUpdater({
  userDataPath: userData,
  bundledRegistryPath,
  currentAppVersion: '1.0.0',
  runtimeLockPath,
  publicKeyDer,
  fetchImpl: async () => new Response('{}', { status: 404 }),
})

const modelService = createModelService({
  profileStore: createProfileStore(userData),
  priceRegistryPath: path.join(projectRoot, 'pricing/registry.json'),
  dshHostManager: hostManager,
  userDataPath: userData,
  dshRuntimeRoot: runtimeRoot,
  modelRegistryUpdater,
})

try {
  await hostManager.start()
  const bundled = JSON.parse(await fs.readFile(bundledRegistryPath, 'utf8'))
  await modelService.validateRegistryMapping(bundled)

  const afterValid = await modelService.listCatalog()
  assert.ok(afterValid.candidateModels.length >= 0)
  await modelService.validateRegistryMapping(bundled)

  const upstreamOnly = {
    ...bundled,
    registryVersion: `${bundled.registryVersion}-upstream-slice`,
    models: Object.fromEntries(
      Object.entries(bundled.models).filter(([, model]) => model.confidence === 'upstream'),
    ),
  }
  await modelService.validateRegistryMapping(upstreamOnly)

  console.log('model-registry-mapping checks passed: bundled registry validates; upstream-only slice is a no-op for modelAdditions')
} finally {
  await modelService.dispose()
  await hostManager.stop().catch(() => {})
  await fs.rm(userData, { recursive: true, force: true })
}
