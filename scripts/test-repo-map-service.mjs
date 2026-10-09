import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  generateRepoMap,
  scanWorkspaceFiles,
  computePageRank,
  estimateTokens,
  clearRepoMapCache,
  getRepoMapCacheSize,
  setSymbolOutlineExtractor,
} from '../electron/backend/repo-map-service.mjs'

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'test-repo-map-'))

try {
  const workspace = path.join(tempRoot, 'repo')

  // 1. 搭建多文件代码仓库
  await fs.mkdir(path.join(workspace, 'src', 'auth'), { recursive: true })
  await fs.mkdir(path.join(workspace, 'src', 'models'), { recursive: true })
  await fs.mkdir(path.join(workspace, 'src', 'utils'), { recursive: true })
  await fs.mkdir(path.join(workspace, 'src', 'billing'), { recursive: true })
  await fs.mkdir(path.join(workspace, 'node_modules', 'dep'), { recursive: true })
  await fs.mkdir(path.join(workspace, '.git'), { recursive: true })
  await fs.mkdir(path.join(workspace, 'dist'), { recursive: true })

  // src/models/user.ts (被 auth 引用)
  await fs.writeFile(
    path.join(workspace, 'src', 'models', 'user.ts'),
    `export interface UserProfile {
  id: string
  name: string
}

export class UserModel {
  validateUser(data: any) {}
}
`,
  )

  // src/utils/token.ts (被 auth 引用)
  await fs.writeFile(
    path.join(workspace, 'src', 'utils', 'token.ts'),
    `export class TokenHelper {
  createToken(payload: any) {}
  verifyToken(token: string) {}
}
`,
  )

  // src/utils/logger.ts (被多个文件引用)
  await fs.writeFile(
    path.join(workspace, 'src', 'utils', 'logger.ts'),
    `export class Logger {
  logInfo(msg: string) {}
  logError(err: any) {}
}
`,
  )

  // src/auth/service.ts (引用 UserModel, TokenHelper, Logger)
  await fs.writeFile(
    path.join(workspace, 'src', 'auth', 'service.ts'),
    `import { UserModel } from '../models/user'
import { TokenHelper } from '../utils/token'
import { Logger } from '../utils/logger'

export class AuthService {
  login(username: string, pass: string) {
    UserModel
    TokenHelper
    Logger
  }

  logout() {}
}
`,
  )

  // src/billing/payment.ts (引用 Logger)
  await fs.writeFile(
    path.join(workspace, 'src', 'billing', 'payment.ts'),
    `import { Logger } from '../utils/logger'

export class PaymentProcessor {
  chargeCreditCard(amount: number) {
    Logger
  }

  refundPayment(txId: string) {}
}
`,
  )

  // src/billing/invoice.ts (引用 PaymentProcessor)
  await fs.writeFile(
    path.join(workspace, 'src', 'billing', 'invoice.ts'),
    `import { PaymentProcessor } from './payment'

export class InvoiceManager {
  generateInvoice(orderId: string) {
    PaymentProcessor
  }
}
`,
  )

  // 忽略的文件
  await fs.writeFile(path.join(workspace, 'node_modules', 'dep', 'index.js'), 'export const hidden = 1\n')
  await fs.writeFile(path.join(workspace, '.git', 'config'), '[core]\n')
  await fs.writeFile(path.join(workspace, 'dist', 'bundle.js'), 'var bundle = 1;\n')
  await fs.writeFile(path.join(workspace, 'binary.dat'), Buffer.from([0, 1, 2, 3]))

  console.log('✓ 模拟工作区文件树构建完毕')

  // Case 1: 扫描与忽略规则验证
  const files = await scanWorkspaceFiles(workspace)
  const relPaths = files.map((f) => f.relativePath)
  assert.ok(relPaths.includes('src/auth/service.ts'), '应当包含 service.ts')
  assert.ok(relPaths.includes('src/models/user.ts'), '应当包含 user.ts')
  assert.ok(relPaths.includes('src/utils/token.ts'), '应当包含 token.ts')
  assert.ok(relPaths.includes('src/billing/payment.ts'), '应当包含 payment.ts')
  assert.ok(!relPaths.some((p) => p.includes('node_modules')), '必须忽略 node_modules')
  assert.ok(!relPaths.some((p) => p.includes('.git')), '必须忽略 .git')
  assert.ok(!relPaths.some((p) => p.includes('dist')), '必须忽略 dist')
  assert.ok(!relPaths.some((p) => p.endsWith('.dat')), '必须忽略非代码文件')
  console.log('✓ Case 1: 文件扫描及忽略规则验证通过')

  // Case 2: 无 Query 基础地图生成与 PageRank 分析
  clearRepoMapCache()
  const defaultMap = await generateRepoMap(workspace, { maxTokens: 4000 })
  assert.ok(defaultMap.length > 0, '生成的地图不应为空')
  assert.match(defaultMap, /src\/auth\/service\.ts:/, '应包含 auth 路径')
  assert.match(defaultMap, /class AuthService/, '应提取出 AuthService 类')
  assert.match(defaultMap, /class PaymentProcessor/, '应提取出 PaymentProcessor')
  assert.match(defaultMap, /class Logger/, '应提取出 Logger')
  assert.ok(!defaultMap.includes('node_modules'), '地图内容绝不能包含 node_modules')

  // 验证 PageRank 计算
  const fileNodes = [
    { relativePath: 'auth.ts', defs: new Set(['AuthService']), refs: new Set(['UserModel', 'TokenHelper', 'Logger']) },
    { relativePath: 'payment.ts', defs: new Set(['PaymentProcessor']), refs: new Set(['Logger']) },
    { relativePath: 'logger.ts', defs: new Set(['Logger']), refs: new Set() },
    { relativePath: 'user.ts', defs: new Set(['UserModel']), refs: new Set() },
  ]
  const ranks = computePageRank(fileNodes)
  assert.ok(ranks.get('logger.ts') > ranks.get('auth.ts'), '被多个模块引用的 Logger 应获得更高的 PageRank')
  console.log('✓ Case 2: 基础地图生成与 PageRank 计算验证通过')

  // Case 3: Query 意图引导与符号重排
  const authQueryMap = await generateRepoMap(workspace, { query: 'auth 登录验证 token login' })
  const authLines = authQueryMap.split('\n')
  // 最靠前的行应为 auth 或 token
  const firstFew = authLines.slice(0, 2).join(' ')
  assert.ok(firstFew.includes('auth') || firstFew.includes('token'), '相关度最高的 auth/token 文件应排在最前列')

  const billQueryMap = await generateRepoMap(workspace, { query: 'invoice 账单 发票 payment' })
  const billLines = billQueryMap.split('\n')
  const firstBillFew = billLines.slice(0, 2).join(' ')
  assert.ok(firstBillFew.includes('invoice') || firstBillFew.includes('payment'), '相关度最高的 billing 文件应排在最前列')
  console.log('✓ Case 3: Query 意图引导筛选验证通过')

  // Case 4: Token 预算严格限制 (Token Budget Truncation)
  const budget50 = await generateRepoMap(workspace, { maxTokens: 40 })
  const tokens50 = estimateTokens(budget50)
  assert.ok(tokens50 <= 40, `预算为 40 时生成的 token (${tokens50}) 不应超出上限`)

  const budget100 = await generateRepoMap(workspace, { maxTokens: 100 })
  const tokens100 = estimateTokens(budget100)
  assert.ok(tokens100 <= 100, `预算为 100 时生成的 token (${tokens100}) 不应超出上限`)
  assert.ok(tokens100 >= tokens50, '更大预算应能容纳更多或相同的内容')
  console.log('✓ Case 4: Token 预算严格控制验证通过 (50 / 100 tokens)')

  // Case 5: 内存缓存 (mtime) 验证
  clearRepoMapCache()
  assert.equal(getRepoMapCacheSize(), 0, '清空缓存后大小为 0')
  await generateRepoMap(workspace)
  const initialCacheSize = getRepoMapCacheSize()
  assert.ok(initialCacheSize > 0, '首次生成后缓存应当有记录')

  // 第二次调用，缓存命中，大小保持不变
  await generateRepoMap(workspace)
  assert.equal(getRepoMapCacheSize(), initialCacheSize, '重复调用时不应重复新建无用条目')

  // 修改某个文件内容并重新测试
  await fs.appendFile(path.join(workspace, 'src', 'utils', 'logger.ts'), '\nexport function newLogHelper() {}\n')
  const updatedMap = await generateRepoMap(workspace, { query: 'newLogHelper' })
  assert.match(updatedMap, /newLogHelper/, '修改文件后应刷新缓存并提取新符号')
  console.log('✓ Case 5: 内存缓存与 mtime 失效机制验证通过')

  // Case 6: 符号提取器注入与 precomputedSymbols 兼容性验证
  const customSymbolsMap = await generateRepoMap(workspace, {
    precomputedSymbols: {
      'virtual/api.ts': [
        { name: 'ApiClient', kind: 'class' },
        { name: 'fetchOrders', kind: 'function' },
      ],
      'virtual/store.ts': [
        'interface GlobalStore',
        'type ActionType',
      ],
    },
  })
  assert.match(customSymbolsMap, /virtual\/api\.ts: class ApiClient \| function fetchOrders/)
  assert.match(customSymbolsMap, /virtual\/store\.ts: interface GlobalStore \| type ActionType/)

  // 测试自定义符号提取器函数注入
  setSymbolOutlineExtractor(async (file, content) => {
    return [{ name: 'CustomInjectedSymbol', kind: 'class' }]
  })
  clearRepoMapCache()
  const injectedMap = await generateRepoMap(workspace)
  assert.match(injectedMap, /CustomInjectedSymbol/, '注入自定义提取器后应当正常工作')
  // 恢复默认
  setSymbolOutlineExtractor(null)
  console.log('✓ Case 6: 符号提取器注入与 precomputedSymbols 验证通过')

  // Case 7: 边界情况（空目录、极端字符、零预算等）
  const emptyDir = path.join(tempRoot, 'empty')
  await fs.mkdir(emptyDir)
  const emptyResult = await generateRepoMap(emptyDir)
  assert.equal(emptyResult, '', '空工作区应返回空字符串')

  const zeroTokens = await generateRepoMap(workspace, { maxTokens: 0 })
  assert.equal(zeroTokens, '', '0 token 预算应返回空字符串')
  console.log('✓ Case 7: 边界与异常情况防御性测试通过')

  console.log('\n========================================')
  console.log('🎉 所有 repo-map-service 测试用例 100% 通过!')
  console.log('========================================\n')
} finally {
  await fs.rm(tempRoot, { recursive: true, force: true })
}
