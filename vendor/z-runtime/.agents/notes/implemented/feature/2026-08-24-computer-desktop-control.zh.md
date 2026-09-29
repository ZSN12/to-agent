# Agent Note：带应用级访问策略的 macOS 桌面控制工具

状态：已实现

[English](2026-08-24-computer-desktop-control.md) | 中文

## 问题

模型无法像真人一样操作真实电脑——看屏幕、移动光标、点击、滚动与键入。Codex 为此提供了 computer-use 特性，但它的执行引擎（截屏 + 光标/键盘模拟）位于闭源的桌面应用里，只有配置、需求与远程传输缝是开源的。DSH 原本没有任何桌面控制面，因此智能体只能使用终端与文件原语。

## 调研

来自 `openai/codex`（开源）：`codex-rs/config/src/computer_use.rs` 暴露应用级访问策略（`bundle_ids`/`aumids`/`exes`，含 `AllowDenyRequirementToml::{Allow,Deny}`），`ComputerUseRequirements.ts` 暴露需求开关（`allowLockedComputerUse`、`allowPersistentApproval`、`defaultAppAccess`），`app-server-transport/.../remote_control/` 暴露传输层（配对 + 在智能体与伴生进程之间搭桥的 websocket 流）。真正的光标/鼠标/键盘/截屏执行与人类动作平滑是专有的，未被复制；这里的贝塞尔/缓入缓出「人性化」核心是自行实现的纯逻辑。

## 决策

新增 `@z/dsh-tool-desktop` 函数插件，提供面向模型的 `desktop_screenshot`、`desktop_mouse` 与 `desktop_keyboard` 工具。macOS 后端调用 `screencapture` 与 JXA（`osascript` + `CGEvent`）；操作系统边界以 `RunCommand` 运行器注入，因此其上的一切都能在不触碰真实桌面的情况下做单元测试。

设计在开源层的各层对齐 Codex 架构：

- **应用级访问策略** —— `config.policy` 含 `{ bundleId, access }` 规则列表与 `default` 兜底。显式 `deny` 为最终决定；显式 `allow` 直接执行，除非 `gateAllow`；在 `deny` 默认下未命中的应用会交给审批瀑布（被询问而非静默拒绝）。`classifyDesktopAccess` 是纯函数。
- **持久审批** —— `config.persistApproval` 在进程生命周期内缓存已批准的应用，后续对同一应用的操作不再重复弹审批，对齐 Codex 的 `allowPersistentApproval`。
- **强制缝** —— 访问由审批器判定，但真正的强制仍落在 `approval/request` 瀑布（审批服务）上，对齐 Codex 在策略与授予权威之间的分离。
- **人性化移动** —— `planHumanizedMove`（纯函数、固定种子）采样带垂直控制点偏移的三次贝塞尔，套用 smoothstep 缓入缓出与 ±0.5px 抖动，最后一步精确落在目标点。

每次执行或拒绝的操作都会追加一条仅日志的 `desktop/action` 会话事件（`kind`、`outcome`、可选 `bundleId`），并由包级 `./invariant` 伴生校验这些记录。

## 诚实范围

macOS 为首选目标，并已在本机验证可用（JXA CGEvent 光标位置、`NSWorkspace.frontmostApplication`、`/usr/sbin/screencapture` 均正常响应）。跨平台（X11/Wayland/Windows）、视频流式传输、多显示器几何、辅助功能/录屏授权引导、按键回显与布局感知，均在 README 中记为待办工作，而非伪装成已完成。

## 备选方案评估

通过 CGEvent 从 Cordis 消费端插件驱动真实指针事件，是标准的 macOS 路径，也避免新增原生插件。提供可注入的 `RunCommand` 运行器，让确定性的动作规划器、策略分类器与审批流程实现 100% 单元覆盖，同时用 REAL-composition 测试（真实智能体循环 + 真实 shell，OS 边界打桩）证明组装后的完整链路。曾考虑原生插件（例如经 N-API）：它会让本包耦合构建工具链，并因跨 macOS 版本部署而复杂化，相对 CGEvent 路径并无正确性收益，故被否决。

## 后果

该决策换来一个完全可测、对齐开源 Codex 架构（应用级策略、持久审批、经由 `approval/request` 瀑布强制）的桌面控制面，以及一条 `desktop/action` 审计轨迹；操作系统边界被注入，使动作、策略与审批逻辑获得 100% 单元覆盖并配以 REAL-composition 证明。代价是首版仅支持 macOS：X11/Wayland/Windows、视频流式传输、多显示器几何、辅助功能/录屏授权引导、按键回显与布局感知仍属待办；且人性化是对闭源 Codex 平滑引擎的启发式近似，而非其副本。

## 验证

八个测试套件（86 个用例）在 `src` 每个模块上达到逐文件 100% 覆盖率，其中包含 REAL-composition 套件：在真实智能体循环上挂载 tool-desktop 插件、对 shell 打桩，并断言持久的 `desktop/action` 审计记录。包已通过类型检查，README/en/zh 成对记录已写入翻译门禁。

另附一个可运行的 `examples/web-desktop/` 覆盖层（`dsh web --patch examples/web-desktop/cordis.yml`，演示脚本 `pnpm run demo:web-desktop`）：将桌面工具叠加到 Web profile，配以 bundle-id 白名单与 `deny` 默认访问；它在 `http://127.0.0.1:3082` 启动 GUI、注册工具，且 `verify-cordis-config` 门禁能从 `examples/package.json` 解析 `@z/dsh-tool-desktop`。
