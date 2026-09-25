# TaskWeaver 内置 Agent 运行时（编译快照）

本目录为 **编译产物快照**，用于 `npm run runtime:seed-dist` 填充 `packages/pi` 各包 `dist/`。

- **源码改造**在 `packages/pi/`（见 `packages/pi/TASKWEAVER.md`）；TaskWeaver 运行时入口为 `packages/pi/packages/coding-agent/dist`。
- **版本**：见 `VERSION` 文件。
- **许可**：上游为 MIT，见 `THIRD_PARTY_NOTICES.md`。论文与发布材料中应注明「执行层集成开源 MIT 组件」。

## 升级运行时

1. 临时加回 dev 依赖：`npm install @earendil-works/pi-coding-agent@<新版本> --no-save`（或写入 dependencies 再 install）。
2. `node scripts/vendor-runtime.mjs`
3. 再次从 `package.json` 去掉 registry 依赖，`npm install`，跑 `npm run test:all`。

## 体积说明

`coding-agent/node_modules` 含多厂商 API 客户端，体积较大（约 150MB），这是「自带完整模型接入层」的代价；终端用户仍只需安装 TaskWeaver.app，无需单独拉取任何外部仓库。
