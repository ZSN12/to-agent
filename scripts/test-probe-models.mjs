import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { createCustomProviderService } from '../electron/backend/custom-provider-service.mjs'

async function runTest() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-probe-test-'))
  const modelsPath = path.join(tmpDir, 'models.json')
  
  let savedCredentials = {}
  const mockCredentials = {
    read: async (id) => savedCredentials[id],
    modify: async (id, fn) => {
      savedCredentials[id] = await fn(savedCredentials[id])
      return savedCredentials[id]
    },
    delete: async (id) => { delete savedCredentials[id] },
  }

  let refreshed = false
  const service = createCustomProviderService({
    modelsPath,
    credentials: mockCredentials,
    refreshRuntime: async () => { refreshed = true },
  })

  // 1. 初始化添加一个提供方
  await service.upsertCustomProvider({
    providerId: 'my-gw',
    name: '我的网关',
    baseUrl: 'https://api.example.com/v1',
    apiKey: 'sk-test-123456',
    modelId: 'gpt-4o',
    modelName: 'GPT-4o',
  })

  const providers = await service.listCustomProviders()
  assert.equal(providers.length, 1)
  assert.equal(providers[0].id, 'custom-my-gw')
  assert.equal(providers[0].models.length, 1)
  assert.equal(providers[0].models[0].id, 'gpt-4o')

  // 2. 测试 batchAddCustomModels
  const batchRes = await service.batchAddCustomModels({
    providerId: 'custom-my-gw',
    models: [
      { id: 'claude-3-7-sonnet-20250219', name: 'Claude 3.7 Sonnet', contextWindow: 200000, reasoning: true },
      { id: 'deepseek-r1', name: 'DeepSeek R1', contextWindow: 128000, reasoning: true },
    ],
  })

  assert.equal(batchRes.ok, true)
  assert.equal(batchRes.addedCount, 2)
  assert.deepEqual(batchRes.addedKeys, ['custom-my-gw/claude-3-7-sonnet-20250219', 'custom-my-gw/deepseek-r1'])
  assert.equal(refreshed, true)

  const updatedProviders = await service.listCustomProviders()
  assert.equal(updatedProviders[0].models.length, 3)
  const modelIds = updatedProviders[0].models.map(m => m.id)
  assert.ok(modelIds.includes('gpt-4o'))
  assert.ok(modelIds.includes('claude-3-7-sonnet-20250219'))
  assert.ok(modelIds.includes('deepseek-r1'))

  // 清理
  await fs.rm(tmpDir, { recursive: true, force: true })
  console.log('✅ probe & batchAddCustomModels 单元测试全部通过！')
}

runTest().catch((err) => {
  console.error('❌ 测试失败:', err)
  process.exit(1)
})
