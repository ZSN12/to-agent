#!/usr/bin/env node
/**
 * 验证 DSH 后端迁移的关键修复
 */

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '..')

console.log('🔍 验证 DSH 后端迁移修复...\n')

let allPassed = true

// 检查 1: credentialStore 初始化顺序
console.log('1️⃣  检查 credentialStore 初始化顺序')
const registerIpc = readFileSync(join(rootDir, 'electron/backend/register-ipc.mjs'), 'utf8')
const lines = registerIpc.split('\n')

const credentialStoreLineIdx = lines.findIndex(l => l.includes('const credentialStore = createCredentialStore'))
const modelServiceLineIdx = lines.findIndex(l => l.includes('const modelService = createModelService'))

if (credentialStoreLineIdx > 0 && credentialStoreLineIdx < modelServiceLineIdx) {
  console.log('   ✅ credentialStore 在 modelService 之前创建')
} else {
  console.log('   ❌ credentialStore 初始化顺序错误')
  allPassed = false
}

// 检查 2: customProviderService 使用正确的变量名
console.log('\n2️⃣  检查 customProviderService 凭据引用')
const hasCorrectRef = registerIpc.includes('credentials: credentialStore')
const hasWrongRef = registerIpc.includes('credentials: credentialsService')

if (hasCorrectRef && !hasWrongRef) {
  console.log('   ✅ customProviderService 使用正确的 credentialStore')
} else {
  console.log('   ❌ customProviderService 凭据引用错误')
  allPassed = false
}

// 检查 3: OAuth 回调可选性
console.log('\n3️⃣  检查 OAuth UI 回调可选性')
const modelSettingsPanel = readFileSync(
  join(rootDir, 'src/features/models/ModelSettingsPanel.tsx'),
  'utf8'
)

const hasOptionalCallbacks =
  modelSettingsPanel.includes('onStartOAuthLogin?:') &&
  modelSettingsPanel.includes('onCancelOAuthLogin?:') &&
  modelSettingsPanel.includes('onSubmitOAuthCode?:')

const hasSafetyChecks =
  modelSettingsPanel.includes('if (onStartOAuthLogin)') &&
  modelSettingsPanel.includes('if (onCancelOAuthLogin)') &&
  modelSettingsPanel.includes('if (onSubmitOAuthCode)')

if (hasOptionalCallbacks && hasSafetyChecks) {
  console.log('   ✅ OAuth 回调正确标记为可选并有防护检查')
} else {
  console.log('   ❌ OAuth 回调可选性或防护检查缺失')
  allPassed = false
}

// 检查 4: pricing 服务导入导出
console.log('\n4️⃣  检查 pricing 服务导入导出')
const pricingService = readFileSync(
  join(rootDir, 'electron/backend/pricing-sync-service.mjs'),
  'utf8'
)

const hasExport = pricingService.includes('export function createPricingSyncService')
const hasImport = registerIpc.includes("import { createPricingSyncService } from './pricing-sync-service.mjs'")
const hasUsage = registerIpc.includes('const pricingSync = createPricingSyncService')

if (hasExport && hasImport && hasUsage) {
  console.log('   ✅ pricing 服务正确导入导出和使用')
} else {
  console.log('   ❌ pricing 服务导入导出或使用有问题')
  allPassed = false
}

// 检查 5: DSH hostManager 集成
console.log('\n5️⃣  检查 DSH hostManager 集成')
const hasHostManagerCreation = registerIpc.includes('const hostManager = createZHostManager')
const hasHostManagerAssignment = registerIpc.includes('Object.assign(modelService, { dshHostManager: hostManager })')
const hasChatServiceIntegration = registerIpc.includes('hostManager,') && registerIpc.includes('const chat = createDshChatService')

if (hasHostManagerCreation && hasHostManagerAssignment && hasChatServiceIntegration) {
  console.log('   ✅ DSH hostManager 正确创建和集成')
} else {
  console.log('   ❌ DSH hostManager 集成有问题')
  allPassed = false
}

// 总结
console.log('\n' + '='.repeat(50))
if (allPassed) {
  console.log('✅ 所有检查通过！DSH 后端迁移修复验证成功')
  process.exit(0)
} else {
  console.log('❌ 部分检查失败，请查看上述错误')
  process.exit(1)
}
