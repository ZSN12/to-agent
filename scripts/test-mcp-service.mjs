import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createMcpService } from '../electron/backend/mcp-service.mjs'

const userData = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-mcp-test-'))
let connects = 0
let closes = 0
let lastCall = null

const mockSafeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (str) => Buffer.from(`enc_${str}`),
  decryptString: (buf) => buf.toString().replace(/^enc_/, ''),
}

// 1. 测试安全基线：当 safeStorage 不可用时，保存包含环境变量的配置必须坚决拒绝并抛错
const insecureService = createMcpService({ userData: path.join(userData, 'insecure'), safeStorage: null })
await assert.rejects(
  () => insecureService.saveServer({ id: 'insecure-srv', command: 'node', args: [], env: { KEY: 'sensitive' }, enabled: false }),
  /安全存储.*不可用.*拒绝保存/,
  '安全存储不可用时绝不允许明文写入磁盘！',
)

// 2. 正常加密环境下的服务
const service = createMcpService({
  userData,
  safeStorage: mockSafeStorage,
  connectClient: async () => {
    connects += 1
    return {
      listTools: async () => ({ tools: [
        { name: 'lookup', description: 'Read one item', inputSchema: { type: 'object', properties: { id: { type: 'string' } } }, annotations: { readOnlyHint: true } },
        { name: 'modify', description: 'Modify one item', inputSchema: { type: 'object', properties: {} } },
      ] }),
      callTool: async (call) => {
        lastCall = call
        return { content: [{ type: 'text', text: 'found' }] }
      },
      close: async () => { closes += 1 },
    }
  },
})

try {
  assert.deepEqual(await service.listServers(), [])
  await service.saveServer({ id: 'local', command: 'node', args: ['server.mjs'], env: { API_TOKEN: 'secret' }, enabled: false })
  assert.equal((await service.getCustomTools()).tools.length, 0)
  assert.equal(connects, 0)

  // 验证磁盘写入格式必须是 enc:aes256:，绝不能出现敏感明文字符串
  const rawDiskConfig = await fs.readFile(path.join(userData, 'taskweaver-mcp.json'), 'utf8')
  assert.equal(rawDiskConfig.includes('secret'), false, '磁盘配置文件严禁出现明文凭据！')
  assert.ok(rawDiskConfig.includes('enc:aes256:'), '敏感配置必须加密持久化！')

  await service.saveServer({ id: 'local', command: 'node', args: ['server.mjs'], env: { API_TOKEN: 'secret' }, enabled: true })
  const listed = await service.listServers()
  assert.deepEqual(listed[0].envKeys, ['API_TOKEN'])
  assert.equal(JSON.stringify(listed).includes('secret'), false)
  const implementation = await service.getCustomTools({ taskType: 'implementation' })
  assert.deepEqual(implementation.tools.map((tool) => tool.name), ['mcp_local__lookup', 'mcp_local__modify'])
  assert.equal(implementation.statuses[0].status, 'connected')
  const lookup = implementation.tools[0]
  assert.deepEqual(await lookup.execute('call-1', { id: 'x' }), { content: [{ type: 'text', text: 'found' }] })
  assert.deepEqual(lastCall, { name: 'lookup', arguments: { id: 'x' } })
  assert.deepEqual((await service.getCustomTools({ taskType: 'research' })).tools.map((tool) => tool.name), ['mcp_local__lookup'])
  await service.removeServer('local')
  assert.equal(closes, 1)
  assert.deepEqual(await service.listServers(), [])
  await assert.rejects(() => service.saveServer({ id: '../escape', command: 'node', args: [], enabled: true }), /ID 无效/)

  const realService = createMcpService({ userData: path.join(userData, 'real') })
  try {
    await realService.saveServer({ id: 'echo', command: process.execPath, args: [path.join(import.meta.dirname, 'fixtures', 'mcp-echo-server.mjs')], enabled: true })
    const { tools, statuses } = await realService.getCustomTools()
    assert.equal(statuses[0].status, 'connected')
    assert.deepEqual(tools.map((tool) => tool.name), ['mcp_echo__echo'])
    assert.deepEqual(await tools[0].execute('real-call', { text: 'hello' }), { content: [{ type: 'text', text: 'hello' }] })
  } finally {
    await realService.stopAll()
  }

  // 3. 测试历史明文自动检测与安全迁移
  const migrationDir = path.join(userData, 'migration')
  await fs.mkdir(migrationDir, { recursive: true })
  const legacyConfig = {
    servers: [
      { id: 'legacy-srv', command: 'node', args: ['legacy.mjs'], env: { OLD_KEY: 'plain_text_secret' }, enabled: false },
    ],
  }
  await fs.writeFile(path.join(migrationDir, 'taskweaver-mcp.json'), JSON.stringify(legacyConfig))

  const migrationService = createMcpService({ userData: migrationDir, safeStorage: mockSafeStorage })
  const migratedServers = await migrationService.listServers()
  assert.equal(migratedServers.length, 1)

  const reReadDisk = await fs.readFile(path.join(migrationDir, 'taskweaver-mcp.json'), 'utf8')
  assert.equal(reReadDisk.includes('plain_text_secret'), false, '历史明文必须被自动加密覆盖！')
  assert.ok(reReadDisk.includes('enc:aes256:'), '历史明文必须已迁移为 enc:aes256: 格式！')
} finally {
  await service.stopAll()
  await fs.rm(userData, { recursive: true, force: true })
}

console.log('MCP service checks passed: disabled default, explicit config, status, tool bridge, read-only filtering, secret hiding')
