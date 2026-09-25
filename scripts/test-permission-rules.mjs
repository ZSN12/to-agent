import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createPermissionRulesStore } from '../electron/backend/permission-rules-store.mjs'
import { createPermissionService } from '../electron/backend/permission-service.mjs'
import { createMcpService } from '../electron/backend/mcp-service.mjs'

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-permrules-test-'))
const workspaceA = path.join(root, 'workspace-a')
const workspaceB = path.join(root, 'workspace-b')
await fs.mkdir(workspaceA, { recursive: true })
await fs.mkdir(workspaceB, { recursive: true })

try {
  // ==========================================
  // 1. 细粒度规则存储与模式匹配测试
  // ==========================================
  const rulesStore = createPermissionRulesStore({ userDataPath: root })

  // 1.1 添加全局 Deny 规则：阻止任何 rm -rf 命令
  await rulesStore.addRule({
    tool: 'bash',
    type: 'command',
    pattern: 'rm -rf *',
    decision: 'deny',
    scope: 'global',
    description: '禁止删除命令',
  })

  // 1.2 添加全局 Deny 规则：阻止写入任何 .env 文件
  await rulesStore.addRule({
    tool: 'write',
    type: 'path',
    pattern: '*.env*',
    decision: 'deny',
    scope: 'global',
    description: '禁止写入环境变量文件',
  })

  // 1.3 添加工作区 A 的 Allow 规则：允许执行 npm test
  await rulesStore.addRule({
    tool: 'bash',
    type: 'command',
    pattern: 'npm test*',
    decision: 'allow',
    scope: 'workspace',
    workspacePath: workspaceA,
    description: '允许运行测试',
  })

  // 验证列表
  const allRules = await rulesStore.listRules()
  assert.equal(allRules.length, 3)

  const rulesForA = await rulesStore.listRules({ workspacePath: workspaceA })
  assert.equal(rulesForA.length, 3)

  const rulesForB = await rulesStore.listRules({ workspacePath: workspaceB })
  // 工作区 B 只匹配两个全局规则
  assert.equal(rulesForB.length, 2)

  // ==========================================
  // 2. 权限服务联动与优先判定测试
  // ==========================================
  const pendingDialogs = []
  let dialogResponse = 1
  const dialog = {
    showMessageBox: async (...args) => {
      pendingDialogs.push(args)
      return { response: dialogResponse }
    },
  }
  const contents = { isDestroyed: () => false }

  let currentWorkspace = workspaceA
  const permissions = createPermissionService({
    dialog,
    getParentWindow: () => null,
    getWorkspacePath: () => currentWorkspace,
    rulesStore,
  })

  // 2.1 Deny 优先拦截测试：即使处于 full 模式，命中 deny 规则也必须强制阻止
  const rmCall = { toolName: 'bash', input: { command: 'rm -rf /tmp/data' } }
  const blockedFull = await permissions.withExecution('full', contents, () => permissions.authorize(rmCall))
  assert.equal(blockedFull.block, true)
  assert.match(blockedFull.reason, /命中了安全拒绝规则/)
  assert.equal(pendingDialogs.length, 0, 'Deny 规则直接阻断，不应弹窗骚扰用户')

  // 2.2 路径通配 Deny 拦截：write .env.production
  const writeEnvCall = { toolName: 'write', input: { path: '.env.production' } }
  const blockedWrite = await permissions.withExecution('ask', contents, () => permissions.authorize(writeEnvCall))
  assert.equal(blockedWrite.block, true)
  assert.match(blockedWrite.reason, /命中了安全拒绝规则/)
  assert.equal(pendingDialogs.length, 0)

  // 2.3 Allow 规则测试：在 ask 模式下，针对 workspaceA 执行 npm test，应直接放行不弹窗
  const testCall = { toolName: 'bash', input: { command: 'npm test' } }
  const allowedTest = await permissions.withExecution('ask', contents, () => permissions.authorize(testCall))
  assert.equal(allowedTest, undefined)
  assert.equal(pendingDialogs.length, 0, '匹配到 Allow 规则后应直接放行，不弹窗')

  // 2.4 工作区隔离测试：切换到 workspaceB 执行 npm test，没有 allow 规则，在 ask 模式下应弹窗
  currentWorkspace = workspaceB
  dialogResponse = 1 // 批准一次
  const testInB = await permissions.withExecution('ask', contents, () => permissions.authorize(testCall))
  assert.equal(testInB, undefined)
  assert.equal(pendingDialogs.length, 1, 'workspaceB 无 allow 规则，在 ask 模式下必须触发弹窗询问')
  assert.equal(pendingDialogs[0][0].buttons.length, 3, 'bash 工具应提供 3 个选项：拒绝、批准一次、总是允许该命令')

  // 2.5 “总是允许该命令”弹窗选项联动
  currentWorkspace = workspaceB
  pendingDialogs.length = 0
  dialogResponse = 2 // 点击“总是允许该命令”
  const gitStatusCall = { toolName: 'bash', input: { command: 'git status' } }
  const alwaysAllowed = await permissions.withExecution('ask', contents, () => permissions.authorize(gitStatusCall))
  assert.equal(alwaysAllowed, undefined)
  assert.equal(pendingDialogs.length, 1)

  // 验证规则表是否自动添加了 git status 的 allow 规则
  const bRulesUpdated = await rulesStore.listRules({ workspacePath: workspaceB })
  const autoRule = bRulesUpdated.find((r) => r.pattern === 'git status')
  assert.ok(autoRule, '点击总是允许后应持久化该命令的规则')
  assert.equal(autoRule.decision, 'allow')
  assert.equal(autoRule.workspacePath, workspaceB)

  // 再次执行 git status，应直接放行不弹窗
  pendingDialogs.length = 0
  const repeatAllowed = await permissions.withExecution('ask', contents, () => permissions.authorize(gitStatusCall))
  assert.equal(repeatAllowed, undefined)
  assert.equal(pendingDialogs.length, 0, '已持久化为总是允许，后续调用直接放行')

  // ==========================================
  // 3. MCP 敏感环境变量安全加密存储测试
  // ==========================================
  const mockSafeStorage = {
    isEncryptionAvailable: () => true,
    encryptString: (str) => Buffer.from(`mock_enc:${str}`),
    decryptString: (buf) => {
      const s = buf.toString('utf8')
      if (s.startsWith('mock_enc:')) return s.slice('mock_enc:'.length)
      return s
    },
  }

  let capturedTransportEnv = null
  const mockConnectClient = async (server) => {
    capturedTransportEnv = server.env
    return {
      listTools: async () => ({ tools: [{ name: 'dummy_tool' }] }),
      close: async () => {},
    }
  }

  const mcp = createMcpService({
    userData: root,
    safeStorage: mockSafeStorage,
    connectClient: mockConnectClient,
  })

  // 保存带有敏感凭据的 MCP server
  await mcp.saveServer({
    id: 'github-mcp',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    env: {
      GITHUB_PERSONAL_ACCESS_TOKEN: 'ghp_secret_token_1234567890',
    },
    enabled: true,
  })

  // 3.1 检查磁盘上保存的 taskweaver-mcp.json，确保明文敏感 token 不直接暴露在文件系统中
  const mcpJsonRaw = await fs.readFile(path.join(root, 'taskweaver-mcp.json'), 'utf8')
  assert.ok(!mcpJsonRaw.includes('ghp_secret_token_1234567890'), '敏感 Token 必须被加密，不可在 JSON 文件中明文泄露')
  assert.ok(mcpJsonRaw.includes('enc:aes256:'), '应包含安全加密前缀')

  // 3.2 检查 listServers 对外暴露情况，确保只包含 envKeys，不暴露值
  const serverList = await mcp.listServers()
  const githubServer = serverList.find((s) => s.id === 'github-mcp')
  assert.ok(githubServer)
  assert.deepEqual(githubServer.envKeys, ['GITHUB_PERSONAL_ACCESS_TOKEN'])
  assert.equal(githubServer.env, undefined, '对外暴露的视图不得包含 env 明文字段')

  // 3.3 检查启动连接时，stdio 实际接收到的是解密后的真实 Token
  await mcp.getCustomTools()
  assert.ok(capturedTransportEnv, '进程启动应传入解密后的 env')
  assert.equal(capturedTransportEnv.GITHUB_PERSONAL_ACCESS_TOKEN, 'ghp_secret_token_1234567890')

  console.log('permission-rules and mcp-safe-storage tests passed successfully!')
} finally {
  await fs.rm(root, { recursive: true, force: true })
}
