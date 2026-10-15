import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  generateRepoMap,
  scanWorkspaceFiles,
  scanWorkspaceFilesDetailed,
  computePageRank,
  estimateTokens,
  clearRepoMapCache,
  getRepoMapCacheSize,
  setSymbolOutlineExtractor,
  fallbackExtractSymbols,
} from '../backend/repo-map-service.mjs'

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'test-repo-map-'))

function referencePageRank(fileNodes, { damping = 0.85, iterations = 20 } = {}) {
  const n = fileNodes.length
  if (n === 0) return new Map()
  if (n === 1) return new Map([[fileNodes[0].relativePath, 1]])
  const outgoing = new Map(fileNodes.map((node) => [node.relativePath, new Set()]))
  const incoming = new Map(fileNodes.map((node) => [node.relativePath, new Set()]))
  for (let i = 0; i < n; i++) {
    const source = fileNodes[i]
    for (let j = 0; j < n; j++) {
      if (i === j) continue
      const target = fileNodes[j]
      let linked = false
      for (const def of target.defs) {
        if (source.refs.has(def)) {
          linked = true
          break
        }
      }
      if (!linked) {
        const base = path.basename(target.relativePath, path.extname(target.relativePath))
        linked = source.refs.has(base)
      }
      if (linked) {
        outgoing.get(source.relativePath).add(target.relativePath)
        incoming.get(target.relativePath).add(source.relativePath)
      }
    }
  }
  let ranks = new Map(fileNodes.map((node) => [node.relativePath, 1 / n]))
  for (let iter = 0; iter < iterations; iter++) {
    let danglingSum = 0
    for (const node of fileNodes) {
      if (outgoing.get(node.relativePath).size === 0) danglingSum += ranks.get(node.relativePath)
    }
    const baseProb = (1 - damping) / n + (damping * danglingSum) / n
    const nextRanks = new Map()
    for (const node of fileNodes) {
      let incomingShare = 0
      for (const sourcePath of incoming.get(node.relativePath)) {
        const outDeg = outgoing.get(sourcePath).size
        if (outDeg > 0) incomingShare += ranks.get(sourcePath) / outDeg
      }
      nextRanks.set(node.relativePath, baseProb + damping * incomingShare)
    }
    ranks = nextRanks
  }
  return ranks
}

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
  const completeInventory = await scanWorkspaceFilesDetailed(workspace, { maxFiles: relPaths.length })
  assert.equal(completeInventory.truncated, false, '恰好到达文件上限时不能误报截断')
  const partialInventory = await scanWorkspaceFilesDetailed(workspace, { maxFiles: relPaths.length - 1 })
  assert.equal(partialInventory.files.length, relPaths.length - 1)
  assert.equal(partialInventory.truncated, true, '发现第一个超限文件时必须标记截断')
  await assert.rejects(scanWorkspaceFilesDetailed(workspace, { maxFiles: 0 }), /maxFiles/)
  await assert.rejects(scanWorkspaceFilesDetailed(workspace, { maxEntries: 0 }), /maxEntries/)

  // A large nested branch must not starve a smaller sibling workspace area.
  const broadWorkspace = path.join(tempRoot, 'broad-repo')
  await fs.mkdir(path.join(broadWorkspace, 'a-dense', 'nested'), { recursive: true })
  await fs.mkdir(path.join(broadWorkspace, 'backend'), { recursive: true })
  await fs.writeFile(path.join(broadWorkspace, 'backend', 'entry.ts'), 'export function backendEntry() {}\n')
  for (let index = 0; index < 1001; index += 1) {
    await fs.writeFile(path.join(broadWorkspace, 'a-dense', 'nested', `file-${index}.ts`), 'export const value = 1\n')
  }
  const broadInventory = await scanWorkspaceFilesDetailed(broadWorkspace, { maxFiles: 1000 })
  assert.equal(broadInventory.files.length, 1000, '扫描保留原有文件上限')
  assert.equal(broadInventory.truncated, true, '检测到额外候选文件后标记截断')
  assert.ok(broadInventory.files.some((file) => file.relativePath === 'backend/entry.ts'),
    '广度优先遍历应覆盖其他根目录后再深入密集分支')
  const entryBoundInventory = await scanWorkspaceFilesDetailed(broadWorkspace, { maxFiles: 100, maxEntries: 1 })
  assert.equal(entryBoundInventory.files.length, 0)
  assert.equal(entryBoundInventory.truncated, true, '目录项上限也必须标记未完成的库存扫描')
  assert.match(await generateRepoMap(broadWorkspace, { maxFiles: 100, maxEntries: 1 }),
    /Repo Map partial: inventory has 0 indexed files/,
    '库存截断且尚无候选文件时也必须明确返回部分结果')
  const repeatedBroadInventory = await scanWorkspaceFilesDetailed(broadWorkspace, { maxFiles: 1000 })
  assert.deepEqual(repeatedBroadInventory.files.map((file) => file.relativePath),
    broadInventory.files.map((file) => file.relativePath), '遍历结果应保持确定性')
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
  assert.doesNotMatch(defaultMap, /Repo Map partial/, '完整且预算充足的地图不应出现截断说明')

  const truncatedMap = await generateRepoMap(workspace, { maxTokens: 100, maxFiles: 3 })
  assert.match(truncatedMap, /Repo Map partial: inventory has 3 indexed files/)
  assert.equal(await generateRepoMap(workspace, { maxTokens: 100, maxFiles: 3 }), truncatedMap,
    'Repo Map 文本缓存命中时必须保留相同截断说明')
  const tokenTruncatedMap = await generateRepoMap(workspace, { maxTokens: 30 })
  assert.match(tokenTruncatedMap, /output hit the 30-token limit/)
  assert.ok(estimateTokens(tokenTruncatedMap) <= 30)

  // 验证 PageRank 计算
  const fileNodes = [
    { relativePath: 'auth.ts', defs: new Set(['AuthService']), refs: new Set(['UserModel', 'TokenHelper', 'Logger']) },
    { relativePath: 'payment.ts', defs: new Set(['PaymentProcessor']), refs: new Set(['Logger']) },
    { relativePath: 'logger.ts', defs: new Set(['Logger']), refs: new Set() },
    { relativePath: 'user.ts', defs: new Set(['UserModel']), refs: new Set() },
  ]
  const ranks = computePageRank(fileNodes)
  assert.ok(ranks.get('logger.ts') > ranks.get('auth.ts'), '被多个模块引用的 Logger 应获得更高的 PageRank')

  const graphCases = [
    { relativePath: 'src/auth.ts', defs: new Set(['AuthService']), refs: new Set(['Logger', 'tokens', 'Self']) },
    { relativePath: 'src/logging.ts', defs: new Set(['Logger', 'Shared']), refs: new Set(['AuthService']) },
    { relativePath: 'src/other/logging.js', defs: new Set(['Shared']), refs: new Set(['Logger']) },
    { relativePath: 'src/tokens.ts', defs: new Set(['TokenStore']), refs: new Set(['Shared']) },
    { relativePath: 'src/isolated.ts', defs: new Set(['Self']), refs: new Set(['Self']) },
  ]
  const optimizedRanks = computePageRank(graphCases)
  const referenceRanks = referencePageRank(graphCases)
  for (const [relativePath, rank] of referenceRanks) {
    assert.ok(Math.abs(optimizedRanks.get(relativePath) - rank) < 1e-12, `优化后的 PageRank 必须保持 ${relativePath} 的原有结果`)
  }
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

  // Case 5: 内存缓存 freshness 验证
  clearRepoMapCache()
  assert.equal(getRepoMapCacheSize(), 0, '清空缓存后大小为 0')
  await generateRepoMap(workspace)
  const initialCacheSize = getRepoMapCacheSize()
  assert.ok(initialCacheSize > 0, '首次生成后缓存应当有记录')

  // 第二次调用，缓存命中，大小保持不变
  await generateRepoMap(workspace)
  assert.equal(getRepoMapCacheSize(), initialCacheSize, '重复调用时不应重复新建无用条目')

  const userModelPath = path.join(workspace, 'src', 'models', 'user.ts')
  const userModelStat = await fs.stat(userModelPath)
  const originalUserModel = await fs.readFile(userModelPath, 'utf8')
  const priorSameQueryMap = await generateRepoMap(workspace, { query: 'UserProfile', maxTokens: 4000 })
  assert.match(priorSameQueryMap, /UserProfile/)
  const sameSizeUserModel = originalUserModel.replace('UserProfile', 'UserAccount')
  assert.equal(Buffer.byteLength(sameSizeUserModel), Buffer.byteLength(originalUserModel), '缓存碰撞夹具必须保持文件大小不变')
  await fs.writeFile(userModelPath, sameSizeUserModel)
  await fs.utimes(userModelPath, userModelStat.atime, userModelStat.mtime)
  const sameSizeUpdatedMap = await generateRepoMap(workspace, { query: 'UserProfile', maxTokens: 4000 })
  assert.match(sameSizeUpdatedMap, /UserAccount/, 'ctimeNs 应识别同大小且 mtime 恢复后的内容变化')
  assert.doesNotMatch(sameSizeUpdatedMap, /UserProfile/, '文件清单摘要必须阻止旧查询文本缓存命中')

  // 修改另一个文件内容并重新测试
  await fs.appendFile(path.join(workspace, 'src', 'utils', 'logger.ts'), '\nexport function newLogHelper() {}\n')
  const updatedMap = await generateRepoMap(workspace, { query: 'newLogHelper' })
  assert.match(updatedMap, /newLogHelper/, '修改文件后应刷新缓存并提取新符号')
  console.log('✓ Case 5: 内存缓存与 mtime 失效机制验证通过')

  // Case 6: 磁盘只保存大纲/引用索引，并在重启式冷内存后增量复用
  const outlineCacheDirectory = path.join(tempRoot, 'persistent-repo-map-cache')
  let persistentExtractorCalls = 0
  setSymbolOutlineExtractor((filePath, content) => {
    persistentExtractorCalls += 1
    return fallbackExtractSymbols(filePath, content)
  })
  clearRepoMapCache()
  const persistentMap = await generateRepoMap(workspace, { maxTokens: 4000, cacheDirectory: outlineCacheDirectory })
  const initialExtractorCalls = persistentExtractorCalls
  assert.ok(initialExtractorCalls > 0, '冷磁盘缓存必须提取一次源码符号')
  const outlineCacheFiles = await fs.readdir(outlineCacheDirectory)
  assert.equal(outlineCacheFiles.length, 1, '每个工作区使用一个有界缓存文件')
  const outlineCacheDoc = JSON.parse(await fs.readFile(path.join(outlineCacheDirectory, outlineCacheFiles[0]), 'utf8'))
  assert.equal(outlineCacheDoc.schema, 2)
  assert.ok(outlineCacheDoc.files.length > 0)
  assert.ok(outlineCacheDoc.files.every((item) => !Object.hasOwn(item, 'content')),
    '持久化缓存只保存路径元数据、符号与引用，不保存文件全文')

  clearRepoMapCache()
  persistentExtractorCalls = 0
  const warmDiskMap = await generateRepoMap(workspace, { maxTokens: 4000, cacheDirectory: outlineCacheDirectory })
  assert.equal(persistentExtractorCalls, 0, '清空进程内缓存后应直接复用磁盘中的未变化大纲')
  assert.equal(warmDiskMap, persistentMap, '复用持久化大纲时地图输出保持稳定')

  const loggerPath = path.join(workspace, 'src', 'utils', 'logger.ts')
  const loggerStat = await fs.stat(loggerPath)
  const originalLogger = await fs.readFile(loggerPath, 'utf8')
  const sameSizeLogger = originalLogger.replace('Logger', 'LoggrX')
  assert.equal(Buffer.byteLength(sameSizeLogger), Buffer.byteLength(originalLogger))
  await fs.writeFile(loggerPath, sameSizeLogger)
  await fs.utimes(loggerPath, loggerStat.atime, loggerStat.mtime)
  clearRepoMapCache()
  persistentExtractorCalls = 0
  const sameSizeDiskMap = await generateRepoMap(workspace, { maxTokens: 4000, cacheDirectory: outlineCacheDirectory })
  assert.match(sameSizeDiskMap, /class LoggrX/, '持久缓存也必须识别同大小且 mtime 恢复后的内容变化')
  assert.equal(persistentExtractorCalls, 1, '持久缓存只重提取发生变化的文件')

  await fs.appendFile(path.join(workspace, 'src', 'utils', 'logger.ts'), '\nexport class PersistentCacheRefresh {}\n')
  clearRepoMapCache()
  persistentExtractorCalls = 0
  const incrementallyUpdatedMap = await generateRepoMap(workspace, { maxTokens: 4000, cacheDirectory: outlineCacheDirectory })
  assert.match(incrementallyUpdatedMap, /PersistentCacheRefresh/)
  assert.equal(persistentExtractorCalls, 1, '文件变化时只重新提取发生变化的文件')
  setSymbolOutlineExtractor(null)
  console.log('✓ Case 6: Repo Map 磁盘大纲缓存、冷启动复用与增量更新验证通过')

  // Case 7: 符号提取器注入与 precomputedSymbols 兼容性验证
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

  // Case 8: 边界情况（空目录、极端字符、零预算等）
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
