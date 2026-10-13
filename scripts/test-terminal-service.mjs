import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createTerminalService } from '../backend/terminal-service.mjs'
import { registerTerminalIpc } from '../backend/register-terminal-ipc.mjs'
import { createShellPlatform, invokeShellChannel } from '../backend/platform/shell-platform.mjs'
import { shellEventBus } from '../backend/shell/event-bus.mjs'

console.log('--- 开始测试 TerminalService 终端服务 (PTY、尺寸动态调整、中断与进程树清理) ---')

const terminalService = createTerminalService()

try {
  let receivedData = ''

  // 1. 创建终端会话
  const session = await terminalService.createSession({
    id: 'term-test-1',
    title: '测试终端',
    cwd: process.cwd(),
    cols: 80,
    rows: 24,
    onData: (data) => {
      receivedData += data
    },
  })

  assert.equal(session.id, 'term-test-1')
  assert.equal(session.title, '测试终端')
  assert.equal(session.cwd, process.cwd())

  // 2. 检查会话列表
  const list = terminalService.listSessions()
  assert.equal(list.length, 1)
  assert.equal(list[0].id, 'term-test-1')

  // 3. 向会话写入命令并等待输出响应
  terminalService.write('term-test-1', 'echo "TASKWEAVER_TERMINAL_ONLINE"\n')

  let hasOutput = false
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 100))
    if (receivedData.includes('TASKWEAVER_TERMINAL_ONLINE')) {
      hasOutput = true
      break
    }
  }

  assert.ok(hasOutput, `应该能收到终端返回的 echo 命令输出，收到数据: ${receivedData}`)

  // 4. 测试 resize 尺寸同步
  const resized = terminalService.resize('term-test-1', 120, 36)
  assert.equal(resized, true, '终端 resize 应当成功生效')

  // 5. 测试发送 Ctrl+C 中断信号 (\x03)
  terminalService.write('term-test-1', '\x03')
  await new Promise((r) => setTimeout(r, 150))

  // 7. 测试非法参数校验
  await assert.rejects(
    async () => terminalService.createSession({ id: '' }),
    /会话 ID 必须为有效字符串/
  )

  // 8. 测试 cols/rows 边界兜底并自动规整
  const session2 = await terminalService.createSession({
    id: 'term-clamp-test',
    cols: 2, // 应自动 clamp 到 10
    rows: 1, // 应自动 clamp 到 3
  })
  assert.equal(session2.cols, 10)
  assert.equal(session2.rows, 3)

  // 9. 重复 ID 不能悄悄终止并替换正在使用的终端
  await assert.rejects(
    () => terminalService.createSession({ id: 'term-clamp-test', cols: 80, rows: 24 }),
    /会话 ID 已被占用/,
  )
  terminalService.killSession('term-clamp-test')

  // 10. 验证 asar.unpacked 路径解析
  const shimPath = terminalService.resolvePtyShimPath()
  assert.ok(typeof shimPath === 'string' && shimPath.length > 0)
  assert.equal(shimPath.includes('pty-shim.py'), true)

  // 11. 验证真实终端会话标明了有效 PTY 驱动 (node-pty 或 python-shim)
  assert.equal(session.isPty, true, '终端必须由真实 PTY 驱动')
  assert.ok(['node-pty', 'python-shim'].includes(session.driver), `驱动必须为标准 PTY 引擎，当前为: ${session.driver}`)

  // 12. 沙箱不可用时必须阻止受限 Shell，不能退化为普通进程。
  const blockedTerminal = createTerminalService({
    sandbox: {
      probeSandboxSupport: () => ({ available: false }),
      confineArgv: () => { throw new Error('不得在无 runner 时调用') },
    },
    getEnv: async () => { throw new Error('无 runner 时不应读取或构造 Shell 环境') },
  })
  await assert.rejects(
    () => blockedTerminal.createSession({
      id: 'term-no-sandbox',
      cwd: process.cwd(),
      sandboxPolicy: { mode: 'workspace-write', workspaceRoot: process.cwd() },
    }),
    /终端沙箱不可用/,
  )
  assert.equal(blockedTerminal.listSessions().length, 0)
  blockedTerminal.dispose()

  // 13. 环境清理失败必须失败关闭，不允许继承整个进程环境。
  const blockedEnvironment = createTerminalService({ getEnv: async () => { throw new Error('sanitized env unavailable') } })
  await assert.rejects(
    () => blockedEnvironment.createSession({ id: 'term-no-env', cwd: process.cwd() }),
    /sanitized env unavailable/,
  )
  assert.equal(blockedEnvironment.listSessions().length, 0)
  blockedEnvironment.dispose()

  // 14. IPC 按窗口隔离终端，且 cwd 只能位于当前会话工作区内。
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-terminal-ipc-'))
  const nested = path.join(root, 'nested')
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-terminal-outside-'))
  await fs.mkdir(nested)
  const fakeSessions = new Map()
  const fakeSessionOptions = new Map()
  const killed = []
  const fakeService = {
    async createSession(options) {
      if (options.id === 'simulated-spawn-failure') throw new Error('simulated spawn failure')
      fakeSessions.set(options.id, { id: options.id, cwd: options.cwd, title: options.title, isPty: true, shell: '/bin/zsh' })
      fakeSessionOptions.set(options.id, options)
      return fakeSessions.get(options.id)
    },
    write: (id) => fakeSessions.has(id),
    resize: (id) => fakeSessions.has(id),
    killSession(id) {
      killed.push(id)
      fakeSessionOptions.delete(id)
      return fakeSessions.delete(id)
    },
    listSessions: () => [...fakeSessions.values()],
    dispose() {},
  }
  const handlers = new Map()
  const ipcMain = { handle: (channel, handler) => handlers.set(channel, handler) }
  registerTerminalIpc({
    ipcMain,
    terminalService: fakeService,
    resolveRuntimeContext: async () => ({
      conversationId: 'conversation-1', workspacePath: root,
      permissionMode: 'ask', bashSandbox: 'workspace-write', sessionSandboxMode: null,
    }),
    resolveTerminalPolicy: (context) => ({ mode: 'workspace-write', workspaceRoot: context.workspacePath }),
  })

  const makeEvent = (id) => {
    const sender = new EventEmitter()
    if (Number.isInteger(id)) sender.id = id
    sender.destroyed = false
    sender.isDestroyed = () => sender.destroyed
    sender.send = () => {}
    return { sender, senderFrame: { url: 'file:///TaskWeaver/index.html' } }
  }
  const ownerA = makeEvent(101)
  const ownerB = makeEvent(202)
  const invoke = (channel, event, ...args) => handlers.get(channel)(event, ...args)
  const ipcCreated = await invoke('terminal:create', ownerA, { id: 'owned-terminal', cwd: nested })
  assert.equal(ipcCreated.ok, true)
  assert.equal(ipcCreated.data.cwd, await fs.realpath(nested))
  const ownerBWrite = await invoke('terminal:write', ownerB, 'owned-terminal', 'echo unsafe')
  assert.deepEqual(ownerBWrite, { ok: true, data: false })
  const ownerBList = await invoke('terminal:list', ownerB)
  assert.deepEqual(ownerBList, { ok: true, data: [] })
  const ownerAList = await invoke('terminal:list', ownerA)
  assert.deepEqual(ownerAList.data.map((row) => row.id), ['owned-terminal'])
  const ownerBKill = await invoke('terminal:kill', ownerB, 'owned-terminal')
  assert.deepEqual(ownerBKill, { ok: true, data: false })

  const outsideCreate = await invoke('terminal:create', ownerA, { id: 'outside-terminal', cwd: outside })
  assert.equal(outsideCreate.ok, false)
  assert.match(outsideCreate.error, /当前会话工作区内/)
  const duplicateCreate = await invoke('terminal:create', ownerB, { id: 'owned-terminal' })
  assert.equal(duplicateCreate.ok, false)
  assert.match(duplicateCreate.error, /已被占用/)

  const failedOwner = makeEvent()
  const failedCreate = await invoke('terminal:create', failedOwner, { id: 'simulated-spawn-failure', cwd: nested })
  assert.deepEqual(failedCreate, { ok: false, error: 'simulated spawn failure' })
  assert.deepEqual(await invoke('terminal:list', failedOwner), { ok: true, data: [] })
  assert.equal(failedOwner.sender.listenerCount('destroyed'), 0, 'failed creation must release its owner listener')

  // Shell/RPC senders have stable object identity but no Electron numeric id.
  const ownerC = makeEvent()
  const ownerD = makeEvent()
  const shellLikeCreated = await invoke('terminal:create', ownerC, { id: 'idless-owned-terminal', cwd: nested })
  assert.equal(shellLikeCreated.ok, true)
  const ownerDWrite = await invoke('terminal:write', ownerD, 'idless-owned-terminal', 'echo unsafe')
  assert.deepEqual(ownerDWrite, { ok: true, data: false })
  const ownerDList = await invoke('terminal:list', ownerD)
  assert.deepEqual(ownerDList, { ok: true, data: [] })
  ownerC.sender.emit('destroyed')
  assert.equal(fakeSessions.has('idless-owned-terminal'), false)

  // Exercise the actual ShellPlatform adapter, whose WebContents has no id.
  const shellPlatform = createShellPlatform({ platformName: 'linux' })
  registerTerminalIpc({
    ipcMain: shellPlatform.ipcMain,
    terminalService: fakeService,
    resolveRuntimeContext: async () => ({
      conversationId: 'shell-conversation', workspacePath: root,
      permissionMode: 'ask', bashSandbox: 'workspace-write', sessionSandboxMode: null,
    }),
    resolveTerminalPolicy: (context) => ({ mode: 'workspace-write', workspaceRoot: context.workspacePath }),
  })
  const shellPushes = []
  const onShellPush = (event) => shellPushes.push(event)
  shellEventBus.on('push', onShellPush)
  const nativeShellCreated = await invokeShellChannel('terminal:create', { id: 'shell-output-terminal', cwd: nested })
  assert.equal(nativeShellCreated.ok, true)
  const nativeShellList = await invokeShellChannel('terminal:list')
  assert.deepEqual(nativeShellList.data.map((row) => row.id), ['shell-output-terminal'])
  const nativeShellOptions = fakeSessionOptions.get('shell-output-terminal')
  nativeShellOptions.onData('shell output')
  fakeSessions.delete('shell-output-terminal')
  nativeShellOptions.onExit(0)
  assert.deepEqual(shellPushes.map(({ channel }) => channel), ['terminal:data', 'terminal:exit'])
  assert.deepEqual(shellPushes[0].payload, { id: 'shell-output-terminal', data: 'shell output' })
  assert.deepEqual(shellPushes[1].payload, { id: 'shell-output-terminal', code: 0 })

  const nativeShellKillCreated = await invokeShellChannel('terminal:create', { id: 'shell-kill-terminal', cwd: nested })
  assert.equal(nativeShellKillCreated.ok, true)
  assert.deepEqual(await invokeShellChannel('terminal:kill', 'shell-kill-terminal'), { ok: true, data: true })
  assert.equal(fakeSessions.has('shell-kill-terminal'), false, 'owner should be allowed to stop its own terminal')

  const nativeShellDestroyCreated = await invokeShellChannel('terminal:create', { id: 'shell-destroy-terminal', cwd: nested })
  assert.equal(nativeShellDestroyCreated.ok, true)
  shellPlatform.BrowserWindow.getFocusedWindow().webContents.destroy()
  assert.equal(fakeSessions.has('shell-destroy-terminal'), false, 'Shell WebContents destruction must clean up its terminal')
  shellEventBus.off('push', onShellPush)

  ownerA.sender.destroyed = true
  ownerA.sender.emit('destroyed')
  assert.equal(fakeSessions.has('owned-terminal'), false)
  assert.deepEqual(killed, [
    'idless-owned-terminal', 'shell-kill-terminal', 'shell-destroy-terminal', 'owned-terminal',
  ])
  await fs.rm(root, { recursive: true, force: true })
  await fs.rm(outside, { recursive: true, force: true })

  console.log('✓ TerminalService PTY、沙箱失败关闭、窗口归属、工作区路径边界与进程清理测试全部通过！')
} finally {
  terminalService.dispose()
}
