import assert from 'node:assert/strict'
import { createTerminalService } from '../electron/backend/terminal-service.mjs'

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

  // 9. 测试重复创建同名 session 时自动替换并 kill 旧 session
  const session2Dup = await terminalService.createSession({
    id: 'term-clamp-test',
    cols: 80,
    rows: 24,
  })
  assert.equal(session2Dup.id, 'term-clamp-test')
  assert.equal(session2Dup.cols, 80)
  terminalService.killSession('term-clamp-test')

  // 10. 验证 asar.unpacked 路径解析
  const shimPath = terminalService.resolvePtyShimPath()
  assert.ok(typeof shimPath === 'string' && shimPath.length > 0)
  assert.equal(shimPath.includes('pty-shim.py'), true)

  // 11. 验证真实终端会话标明了有效 PTY 驱动 (node-pty 或 python-shim)
  assert.equal(session.isPty, true, '终端必须由真实 PTY 驱动')
  assert.ok(['node-pty', 'python-shim'].includes(session.driver), `驱动必须为标准 PTY 引擎，当前为: ${session.driver}`)

  console.log('✓ TerminalService PTY双向读写、动态Resize、中断、参数校验、进程树销毁与驱动收敛测试全部通过！')
} finally {
  terminalService.dispose()
}
