# Z Runtime 构建说明

## 依赖安装

**TaskWeaver 仓库根目录**只用 npm：克隆后执行 `npm ci`（锁文件为 `package-lock.json`）。不要在根目录运行 `pnpm install`。

Z Runtime 使用 pnpm workspace，必须在其目录下用 CI 模式安装以避免交互式提示和副作用：

```bash
cd packages/runtime
CI=true pnpm install --ignore-scripts
```

**重要**：不要在 z-runtime 内使用 `pnpm exec` 调用构建工具，这会触发整仓 install 并可能破坏 node_modules 结构。

## 构建方式

### 全量构建（推荐）

从项目根目录运行：

```bash
CI=true node scripts/build-host-runtime.mjs
```

这会：
1. 检查并安装 z-runtime 依赖（如需要）
2. 用本地 tsc/tsdown 二进制编译 host 和 client 面
3. 用 pnpm deploy 打包到 `vendor/taskweaver-z-runtime`
4. 同步模型目录和运行时包

### 仅打包（跳过编译）

如果已有构建产物，只想重新打包：

```bash
node scripts/build-host-runtime.mjs --skip-build
```

## 技术细节

### 为什么避免 pnpm exec

`pnpm exec tsc` 会：
- 触发整仓依赖检查和可能的 install
- 在某些情况下重建 node_modules 结构
- 导致 `node_modules/.bin/tsc` 暂时不可用
- 可能引入类型冲突（如根项目和 z-runtime 的 commander 类型）

**解决方案**：`build-host-runtime.mjs` 直接调用 `monorepoRoot/node_modules/.bin/tsc` 和 `tsdown`，避免 pnpm exec 的副作用。

### 类型隔离

z-runtime 使用 pnpm，根项目使用 npm。构建时：
- 在 z-runtime 目录设置 `cwd`
- 直接调用本地二进制，确保类型解析只在 z-runtime/node_modules 内进行
- 避免根项目的 node_modules 污染 z-runtime 的类型系统

### CI 模式

所有 pnpm 命令都设置 `CI=true` 环境变量，禁用交互式提示，特别是删除 node_modules 时的确认。

## 常见问题

### "Command tsc not found"

原因：z-runtime 的 node_modules 不完整或被破坏。

解决：
```bash
cd packages/runtime
CI=true pnpm install --ignore-scripts
```

### "Found 12 errors" 类型错误

原因：可能是 commander 等库的类型从两个地方解析（根项目和 z-runtime），导致不兼容。

解决：确保构建时 cwd 在 z-runtime 内，使用本地二进制而非 pnpm exec。

### make-mac-app.sh 显示"全量构建失败，尝试仅打包"

原因：tsc 编译失败，但脚本检测到旧的 deploy 目录，fallback 到 `--skip-build`。

解决：修复 tsc 错误后重新运行，或删除 `vendor/taskweaver-z-runtime` 强制全量构建。
