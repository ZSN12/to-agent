# TaskWeaver Runtime 包族目录

[English](README.md)

<a id="runtime-family-index"></a>
## 包族索引

运行时工作区位于 `packages/runtime/<包族>/<包>`。本目录不改包名或目录；逐包 README 现在只负责跳转，API、扩展点、错误语义和限制集中记录在包族中文文档中。

| 包族 | workspace 包数 | 中文文档 |
|---|---:|---|
| `acp` | 0 | [打开包族文档](./acp/README.zh.md#family-acp) |
| `api` | 2 | [打开包族文档](./api/README.zh.md#family-api) |
| `attachment` | 2 | [打开包族文档](./attachment/README.zh.md#family-attachment) |
| `boot` | 2 | [打开包族文档](./boot/README.zh.md#family-boot) |
| `bridge` | 1 | [打开包族文档](./bridge/README.zh.md#family-bridge) |
| `bundle` | 2 | [打开包族文档](./bundle/README.zh.md#family-bundle) |
| `client` | 2 | [打开包族文档](./client/README.zh.md#family-client) |
| `code-runtime` | 3 | [打开包族文档](./code-runtime/README.zh.md#family-code-runtime) |
| `compaction` | 4 | [打开包族文档](./compaction/README.zh.md#family-compaction) |
| `context` | 4 | [打开包族文档](./context/README.zh.md#family-context) |
| `cordis` | 8 | [打开包族文档](./cordis/README.zh.md#family-cordis) |
| `core` | 8 | [打开包族文档](./core/README.zh.md#family-core) |
| `credentials` | 3 | [打开包族文档](./credentials/README.zh.md#family-credentials) |
| `e2b` | 0 | [打开包族文档](./e2b/README.zh.md#family-e2b) |
| `examples` | 0 | [打开包族文档](./examples/README.zh.md#family-examples) |
| `experimental` | 0 | [打开包族文档](./experimental/README.zh.md#family-experimental) |
| `extensions` | 1 | [打开包族文档](./extensions/README.zh.md#family-extensions) |
| `fs` | 9 | [打开包族文档](./fs/README.zh.md#family-fs) |
| `goal` | 4 | [打开包族文档](./goal/README.zh.md#family-goal) |
| `guard` | 2 | [打开包族文档](./guard/README.zh.md#family-guard) |
| `hooks` | 0 | [打开包族文档](./hooks/README.zh.md#family-hooks) |
| `host` | 6 | [打开包族文档](./host/README.zh.md#family-host) |
| `host-cli` | 1 | [打开包族文档](./host-cli/README.zh.md#family-host-cli) |
| `interaction` | 7 | [打开包族文档](./interaction/README.zh.md#family-interaction) |
| `jobs` | 3 | [打开包族文档](./jobs/README.zh.md#family-jobs) |
| `llm` | 5 | [打开包族文档](./llm/README.zh.md#family-llm) |
| `lsp` | 3 | [打开包族文档](./lsp/README.zh.md#family-lsp) |
| `mcp` | 1 | [打开包族文档](./mcp/README.zh.md#family-mcp) |
| `plan` | 1 | [打开包族文档](./plan/README.zh.md#family-plan) |
| `preset` | 2 | [打开包族文档](./preset/README.zh.md#family-preset) |
| `runtime-diagnostics` | 1 | [打开包族文档](./runtime-diagnostics/README.zh.md#family-runtime-diagnostics) |
| `sandbox` | 4 | [打开包族文档](./sandbox/README.zh.md#family-sandbox) |
| `schedule` | 0 | [打开包族文档](./schedule/README.zh.md#family-schedule) |
| `sdk` | 0 | [打开包族文档](./sdk/README.zh.md#family-sdk) |
| `session` | 10 | [打开包族文档](./session/README.zh.md#family-session) |
| `session-query` | 4 | [打开包族文档](./session-query/README.zh.md#family-session-query) |
| `settings` | 2 | [打开包族文档](./settings/README.zh.md#family-settings) |
| `shell` | 8 | [打开包族文档](./shell/README.zh.md#family-shell) |
| `skill` | 3 | [打开包族文档](./skill/README.zh.md#family-skill) |
| `spill` | 3 | [打开包族文档](./spill/README.zh.md#family-spill) |
| `storage` | 3 | [打开包族文档](./storage/README.zh.md#family-storage) |
| `subagent` | 7 | [打开包族文档](./subagent/README.zh.md#family-subagent) |
| `subprocess` | 2 | [打开包族文档](./subprocess/README.zh.md#family-subprocess) |
| `terminal` | 0 | [打开包族文档](./terminal/README.zh.md#family-terminal) |
| `test-support` | 3 | [打开包族文档](./test-support/README.zh.md#family-test-support) |
| `todo` | 1 | [打开包族文档](./todo/README.zh.md#family-todo) |
| `typert` | 4 | [打开包族文档](./typert/README.zh.md#family-typert) |
| `util` | 7 | [打开包族文档](./util/README.zh.md#family-util) |
| `web` | 5 | [打开包族文档](./web/README.zh.md#family-web) |
| `workflow` | 4 | [打开包族文档](./workflow/README.zh.md#family-workflow) |
| `workspace` | 1 | [打开包族文档](./workspace/README.zh.md#family-workspace) |

## 组合原则

运行时通过 Cordis 服务、事件和 waterfall 扩展。Consumer 依赖稳定的服务定义与契约；具体 Provider 保持可替换。各包的原接口、扩展点和限制已迁入对应包族文档，迁移时保留技术原文，以避免改写错误文本或 API 名称。

每个包的 `README.md` 只保留一句跳转说明。运行 `node scripts/check-runtime-package-docs.mjs` 可静态检查包覆盖、跳转目标和本地文档链接。
