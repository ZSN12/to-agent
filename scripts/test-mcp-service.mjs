import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createMcpService, getMcpDshRuntimeBinding } from '../electron/backend/mcp-service.mjs'

const userData = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-mcp-test-'))
let connects = 0
let closes = 0
let lastCall = null
let lastConfig = null

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
  connectClient: async (config) => {
    connects += 1
    lastConfig = config
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
  const implNames = implementation.tools.map((tool) => tool.name).sort()
  assert.deepEqual(implNames, [
    'mcp__local__lookup',
    'mcp__local__modify',
    'mcp_local_lookup',
    'mcp_local_modify',
  ].sort())
  assert.equal(implementation.statuses[0].status, 'connected')
  const lookup = implementation.tools[0]
  assert.deepEqual(await lookup.execute('call-1', { id: 'x' }), { content: [{ type: 'text', text: 'found' }] })
  assert.deepEqual(lastCall, { name: 'lookup', arguments: { id: 'x' } })
  assert.deepEqual(
    (await service.getCustomTools({ taskType: 'research' })).tools.map((tool) => tool.name).sort(),
    ['mcp__local__lookup', 'mcp_local_lookup'].sort(),
  )
  const runtimeConfig = await service.prepareRuntimeIntegration()
  const runtimePatch = await fs.readFile(runtimeConfig.patchPath, 'utf8')
  assert.ok(runtimePatch.includes('@z/dsh-mcp-client'), 'enabled servers must be mounted through Z Runtime MCP plugin')
  assert.ok(runtimePatch.includes('process.env.TASKWEAVER_MCP_'), 'the runtime patch must reference injected credentials')
  assert.equal(runtimePatch.includes('secret'), false, 'the generated runtime patch must not contain decrypted credentials')
  assert.ok(Object.values(runtimeConfig.environment).includes('secret'), 'decrypted credentials are injected only into the Z Host child environment')
  await service.removeServer('local')
  assert.equal(closes, 1)
  assert.deepEqual(await service.listServers(), [])
  await assert.rejects(() => service.saveServer({ id: '../escape', command: 'node', args: [], enabled: true }), /ID 无效/)

  await assert.rejects(() => service.configureGitHub(''), /请输入 GitHub Personal Access Token/)
  const githubConfig = await service.configureGitHub('ghp_test_token')
  assert.equal(githubConfig.transport, 'http')
  assert.equal(githubConfig.url, 'https://api.githubcopilot.com/mcp/')
  assert.deepEqual(githubConfig.envKeys, ['GITHUB_PERSONAL_ACCESS_TOKEN'])
  assert.equal(JSON.stringify(githubConfig).includes('ghp_test_token'), false)
  const githubStatus = await service.testConnection('github')
  assert.equal(githubStatus.status, 'connected')
  assert.equal(lastConfig.env.GITHUB_PERSONAL_ACCESS_TOKEN, 'ghp_test_token')
  assert.equal(lastConfig.url, 'https://api.githubcopilot.com/mcp/')
  const githubRuntime = await service.prepareRuntimeIntegration()
  const githubPatch = await fs.readFile(githubRuntime.patchPath, 'utf8')
  assert.ok(githubPatch.includes('transport: streamable-http'))
  assert.ok(githubPatch.includes('Authorization: !!js'))
  assert.equal(githubPatch.includes('ghp_test_token'), false, 'HTTP authorization must not be written to the overlay')
  assert.ok(Object.values(githubRuntime.environment).includes('ghp_test_token'))
  await service.configureGitHub('')
  assert.equal((await service.listServers())[0].envKeys.includes('GITHUB_PERSONAL_ACCESS_TOKEN'), true, '空 token 应保留已有凭据')
  await service.setEnabled('github', false)
  assert.equal((await service.listServers())[0].enabled, false)
  assert.equal((await service.listServers())[0].envKeys.includes('GITHUB_PERSONAL_ACCESS_TOKEN'), true, '停用服务时应保留已加密凭据')
  await service.setEnabled('github', true)
  await service.removeServer('github')
  await assert.rejects(() => service.saveServer({
    id: 'github', transport: 'http', url: 'http://127.0.0.1/mcp/', args: [], env: { GITHUB_PERSONAL_ACCESS_TOKEN: 'x' }, enabled: true,
  }), /仅允许连接 GitHub 官方 MCP 地址/)
  assert.equal(closes, 2)

  const realService = createMcpService({ userData: path.join(userData, 'real') })
  try {
    await realService.saveServer({ id: 'echo', command: process.execPath, args: [path.join(import.meta.dirname, 'fixtures', 'mcp-echo-server.mjs')], enabled: true })
    const { tools, statuses } = await realService.getCustomTools()
    assert.equal(statuses[0].status, 'connected')
    assert.deepEqual(tools.map((tool) => tool.name).sort(), ['mcp__echo__echo', 'mcp_echo_echo'].sort())
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

  // 4. 测试历史明文在 safeStorage 不可用时被安全擦除清理
  const insecureMigrationDir = path.join(userData, 'insecure-migration')
  await fs.mkdir(insecureMigrationDir, { recursive: true })
  await fs.writeFile(
    path.join(insecureMigrationDir, 'taskweaver-mcp.json'),
    JSON.stringify({ servers: [{ id: 'leak-srv', command: 'node', args: [], env: { LEAK: 'danger_plain_text' }, enabled: false }] })
  )

  const insecureCleanService = createMcpService({ userData: insecureMigrationDir, safeStorage: null })
  await insecureCleanService.listServers()

  const diskAfterClean = await fs.readFile(path.join(insecureMigrationDir, 'taskweaver-mcp.json'), 'utf8')
  assert.equal(diskAfterClean.includes('danger_plain_text'), false, '系统加密不可用时必须安全清洗擦除磁盘明文！')
} finally {
  await service.stopAll()
  await fs.rm(userData, { recursive: true, force: true })
}

// Provider success envelopes must contain a valid tool listing, and raw errors
// must never cross the renderer/model boundary (including echoed test secrets).
for (const failure of ['throw', 'payload', 'malformed']) {
  const failed = createMcpService({
    userData: path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-error-')), 'config'),
    connectClient: async () => ({
      listTools: async () => {
        if (failure === 'throw') throw new Error('Authorization: Bearer synthetic-secret')
        return failure === 'payload' ? { error: { message: 'synthetic-secret' }, tools: [] } : {}
      },
      close: async () => {},
    }),
  })
  await failed.saveServer({ id: 'failed', command: 'node', enabled: true })
  const status = await failed.testConnection('failed')
  assert.equal(status.status, 'error')
  assert.doesNotMatch(JSON.stringify(status), /synthetic-secret|Authorization/)
  await failed.stopAll()
}
const failingCalls = createMcpService({
  userData: path.join(os.tmpdir(), `mcp-calls-${process.pid}`),
  connectClient: async () => ({
    listTools: async () => ({ tools: [{ name: 'fail', inputSchema: { type: 'object' } }] }),
    callTool: async ({ arguments: args }) => {
      if (args.kind === 'throw') throw new Error('synthetic-secret')
      return args.kind === 'payload' ? { error: { message: 'synthetic-secret' } } : { isError: true, content: [{ type: 'text', text: 'synthetic-secret' }] }
    },
    close: async () => {},
  }),
})
await failingCalls.saveServer({ id: 'failure', command: 'node', enabled: true })
const failureTool = (await failingCalls.getCustomTools()).tools[0]
for (const kind of ['throw', 'payload', 'isError']) {
  await assert.rejects(() => failureTool.execute('error-call', { kind }), (error) => /MCP/.test(error.message) && !error.message.includes('synthetic-secret'))
}
await failingCalls.stopAll()

const binding = getMcpDshRuntimeBinding()
assert.equal(binding.dshWired, true)
assert.match(binding.executionNote, /Z Host/)
assert.match(binding.executionNote, /主对话及启用工具的子任务/)

const runtimeBinding = service.getDshRuntimeBinding()
assert.deepEqual(runtimeBinding, binding)

console.log('MCP service checks passed: encrypted config, host runtime overlay generation, secret-safe environment injection, tool discovery, and Z Host binding metadata')
