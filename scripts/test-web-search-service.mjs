import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { createWebSearchService } from '../electron/backend/web-search-service.mjs'

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

  try {
    const service = createWebSearchService({
      userData: tmpDir,
      safeStorage,
      assertRuntimeConfigChangeSafe: async () => {
        runtimeChangeChecks++
        if (rejectRuntimeChange) throw new Error('Host 有正在运行的对话，不能重启。')
      },
      onRuntimeConfigChanged: async () => { runtimeReloads++ },
    })

    // 1. 默认状态
    const initial = await service.getConfig()
    assert.equal(initial.enabled, false, '默认未启用')
    assert.equal(initial.hasKey, false, '默认无 key')
    assert.equal(initial.endpoint, '', '默认无自定义 endpoint')
    assert.equal(initial.maxResults, 5, '默认最大条数 5')

    // 2. 更新配置（包含 apiKey 和自定义 endpoint）
    const updated = await service.setConfig({
      enabled: true,
      apiKey: 'tvly-test-123456',
      endpoint: 'https://api.tavily.com/search',
      maxResults: 8,
    })
    assert.equal(updated.enabled, true)
    assert.equal(updated.hasKey, true)
    assert.equal(updated.endpoint, 'https://api.tavily.com/search')
    assert.equal(updated.maxResults, 8)
    assert.equal(updated.apiKey, undefined, 'getConfig 与 setConfig 不泄露 apiKey 明文')
    assert.equal(runtimeReloads, 1, 'a saved runtime configuration restarts the Host')

    const unchanged = await service.setConfig({
      enabled: true,
      apiKey: 'tvly-test-123456',
      endpoint: 'https://api.tavily.com/search',
      maxResults: 8,
    })
    assert.deepEqual(unchanged, updated, 'saving the same effective settings is a no-op')
    assert.equal(runtimeChangeChecks, 1, 'unchanged settings skip the Host restart guard')
    assert.equal(runtimeReloads, 1, 'unchanged settings do not restart the Host')

    rejectRuntimeChange = true
    await assert.rejects(
      () => service.setConfig({ endpoint: 'https://blocked.example/search' }),
      /正在运行的对话/,
      'the Host guard runs before configuration is persisted',
    )
    rejectRuntimeChange = false
    assert.equal((await service.getConfig()).endpoint, 'https://api.tavily.com/search')
    assert.equal(runtimeReloads, 1, 'a rejected configuration change does not restart the Host')

    const storedConfig = await fs.readFile(path.join(tmpDir, 'taskweaver-web-search.json'), 'utf8')
    assert.equal(storedConfig.includes('tvly-test-123456'), false, 'API Key is not stored as clear text')
    assert.match(storedConfig, /"apiKeyEncrypted"\s*:\s*"enc:safe-storage:/)

    // 再次读取脱敏配置
    const fetched = await service.getConfig()
    assert.equal(fetched.hasKey, true)
    assert.equal(fetched.endpoint, 'https://api.tavily.com/search')
    assert.equal(fetched.maxResults, 8)

    const runtime = await service.prepareRuntimeIntegration()
    assert.equal(runtime.environment.TASKWEAVER_WEB_SEARCH_ENABLED, 'true')
    assert.equal(runtime.environment.TASKWEAVER_WEB_SEARCH_ENDPOINT, 'https://api.tavily.com/search')
    assert.equal(runtime.environment.TASKWEAVER_WEB_SEARCH_MAX_RESULTS, '8')
    assert.equal(runtime.environment.TASKWEAVER_WEB_SEARCH_API_KEY_SECRET, 'tvly-test-123456')
    assert.deepEqual(Object.keys(runtime.environment).filter(key => /SECRET$/.test(key)), [
      'TASKWEAVER_WEB_SEARCH_API_KEY_SECRET',
    ])

    // 3. 留空保持现有 key
    const kept = await service.setConfig({
      endpoint: 'https://api.custom.com/search',
      maxResults: 6,
    })
    assert.equal(kept.hasKey, true, '留空保持当前 key')
    assert.equal(kept.endpoint, 'https://api.custom.com/search')
    assert.equal(kept.maxResults, 6)
    assert.equal(runtimeReloads, 2)

    // 4. 清除现有 key
    const cleared = await service.setConfig({
      clearKey: true,
    })
    assert.equal(cleared.hasKey, false, 'clearKey=true 清空 key')
    assert.equal(runtimeReloads, 3, 'clearing a credential restarts the Host')
    assert.equal('TASKWEAVER_WEB_SEARCH_API_KEY_SECRET' in (await service.prepareRuntimeIntegration()).environment, false)

    // 5. 工具装载
    const tools = await service.getCustomTools()
    assert.equal(tools.length, 1, '启用时注入 web_search 工具')
    assert.equal(tools[0].name, 'web_search')

    // 6. 禁用后不暴露工具
    await service.setConfig({ enabled: false })
    const disabledTools = await service.getCustomTools()
    assert.equal(disabledTools.length, 0, '未启用时不注入工具')

    // 7. 百度千帆使用 messages 请求格式，并提取 references
    await service.setConfig({
      enabled: true,
      apiKey: 'baidu-test-key',
      endpoint: 'https://qianfan.baidubce.com/v2/ai_search/web_search',
      maxResults: 3,
    })
    const originalFetch = globalThis.fetch
    let capturedRequest
    try {
      globalThis.fetch = async (url, options) => {
        capturedRequest = { url, options }
        return new Response(JSON.stringify({
          references: [{ title: '官方文档', url: 'https://example.com/docs', content: '搜索摘要' }],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      const success = await service.testSearch('TaskWeaver 搜索')
      assert.equal(success.ok, true, '有效 references 应报告检索成功')
      assert.match(success.text, /官方文档/)
      assert.equal(capturedRequest.url, 'https://qianfan.baidubce.com/v2/ai_search/web_search')
      assert.equal(capturedRequest.options.headers['X-Appbuilder-Authorization'], 'Bearer baidu-test-key')
      assert.deepEqual(JSON.parse(capturedRequest.options.body).messages, [
        { role: 'user', content: 'TaskWeaver 搜索' },
      ])

      // 8. HTTP 200 中的百度业务错误不能被误报为成功
      globalThis.fetch = async () => new Response(JSON.stringify({
        request_id: 'test-request',
        code: 'InvalidArgument',
        message: 'empty messages',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      const failure = await service.testSearch('测试查询')
      assert.equal(failure.ok, false, '业务层错误不能误报检索成功')
      assert.match(failure.error, /empty messages/)

      // Keep every provider accepted by the settings page operational through the Host web seam.
      await service.setConfig({ enabled: true, clearKey: true, endpoint: '', maxResults: 2 })
      globalThis.fetch = async (url) => {
        assert.match(String(url), /^https:\/\/api\.duckduckgo\.com\//)
        return new Response(JSON.stringify({
          Heading: 'TaskWeaver',
          AbstractText: 'Project overview',
          AbstractURL: 'https://example.com/project',
          RelatedTopics: [{ Text: 'Docs - Documentation', FirstURL: 'https://example.com/docs' }],
        }), { status: 200 })
      }
      const duckDuckGo = await service.testSearch('default provider')
      assert.equal(duckDuckGo.ok, true)
      assert.match(duckDuckGo.text, /Project overview/)
      assert.match(duckDuckGo.text, /https:\/\/example\.com\/docs/)

      await service.setConfig({ enabled: true, apiKey: 'tvly-provider-key', endpoint: 'https://api.tavily.com/search', maxResults: 5 })
      globalThis.fetch = async (url, options) => {
        assert.equal(String(url), 'https://api.tavily.com/search')
        assert.equal(options.headers.Authorization, 'Bearer tvly-provider-key')
        assert.deepEqual(JSON.parse(options.body), {
          query: 'tavily provider', max_results: 5, api_key: 'tvly-provider-key', search_depth: 'basic',
        })
        return new Response(JSON.stringify({ results: [
          { title: 'Tavily result', url: 'https://example.com/tavily', content: 'Tavily snippet' },
        ] }), { status: 200 })
      }
      const tavily = await service.testSearch('tavily provider')
      assert.equal(tavily.ok, true)
      assert.match(tavily.text, /Tavily result/)

      await service.setConfig({ enabled: true, apiKey: 'brave-provider-key', endpoint: 'https://api.search.brave.com/res/v1/web/search' })
      globalThis.fetch = async (url, options) => {
        const target = new URL(String(url))
        assert.equal(target.searchParams.get('q'), 'brave provider')
        assert.equal(target.searchParams.get('count'), '5')
        assert.equal(options.headers['X-Subscription-Token'], 'brave-provider-key')
        return new Response(JSON.stringify({ web: { results: [
          { title: 'Brave result', url: 'https://example.com/brave', description: 'Brave snippet' },
        ] } }), { status: 200 })
      }
      const brave = await service.testSearch('brave provider')
      assert.equal(brave.ok, true)
      assert.match(brave.text, /Brave result/)

      await service.setConfig({ enabled: true, apiKey: 'serper-provider-key', endpoint: 'https://google.serper.dev/search' })
      globalThis.fetch = async (url, options) => {
        assert.equal(String(url), 'https://google.serper.dev/search')
        assert.equal(options.headers['X-API-KEY'], 'serper-provider-key')
        assert.deepEqual(JSON.parse(options.body), { q: 'serper provider', num: 5 })
        return new Response(JSON.stringify({ organic: [
          { title: 'Serper result', link: 'https://example.com/serper', snippet: 'Serper snippet' },
        ] }), { status: 200 })
      }
      const serper = await service.testSearch('serper provider')
      assert.equal(serper.ok, true)
      assert.match(serper.text, /Serper result/)

      await service.setConfig({ enabled: true, apiKey: 'custom-provider-key', endpoint: 'https://search.example/query/{query}' })
      globalThis.fetch = async (url, options) => {
        assert.equal(String(url), 'https://search.example/query/custom%20provider')
        assert.equal(options.method, 'GET')
        assert.equal(options.headers.Authorization, 'Bearer custom-provider-key')
        assert.equal(options.headers['X-API-Key'], 'custom-provider-key')
        return new Response(JSON.stringify({ data: [
          { name: 'Custom result', href: 'https://example.com/custom', body: 'Custom body' },
        ] }), { status: 200 })
      }
      const custom = await service.testSearch('custom provider')
      assert.equal(custom.ok, true)
      assert.match(custom.text, /Custom result/)
    } finally {
      globalThis.fetch = originalFetch
    }

    // 9. Migrate legacy plaintext settings before exposing them to the Host.
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
    assert.equal(migratedDisk.includes('legacy-plaintext-key'), false, 'legacy clear-text key is encrypted on read')
    assert.match(migratedDisk, /"apiKeyEncrypted"\s*:\s*"enc:safe-storage:/)
    assert.equal(
      (await migratedService.prepareRuntimeIntegration()).environment.TASKWEAVER_WEB_SEARCH_API_KEY_SECRET,
      'legacy-plaintext-key',
    )

    // If safeStorage is unavailable, refuse new clear-text writes and remove old ones.
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
    await assert.rejects(
      () => insecureService.setConfig({ apiKey: 'new-key' }),
      /安全存储不可用.*拒绝保存/,
    )

    console.log('web-search-service 单元测试全部通过！')
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true })
  }
}

run().catch((err) => {
  console.error('测试失败:', err)
  process.exit(1)
})
