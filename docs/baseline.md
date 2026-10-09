# TaskWeaver 自有化基线

记录日期：2026-10-09  
基线代码引用：`pre-ownership`（`31b39360`）。本任务按用户要求继续在 `main` 上实施，没有切换到 `own/main`。  
注意：以下大小是当前工作区现存构建产物的文件系统测量值；产物不包含可核验的源码 revision 标记，因此它们是可复现的磁盘快照，不冒充由该 tag 干净构建的结果。

## 测试状态

- 既有记录列出的初始缺口：`test:stream-segments` 指向不存在的文件；`test:conversation-single-writer` 的预期与 IPC 写入点清单不一致。见 [`baseline-2026-10.md`](baseline-2026-10.md)。
- 后续优化记录称 2026-10-09 的 `npm run test:all` 通过，`test:stream-segments` 入口已移除，单写入者测试已修复。见 [`optimization-plan-progress.md`](optimization-plan-progress.md)。这些是此前记录的结果，本文件建立时未重新运行全量测试。
- 自有化阶段后续测试结果按阶段追加至 [`自有化总计划-执行进度.md`](自有化总计划-执行进度.md)。

## 磁盘基线快照

测量命令（在仓库根目录执行）：

```sh
du -sh release/mac-arm64/TaskWeaver.app
du -sh vendor/taskweaver-z-runtime/runtime-packages
find vendor/taskweaver-z-runtime/runtime-packages -mindepth 2 -maxdepth 2 -name package.json | wc -l
```

| 指标 | 2026-10-09 测量值 |
| --- | ---: |
| 已有 macOS arm64 app bundle | 791M |
| 已有 runtime-packages | 286M |
| runtime package manifests | 216 |
| Z Runtime 工作目录（含 node_modules 和构建产物） | 1.5G |

`vendor/taskweaver-z-runtime/runtime-packages` 是部署依赖包目录；`packages/runtime` 工作目录大小不能与部署包体积混为一谈。重新构建后，应以同一命令、同一机器、同一架构重新测量并记录变化。

## 启动性能基线

启动追踪和报告工具已实现：`scripts/tw-startup-probe.mjs`、`scripts/tw-startup-report.mjs`。当前尚无与 `pre-ownership` 代码版本绑定、可复核的完整启动样本；P12 阶段需在隔离 userData 的打包应用上采集冷启动和模型目录加载耗时，并记录 trace 文件及样本数。此项暂不标记为完成。

## 基线保护

- `pre-ownership` tag 保留早期代码快照。
- 打包 smoke 入口为 `node scripts/test-packaged-app-launch.mjs`；它使用临时 userData 和本地 mock provider，覆盖 Host 就绪、新建会话、模型回复、读取工作区文件和退出。当前工作区已有打包产物时可直接运行，无需先重建。
