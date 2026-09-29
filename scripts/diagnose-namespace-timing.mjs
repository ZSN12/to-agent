#!/usr/bin/env node
import { createZHostManager, resolveTaskWeaverRuntimeRoot } from '../electron/agent/z-host/index.mjs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const appPath = path.join(__dirname, '..')
const resourcesPath = process.resourcesPath ?? appPath
const isPackaged = false

console.log('测试命名空间注册时机...')

const runtimeRoot = resolveTaskWeaverRuntimeRoot({ appPath, resourcesPath, isPackaged })
const userDataPath = path.join(process.env.HOME, '.taskweaver-dev')

const hostManager = createZHostManager({
  runtimeRoot,
  userDataPath,
  executable: process.execPath,
})

try {
  const { api, baseUrl } = await hostManager.start()
  console.log('✓ DSH Host 已启动:', baseUrl)

  // 立即检查命名空间
  for (let i = 0; i < 20; i++) {
    await new Promise(resolve => setTimeout(resolve, 500))
    const settingsReply = await api.settings.describe({})
    const namespaces = settingsReply.result?.value?.namespaces ?? []
    const hasLlmPiAi = namespaces.some(ns => ns.ns === 'llm-pi-ai')
    console.log(`第 ${i + 1} 次检查 (${(i + 1) * 0.5}s): ${hasLlmPiAi ? '✓ 找到' : '✗ 未找到'} llm-pi-ai`)
    if (hasLlmPiAi) {
      console.log(`\n命名空间在启动后 ${(i + 1) * 0.5}s 出现`)
      break
    }
  }

  await hostManager.stop()
  process.exit(0)
} catch (error) {
  console.error('\n✗ 测试失败:', error.message)
  process.exit(1)
}
