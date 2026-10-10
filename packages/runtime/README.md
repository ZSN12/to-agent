# TaskWeaver Runtime Packages

English | [中文包族目录](README.zh.md)

中文入口：[按包族查阅接口、扩展点和限制说明](README.zh.md#runtime-family-index)。

Runtime packages live under `packages/runtime/<family>/<package>`. Package names and paths remain unchanged; each family document collects the package contracts and migration details.

## Package families

| Family | Packages | Documentation |
|---|---:|---|
| `acp` | 0 | [中文说明](./acp/README.zh.md#family-acp) |
| `api` | 2 | [中文说明](./api/README.zh.md#family-api) |
| `attachment` | 2 | [中文说明](./attachment/README.zh.md#family-attachment) |
| `boot` | 2 | [中文说明](./boot/README.zh.md#family-boot) |
| `bridge` | 1 | [中文说明](./bridge/README.zh.md#family-bridge) |
| `bundle` | 2 | [中文说明](./bundle/README.zh.md#family-bundle) |
| `client` | 2 | [中文说明](./client/README.zh.md#family-client) |
| `code-runtime` | 3 | [中文说明](./code-runtime/README.zh.md#family-code-runtime) |
| `compaction` | 4 | [中文说明](./compaction/README.zh.md#family-compaction) |
| `context` | 4 | [中文说明](./context/README.zh.md#family-context) |
| `cordis` | 8 | [中文说明](./cordis/README.zh.md#family-cordis) |
| `core` | 8 | [中文说明](./core/README.zh.md#family-core) |
| `credentials` | 3 | [中文说明](./credentials/README.zh.md#family-credentials) |
| `e2b` | 0 | [中文说明](./e2b/README.zh.md#family-e2b) |
| `examples` | 0 | [中文说明](./examples/README.zh.md#family-examples) |
| `experimental` | 0 | [中文说明](./experimental/README.zh.md#family-experimental) |
| `extensions` | 1 | [中文说明](./extensions/README.zh.md#family-extensions) |
| `fs` | 9 | [中文说明](./fs/README.zh.md#family-fs) |
| `goal` | 4 | [中文说明](./goal/README.zh.md#family-goal) |
| `guard` | 2 | [中文说明](./guard/README.zh.md#family-guard) |
| `hooks` | 0 | [中文说明](./hooks/README.zh.md#family-hooks) |
| `host` | 6 | [中文说明](./host/README.zh.md#family-host) |
| `host-cli` | 1 | [中文说明](./host-cli/README.zh.md#family-host-cli) |
| `interaction` | 7 | [中文说明](./interaction/README.zh.md#family-interaction) |
| `jobs` | 3 | [中文说明](./jobs/README.zh.md#family-jobs) |
| `llm` | 5 | [中文说明](./llm/README.zh.md#family-llm) |
| `lsp` | 3 | [中文说明](./lsp/README.zh.md#family-lsp) |
| `mcp` | 1 | [中文说明](./mcp/README.zh.md#family-mcp) |
| `plan` | 1 | [中文说明](./plan/README.zh.md#family-plan) |
| `preset` | 2 | [中文说明](./preset/README.zh.md#family-preset) |
| `runtime-diagnostics` | 1 | [中文说明](./runtime-diagnostics/README.zh.md#family-runtime-diagnostics) |
| `sandbox` | 4 | [中文说明](./sandbox/README.zh.md#family-sandbox) |
| `schedule` | 0 | [中文说明](./schedule/README.zh.md#family-schedule) |
| `sdk` | 0 | [中文说明](./sdk/README.zh.md#family-sdk) |
| `session` | 10 | [中文说明](./session/README.zh.md#family-session) |
| `session-query` | 4 | [中文说明](./session-query/README.zh.md#family-session-query) |
| `settings` | 2 | [中文说明](./settings/README.zh.md#family-settings) |
| `shell` | 8 | [中文说明](./shell/README.zh.md#family-shell) |
| `skill` | 3 | [中文说明](./skill/README.zh.md#family-skill) |
| `spill` | 3 | [中文说明](./spill/README.zh.md#family-spill) |
| `storage` | 3 | [中文说明](./storage/README.zh.md#family-storage) |
| `subagent` | 7 | [中文说明](./subagent/README.zh.md#family-subagent) |
| `subprocess` | 2 | [中文说明](./subprocess/README.zh.md#family-subprocess) |
| `terminal` | 0 | [中文说明](./terminal/README.zh.md#family-terminal) |
| `test-support` | 3 | [中文说明](./test-support/README.zh.md#family-test-support) |
| `todo` | 1 | [中文说明](./todo/README.zh.md#family-todo) |
| `typert` | 4 | [中文说明](./typert/README.zh.md#family-typert) |
| `util` | 7 | [中文说明](./util/README.zh.md#family-util) |
| `web` | 5 | [中文说明](./web/README.zh.md#family-web) |
| `workflow` | 4 | [中文说明](./workflow/README.zh.md#family-workflow) |
| `workspace` | 1 | [中文说明](./workspace/README.zh.md#family-workspace) |

## Composition and documentation gate

Cordis plugins compose through services and lifecycle hooks. Consumers should depend on service definitions and contracts; concrete providers remain replaceable through the family composition.

Each package README is a one-sentence route to its family document. Family pages preserve the former package-level API, extension-point, error, and limitation text. Run `node scripts/check-runtime-package-docs.mjs` to verify package coverage and local documentation links.
