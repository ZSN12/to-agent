# Z 运行时收尾计划：删除 dsh-source，全面去 DSH 化

> 承接 `docs/完整改造.md` 和 `docs/完整改造-执行进度.md`。
> 回退点：分支 `refactor/z-runtime-integration`，提交 `5d24dba`（checkpoint）。

## 0. 现状（已核实）

| 项 | 结论 |
|---|---|
| `vendor/z-runtime` | 7943 个受控文件，包名已是 `@z/*`，可构建、可装机 |
| `dsh-source` | 7980 个受控文件，192M。另有 `.github` 和 lefthook 两套仓库配置 |
| 两者差异 | 把 `@deepseek-ai/` 替换成 `@z/` 后比对：**z-runtime 是超集**。dsh-source 独有的只有 `CLAUDE.md`、`.github/`、`install-lefthook.mjs`，都是提取时故意删的。源码没有漏改 |
| z-runtime 多出的改动 | `tsconfig.{host,client}.taskweaver.json`、`fixture.ts` authorization 桩、apiproxy tsconfig 引用 |
| 仍是"双轨" | `TASKWEAVER_USE_Z_RUNTIME` 开关、`resolveDsh*`/`resolveZ*` 两套解析函数、`z-host` 只是转发到 `dsh-host` 的壳 |
| 仍叫 DSH 的地方 | 233 个包名 `@z/dsh-*`、CLI 命令 `dsh web`、运行时 `DSH_*` 环境变量（仅 `DSH_HOME` 就 212 处）、TaskWeaver 侧 103 个文件 |

结论：dsh-source 可以安全删除。去 DSH 命名是一次独立的大改，分层推进。

---

## 阶段 A：删除 dsh-source（低风险，约半天）

依赖 dsh-source 的地方，要逐个改掉：

| 文件 | 改法 |
|---|---|
| `scripts/build-dsh-runtime.mjs:20,28-31,228` | 删 `legacyDshSource` 和 `TASKWEAVER_USE_Z_RUNTIME` 分支，源固定为 `vendor/z-runtime` |
| `scripts/make-mac-app.sh:9-21` | 删回退逻辑。z-runtime 没构建时直接报错，提示运行 `npm run build:z-runtime` |
| `scripts/update-runtime-lock.mjs:39` | 路径改成 `vendor/z-runtime/packages/llm/llm-pi-ai/package.json` |
| `scripts/sync-dsh-windows-acl.mjs:12` | 默认源改成 `vendor/z-runtime/packages/sandbox/sandbox-windows-acl` |
| `scripts/diagnose-dsh-host.mjs:3,17` | 改用 `resolveZRuntimeRoot` |
| `package.json` `test:dsh-apiproxy` | `cd vendor/z-runtime && ...` |
| `electron/agent/dsh-host/resolve-runtime.mjs:~162` | 删 `monorepoFallbackSubpath: 'dsh-source'` |

完成后：

```bash
git rm -r dsh-source
npm run build:z-runtime
npm run test:dsh-runtime-resolution && node scripts/test-dsh-host.mjs && node scripts/test-model-service.mjs
npm run install:app          # 然后验证 /Applications/TaskWeaver.app 内是 runtime-packages/@z/*
```

提交：`chore: 移除 dsh-source，vendor/z-runtime 成为唯一运行时源`

## 阶段 B：合并双轨代码（低风险，约半天）

1. `resolve-runtime.mjs`：删 `useZRuntime`、`deployedRuntimeHasZPackages`、`resolveDshRuntimeRoot`、`resolveDshHostLaunch`、`resolveDshRuntimeNodePath`，只留一套 `resolveRuntimeRoot / resolveHostLaunch / resolveRuntimeNodePath`
2. 把 `electron/agent/dsh-host/*` 整体移到 `electron/agent/z-host/`，删除转发壳。更新 `main.cjs`、`register-ipc.mjs`、`model-service.mjs` 等的 import
3. `scripts/build-dsh-runtime.mjs` 改名为 `build-z-runtime.mjs`（合并现有 wrapper），同步 `package.json` scripts
4. `test-dsh-runtime-resolution.mjs` 删掉 legacy 用例，只测 Z 路径

提交：`refactor: 运行时解析单一路径，dsh-host → z-host`

## 阶段 C：全面去 DSH 命名（高风险，分 4 步，每步单独提交并验证）

### C1 TaskWeaver 侧（风险：低）
- 目录和文件名：`vendor/taskweaver-dsh-runtime` → `vendor/taskweaver-z-runtime`，Resources 下同名，`electron-builder.yml` 同步
- 常量名和函数名：`createDshHostManager` → `createZHostManager`，`dsh-api-client.mjs` → `z-api-client.mjs`，`test-dsh-*.mjs` → `test-z-*.mjs`
- TaskWeaver 自己的环境变量：`TASKWEAVER_DSH_RUNTIME*` → `TASKWEAVER_Z_RUNTIME*`，`DSH_MAX_RECONNECT_*` 等 TaskWeaver 前端/后端常量改成 `Z_*`
- IPC 通道名和前端 `src/` 里的 `dsh` 标识

### C2 包名 `@z/dsh-*` → `@z/*`（风险：中）
- 扩展 `extract-and-rename-z-runtime.mjs`，或新写一个 `rename-z-packages.mjs`：批量改 233 个 package.json 的 `name`，以及所有 import、`tsconfig` paths、`tsdown.client.ts` 里的 `INLINE_SAFE` 正则、`cordis.patch.yml`、`knip.json`
- 注意重名冲突：先生成新旧名映射表，检查 `@z/xxx` 有没有撞名
- 重新 `pnpm install` 生成 lockfile，全量 `build:lib:host` / `build:lib:client`
- TaskWeaver 侧 `@z/dsh-client-connection` 的引用同步改

### C3 CLI 命令与运行时环境变量（风险：高）
- `dsh` bin → `z`（`apps/cli/package.json` 的 `bin`，spawn 参数 `web --no-open --port 0` 不变）
- 运行时 `DSH_*` → `Z_*`：`DSH_HOME`、`DSH_TELEMETRY_DISABLED`、`DSH_TASKWEAVER_EMBEDDED`、`DSH_SESSION_ID`、`DSH_PERMISSION_MODE` 等
- 集中改 `DSH_ENV_PREFIX`（已存在的前缀常量，17 处），避免逐个字符串替换
- 过渡期兼容：读取时先读 `Z_*`，没有再回退 `DSH_*`，保留一个版本后删除
- **数据目录迁移**：先确认 `DSH_HOME` 的默认路径。如果改名，要在首次启动时把旧目录迁移或软链到新目录，否则用户已有的会话、模型配置、凭证会"消失"

### C4 品牌与提示词文本（风险：中，影响模型行为和测试）
- 系统提示词里的 "DSH file policy"、"DSH file sandbox" 等 → "Z"
- `@z/dsh-brand` 包里的品牌字符串、Web UI 标题
- 以上会让 `examples/acp-agent/tests/snapshots/**` 和 `apps/web/tests/snapshots/**` 全部失效，需要重新生成快照
- 附带修复：`.jsonl` 快照里残留的 `@deepseek-ai/dsh-system-prompt`（提取脚本没处理 jsonl），以及 `knip.json`、`typert` fixtures、`scripts/snapshots/*` 中剩余的 `@deepseek-ai/`

## 验证清单（每个阶段结束都跑）

- [ ] `npm run build:z-runtime` 成功
- [ ] `test-dsh-runtime-resolution` / `test-dsh-host` / `test-model-service`（阶段 C1 后改名为 `test-z-*`）
- [ ] `vendor/z-runtime` 内：`build:lib:host`、`build:lib:client`、相关 vitest
- [ ] `npm run install:app`，启动后：模型列表加载（`llm-pi-ai` namespace 就绪）、发一条消息、工具调用审批
- [ ] 全仓 `grep -rI 'dsh-source\|@deepseek-ai'` 结果为 0（阶段 A、C2 后）
- [ ] 阶段 C3 后：旧 `DSH_HOME` 下的数据在新版本中仍可见

## 风险与回退

- 每个阶段一个提交，出问题 `git revert` 对应提交即可。`5d24dba` 是总回退点
- 阶段 A 之后就不能再从上游 DSH 合并更新了。这是有意的取舍：以后 Z 独立演进
- C3 是唯一会影响用户数据的步骤，必须先做迁移逻辑，再改默认路径
- `vendor/z-runtime` 本地有 1.5G（主要是 node_modules 和 lib），不入库；受控文件只有源码

## 需要你拍板的点

1. 阶段 C 做到哪一层？建议 C1、C2 必做（答辩时代码里看不到 DSH），C3、C4 视时间而定
2. CLI 命令叫 `z` 还是别的名字（例如 `zhost`）？单字母命令容易和系统工具冲突
3. `DSH_*` 兼容回退要保留多久，还是直接一刀切（毕设场景下没有存量用户，可以一刀切，只迁移你本机的数据）
