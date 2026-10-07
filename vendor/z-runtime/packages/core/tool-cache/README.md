# @z/dsh-tool-cache

工具结果缓存插件，用于消除 DAG 子任务中的重复工具调用。

## 功能

- **自动缓存读操作**：自动识别并缓存 `read`、`grep`、`find_files`、`bash`（只读命令）等工具的结果
- **会话级缓存**：缓存作用域限定在单个会话内，会话重置时自动清空
- **智能失效**：只缓存成功的结果，错误结果不缓存
- **LRU 驱逐**：达到容量上限时自动移除最旧的条目
- **统计监控**：提供命中率统计和详细日志

## 安装

```yaml
# cordis.yml
- name: '@z/dsh-tool-cache'
  config:
    enabled: true
    maxEntriesPerSession: 1000
```

## 配置

```typescript
interface Config {
  /** 启用工具结果缓存。默认：true */
  enabled?: boolean
  /** 每个会话的最大缓存条目数。默认：1000 */
  maxEntriesPerSession?: number
  /** 允许缓存的工具列表（为空则缓存所有只读工具）。默认：[] */
  allowedTools?: string[]
  /** 禁止缓存的工具列表。默认：[] */
  blockedTools?: string[]
}
```

## 默认可缓存工具

- `read` - 文件读取
- `grep` - 文件内容搜索
- `find_files` - 文件查找
- `glob` - 文件模式匹配
- `bash` - Bash 命令（仅只读命令）
- `list_directory` - 目录列表
- `get_file_info` - 文件信息

## 缓存键计算

缓存键由工具名称和参数的 SHA256 哈希值组成：

```typescript
key = sha256(JSON.stringify({ tool: toolName, args: toolInput }))
```

相同的工具调用（工具名和参数完全相同）会命中缓存。

## 只读检测

对于 `bash` 工具，插件会检查命令是否为只读操作：

- ✅ 可缓存：`cat file.txt`、`ls -la`、`grep pattern file`
- ❌ 不可缓存：`rm file.txt`、`echo text > file`、`mv a b`

检测规则基于命令中是否包含写操作关键字（`>`、`>>`、`rm`、`mv`、`cp`、`mkdir` 等）。

## 性能影响

### 模型体验

**无额外 token 消耗** - 缓存在工具执行层实现，对模型完全透明。

**减少响应延迟** - 缓存命中时跳过实际工具执行，显著降低重复操作的延迟。

**无 KV-cache 影响** - 缓存不改变对话历史结构，KV-cache 行为保持不变。

### 典型收益

在包含重复文件读取或搜索的任务中：

- 31 次工具调用的任务可能有 5-8 次缓存命中
- 每次命中节省 100-500ms（取决于工具类型）
- 总体响应时间减少 10-20%

## 监控

插件在会话结束时输出统计信息：

```
[tool-cache] Session abc123 stats: 8 hits, 23 misses, hit rate: 25.8%
```

通过服务接口获取实时统计：

```typescript
const stats = ctx['tool-cache'].getStats(sessionId)
// { entries: 15, hits: 8, misses: 23, hitRate: 0.258 }
```

## API

插件提供以下服务方法：

```typescript
interface ToolCacheService {
  /** 获取会话的缓存统计 */
  getStats(sessionId: string): {
    entries: number
    hits: number
    misses: number
    hitRate: number
  } | null
  
  /** 清空指定会话的缓存 */
  clear(sessionId: string): void
  
  /** 清空所有会话的缓存 */
  clearAll(): void
}
```

## 示例配置

### 仅缓存文件读取

```yaml
- name: '@z/dsh-tool-cache'
  config:
    enabled: true
    allowedTools: ['read', 'grep']
```

### 禁止缓存 bash 命令

```yaml
- name: '@z/dsh-tool-cache'
  config:
    enabled: true
    blockedTools: ['bash']
```

### 大容量缓存

```yaml
- name: '@z/dsh-tool-cache'
  config:
    enabled: true
    maxEntriesPerSession: 5000
```

## 已知限制

- **不跨会话共享** - 缓存作用域限定在单个会话，不同会话间不共享缓存
- **无持久化** - 缓存存储在内存中，进程重启后丢失
- **Bash 检测启发式** - 只读命令检测基于简单模式匹配，复杂命令可能误判
- **无主动失效** - 文件修改后不会主动失效相关缓存（依赖会话重置清空）

## 设计权衡

**为何不持久化缓存？**  
文件系统状态在会话间可能变化，持久化缓存需要复杂的失效策略。会话级缓存足以覆盖 DAG 子任务重复的主要场景。

**为何不跨会话共享？**  
不同会话可能工作在不同工作目录或文件系统状态下，跨会话共享需要额外的上下文管理。

**为何只缓存成功结果？**  
错误结果（如文件不存在）可能在后续操作后变为成功（如文件被创建），缓存错误结果会导致陈旧数据。
