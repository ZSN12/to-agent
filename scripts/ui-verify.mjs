/**
 * 冒烟测试入口：检查 ui-verify 核心功能与关键可测性。
 * 用法：node scripts/ui-verify.mjs
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ts from 'typescript'
import assert from 'node:assert/strict'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// 读取并编译 ui-verify/src/index.ts
const sourcePath = path.join(root, 'packages/runtime/interaction/ui-verify/src/index.ts')
const source = await fs.readFile(sourcePath, 'utf8')
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
})

// 写入临时文件以确保模块解析正常
const tmpPath = path.join(root, 'scripts/.ui-verify-compiled.mjs')
await fs.writeFile(tmpPath, outputText)

let UiVerifySession
try {
  const mod = await import(pathToFileURL(tmpPath).href)
  UiVerifySession = mod.UiVerifySession
} finally {
  await fs.unlink(tmpPath).catch(() => {})
}

console.log('--- TaskWeaver UI Verify Smoke Test ---')
const artifactsDir = path.join(root, '.ui-verify-artifacts')

console.log('[+] 启动独立的 Electron 实例隔离测试 (UiVerifySession.launch)...')
const session = await UiVerifySession.launch({
  root,
  artifactsDir,
  launchTimeoutMs: 60000,
})

try {
  console.log('[+] 测试设置面板可访问性 (role/testid)...')
  await session.expectVisible({ testId: 'open-settings' })
  await session.click({ testId: 'open-settings' })
  await session.expectVisible({ testId: 'settings-page' })

  console.log('[+] 测试发消息输入框 (role/testid)...')
  // 此时设置面板可能盖住输入框，我们先 snapshot 确认下
  const snap = await session.snapshot()
  assert(typeof snap === 'string' && snap.length > 0, 'snapshot 应该返回字符串')

  // 假设设置面板打开时不影响我们在背后或者关闭它后找到 composer
  // 可以通过点击左侧新建会话退出设置面板
  await session.click({ testId: 'new-chat' }).catch(() => {})
  
  await session.expectVisible({ testId: 'message-input' })
  await session.fill({ testId: 'message-input' }, 'Hello from ui-verify smoke test')

  console.log('[+] 测试 ui_check 批量断言功能...')
  const results = await session.check([
    { kind: 'visible', target: { testId: 'send-message' } }
  ])
  assert(results[0].passed, '输入后应能看到发送按钮')

  console.log('[+] 截取最终屏幕截图...')
  const screenshotPath = await session.screenshot('smoke-final')
  console.log(`    截图保存在: ${screenshotPath}`)

  console.log('[+] 冒烟测试成功通过！')
} catch (error) {
  console.error('[-] 冒烟测试失败:', error)
  process.exitCode = 1
} finally {
  console.log('[+] 关闭实例...')
  await session.close()
}
