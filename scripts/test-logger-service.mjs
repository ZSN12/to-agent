import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { LoggerService } from '../backend/logger-service.mjs'

const testLogDir = path.join(os.tmpdir(), `taskweaver-test-logs-${Date.now()}`)
const logger = new LoggerService({ logDir: testLogDir, consoleOutput: false })

// 1. 验证日志写入与脱敏
const tagLogger = logger.forTag('AuthModule')
tagLogger.info('用户正在使用 API Key: sk-1234567890abcdef1234567890 进行连接')
tagLogger.warn(`工作区位于目录: ${os.homedir()}/projects/test`)

// 等待文件流刷盘
await new Promise((r) => setTimeout(r, 60))

const logContent = fs.readFileSync(logger.currentLogPath, 'utf8')
assert.match(logContent, /\[INFO\] \[AuthModule\]/)
assert.doesNotMatch(logContent, /sk-1234567890abcdef1234567890/, '敏感 API Key 必须被脱敏')
assert.doesNotMatch(logContent, new RegExp(os.homedir()), '用户家目录必须被替换为 ~')
assert.match(logContent, /~/ , '家目录应脱敏为 ~')

// 2. 验证诊断包导出
const bundle = await logger.exportDiagnosticsBundle({
  appVersion: '1.2.0-test',
  activeState: { activeConversation: 'conv-123' },
})

assert.equal(bundle.appVersion, '1.2.0-test')
assert.ok(bundle.platform.nodeVersion)
assert.ok(Array.isArray(bundle.recentLogs))
assert.ok(bundle.recentLogs.length >= 2)

// 清理测试临时目录
try {
  fs.rmSync(testLogDir, { recursive: true, force: true })
} catch {
  // ignore
}

console.log('logger service tests passed')
