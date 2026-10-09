import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createMcpService, getMcpDshRuntimeBinding } from '../electron/backend/mcp-service.mjs'

const userData = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-mcp-test-'))
const mockSafeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: value => Buffer.from(`enc_${value}`),
  decryptString: value => value.toString().replace(/^enc_/, ''),
}
let hostTools = null
let hostStarts = 0
const service = createMcpService({
  userData,
  safeStorage: mockSafeStorage,
  getHostTools: async ({ startHost = false } = {}) => {
    if (startHost) hostStarts++
    return hostTools
  },
})

try {
  const insecure = createMcpService({ userData: path.join(userData, 'insecure'), safeStorage: null })
  await assert.rejects(
    () => insecure.saveServer({ id: 'insecure-srv', command: 'node', args: [], env: { KEY: 'sensitive' }, enabled: false }),
    /安全存储.*不可用.*拒绝保存/,
  )

  assert.deepEqual(await service.listServers(), [])
  await service.saveServer({ id: 'local', command: 'node', args: ['server.mjs'], env: { API_TOKEN: 'secret' }, enabled: false })
  const rawConfig = await fs.readFile(path.join(userData, 'taskweaver-mcp.json'), 'utf8')
  assert.equal(rawConfig.includes('secret'), false)
  assert.ok(rawConfig.includes('enc:aes256:'))

  await service.setEnabled('local', true)
  assert.equal((await service.listServers())[0].status, 'disconnected')
  hostTools = [
    { name: 'mcp__local__lookup', description: 'Read one item', parameters: { type: 'object' } },
    { name: 'mcp__local__modify', description: 'Modify one item', parameters: { type: 'object' } },
    { name: 'read_file', description: 'Non-MCP tool', parameters: { type: 'object' } },
  ]
  const [listed] = await service.listServers()
  assert.equal(listed.status, 'connected')
  assert.equal(listed.toolCount, 2)
  assert.deepEqual(listed.envKeys, ['API_TOKEN'])
  assert.equal(JSON.stringify(listed).includes('secret'), false)
  assert.equal((await service.testConnection('local')).status, 'connected')
  assert.equal(hostStarts, 1, 'connection checks query the Host API instead of opening another MCP client')

  const runtime = await service.prepareRuntimeIntegration()
  const patch = await fs.readFile(runtime.patchPath, 'utf8')
  assert.ok(patch.includes('@z/dsh-mcp-client'))
  assert.match(patch, /process\.env\.TASKWEAVER_MCP_[A-F0-9]{10}_SECRET/)
  assert.equal(patch.includes('secret'), false)
  assert.ok(Object.values(runtime.environment).includes('secret'))
  assert.ok(Object.keys(runtime.environment).every(name => /(?:KEY|PASSWORD|SECRET|TOKEN)/i.test(name)))

  const source = await fs.readFile(new URL('../electron/backend/mcp-service.mjs', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /@modelcontextprotocol\/client|connectClient|callTool\(/)
  await service.disconnect('local')
  assert.equal((await service.listServers())[0].enabled, false)
  await service.removeServer('local')
  assert.deepEqual(await service.listServers(), [])
  await assert.rejects(() => service.saveServer({ id: '../escape', command: 'node', args: [], enabled: true }), /ID 无效/)

  await assert.rejects(() => service.configureGitHub(''), /Personal Access Token/)
  const github = await service.configureGitHub('ghp_test_token')
  assert.equal(github.transport, 'http')
  assert.equal(github.url, 'https://api.githubcopilot.com/mcp/')
  assert.deepEqual(github.envKeys, ['GITHUB_PERSONAL_ACCESS_TOKEN'])
  assert.equal(JSON.stringify(github).includes('ghp_test_token'), false)
  hostTools = [{ name: 'mcp__github__search_repositories', description: 'Search', parameters: { type: 'object' } }]
  assert.equal((await service.testConnection('github')).toolCount, 1)
  const githubRuntime = await service.prepareRuntimeIntegration()
  const githubPatch = await fs.readFile(githubRuntime.patchPath, 'utf8')
  assert.ok(githubPatch.includes('transport: streamable-http'))
  assert.ok(githubPatch.includes('Authorization: !!js'))
  assert.equal(githubPatch.includes('ghp_test_token'), false)
  assert.ok(Object.values(githubRuntime.environment).includes('ghp_test_token'))
  await service.configureGitHub('')
  assert.equal((await service.listServers())[0].envKeys.includes('GITHUB_PERSONAL_ACCESS_TOKEN'), true)
  await service.setEnabled('github', false)
  assert.equal((await service.listServers())[0].enabled, false)
  assert.equal((await service.listServers())[0].envKeys.includes('GITHUB_PERSONAL_ACCESS_TOKEN'), true)
  await service.removeServer('github')
  await assert.rejects(() => service.saveServer({
    id: 'github', transport: 'http', url: 'http://127.0.0.1/mcp/', args: [],
    env: { GITHUB_PERSONAL_ACCESS_TOKEN: 'x' }, enabled: true,
  }), /仅允许连接 GitHub 官方 MCP 地址/)

  const migrationDir = path.join(userData, 'migration')
  await fs.mkdir(migrationDir, { recursive: true })
  await fs.writeFile(path.join(migrationDir, 'taskweaver-mcp.json'), JSON.stringify({
    servers: [{ id: 'legacy-srv', command: 'node', args: [], env: { OLD_KEY: 'plain_text_secret' }, enabled: false }],
  }))
  const migration = createMcpService({ userData: migrationDir, safeStorage: mockSafeStorage })
  assert.equal((await migration.listServers()).length, 1)
  const migrated = await fs.readFile(path.join(migrationDir, 'taskweaver-mcp.json'), 'utf8')
  assert.equal(migrated.includes('plain_text_secret'), false)
  assert.ok(migrated.includes('enc:aes256:'))

  const insecureMigrationDir = path.join(userData, 'insecure-migration')
  await fs.mkdir(insecureMigrationDir, { recursive: true })
  await fs.writeFile(path.join(insecureMigrationDir, 'taskweaver-mcp.json'), JSON.stringify({
    servers: [{ id: 'leak-srv', command: 'node', args: [], env: { LEAK: 'danger_plain_text' }, enabled: false }],
  }))
  await createMcpService({ userData: insecureMigrationDir, safeStorage: null }).listServers()
  const cleaned = await fs.readFile(path.join(insecureMigrationDir, 'taskweaver-mcp.json'), 'utf8')
  assert.equal(cleaned.includes('danger_plain_text'), false)

  hostTools = null
  const failed = createMcpService({
    userData: path.join(userData, 'host-error'),
    safeStorage: mockSafeStorage,
    getHostTools: async () => { throw new Error('Authorization: Bearer synthetic-secret') },
  })
  await failed.saveServer({ id: 'failed', command: 'node', enabled: true })
  const safeStatus = await failed.testConnection('failed')
  assert.equal(safeStatus.status, 'error')
  assert.doesNotMatch(JSON.stringify(safeStatus), /synthetic-secret|Authorization/)
} finally {
  await fs.rm(userData, { recursive: true, force: true })
}

const binding = getMcpDshRuntimeBinding()
assert.equal(binding.dshWired, true)
assert.match(binding.executionNote, /Z Host/)
assert.match(binding.executionNote, /主对话及启用工具的子任务/)

console.log('MCP checks passed: single Host tool directory, encrypted config, legacy migration, and secret-safe runtime injection.\n')

await import('./test-mcp-marketplace.mjs')
const { runSelfTest, runBoundaryCheck } = await import('./check-model-boundary.mjs')
await runSelfTest()
const boundary = await runBoundaryCheck()
assert.equal(boundary.violations.length, 0, '模型抽象护栏扫描应无违规')
console.log('check-model-boundary: 全库扫描确认 0 违规\n')
await import('./test-degradation-matrix.mjs')
