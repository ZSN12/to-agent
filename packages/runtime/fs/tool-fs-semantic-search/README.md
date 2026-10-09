# @z/dsh-tool-fs-semantic-search

语义代码搜索工具，使用向量嵌入实现基于自然语言的代码搜索。

## 功能特性

- 🔍 **语义搜索**：使用自然语言查询代码，理解代码含义而非仅匹配文本
- 🎯 **精确过滤**：支持按语言、类型、文件路径过滤结果
- 📦 **智能分块**：自动识别函数、类、方法等代码单元
- ⚡ **性能优化**：嵌入缓存和批量处理
- 🔌 **多后端支持**：支持 ChromaDB 和内存存储

## 安装

```bash
pnpm install
```

## 配置

在 Cordis 配置文件中添加：

```yaml
- id: semantic-search
  name: '@z/dsh-tool-fs-semantic-search'
  config:
    enabled: true
    embeddingProvider: jina  # 或 openai
    jinaApiKey: !env JINA_API_KEY  # 或 openaiApiKey
    vectorStore: memory  # 或 chroma
    chromaHost: localhost
    chromaPort: 8000
    cacheEmbeddings: true
    autoIndex: false
    indexOnStartup: false
```

### 配置项说明

- `enabled`: 是否启用语义搜索（默认 `true`）
- `embeddingProvider`: 嵌入服务提供商，`jina` 或 `openai`
- `jinaApiKey`: Jina AI API 密钥（使用 Jina 时必需）
- `openaiApiKey`: OpenAI API 密钥（使用 OpenAI 时必需）
- `vectorStore`: 向量存储后端，`memory`（内存）或 `chroma`（ChromaDB）
- `chromaHost`: ChromaDB 主机地址（使用 chroma 时）
- `chromaPort`: ChromaDB 端口（使用 chroma 时）
- `cacheEmbeddings`: 是否缓存嵌入结果（默认 `true`）
- `autoIndex`: 是否自动索引当前项目（默认 `false`）
- `indexOnStartup`: 是否在启动时索引项目（默认 `false`）

## 使用方法

### 1. 索引项目

在使用语义搜索之前，需要先索引项目：

```typescript
// Agent 调用
index_project_for_semantic_search({
  path: "/path/to/project",  // 可选，默认当前目录
  force: false  // 可选，强制重建索引
})

// 返回
{
  indexed: true,
  path: "/path/to/project",
  totalChunks: 1250,
  cacheSize: 42,
  message: "Project indexed successfully. Found 1250 code blocks."
}
```

### 2. 语义搜索

使用自然语言查询代码：

```typescript
// Agent 调用
semantic_search_code({
  query: "functions that handle user authentication",
  language: "typescript",  // 可选：typescript, javascript, python, java, cpp, all
  type: "function",  // 可选：function, class, method, interface, all
  file: "auth",  // 可选：文件路径子串
  top_k: 10  // 可选：返回结果数量（1-50）
})

// 返回
{
  results: [
    {
      file: "src/auth/login.ts",
      name: "authenticateUser",
      type: "function",
      language: "typescript",
      location: "src/auth/login.ts:15-42",
      score: "0.923",
      preview: "export async function authenticateUser(username: string, password: string) {\n  // Authenticate user with credentials\n  const user = await db.findUser(username)...",
      comments: "// Authenticates a user with username and password..."
    },
    // ... 更多结果
  ],
  total: 10,
  query: "functions that handle user authentication"
}
```

### 3. 查看统计信息

```typescript
// Agent 调用
semantic_search_stats({})

// 返回
{
  initialized: true,
  totalChunks: 1250,
  cacheSize: 42,
  embeddingProvider: "jina",
  vectorStore: "memory"
}
```

## 使用场景

### 场景 1：查找认证相关代码

```
用户：帮我找到所有处理用户认证的函数

Agent 调用：
semantic_search_code({
  query: "functions that handle user authentication",
  type: "function"
})

结果：
- src/auth/login.ts:authenticateUser (score: 0.92)
- src/auth/token.ts:verifyToken (score: 0.89)
- src/middleware/auth.ts:checkAuth (score: 0.85)
```

### 场景 2：查找 React Hooks 使用

```
用户：项目中哪些组件使用了 useState 和 useEffect？

Agent 调用：
semantic_search_code({
  query: "React components that use useState and useEffect hooks",
  language: "typescript",
  type: "function"
})

结果：
- src/components/UserProfile.tsx:UserProfile (score: 0.94)
- src/components/Dashboard.tsx:Dashboard (score: 0.91)
```

### 场景 3：查找 HTTP 请求代码

```
用户：哪些代码在发 HTTP 请求？

Agent 调用：
semantic_search_code({
  query: "code that makes HTTP requests or API calls",
  top_k: 15
})

结果：
- src/api/client.ts:fetchUser (score: 0.93)
- src/services/data.ts:getData (score: 0.90)
- src/utils/request.ts:makeRequest (score: 0.88)
```

## ChromaDB 设置

如果使用 ChromaDB 作为向量存储：

1. 安装 ChromaDB：
```bash
pip install chromadb
```

2. 启动 ChromaDB 服务器：
```bash
chroma run --host localhost --port 8000
```

3. 在配置中设置：
```yaml
vectorStore: chroma
chromaHost: localhost
chromaPort: 8000
```

## 获取 API 密钥

### Jina AI（推荐）

1. 访问 https://jina.ai/
2. 注册账号
3. 获取 API 密钥
4. 设置环境变量：`export JINA_API_KEY=your_key`

### OpenAI

1. 访问 https://platform.openai.com/
2. 注册账号
3. 获取 API 密钥
4. 设置环境变量：`export OPENAI_API_KEY=your_key`

## 性能优化

### 嵌入缓存

启用 `cacheEmbeddings: true` 可以缓存嵌入结果，避免重复计算：
- 相同文本的嵌入会被缓存
- 显著减少 API 调用次数
- 加快重复查询速度

### 批量处理

索引时自动使用批量处理：
- 每批最多 100 个文本
- 并行处理多个批次
- 减少网络往返次数

### 增量索引

使用 `force: false`（默认）时：
- 只索引新文件或修改过的文件
- 避免重复索引未变更的代码
- 节省时间和 API 调用

## 支持的语言

目前支持以下编程语言：
- TypeScript (`.ts`, `.tsx`)
- JavaScript (`.js`, `.jsx`)
- Python (`.py`)
- Java (`.java`)
- C++ (`.cpp`)
- C (`.c`)
- Go (`.go`)
- Rust (`.rs`)

## 排除的目录

索引时会自动排除以下目录：
- `node_modules`
- `.git`
- `dist`
- `build`
- `out`
- `target`
- `vendor`
- `__pycache__`

## 限制

- 单次搜索最多返回 50 个结果
- 索引大型项目（10k+ 文件）可能需要几分钟
- 嵌入 API 有速率限制（取决于提供商）
- 内存存储模式下，索引会在重启后丢失

## 故障排除

### ChromaDB 连接失败

```
Error: ChromaDB initialization failed
```

解决方法：
1. 确保 ChromaDB 服务器正在运行
2. 检查主机和端口配置是否正确
3. 尝试使用内存存储：`vectorStore: memory`

### API 密钥错误

```
Error: Jina API key is required
```

解决方法：
1. 确保设置了正确的环境变量
2. 检查配置文件中的 API 密钥设置
3. 验证 API 密钥是否有效

### 搜索结果为空

```
No results found. You may need to index the project first.
```

解决方法：
1. 运行 `index_project_for_semantic_search`
2. 检查索引是否成功完成
3. 使用 `semantic_search_stats` 查看索引状态

## 开发

### 构建

```bash
pnpm build
```

### 测试

```bash
pnpm test
```

### 开发模式

```bash
pnpm dev
```

## 许可证

MIT
