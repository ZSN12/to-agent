# sdk 包族

<a id="family-sdk"></a>
[返回 TaskWeaver Runtime 包族目录](../README.zh.md#runtime-family-index)

## 职责与边界

提供跨进程驱动 Harness Runtime 的 JSON-RPC 协议、TypeScript 客户端和服务端插件。

本页汇总当前目录下的包清单，并集中保存原逐包文档中的 API、扩展点、错误语义和限制。包名、包目录和导出面保持原样。

## 包清单

当前目录没有 workspace package；保留的族级说明仍收录在本页，供后续增量维护时参考。

## API、扩展点与限制

以下内容从原逐包 README 和族级 README 迁入。为了保留接口名、代码片段、错误文本与约束语义，技术细节按原文保存；本页前半部分提供中文目录和边界说明。

<a id="family-sdk"></a>
### 原族级说明（迁移保留）

<a id="family-sdk--sdk-drive-harness-runtimes-from-another-process"></a>
This group contains the protocol stack for driving a Harness runtime from another process. Callers supply the runtime executable and its `cordis.yml`; this group does not create, configure, build, or launch developer projects. The [TypeScript SDK decision]（原文链接目标：`../../.agents/notes/implemented/feature/2026-07-27-typescript-sdk-and-sdk-subagent-backend.md`） owns the client contract, and the [toolchain removal]（原文链接目标：`../../.agents/notes/implemented/simplification/2026-08-11-remove-sdk-project-toolchain.md`） owns the product boundary.

| Package | Role |
|---|---|
| [`protocol/`]（原文链接目标：`protocol/README.md`） | Defines the SDK runtime wire protocol |
| [`client/`]（原文链接目标：`client/README.md`） | Drives a Harness runtime through the TypeScript client API |
| [`server/`]（原文链接目标：`server/README.md`） | Serves out-of-process SDK clients over stdio JSON-RPC |
