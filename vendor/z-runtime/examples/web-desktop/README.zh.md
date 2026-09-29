# web-desktop

[English](README.md) | 中文

通过 [`@z/dsh-tool-desktop`](../../packages/interaction/tool-desktop/README.zh.md) 将 macOS 桌面控制叠加到 DSH Web profile 上。模型可以截屏、沿人性化贝塞尔曲线移动光标、点击、滚动与键入——这是对宿主 Mac 的真实输入事件，而非模拟。

## 运行

```sh
pnpm run demo:web-desktop
```

这会在 `http://127.0.0.1:3082` 启动浏览器界面，并要求 `DEEPSEEK_API_KEY`。基础 Web profile 已挂载 `approval`（dsh-user-approval）与 `shell` 两个缝，因此本覆盖层只需插入 `tool-desktop` 插件。

## 访问策略

访问按最前端应用的 macOS bundle id 界定：

- `com.apple.Safari` 与 `com.apple.Terminal` 直接执行（allow）。
- 其他任何最前端应用会交给交互式审批瀑布——在工具驱动操作系统之前，GUI 会先征求你的同意。

`config.gateAllow`、`config.persistApproval` 与 `config.moveDurationMs` 分别控制：即使白名单应用也强制走审批、已批准应用是否在进程生命周期内缓存、以及人性化光标移动时长。

## 宿主要求

- **仅 macOS**（首版面向 `screencapture` + JXA/`CGEvent`）。
- 宿主进程需要**屏幕录制**权限才能截取显示器，以及**辅助功能**权限才能投递光标/键盘事件。macOS 会在「系统设置 → 隐私与安全性」中为每个宿主二进制授予一次。
- 这些工具会作用于运行 GUI 的那台机器的真实桌面，因此只应在你掌控的宿主上运行。

已知限制与待办（跨平台、视频流式传输、多显示器、按键回显）见[包 README](../../packages/interaction/tool-desktop/README.zh.md)。
