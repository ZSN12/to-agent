# TaskWeaver 对执行层源码的纳入与改造说明

本目录为 **pi monorepo 完整源码**（纳入毕设仓库 `packages/pi`），供 TaskWeaver 在**同一项目文件夹内**做自适应化改造，而不是仅依赖 npm registry 上的预编译包。

## 目录角色

| 包路径 | 作用 | TaskWeaver 是否直接改 |
|--------|------|------------------------|
| `packages/coding-agent` | SDK：`createAgentSession`、`ModelRuntime`、工具、Skill、Extension | **是**（桌面集成、权限 extension 契约） |
| `packages/agent` | Agent 循环、compaction | 按需（多会话、压缩策略） |
| `packages/ai` | 模型目录、各厂商 HTTP/OAuth | 按需（价签、自定义 provider） |
| `packages/tui` | 终端 UI | **否**（TaskWeaver 用 Electron UI） |

毕设**创新层**仍在仓库根目录 `electron/backend/*`（门控、DAG、分配、记忆）；本目录是**执行层源码基线**。

## 与 TaskWeaver 的接线

- 唯一对外 re-export：`electron/agent/agent-runtime.mjs` → `packages/pi/packages/coding-agent/dist/index.js`
- 业务代码**不要**散落 `import '@earendil-works/...'`，改造时优先改 `coding-agent/src` 再在 monorepo 内构建。

## 构建

```bash
# 在 packages/pi 安装 monorepo 依赖（仅需一次或升级后）
cd packages/pi && npm install

# 完整构建（需 Node >= 22.19，pi-ai 会拉 models.dev 等生成目录）
npm run build

# 若仅改了 coding-agent/agent，可缩短为：
cd packages/tui && npm run build && cd ../ai && npm run build && cd ../agent && npm run build && cd ../coding-agent && npm run build
```

首次纳入时若全量构建失败，可用根目录脚本将已验证的 dist 同步进来：

```bash
npm run runtime:seed-dist
```

## 建议改造顺序（自适应化）

1. **品牌与配置目录**：`.pi` → 与 TaskWeaver `taskweaver/` 数据目录对齐（`agentDir` 已由 Electron 传入，可改默认 config 名与文档字符串）。
2. **桌面专用 SDK 面**：在 `coding-agent/src/core/sdk.ts` 收敛 TaskWeaver 需要的 export，CLI/TUI 路径可标记为 non-desktop。
3. **权限与工具**：与 `electron/extensions/taskweaver-permissions.ts` 的 extension 事件契约保持一致。
4. **模型目录**：与 `electron/backend/model-service.mjs`、`pricing/registry.json` 合并策略文档化（可改 `ModelRuntime` 刷新逻辑）。
5. **论文表述**：执行层为「基于开源 MIT 源码纳入并二次开发」，编排与路由为自有实现。

## 许可

上游 MIT，见仓库根 `LICENSE` / `vendor/runtime/THIRD_PARTY_NOTICES.md`。改造后分发须保留版权声明。
