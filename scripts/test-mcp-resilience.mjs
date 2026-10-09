#!/usr/bin/env node
/**
 * scripts/test-mcp-resilience.mjs
 * 
 * MCP 版本与健康治理韧性测试：
 * 1. 安装版本锁定（pin + 记录元数据）
 * 2. 探活与健康探测机制 (probeServer / probeAllServers)
 * 3. 第三方 MCP 失联时的自动摘除 (auto-eviction) 与非阻塞保证
 * 4. 故障退避机制 (fault backoff) 避免重复重试雪崩
 * 5. 运行时调用故障的现场摘除与退避
 */

import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  catalogEntryToServerConfig,
  getMarketplaceEntry,
  DEFAULT_PINNED_VERSIONS,
} from '../electron/backend/mcp-marketplace.mjs'
import { createMcpService } from '../electron/backend/mcp-service.mjs'

console.log('🧪 开始 MCP 版本与健康治理测试 (test-mcp-resilience)...')

// ==========================================
// 1. 测试安装版本锁定 (Pin + 记录元数据)
// ==========================================
console.log('  1. 验证安装版本锁定与元数据记录...')
const memoryEntry = getMarketplaceEntry('memory')
assert.ok(memoryEntry, '应能检索到 memory 目录项')
assert.equal(memoryEntry.pinnedVersion, DEFAULT_PINNED_VERSIONS.memory)

// 默认安装锁定版本
const defaultPinnedConfig = catalogEntryToServerConfig('memory')
assert.equal(defaultPinnedConfig.id, 'memory')
assert.equal(defaultPinnedConfig.version, DEFAULT_PINNED_VERSIONS.memory)
assert.equal(defaultPinnedConfig.pinned, true)
assert.ok(defaultPinnedConfig.installedAt)
assert.equal(defaultPinnedConfig.marketplaceId, 'taskweaver-bundled')
// 检查 args 中包名已锁定版本号
const hasPinnedArg = defaultPinnedConfig.args.some((arg) => arg.includes(`@modelcontextprotocol/server-memory@${DEFAULT_PINNED_VERSIONS.memory}`))
assert.ok(hasPinnedArg, `参数中应包含锁定版本，实际 args: ${JSON.stringify(defaultPinnedConfig.args)}`)

// 自定义版本锁定
const customPinnedConfig = catalogEntryToServerConfig('memory', { version: '1.0.0-custom' })
assert.equal(customPinnedConfig.version, '1.0.0-custom')
assert.ok(customPinnedConfig.args.some((arg) => arg.includes('@modelcontextprotocol/server-memory@1.0.0-custom')))

// 显式指定 pin: false 不锁定
const unpinnedConfig = catalogEntryToServerConfig('memory', { pin: false })
assert.equal(unpinnedConfig.pinned, false)
assert.ok(unpinnedConfig.args.some((arg) => arg === '@modelcontextprotocol/server-memory'))
console.log('  ✓ 版本锁定与元数据记录测试通过')

// ==========================================
// 2. 模拟运行环境测试韧性治理
// ==========================================
const testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tw-mcp-resilience-'))
const mockSafeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (str) => Buffer.from(`enc_${str}`),
  decryptString: (buf) => buf.toString().replace(/^enc_/, ''),
}

let connectAttempts = { okSrv: 0, badSrv: 0 }
let badSrvShouldFail = true

const resilienceService = createMcpService({
  userData: testDir,
  safeStorage: mockSafeStorage,
  connectClient: async (server) => {
    if (server.id === 'ok-srv') {
      connectAttempts.okSrv += 1
      return {
        listTools: async () => ({
          tools: [
            { name: 'healthy_tool', description: '正常可用的 MCP 工具', inputSchema: { type: 'object' } },
          ],
        }),
        callTool: async () => ({ content: [{ type: 'text', text: 'ok-result' }] }),
        close: async () => {},
      }
    }

    if (server.id === 'bad-srv') {
      connectAttempts.badSrv += 1
      if (badSrvShouldFail) {
        throw new Error('模拟第三方 MCP 服务失联（端口拒绝或进程崩溃）')
      }
      return {
        listTools: async () => ({
          tools: [{ name: 'recovered_tool', description: '恢复的工具' }],
        }),
        callTool: async () => ({ content: [{ type: 'text', text: 'recovered-result' }] }),
        close: async () => {},
      }
    }

    throw new Error(`未知服务: ${server.id}`)
  },
})

try {
  // 注册一个正常服务和一个失联服务
  await resilienceService.saveServer({
    id: 'ok-srv',
    command: 'node',
    args: ['healthy.mjs'],
    version: '0.6.2',
    pinned: true,
    enabled: true,
  })

  await resilienceService.saveServer({
    id: 'bad-srv',
    command: 'node',
    args: ['unreachable.mjs'],
    version: '0.6.2',
    pinned: true,
    enabled: true,
  })

  // 验证探活探测 (probeServer)
  console.log('  2. 验证主动探活与健康检测机制...')
  const healthyProbe = await resilienceService.probeServer('ok-srv')
  assert.equal(healthyProbe.status, 'connected')
  assert.equal(healthyProbe.toolCount, 1)
  assert.equal(healthyProbe.health.inBackoff, false)
  assert.equal(healthyProbe.health.evicted, false)

  const badProbe = await resilienceService.probeServer('bad-srv')
  assert.equal(badProbe.status, 'error')
  assert.equal(badProbe.toolCount, 0)
  assert.equal(badProbe.health.inBackoff, true)
  assert.equal(badProbe.health.evicted, true)
  assert.equal(badProbe.health.consecutiveFailures, 1)
  console.log('  ✓ 主动探活探测测试通过')

  // 验证工具发现时的失联自动摘除 (Auto Eviction)
  console.log('  3. 验证第三方服务失联时的工具自动摘除与非阻塞保证...')
  const customToolsResult = await resilienceService.getCustomTools()
  // 断言：失联服务的工具必须被摘除，只保留健康服务的工具
  const toolNames = customToolsResult.tools.map((t) => t.name)
  assert.ok(toolNames.includes('mcp__ok-srv__healthy_tool'))
  assert.equal(toolNames.some((t) => t.includes('bad-srv')), false, '失联服务的工具必须从工具目录中完全摘除')

  // 断言：evictedServers 必须明确记录失联服务及原因，通知上层
  assert.ok(customToolsResult.evictedServers)
  const evictedBad = customToolsResult.evictedServers.find((s) => s.id === 'bad-srv')
  assert.ok(evictedBad, 'evictedServers 必须包含 bad-srv')
  assert.ok(evictedBad.reason.includes('失联') || evictedBad.reason.includes('失败'))
  console.log('  ✓ 失联工具自动摘除测试通过')

  // 验证故障退避机制 (Fault Backoff)
  console.log('  4. 验证退避窗口内避免反复连接雪崩...')
  const currentBadAttempts = connectAttempts.badSrv
  // 再次调用 getCustomTools，此时处于退避期内，不应再次触发实际 connect
  await resilienceService.getCustomTools()
  assert.equal(connectAttempts.badSrv, currentBadAttempts, '处于退避窗口期内严禁高频重试轰炸')
  console.log('  ✓ 故障退避窗口保护测试通过')

  // 验证重置与恢复
  console.log('  5. 验证服务恢复与退避重置...')
  badSrvShouldFail = false
  resilienceService.resetBackoff('bad-srv')
  const recoveredProbe = await resilienceService.probeServer('bad-srv')
  assert.equal(recoveredProbe.status, 'connected')
  assert.equal(recoveredProbe.health.evicted, false)
  assert.equal(recoveredProbe.health.consecutiveFailures, 0)

  const toolsAfterRecovery = await resilienceService.getCustomTools()
  const recoveredNames = toolsAfterRecovery.tools.map((t) => t.name)
  assert.ok(recoveredNames.includes('mcp__bad-srv__recovered_tool'))
  assert.equal(toolsAfterRecovery.evictedServers.length, 0)
  console.log('  ✓ 服务恢复与重新注册工具测试通过')

  // 验证运行时调用故障的动态摘除
  console.log('  6. 验证运行时工具调用崩溃后的现场摘除...')
  let fragileCallCount = 0
  const fragileService = createMcpService({
    userData: path.join(testDir, 'fragile'),
    safeStorage: mockSafeStorage,
    connectClient: async () => ({
      listTools: async () => ({
        tools: [{ name: 'fragile_op', description: '易崩工具' }],
      }),
      callTool: async () => {
        fragileCallCount += 1
        throw new Error('EPIPE: client process died unexpectedly')
      },
      close: async () => {},
    }),
  })

  await fragileService.saveServer({ id: 'fragile-srv', command: 'node', enabled: true })
  const fragileTools = await fragileService.getCustomTools()
  assert.equal(fragileTools.tools.length, 2) // full and legacy name

  // 调用报错
  await assert.rejects(
    () => fragileTools.tools[0].execute('call-crash', {}),
    /MCP 工具调用失败/,
  )

  // 验证报错后已现场摘除并进入退避
  const fragileServers = await fragileService.listServers()
  const fragileState = fragileServers.find((s) => s.id === 'fragile-srv')
  assert.equal(fragileState.health.evicted, true)
  assert.equal(fragileState.health.inBackoff, true)
  assert.equal(fragileState.health.consecutiveFailures, 1)

  // 再次获取工具列表，易崩服务已被自动摘除
  const afterCrashTools = await fragileService.getCustomTools()
  assert.equal(afterCrashTools.tools.length, 0, '发生调用异常的服务已被动态摘除')
  assert.equal(afterCrashTools.evictedServers.length, 1)
  console.log('  ✓ 运行时调用崩溃现场摘除测试通过')

} finally {
  await fs.rm(testDir, { recursive: true, force: true }).catch(() => {})
}

console.log('🎉 test-mcp-resilience: 全部通过！\n')
