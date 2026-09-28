# Logger 使用文档

## 概述

统一的日志系统，支持分级日志、控制台输出、文件持久化和自动日志轮转。

## 快速开始

### 初始化全局日志器

```javascript
import { initializeGlobalLogger, logger } from './electron/backend/logger.mjs'

// 在应用启动时初始化（推荐在 main.cjs 或主入口）
initializeGlobalLogger('/path/to/logs', 'INFO')
```

### 使用全局日志器

```javascript
import { logger } from './electron/backend/logger.mjs'

// 基本使用
logger.info('module-name', '操作成功')
logger.warn('module-name', '警告信息')
logger.debug('module-name', '调试信息')

// 记录错误（会自动包含堆栈）
try {
  // 某些操作
} catch (error) {
  logger.error('module-name', '操作失败', error)
}
```

## 日志级别

按严重程度从高到低：

- **ERROR** (0): 错误，需要立即关注
- **WARN** (1): 警告，可能需要关注
- **INFO** (2): 信息，常规操作日志
- **DEBUG** (3): 调试，详细的调试信息

设置日志级别会过滤低于该级别的日志。例如设置为 `INFO` 会输出 ERROR、WARN、INFO，但不输出 DEBUG。

## 日志格式

### 控制台输出
```
2026-09-28T08:00:55.862Z INFO  [mcp-service] MCP 服务已启动
2026-09-28T08:00:55.863Z ERROR [git-service] Git 操作失败
Error: 文件不存在
    at ...
```

### 文件输出（JSON Lines）
```json
{"timestamp":"2026-09-28T08:00:55.862Z","level":"INFO","module":"mcp-service","message":"MCP 服务已启动"}
{"timestamp":"2026-09-28T08:00:55.863Z","level":"ERROR","module":"git-service","message":"Git 操作失败","stack":"Error: 文件不存在\n    at ..."}
```

## 日志轮转

- 单个日志文件最大 10MB
- 保留最近 5 个历史文件
- 文件名格式：`taskweaver.log`, `taskweaver.log.1`, ..., `taskweaver.log.5`
- 达到大小限制时自动轮转

## 高级用法

### 创建独立日志器实例

```javascript
import { createLogger } from './electron/backend/logger.mjs'

const customLogger = createLogger('/custom/log/path', 'DEBUG')
await customLogger.initialize()

customLogger.info('custom-module', '使用独立实例')
```

### 关闭日志器

```javascript
await customLogger.close()
```

## 集成到现有代码

### 替换现有 console 调用

**之前：**
```javascript
console.error('MCP 服务启动失败:', error)
console.warn('[TaskWeaver-MCP] 配置无效')
console.log('Git 仓库已加载')
```

**之后：**
```javascript
import { logger } from './logger.mjs'

logger.error('mcp-service', 'MCP 服务启动失败', error)
logger.warn('mcp-service', '配置无效')
logger.info('git-service', 'Git 仓库已加载')
```

## API 参考

### initializeGlobalLogger(logDir, logLevel)
初始化全局日志器实例。

- `logDir`: 日志文件目录路径
- `logLevel`: 日志级别（'ERROR' | 'WARN' | 'INFO' | 'DEBUG'），默认 'INFO'

### logger.error(module, message, error?)
记录错误级别日志。

- `module`: 模块名称
- `message`: 日志消息
- `error`: 可选的 Error 对象，会自动提取堆栈信息

### logger.warn(module, message, error?)
记录警告级别日志。

### logger.info(module, message)
记录信息级别日志。

### logger.debug(module, message)
记录调试级别日志。

### createLogger(logDir, logLevel)
创建独立的日志器实例。

返回 Logger 实例，需要调用 `initialize()` 后使用。

## 注意事项

1. **模块名称**：使用简短、有意义的模块标识，如 'mcp-service', 'git-service', 'orchestration'
2. **消息内容**：使用简洁、清晰的描述，避免过长的消息
3. **错误对象**：始终传递完整的 Error 对象以保留堆栈信息
4. **初始化时机**：在应用启动早期调用 `initializeGlobalLogger`
5. **性能考虑**：日志写入是异步的，不会阻塞主线程
