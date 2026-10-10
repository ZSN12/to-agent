# examples 包族

<a id="family-examples"></a>
[返回 TaskWeaver Runtime 包族目录](../README.zh.md#runtime-family-index)

## 职责与边界

提供可运行的插件组合示例和对应启动程序。

本页汇总当前目录下的包清单，并集中保存原逐包文档中的 API、扩展点、错误语义和限制。包名、包目录和导出面保持原样。

## 包清单

当前目录没有 workspace package；保留的族级说明仍收录在本页，供后续增量维护时参考。

## API、扩展点与限制

以下内容从原逐包 README 和族级 README 迁入。为了保留接口名、代码片段、错误文本与约束语义，技术细节按原文保存；本页前半部分提供中文目录和边界说明。

<a id="family-examples"></a>
### 原族级说明（迁移保留）

<a id="family-examples--examples-ready-to-run-demo-bundles"></a>
Pre-composed plugin bundles a thin leaf `cordis.yml` loads instead of assembling the spine and an entry point by hand. These are **demo / reference** packages — the `-demo` npm suffix marks each one as non-product surface, readable straight off the package name. The runnable leaves under the repo-root [`examples/`]（原文链接目标：`../../examples/AGENTS.md`） and the [Python SDK runtime]（原文链接目标：`../../python/sdk-runtime/README.md`） are the consumers; each is just its swappable backends plus one bundle entry.

| Package | npm name | Role |
|---|---|---|
| [`agent-spine-demo/`]（原文链接目标：`agent-spine-demo/README.md`） | `@taskweaver/dsh-agent-spine-demo` | Reusable agent-spine bundle |
| [`acp-demo/`]（原文链接目标：`acp-demo/README.md`） | `@taskweaver/dsh-acp-demo` | ACP automation application bundle |
| [`jsonrpc-demo/`]（原文链接目标：`jsonrpc-demo/README.md`） | `@taskweaver/dsh-sdk-jsonrpc-demo` | External-config JSON-RPC runtime |

`agent-spine-demo` is the shared bundle; `acp-demo` adds its automation entry point, while `jsonrpc-demo` boots a deployment-owned plugin tree. Product one-shot execution belongs to `dsh --profile headless`; no package in this directory provides it.

These packages are not product API. Product seams and entry points remain in their owning groups; demo bundles select concrete compositions.

Do not confuse this group with the repo-root [`examples/`]（原文链接目标：`../../examples/AGENTS.md`）: that directory holds the runnable `cordis.yml` **leaves**; this group holds the **bundles** those leaves load.
