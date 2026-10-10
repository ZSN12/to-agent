import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { createWebSearchService } from '../desktop/backend/web-search-service.mjs'

async function run() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tw-web-search-test-'))
  const safeStorage = {
    isEncryptionAvailable: () => true,
    encryptString: value => Buffer.from(`test-encrypted:${value}`),
    decryptString: value => {
      const decoded = value.toString('utf8')
      assert.ok(decoded.startsWith('test-encrypted:'), 'test safe-storage shim must only decode its own ciphertext')
      return decoded.slice('test-encrypted:'.length)
    },
  }
  let runtimeReloads = 0
  let runtimeChangeChecks = 0
  let rejectRuntimeChange = false
  let searchRequest = null
  let searchFailure = null

  try {
    const service = createWebSearchService({
      userData: tmpDir,
      safeStorage,
      searchWithHost: async request => {
        searchRequest = request
        if (searchFailure) throw searchFailure
        return {
          content: 'Provider summary',
          sources: [{ title: '官方文档', url: 'https://example.com/docs', snippet: '搜索摘要' }],
          truncated: false,
        }
      },
      assertRuntimeConfigChangeSafe: async () => {
        runtimeChangeChecks++
        if (rejectRuntimeChange) throw new Error('Host 有正在运行的对话，不能重启。')
      },
      onRuntimeConfigChanged: async () => { runtimeReloads++ },
    })

    const initial = await service.getConfig()
    assert.deepEqual(initial, { enabled: false, hasKey: false, endpoint: '', maxResults: 5 })

    const updated = await service.setConfig({
      enabled: true,
      apiKey: 'tvly-test-123456',
      endpoint: 'https://api.tavily.com/search',
      maxResults: 8,
    })
    assert.deepEqual(updated, { enabled: true, hasKey: true, endpoint: 'https://api.tavily.com/search', maxResults: 8 })
    assert.equal(updated.apiKey, undefined, 'settings responses never expose API keys')
    assert.equal(runtimeReloads, 1)

    assert.deepEqual(await service.setConfig({
      enabled: true,
      apiKey: 'tvly-test-123456',
      endpoint: 'https://api.tavily.com/search',
      maxResults: 8,
    }), updated)
    assert.equal(runtimeChangeChecks, 1, 'unchanged settings do not enter the restart guard')
    assert.equal(runtimeReloads, 1)

    rejectRuntimeChange = true
    await assert.rejects(() => service.setConfig({ endpoint: 'https://blocked.example/search' }), /正在运行的对话/)
    rejectRuntimeChange = false
    assert.equal((await service.getConfig()).endpoint, 'https://api.tavily.com/search')
    assert.equal(runtimeReloads, 1, 'a rejected configuration change is not persisted or applied')

    const storedConfig = await fs.readFile(path.join(tmpDir, 'taskweaver-web-search.json'), 'utf8')
    assert.equal(storedConfig.includes('tvly-test-123456'), false, 'API Key is not stored as clear text')
    assert.match(storedConfig, /"apiKeyEncrypted"\s*:\s*"enc:safe-storage:/)

    const runtime = await service.prepareRuntimeIntegration()
    assert.equal(runtime.environment.TASKWEAVER_WEB_SEARCH_ENABLED, 'true')
    assert.equal(runtime.environment.TASKWEAVER_WEB_SEARCH_ENDPOINT, 'https://api.tavily.com/search')
    assert.equal(runtime.environment.TASKWEAVER_WEB_SEARCH_MAX_RESULTS, '8')
    assert.equal(runtime.environment.TASKWEAVER_WEB_SEARCH_API_KEY_SECRET, 'tvly-test-123456')
    assert.deepEqual(Object.keys(runtime.environment).filter(key => /SECRET$/.test(key)), [
      'TASKWEAVER_WEB_SEARCH_API_KEY_SECRET',
    ])

    const success = await service.testSearch('TaskWeaver 搜索')
    assert.equal(success.ok, true)
    assert.match(success.text, /Provider summary/)
    assert.match(success.text, /官方文档/)
    assert.match(success.text, /https:\/\/example\.com\/docs/)
    assert.deepEqual(searchRequest, { query: 'TaskWeaver 搜索', maxResults: 8 })

    searchFailure = new Error('provider echoed tvly-test-123456')
    const failedSearch = await service.testSearch('测试查询')
    assert.equal(failedSearch.ok, false)
    assert.equal(failedSearch.error.includes('tvly-test-123456'), false, 'provider errors cannot echo a saved key')
    assert.match(failedSearch.error, /\[redacted\]/)
    searchFailure = null

    const kept = await service.setConfig({ endpoint: 'https://api.custom.com/search', maxResults: 6 })
    assert.deepEqual(kept, { enabled: true, hasKey: true, endpoint: 'https://api.custom.com/search', maxResults: 6 })
    assert.equal(runtimeReloads, 2, 'empty API Key edits keep the saved credential')

    const cleared = await service.setConfig({ clearKey: true })
    assert.equal(cleared.hasKey, false)
    assert.equal(runtimeReloads, 3)
    assert.equal('TASKWEAVER_WEB_SEARCH_API_KEY_SECRET' in (await service.prepareRuntimeIntegration()).environment, false)

    await service.setConfig({ enabled: false })
    assert.equal((await service.prepareRuntimeIntegration()).environment.TASKWEAVER_WEB_SEARCH_ENABLED, 'false')

    // Migrate legacy plaintext settings before exposing credentials to the Host.
    const migrationDir = path.join(tmpDir, 'legacy')
    await fs.mkdir(migrationDir, { recursive: true })
    await fs.writeFile(path.join(migrationDir, 'taskweaver-web-search.json'), JSON.stringify({
      enabled: true,
      apiKey: 'legacy-plaintext-key',
      endpoint: 'https://qianfan.baidubce.com/v2/ai_search/web_search',
      maxResults: 4,
    }))
    const migratedService = createWebSearchService({ userData: migrationDir, safeStorage })
    assert.equal((await migratedService.getConfig()).hasKey, true)
    const migratedDisk = await fs.readFile(path.join(migrationDir, 'taskweaver-web-search.json'), 'utf8')
    assert.equal(migratedDisk.includes('legacy-plaintext-key'), false)
    assert.match(migratedDisk, /"apiKeyEncrypted"\s*:\s*"enc:safe-storage:/)
    assert.equal(
      (await migratedService.prepareRuntimeIntegration()).environment.TASKWEAVER_WEB_SEARCH_API_KEY_SECRET,
      'legacy-plaintext-key',
    )

    const insecureDir = path.join(tmpDir, 'insecure')
    await fs.mkdir(insecureDir, { recursive: true })
    await fs.writeFile(path.join(insecureDir, 'taskweaver-web-search.json'), JSON.stringify({
      enabled: true,
      apiKey: 'cannot-keep-plaintext',
      endpoint: '',
      maxResults: 5,
    }))
    const insecureService = createWebSearchService({ userData: insecureDir })
    assert.equal((await insecureService.getConfig()).hasKey, false)
    assert.equal((await insecureService.getConfig()).enabled, false)
    const cleanedDisk = await fs.readFile(path.join(insecureDir, 'taskweaver-web-search.json'), 'utf8')
    assert.equal(cleanedDisk.includes('cannot-keep-plaintext'), false)
    await assert.rejects(() => insecureService.setConfig({ apiKey: 'new-key' }), /安全存储不可用.*拒绝保存/)

    console.log('web-search-service 单元测试全部通过！')
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true })
  }
}

run().catch((err) => {
  console.error('测试失败:', err)
  process.exit(1)
})
