#!/usr/bin/env node
import { createDshHostManager } from '../electron/agent/dsh-host/spawn-host.mjs'
import { resolveDshRuntimeRoot } from '../electron/agent/dsh-host/resolve-runtime.mjs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const appPath = path.join(__dirname, '..')
const resourcesPath = process.resourcesPath ?? appPath
const isPackaged = false

console.log('诊断 DSH Host 启动...')
console.log('appPath:', appPath)
console.log('resourcesPath:', resourcesPath)
console.log('isPackaged:', isPackaged)

const runtimeRoot = resolveDshRuntimeRoot({ appPath, resourcesPath, isPackaged })
console.log('runtimeRoot:', runtimeRoot)

const userDataPath = path.join(process.env.HOME, '.taskweaver-dev')
console.log('userDataPath:', userDataPath)

const hostManager = createDshHostManager({
  runtimeRoot,
  userDataPath,
  executable: process.execPath,
})

console.log('\n正在启动 DSH Host...')
try {
  const { api, baseUrl } = await hostManager.start()
  console.log('✓ DSH Host 已启动:', baseUrl)

  console.log('\n正在获取提供方列表...')
  const providerReply = await api.llm.providers({})
  console.log('providerReply:', JSON.stringify(providerReply, null, 2))

  console.log('\n正在获取模型列表...')
  const modelReply = await api.llm.models({})
  console.log('modelReply:', JSON.stringify(modelReply, null, 2))

  console.log('\n正在获取设置命名空间...')
  const settingsReply = await api.settings.describe({})
  console.log('settingsReply:', JSON.stringify(settingsReply, null, 2))

  console.log('\n✓ 诊断完成，DSH Host 正常工作')
  await hostManager.stop()
  process.exit(0)
} catch (error) {
  console.error('\n✗ DSH Host 启动失败:', error.message)
  console.error('\n诊断日志:')
  console.error(hostManager.getDiagnostics())
  process.exit(1)
}
