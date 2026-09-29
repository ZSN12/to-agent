import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { createWebSearchService } from '../electron/backend/web-search-service.mjs'

async function run() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tw-web-search-test-'))

  try {
    const service = createWebSearchService({ userData: tmpDir })

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

    // 再次读取脱敏配置
    const fetched = await service.getConfig()
    assert.equal(fetched.hasKey, true)
    assert.equal(fetched.endpoint, 'https://api.tavily.com/search')
    assert.equal(fetched.maxResults, 8)

    // 3. 留空保持现有 key
    const kept = await service.setConfig({
      endpoint: 'https://api.custom.com/search',
      maxResults: 6,
    })
    assert.equal(kept.hasKey, true, '留空保持当前 key')
    assert.equal(kept.endpoint, 'https://api.custom.com/search')
    assert.equal(kept.maxResults, 6)

    // 4. 清除现有 key
    const cleared = await service.setConfig({
      clearKey: true,
    })
    assert.equal(cleared.hasKey, false, 'clearKey=true 清空 key')

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
    } finally {
      globalThis.fetch = originalFetch
    }

    console.log('web-search-service 单元测试全部通过！')
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true })
  }
}

run().catch((err) => {
  console.error('测试失败:', err)
  process.exit(1)
})
