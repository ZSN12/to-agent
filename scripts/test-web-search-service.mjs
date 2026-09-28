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

    console.log('web-search-service 单元测试全部通过！')
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true })
  }
}

run().catch((err) => {
  console.error('测试失败:', err)
  process.exit(1)
})
