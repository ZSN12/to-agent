import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { initializeGlobalLogger, logger, createLogger } from '../electron/backend/logger.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const testLogDir = path.join(__dirname, '../.test-logs')

console.log('测试日志系统...\n')

// 测试 1: 初始化全局日志器
console.log('=== 测试 1: 初始化全局日志器 ===')
initializeGlobalLogger(testLogDir, 'DEBUG')

// 等待初始化完成
await new Promise((resolve) => setTimeout(resolve, 100))

// 测试 2: 各级别日志输出
console.log('\n=== 测试 2: 各级别日志输出 ===')
logger.debug('test-module', '这是一条 DEBUG 日志')
logger.info('test-module', '这是一条 INFO 日志')
logger.warn('test-module', '这是一条 WARN 日志')
logger.error('test-module', '这是一条 ERROR 日志')

// 测试 3: 带错误堆栈的日志
console.log('\n=== 测试 3: 带错误堆栈的日志 ===')
try {
  throw new Error('测试错误')
} catch (error) {
  logger.error('test-module', '捕获到错误', error)
}

// 测试 4: 不同模块的日志
console.log('\n=== 测试 4: 不同模块的日志 ===')
logger.info('mcp-service', 'MCP 服务已启动')
logger.info('git-service', 'Git 仓库已加载')
logger.warn('orchestration', '任务队列已满')

// 测试 5: 独立日志器实例
console.log('\n=== 测试 5: 独立日志器实例 ===')
const customLogger = createLogger(testLogDir, 'WARN')
await customLogger.initialize()
customLogger.info('custom', '这条 INFO 不会显示（级别设为 WARN）')
customLogger.warn('custom', '这条 WARN 会显示')
customLogger.error('custom', '这条 ERROR 会显示')

// 等待所有日志写入
await new Promise((resolve) => setTimeout(resolve, 200))

console.log('\n测试完成！日志文件位置:', path.join(testLogDir, 'taskweaver.log'))
console.log('请检查日志文件内容是否正确')
