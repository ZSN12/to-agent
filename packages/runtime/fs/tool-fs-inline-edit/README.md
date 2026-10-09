# @z/dsh-tool-fs-inline-edit

内联文件编辑工具，提供带预览的 diff 编辑体验，优于传统的 Edit 工具。

## 功能特性

- 📝 **内联 Diff 预览**：在应用更改前查看完整的 diff
- 🔍 **上下文显示**：显示更改周围的代码上下文
- ✅ **语法验证**：应用更改前验证语法错误
- 💾 **自动备份**：自动创建备份，支持撤销
- 📊 **统计信息**：显示添加/删除的行数和字节数
- 🔄 **批量编辑**：一次编辑多个文件
- ⚡ **智能格式化**：自动格式化编辑后的代码

## 安装

```bash
pnpm install
```

## 配置

在 Cordis 配置文件中添加：

```yaml
- id: inline-edit
  name: '@z/dsh-tool-fs-inline-edit'
  config:
    enabled: true
    previewMode: inline  # 或 full
    autoFormat: true
    validateBeforeApply: true
    backupEnabled: true
```

### 配置项说明

- `enabled`: 是否启用内联编辑（默认 `true`）
- `previewMode`: 预览模式
  - `inline`: 只显示变化和上下文（推荐）
  - `full`: 显示完整 diff
- `autoFormat`: 编辑后自动格式化代码（默认 `true`）
- `validateBeforeApply`: 应用前验证语法（默认 `true`）
- `backupEnabled`: 启用自动备份（默认 `true`）

## 使用方法

### 1. 基本编辑（带预览）

```typescript
// Agent 调用
edit_file_inline({
  file_path: "/path/to/file.ts",
  old_string: "const x = 1",
  new_string: "const x = 2",
  preview: true,  // 先预览
  context_lines: 3  // 显示 3 行上下文
})

// 返回预览
{
  success: false,  // 尚未应用
  preview: true,
  file: "/path/to/file.ts",
  diff: {
    hunks: [...],
    inline_preview: {
      context_before: ["function foo() {", "  // 一些代码"],
      old_content: ["const x = 1"],
      new_content: ["const x = 2"],
      context_after: ["  return x", "}"]
    },
    unified: "--- /path/to/file.ts\n+++ /path/to/file.ts\n..."
  },
  stats: {
    additions: 1,
    deletions: 1,
    bytes_changed: 1
  },
  message: "Preview generated. Review the diff above..."
}
```

### 2. 应用编辑

查看预览满意后，设置 `preview: false` 应用：

```typescript
edit_file_inline({
  file_path: "/path/to/file.ts",
  old_string: "const x = 1",
  new_string: "const x = 2",
  preview: false  // 应用更改
})

// 返回
{
  success: true,
  file: "/path/to/file.ts",
  stats: {
    additions: 1,
    deletions: 1,
    bytes_changed: 1
  },
  backup: "/path/to/file.ts.backup",
  message: "File edited successfully."
}
```

### 3. 批量编辑多个文件

```typescript
edit_multiple_files({
  edits: [
    {
      file_path: "/path/to/file1.ts",
      old_string: "import { A } from './a'",
      new_string: "import { A } from './lib/a'"
    },
    {
      file_path: "/path/to/file2.ts",
      old_string: "import { A } from './a'",
      new_string: "import { A } from './lib/a'"
    }
  ],
  preview: true,  // 先预览所有更改
  context_lines: 3
})

// 返回所有文件的预览
{
  success: false,
  preview: true,
  edits: [
    {
      file: "/path/to/file1.ts",
      success: true,
      diff: { hunks: [...], inline_preview: {...} }
    },
    {
      file: "/path/to/file2.ts",
      success: true,
      diff: { hunks: [...], inline_preview: {...} }
    }
  ],
  total: 2,
  message: "Preview generated for all files..."
}
```

### 4. 撤销编辑

如果编辑有误，可以从备份恢复：

```typescript
undo_edit({
  file_path: "/path/to/file.ts"
})

// 返回
{
  success: true,
  file: "/path/to/file.ts",
  message: "Edit undone successfully. Backup removed."
}
```

## 使用场景

### 场景 1：重构导入路径

```
用户：把所有 './utils' 的导入改成 './lib/utils'

Agent 步骤：
1. 先用 semantic_search_code 找到所有相关文件
2. 使用 edit_multiple_files 批量预览更改
3. 用户确认后，应用更改
```

### 场景 2：重命名函数

```
用户：把 getUserData 函数改名为 fetchUserData

Agent 步骤：
1. 搜索所有使用该函数的地方
2. 逐个预览更改（带上下文）
3. 确认后批量应用
4. 如果有问题，使用 undo_edit 撤销
```

### 场景 3：修复类型错误

```
用户：把 User 接口的 age 字段从 string 改成 number

Agent 步骤：
1. 预览接口定义的更改
2. 搜索所有使用 age 的地方
3. 预览每处需要修改的代码
4. 语法验证通过后应用
5. 自动格式化
```

## 与传统 Edit 工具的对比

### 传统 Edit 工具

```typescript
Edit({
  file_path: "/path/to/file.ts",
  old_string: "const x = 1",
  new_string: "const x = 2"
})
// ❌ 没有预览
// ❌ 看不到上下文
// ❌ 无法撤销
// ❌ 不验证语法
// ❌ 直接应用，风险高
```

### 内联 Edit 工具

```typescript
edit_file_inline({
  file_path: "/path/to/file.ts",
  old_string: "const x = 1",
  new_string: "const x = 2",
  preview: true,
  context_lines: 3
})
// ✅ 完整的 diff 预览
// ✅ 显示上下文代码
// ✅ 自动备份，可撤销
// ✅ 语法验证
// ✅ 分步骤：预览 → 确认 → 应用
```

## Diff 预览格式

### Inline 模式（推荐）

只显示变化和周围上下文，简洁清晰：

```
📄 src/utils.ts  +1 -1

上下文:
  function foo() {
    // 一些代码

旧内容:
- const x = 1

新内容:
+ const x = 2

上下文:
    return x
  }
```

### Full 模式

完整的 unified diff 格式：

```
--- src/utils.ts
+++ src/utils.ts
@@ -10,7 +10,7 @@
 function foo() {
   // 一些代码
-  const x = 1
+  const x = 2
   return x
 }
```

## 语法验证

支持的语言：
- TypeScript / JavaScript：括号匹配、语法检查
- Python：缩进检查、语法检查
- JSON：JSON 格式验证

验证失败示例：

```typescript
edit_file_inline({
  file_path: "config.json",
  old_string: '{"key": "value"}',
  new_string: '{"key": "value"',  // 缺少右括号
  preview: false
})

// 返回
{
  success: false,
  error: "Syntax validation failed",
  validation_errors: ["1 unclosed brackets"],
  message: "The changes would introduce syntax errors. Fix them first."
}
```

## 自动备份

每次编辑都会自动创建 `.backup` 文件：

```
src/utils.ts          # 原文件
src/utils.ts.backup   # 备份文件
```

撤销时会恢复备份并删除它：

```typescript
undo_edit({ file_path: "src/utils.ts" })
// src/utils.ts 恢复为备份内容
// src/utils.ts.backup 被删除
```

## 性能优化

### 批量编辑优化

- 并行读取多个文件
- 统一生成所有 diff
- 一次性应用所有更改
- 减少磁盘 I/O

### 大文件优化

- 流式读取
- 增量 diff 计算
- 内存高效的 LCS 算法

### 上下文行数建议

- 小改动：3 行（默认）
- 中等改动：5 行
- 大改动：10 行
- 完整文件：0 行（显示全部）

## 故障排除

### 找不到 old_string

```
Error: old_string not found in file
```

解决方法：
1. 先用 Read 工具读取文件当前内容
2. 确保 old_string 完全匹配，包括空格和换行
3. 使用多行字符串时注意缩进

### 语法验证失败

```
Error: Syntax validation failed
```

解决方法：
1. 检查 new_string 的语法
2. 确保括号、引号成对
3. 使用编辑器的语法检查
4. 临时禁用验证：`validateBeforeApply: false`

### 备份不存在

```
Error: No backup found for this file
```

解决方法：
1. 确保 `backupEnabled: true`
2. 只能撤销本次会话的编辑
3. 跨会话需要使用 git 等版本控制

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

## 路线图

- [ ] 集成 Prettier 自动格式化
- [ ] 支持 Tree-sitter 精确语法验证
- [ ] 支持正则表达式替换
- [ ] 支持多光标编辑
- [ ] 支持 AI 辅助的智能重构
- [ ] 支持增量 diff（只重新计算变化部分）

## 许可证

MIT
