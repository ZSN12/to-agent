# 第三方开源声明

TaskWeaver 基于下列 MIT 许可项目进行改造。项目维护自己的代码与版本，不代表上游认可 TaskWeaver。各依赖的具体版本和完整传递依赖以根 `pnpm-lock.yaml`、对应 `package.json` 及随包许可证为准。

| 项目 | 来源 / 版本 | 许可 | 保留位置 |
| --- | --- | --- | --- |
| deepseek-harness | `deepseek-ai/deepseek-harness`，基线提交 `c6becee` | MIT | `packages/runtime/`；各包保留上游许可证与来源信息 |
| OpenCodex Cursor 适配器 | TaskWeaver 维护的 `@bitkyc08/opencodex@2.79.0` 派生代码及 OpenCodex contributors 的 MIT 工作 | MIT | `packages/provider-bridge/`；来源、裁剪范围与 TaskWeaver protobuf 补丁见该目录的 `NOTICE.md` |
| OpenCodex 保留代码 | TaskWeaver fork，基于 `@bitkyc08/opencodex@2.79.0` | MIT | `vendor/opencodex/`；保留的 CLI/登录兼容代码持续按总计划收敛 |
| Cordis 组件 | Shigma 及各独立组件的版权方 | MIT（以组件文件为准） | `packages/runtime/cordis/`；每个组件目录保留独立许可证 |

桌面应用自身的版权声明与 MIT 许可文本位于 [`LICENSE`](LICENSE)。`packages/provider-bridge/LICENSE`、`vendor/opencodex/LICENSE` 和 `packages/runtime/cordis/*/LICENSE` 保留派生源项目的许可文本。运行时及桌面端的其他第三方依赖按各自包的 `LICENSE`、`package.json` 与锁文件声明来源和许可；发布产物应随包提供相应许可证。

本项目对上述代码做了结构迁移、删减、改名和功能改造；论文及对外介绍应明确说明“基于 deepseek-harness 分支深度改造”。
