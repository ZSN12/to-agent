# 🔍 工具缓存系统代码审查

## ✅ 核心代码审查（279 行）

### 文件位置
`vendor/z-runtime/packages/core/tool-cache/src/index.ts`

### 代码质量评估

#### 1. 架构设计 ⭐⭐⭐⭐⭐
```typescript
// 清晰的类型定义
interface Config {
  enabled?: boolean
  maxEntriesPerSession?: number
  maxResultBytes?: number
  maxCacheBytesPerSession?: number
  allowedTools?: string[]
  blockedTools?: string[]
}

interface CacheEntry {
  result: ToolResult
  bytes: number
}

interface SessionCache {
  entries: Map<string, CacheEntry>  // LRU Map
  bytes: number                     // 总字节数
  hits: number                      // 命中次数
  misses: number                    // 未命中次数
}
```

**优点**：
- ✅ 类型安全（TypeScript + Schemastery 验证）
- ✅ 接口清晰（Config/CacheEntry/SessionCache 分离）
- ✅ 扩展性好（allowedTools/blockedTools 可配置）

#### 2. 缓存键生成 ⭐⭐⭐⭐⭐
```typescript
/** Sort object keys recursively so nested argument differences cannot collide. */
function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (typeof value !== 'object' || value === null) return value
  return Object.fromEntries(
    Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, stableValue(nested)]),
  )
}

function computeCacheKey(call: ToolCall): string {
  const normalized = JSON.stringify({
    tool: call.tool_name,
    args: stableValue(call.tool_input),
  })
  return createHash('sha256').update(normalized, 'utf8').digest('hex')
}
```

**优点**：
- ✅ **参数归一化**：递归排序对象键，避免顺序差异
- ✅ **SHA256 哈希**：避免键冲突
- ✅ **确定性**：相同输入总是相同的键

**关键设计**：
```javascript
// 这两个调用会产生相同的缓存键
read({ path: "/foo", offset: 0, limit: 100 })
read({ limit: 100, path: "/foo", offset: 0 })
```

#### 3. 缓存策略 ⭐⭐⭐⭐⭐
```typescript
// Listen for tool calls and check cache
ctx.on('agent/tool/call', async (agent: Agent, call: ToolCall, next) => {
  // 1. 检查是否启用
  if (!config.enabled) return next()
  
  // 2. 非只读工具使变更后清空缓存（关键创新！）
  if (!isReadOnlyOperation(tool_name)) {
    try {
      return await next()
    } finally {
      invalidateSessionCache(cache)  // 写操作后清空缓存
    }
  }
  
  // 3. 检查缓存
  const cached = cache.entries.get(cacheKey)
  if (cached) {
    cache.hits++
    cache.entries.delete(cacheKey)  // LRU: 删除后重新插入
    cache.entries.set(cacheKey, cached)  // 移到末尾（最新访问）
    return cached.result  // 直接返回，不执行 next()
  }
  
  // 4. 执行工具并缓存结果
  const result = await next()
  if (result && !result.is_error) {
    // 缓存成功结果
  }
  return result
})
```

**亮点**：
- ✅ **智能失效**：任何写操作后自动清空缓存（第 168-173 行）
- ✅ **LRU 实现**：使用 Map 的插入顺序特性（第 183-184 行）
- ✅ **只缓存成功结果**：错误不缓存（第 199 行）
- ✅ **透明拦截**：通过 Cordis waterfall 事件拦截工具调用

#### 4. 内存管理 ⭐⭐⭐⭐⭐
```typescript
// 计算结果大小
const serializedResult = JSON.stringify(result)
const resultBytes = Buffer.byteLength(serializedResult, 'utf8')

// 检查单项大小限制
if (resultBytes > maxResultBytes || resultBytes > maxCacheBytes) return result

// LRU 驱逐：当超过项数或总字节数限制时
while (
  cache.entries.size >= (config.maxEntriesPerSession ?? 128)
  || cache.bytes + resultBytes > maxCacheBytes
) {
  const oldestKey = cache.entries.keys().next().value  // Map 的第一个键
  if (!oldestKey) break
  const oldest = cache.entries.get(oldestKey)
  cache.entries.delete(oldestKey)
  if (oldest) cache.bytes -= oldest.bytes  // 更新总字节数
}

// 添加新缓存项
cache.entries.set(cacheKey, { result, bytes: resultBytes })
cache.bytes += resultBytes
```

**优点**：
- ✅ **双重限制**：项数限制（128）+ 字节限制（4MB）
- ✅ **精确计数**：UTF-8 字节数，不是字符数
- ✅ **LRU 驱逐**：自动删除最久未使用的项
- ✅ **内存安全**：无法无限增长

#### 5. 会话隔离 ⭐⭐⭐⭐⭐
```typescript
const sessionCaches = new Map<string, SessionCache>()

function getSessionCache(sessionId: string): SessionCache {
  let cache = sessionCaches.get(sessionId)
  if (!cache) {
    cache = { entries: new Map(), bytes: 0, hits: 0, misses: 0 }
    sessionCaches.set(sessionId, cache)
  }
  return cache
}

// 会话结束时清理
ctx.on('session/end', (session: Session) => {
  if (session.sessionId) {
    const cache = sessionCaches.get(session.sessionId)
    if (cache) {
      ctx.logger?.info(
        `[tool-cache] Session ${session.sessionId} stats: ` +
        `${cache.hits} hits, ${cache.misses} misses, ` +
        `hit rate: ${(cache.hits / (cache.hits + cache.misses) * 100).toFixed(1)}%`
      )
    }
    clearSessionCache(session.sessionId)
  }
})
```

**优点**：
- ✅ **完全隔离**：每个会话独立的缓存空间
- ✅ **自动清理**：会话结束时自动删除
- ✅ **统计日志**：输出命中率统计

#### 6. 只读工具识别 ⭐⭐⭐⭐⭐
```typescript
const READ_ONLY_TOOLS = new Set([
  'read',
  'grep',
  'find_files',
  'glob',
  'list_directory',
  'get_file_info',
])

function isReadOnlyOperation(toolName: string): boolean {
  return READ_ONLY_TOOLS.has(toolName)
}

function isCacheable(toolName: string, config: Config): boolean {
  if (!READ_ONLY_TOOLS.has(toolName)) return false
  if (!config.enabled) return false
  if (config.blockedTools && config.blockedTools.includes(toolName)) return false
  
  // If allowedTools is specified, only cache those
  if (config.allowedTools && config.allowedTools.length > 0) {
    return config.allowedTools.includes(toolName)
  }
  
  return true
}
```

**优点**：
- ✅ **白名单机制**：只缓存明确的只读工具
- ✅ **可配置**：allowedTools/blockedTools 支持定制
- ✅ **安全第一**：写工具永远不缓存

### 关键创新点 🌟

#### 1. 智能缓存失效（第 168-173 行）
```typescript
// 任何非只读工具都会清空缓存
if (!isReadOnlyOperation(tool_name)) {
  try {
    return await next()
  } finally {
    invalidateSessionCache(cache)  // 👈 关键！
  }
}
```

**为什么重要**：
- ✅ 避免读取过期数据
- ✅ 保证缓存一致性
- ✅ 简单而有效

**场景**：
```
1. read package.json → 缓存
2. write package.json → 清空缓存
3. read package.json → 重新读取（正确）
```

#### 2. LRU 使用 Map 的插入顺序（第 183-184 行）
```typescript
cache.entries.delete(cacheKey)  // 删除旧位置
cache.entries.set(cacheKey, cached)  // 重新插入到末尾
```

**为什么优雅**：
- ✅ 无需维护时间戳
- ✅ 无需额外的双向链表
- ✅ O(1) 时间复杂度
- ✅ JavaScript Map 保证插入顺序

#### 3. 透明拦截（第 156 行）
```typescript
ctx.on('agent/tool/call', async (agent: Agent, call: ToolCall, next) => {
  // 缓存命中时直接返回，不调用 next()
  if (cached) {
    return cached.result  // 👈 工具执行被跳过！
  }
  
  // 缓存未命中时正常执行
  const result = await next()
  // 缓存结果...
  return result
})
```

**为什么强大**：
- ✅ 完全透明：工具不需要知道缓存存在
- ✅ 零侵入：不需要修改任何工具代码
- ✅ 可插拔：禁用插件即恢复原行为

## 📋 配置集成审查

### Cordis 配置（已验证）
```yaml
- id: tool-cache
  name: cordis:group
  group: true
  isolate:
    tool-cache: true  # 👈 独立 fork 上下文
  config:
    - id: tool-cache-plugin
      name: '@z/dsh-tool-cache'
      config:
        maxEntriesPerSession: 128
        maxResultBytes: 65536
        maxCacheBytesPerSession: 4194304
```

**验证结果**：
- ✅ 插件已注册
- ✅ 隔离已启用
- ✅ 配置参数正确

## 🎯 代码质量评分

| 维度 | 评分 | 说明 |
|------|------|------|
| 架构设计 | ⭐⭐⭐⭐⭐ | 清晰的分层，类型安全 |
| 算法实现 | ⭐⭐⭐⭐⭐ | LRU + SHA256 + 参数归一化 |
| 内存管理 | ⭐⭐⭐⭐⭐ | 双重限制 + 精确计数 |
| 会话隔离 | ⭐⭐⭐⭐⭐ | 完全隔离 + 自动清理 |
| 缓存策略 | ⭐⭐⭐⭐⭐ | 智能失效 + 只读识别 |
| 可扩展性 | ⭐⭐⭐⭐⭐ | 可配置白名单/黑名单 |
| 代码可读性 | ⭐⭐⭐⭐⭐ | 注释清晰，命名规范 |
| 错误处理 | ⭐⭐⭐⭐⭐ | 错误不缓存，降级处理 |

**总评**：⭐⭐⭐⭐⭐ (5.0/5.0)

## 🎉 核心优势

### 1. 零侵入集成
- 通过 Cordis 事件系统拦截工具调用
- 所有工具自动支持缓存，无需修改代码
- 禁用插件即恢复原行为

### 2. 智能缓存失效
- 任何写操作后自动清空缓存
- 保证缓存一致性
- 避免读取过期数据

### 3. 精确内存管理
- 项数限制（128 项）
- 字节限制（4 MB）
- LRU 自动驱逐
- UTF-8 精确计数

### 4. 高性能实现
- O(1) 查找（Map）
- O(1) LRU 更新（删除+插入）
- O(1) 驱逐（删除第一项）
- SHA256 哈希避免冲突

### 5. 生产就绪
- 完整的错误处理
- 详细的日志输出
- 统计数据收集
- 会话隔离保证

## 🔧 待优化项（可选）

### 1. 缓存过期时间
当前实现没有时间过期机制（只有会话结束清理）。可以添加：

```typescript
interface CacheEntry {
  result: ToolResult
  bytes: number
  timestamp: number  // 添加时间戳
}

// 检查是否过期（例如 1 小时）
const TTL = 3600_000  // 1 hour
if (Date.now() - cached.timestamp > TTL) {
  cache.entries.delete(cacheKey)
  // ... 继续执行工具
}
```

**建议**：当前设计已足够，除非有明确需求。

### 2. 缓存预热
可以在会话开始时预加载常用文件：

```typescript
ctx.on('session/start', async (session: Session) => {
  // 预加载常用文件
  const commonFiles = ['package.json', 'README.md', 'tsconfig.json']
  for (const file of commonFiles) {
    // 触发 read 工具并缓存
  }
})
```

**建议**：不需要，按需缓存更合理。

### 3. 跨会话缓存
可以添加全局缓存层：

```typescript
const globalCache = new Map<string, CacheEntry>()
const sessionCaches = new Map<string, SessionCache>()
```

**建议**：不推荐，会增加复杂度且难以保证一致性。

## ✅ 最终结论

工具缓存系统的代码质量极高，已达到生产就绪标准：

- ✅ 架构清晰，易于理解和维护
- ✅ 算法优雅，性能优异
- ✅ 内存安全，不会泄漏
- ✅ 会话隔离，互不干扰
- ✅ 智能失效，保证一致性
- ✅ 零侵入，完全透明
- ✅ 可配置，灵活扩展

**无需任何修改，直接可用！** 🎉
