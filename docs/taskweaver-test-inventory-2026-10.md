# TaskWeaver 测试入口与覆盖清单（CA-20）

> 更新：2026-10-13。按当前根 `package.json`、`.github/workflows/`、脚本导入关系清点；它记录入口，不替代测试结果或运行环境验收。

本清单覆盖 **173 个 `scripts/test-*.mjs`** 与 **8 个 `tests/*.test.mjs`**，合计 **181 个 Node 测试文件**。`packages/runtime` 与 `packages/provider-bridge` 的 Vitest 文件由各自 workspace 配置和 DSH workflow shard 覆盖，未计入这 181 个根测试文件。

## 责任域与门禁口径

- **PR/默认 CI**：通过 `test:all` 递归接入，包含 `check:ipc`、静态安全门禁与根集成测试 glob。
- **CI 专项**：依赖已构建 Host/runtime、Vitest shard、macOS UI 或打包 `.app` 的作业单独运行；不要把耗时或环境相关检查重复塞回 `test:all`。
- **专项/按需**：保留稳定的领域入口，只在该领域改动时运行。
- **人工诊断**：需要本机 profile/Host 或测量性能，不声称是自动化 pass/fail。
- 被其他测试 import 的脚本由表中的上游入口运行，不单独重复安排。

## 逐文件入口

| 测试文件 | 责任入口 | 分类 | 纳入 / 排除理由 |
|---|---|---|---|
| `scripts/diagnose/test-hub-coalesce.mjs` | `diagnose:hub-coalesce` | 人工诊断 | 需本机 Host/runtime 或用于测量；显式运行，不当作稳定通过门禁。 |
| `scripts/pricing/test-deepseek-adapter.mjs` | `test:pricing` | PR/默认 CI | 由 `test:all` 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-agent-preset-composition.mjs` | `test:preset-integrity` | CI 专项 | 由独立 workflow/发行作业运行，保留环境或构建边界。 |
| `scripts/test-app-preferences.mjs` | `test:unit-extra` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-app-server-self-test.mjs` | `test:p19` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-appearance-theme.mjs` | `test:appearance` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-approval-audit.mjs` | `test:approval-audit` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-assemble-compose-user-prompt.mjs` | `test:prompt-pipeline` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-assistant-text-presentation.mjs` | `test:unit-extra` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-backend-persistence.mjs` | `test:backend` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-bootstrap.mjs` | `test:startup` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-bridge-model-availability.mjs` | `test:models` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-bridge-token-reuse.mjs` | `test:unit-extra` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-bridge-tsx-loader.mjs` | `test:z-runtime-resolution` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-bundled-bridge-export.mjs` | `test:models` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-capability-tiers.mjs` | `test:models` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-chat-model-resolver.mjs` | `test:chat-route` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-chat-turn-persistence.mjs` | `test:usage` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-coalesce-content-blocks.mjs` | `test:coalesce` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-code-execution-result-card-source.mjs` | `test:dsh-chat` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-code-output-attachment.mjs` | `test:dsh-chat` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-compaction-reply.mjs` | `test:usage` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-context-compaction-policy.mjs` | `test:usage` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-context-compactor.mjs` | `test:unit-extra` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-conversation-run-lifecycle.mjs` | `test:unit-extra` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-conversation-shadow-compare.mjs` | `test:dsh-chat` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-conversation-single-writer.mjs` | `test:single-writer` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-credential-store.mjs` | `test:credentials` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-cross-provider-review.mjs` | `test:orchestration` | PR/默认 CI（导入） | 作为上游专项的导入子测试执行，避免再次单列造成重复。 |
| `scripts/test-cursor-tool-guidance.mjs` | `test:unit-extra` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-custom-provider.mjs` | `test:custom-provider` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-dag-acceptance.mjs` | `test:orchestration` | PR/默认 CI（导入） | 作为上游专项的导入子测试执行，避免再次单列造成重复。 |
| `scripts/test-dag-budget.mjs` | `test:orchestration` | PR/默认 CI（导入） | 作为上游专项的导入子测试执行，避免再次单列造成重复。 |
| `scripts/test-dag-plan-approval.mjs` | `test:orchestration` | PR/默认 CI（导入） | 作为上游专项的导入子测试执行，避免再次单列造成重复。 |
| `scripts/test-dag-run-replay.mjs` | `test:orchestration` | PR/默认 CI（导入） | 作为上游专项的导入子测试执行，避免再次单列造成重复。 |
| `scripts/test-dag-scheduler.mjs` | `test:dag-scheduler` | PR/默认 CI（导入） | 作为上游专项的导入子测试执行，避免再次单列造成重复。 |
| `scripts/test-dag-writer-retry-safety.mjs` | `test:orchestration` | PR/默认 CI（导入） | 作为上游专项的导入子测试执行，避免再次单列造成重复。 |
| `scripts/test-degradation-matrix.mjs` | `test:degradation` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-dsh-chat-service.mjs` | `test:dsh-chat` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-dsh-conversation-runtime.mjs` | `test:dsh-chat` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-dsh-permission-map.mjs` | `test:dsh-permission-map` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-dsh-session-lifecycle.mjs` | `test:dsh-lifecycle` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-dsh-snapshot-serialize.mjs` | `test:unit-extra` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-dsh-tool-call-tree.mjs` | `test:unit-extra` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-dsh-tool-call-ui-state.mjs` | `test:dsh-chat` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-dsh-transcript-messages.mjs` | `test:dsh-chat` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-dsh-transcript-serialize.mjs` | `test:unit-extra` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-env-service.mjs` | `test:env` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-eval-prompts.mjs` | `test:prompt-eval` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-fs-sandbox-fence.mjs` | `test:fs-sandbox` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-git-checkpoints.mjs` | `test:git-checkpoints` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-github-mcp-ipc.mjs` | `test:mcp` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-github-mcp-oauth.mjs` | `test:mcp` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-github-pull-requests.mjs` | `test:github-pull-requests` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-headless-cli.mjs` | `test:headless-doc` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-host-events.mjs` | `test:startup` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-host-hot-apply.mjs` | `test:unit-extra` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-host-lifecycle.mjs` | `test:startup` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-host-node-executable.mjs` | `test:z-runtime-resolution` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-host-plan-todo-projection.mjs` | `test:unit-extra` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-ipc-contract.mjs` | `check:ipc` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-json-store-concurrency.mjs` | `test:usage` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-keychain-secrets.mjs` | `test:p19` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-launchd-scheduler.mjs` | `test:launchd-scheduler` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-legacy-secrets.mjs` | `test:p19` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-lifecycle-smoke-diagnostics.mjs` | `test:unit-extra` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-local-agent-registry.mjs` | `test:models` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-macos-bundle-layout.mjs` | `test:p19` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-mcp-marketplace.mjs` | `test:mcp-marketplace` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-mcp-service.mjs` | `test:mcp` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-memory-store.mjs` | `test:memory` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-migrate-opencodex-routes.mjs` | `test:models` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-model-catalog-cache.mjs` | `test:models` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-model-directory-invalidation.mjs` | `test:models` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-model-directory-lifecycle.mjs` | `test:models` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-model-live-discovery-ui.mjs` | `test:models` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-model-live-discovery.mjs` | `test:models` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-model-override-registration.mjs` | `test:models` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-model-registry-mapping.mjs` | `test:model-registry` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-model-registry-updater.mjs` | `test:model-registry` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-model-service-cache.mjs` | `test:models` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-model-service.mjs` | `test:models` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-model-sync-background-scan.mjs` | `test:models` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-model-sync-hot-apply.mjs` | `test:models` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-native-chat-command.mjs` | `test:z-host-deploy` | CI 专项 | 由独立 workflow/发行作业运行，保留环境或构建边界。 |
| `scripts/test-opencodex-packaging.mjs` | `test:opencodex-packaging` | CI 专项 | 由独立 workflow/发行作业运行，保留环境或构建边界。 |
| `scripts/test-opencodex-reasoning-overlay.mjs` | `test:opencodex-overlay` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-opencodex-taskweaver-distribution.mjs` | `test:taskweaver-bridge` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-orchestration-p11.mjs` | `test:orchestration` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-orchestration.mjs` | `test:orchestration` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-p6-ipc-wiring.mjs` | `test:worktree-diff` | PR/默认 CI（导入） | 作为上游专项的导入子测试执行，避免再次单列造成重复。 |
| `scripts/test-packaged-app-launch.mjs` | `test:packaged-app-launch` | CI 专项 | 由独立 workflow/发行作业运行，保留环境或构建边界。 |
| `scripts/test-packaged-runtime-layout.mjs` | `test:packaged-runtime-layout` | CI 专项 | 由独立 workflow/发行作业运行，保留环境或构建边界。 |
| `scripts/test-permission-prompt-bridge.mjs` | `test:permissions` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-permission-rules.mjs` | `test:permission-rules` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-permissions.mjs` | `test:permissions` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-planner-hints.mjs` | `test:orchestration` | PR/默认 CI（导入） | 作为上游专项的导入子测试执行，避免再次单列造成重复。 |
| `scripts/test-planner-retries.mjs` | `test:orchestration` | PR/默认 CI（导入） | 作为上游专项的导入子测试执行，避免再次单列造成重复。 |
| `scripts/test-planner-route.mjs` | `test:orchestration` | PR/默认 CI（导入） | 作为上游专项的导入子测试执行，避免再次单列造成重复。 |
| `scripts/test-prepare-runtime-cwd.mjs` | `test:runtime-deploy` | CI 专项 | 由独立 workflow/发行作业运行，保留环境或构建边界。 |
| `scripts/test-price-registry.mjs` | `test:pricing` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-probe-models.mjs` | `test:custom-provider` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-projection-stream.mjs` | `test:dsh-chat` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-prompt-pipeline.mjs` | `test:prompt-pipeline` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-provider-bridge-cursor.mjs` | `test:unit-extra` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-provider-bridge-p12.mjs` | `test:unit-extra` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-provider-bridge-transport.mjs` | `test:unit-extra` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-reasoning-effort-catalog.mjs` | `test:unit-extra` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-repo-map-service.mjs` | `test:unit-extra` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-routing-portfolio.mjs` | `test:portfolio` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-run-parity-bench.mjs` | `test:parity-bench` | CI 专项 | 由独立 workflow/发行作业运行，保留环境或构建边界。 |
| `scripts/test-sandbox-escalation.mjs` | `test:sandbox-escalation` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-sandbox-policy.mjs` | `test:sandbox-policy` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-sandbox-service.mjs` | `test:sandbox` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-scheduled-jobs-store.mjs` | `test:scheduled-jobs` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-security-path.mjs` | `test:security-path` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-session-model-matches.mjs` | `test:unit-extra` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-session-stats.mjs` | `test:usage` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-session-transcript-search.mjs` | `test:session-transcript` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-session-usage.mjs` | `test:usage` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-shell-entry.mjs` | `test:shell-entry` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-shell-http-guard.mjs` | `test:shell-http-guard` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-shell-ui-static-serving.mjs` | `test:shell-entry` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-shell-webcontents-lifecycle.mjs` | `test:shell-entry` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-skill-service.mjs` | `test:skills` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-startup-report.mjs` | `test:unit-extra` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-stdio-rpc.mjs` | `test:stdio-rpc` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-stream-buffer.mjs` | `test:unit-extra` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-stream-render-stability.mjs` | `test:unit-extra` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-symbol-outline-extractor.mjs` | `test:unit-extra` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-task-profile.mjs` | `test:task-profile` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-taskweaver-api-only-host.mjs` | `test:runtime-deploy` | CI 专项 | 由独立 workflow/发行作业运行，保留环境或构建边界。 |
| `scripts/test-taskweaver-bare-module-base.mjs` | `test:runtime-deploy` | CI 专项 | 由独立 workflow/发行作业运行，保留环境或构建边界。 |
| `scripts/test-taskweaver-bridge-catalog.mjs` | `test:taskweaver-bridge` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-taskweaver-bridge-models.mjs` | `test:taskweaver-bridge` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-taskweaver-bridge-sync-e2e.mjs` | `test:runtime-deploy` | CI 专项 | 由独立 workflow/发行作业运行，保留环境或构建边界。 |
| `scripts/test-taskweaver-compaction-target.mjs` | `test:taskweaver-bridge` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-taskweaver-hooks.mjs` | `test:hooks` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-taskweaver-models-defaults.mjs` | `test:models` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-taskweaver-pi-lite-preset.mjs` | `test:user-intent` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-terminal-output-throttle.mjs` | `test:terminal` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-terminal-service.mjs` | `test:terminal` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-thread-store-concurrency.mjs` | `test:threads` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-threads-archive-search.mjs` | `test:threads` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-tool-output-reader.mjs` | `test:unit-extra` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-tool-output-store.mjs` | `test:tool-trace` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-tool-trace.mjs` | `test:tool-trace` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-transcript-display-policy.mjs` | `test:transcript-policy` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-turn-activity.mjs` | `test:unit-extra` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-ui-verify-fixture.mjs` | `test:ui` | CI 专项 | 由独立 workflow/发行作业运行，保留环境或构建边界。 |
| `scripts/test-usage-and-thinking.mjs` | `test:usage` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-usage-ledger.mjs` | `test:usage` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-use-model-catalog.mjs` | `test:models` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-user-intent.mjs` | `test:user-intent` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-verification-policy.mjs` | `test:verification` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-web-search-service.mjs` | `test:web-search` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-workspace-context.mjs` | `test:workspace-context` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-workspace-diff-revert-ipc.mjs` | `test:tool-trace` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-workspace-operation-guard.mjs` | `test:unit-extra` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-workspace-rules.mjs` | `test:workspace-rules` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-workspace-trust.mjs` | `test:workspace-trust` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-worktree-diff.mjs` | `test:worktree-diff` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-z-command-lifecycle.mjs` | `test:z-host-deploy` | CI 专项 | 由独立 workflow/发行作业运行，保留环境或构建边界。 |
| `scripts/test-z-failed-turn-lifecycle.mjs` | `test:z-host-deploy` | CI 专项 | 由独立 workflow/发行作业运行，保留环境或构建边界。 |
| `scripts/test-z-home-migration.mjs` | `test:z-home-migration` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-z-host-deploy.mjs` | `test:z-host-deploy` | CI 专项 | 由独立 workflow/发行作业运行，保留环境或构建边界。 |
| `scripts/test-z-host.mjs` | `test:z-host` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-z-mux-recovery.mjs` | `test:z-recovery` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-z-queue-lifecycle.mjs` | `test:z-host-deploy` | CI 专项 | 由独立 workflow/发行作业运行，保留环境或构建边界。 |
| `scripts/test-z-recovery-history.mjs` | `test:z-recovery` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `scripts/test-z-runtime-build-atomic.mjs` | `test:z-runtime-build-atomic` | CI 专项 | 由独立 workflow/发行作业运行，保留环境或构建边界。 |
| `scripts/test-z-runtime-preset-integrity.mjs` | `test:preset-integrity` | CI 专项 | 由独立 workflow/发行作业运行，保留环境或构建边界。 |
| `scripts/test-z-runtime-resolution.mjs` | `test:z-runtime-resolution` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `tests/chat-document-attachments.test.mjs` | `test:integration` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `tests/chat-image-attachments.test.mjs` | `test:integration` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `tests/conversation-id-routing.test.mjs` | `test:integration` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `tests/dsh-reconnect.test.mjs` | `test:integration` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `tests/fork-thread-smoke.test.mjs` | `test:integration` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `tests/multi-session-parallel.test.mjs` | `test:integration` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `tests/permission-flow.test.mjs` | `test:integration` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |
| `tests/ui-accessibility-source.test.mjs` | `test:integration` | PR/默认 CI | 由 test:all 覆盖；可重复的 fixture / mock / 确定性回归。 |

## 清点结论与待运行门槛

- 当前没有无入口的根测试脚本；`test-probe-models.mjs` 接入 `test:custom-provider`，`diagnose/test-hub-coalesce.mjs` 明确留作手动诊断入口。
- `backend/application-menu.cjs` 与唯一测试 `scripts/test-application-menu.mjs` 已删除：仓库内没有对应的 Swift 菜单装配/调用入口。
- test:all 不再额外重复 `check:ipc`、`test:security-hardening`、`test:script-targets`、DSH API proxy shard、fork smoke 或 hooks；它们分别由默认入口内部、workspace shard、测试集成 glob 或 runtime suite 覆盖。
- `test:integration` 使用 `node --test tests/*.test.mjs`，因此 README 已改为现存 8 个文件与真实命令；缺失的 permissions 专用 package script 不再出现在文档中。
- `.github/workflows/ci.yml` 与 nightly 工作流已去掉重复执行的等价步骤；`test:all` 新增 headless/startup/bridge 覆盖，app smoke 对应的 Bun/layout 检查由 macOS 打包作业承担。
- 本次本机运行了定向新接线测试；没有运行 GitHub Actions，也没有重建 `.app`。这些运行门槛仍待 CI/macOS 构建环境确认。
