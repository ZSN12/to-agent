# @z/dsh-tool-desktop

[English](README.md) | 中文

macOS 桌面控制工具，让智能体像真人一样操作电脑：截屏、让光标沿自然的贝塞尔路径移动、点击、滚动与键入。本包对齐 Codex computer-use 特性的开源表面，在 `screenshot`、鼠标与键盘原语之上提供消费端封装，按应用级访问策略与 `approval/request` 审批瀑布逐应用放行，并将每次操作审计为仅日志的 `desktop/action` 会话事件。

本包是 `shell` 能力缝的消费端，macOS 后端使用 `screencapture` 截屏，用 JXA（`osascript`）+ `CGEvent` 驱动光标与键盘。操作系统边界以 `RunCommand` 运行器注入，因此动作规划、访问策略与审批流程都能在不动真实桌面的情况下完整做单元测试。

## 工具

插件挂载时会注册三个面向模型的工具：

- `desktop_screenshot` —— 将主屏截为 PNG 路径并返回 `{ path, width, height }`。建议点击前先截屏，让模型能看到屏幕。
- `desktop_mouse` —— `move`、`click`、`double_click` 或 `scroll`。光标移动已人性化：带轻微垂直弯曲、缓入缓出加速与亚像素手部抖动，并使用固定随机种子以保证可复现。
- `desktop_keyboard` —— `type` 键入文本，或在聚焦处发送 `key_combo`（可带 `command`/`control`/`option`/`shift` 修饰键）。

## 应用级访问策略

访问范围限定为最前端应用的 macOS bundle id（`NSWorkspace.frontmostApplication`）。`config.policy` 包含 `rules` 列表（`{ bundleId, access: 'allow' | 'deny' }`）与 `default` 兜底：

- 显式 `deny` 规则为最终决定，绝不弹审批。
- 显式 `allow` 规则直接执行，除非 `config.gateAllow` 强制所有操作都走审批瀑布。
- 未命中规则的应用回退到 `default`：`allow` 直接执行，`deny` 则询问用户（交由审批瀑布，而非静默拒绝）。

每次操作都会调用审批器，先对 bundle id 做分类，再决定直接放行、拒绝，或通过交互式 `ask` 策略派发 `approval/request`。开启 `config.persistApproval` 后，已批准的应用会在进程生命周期内缓存，后续对同一应用的操作不再重复弹审批。

## 人性化光标移动

`src/motion.ts` 中的 `planHumanizedMove` 是纯函数且使用固定种子：它采样一条三次贝塞尔曲线，其控制点沿弦的垂直方向偏移弦长的 8–15%，套用 smoothstep 缓入缓出，叠加 ±0.5px 抖动，并以约 10ms 间隔输出步进，最后一步精确落在目标点。固定种子可产出可复现路径，从而保证测试确定。

## 审计轨迹

每次执行或拒绝的操作都会追加一条仅日志的 `desktop/action` 会话事件，含 `kind`、`outcome`，以及（当最前端应用已知时的）`bundleId`。该事件不是表面事件，也不携带 `surfaceOp`。本包的 `./invariant` 伴生（`tool-desktop-invariant`）会校验记录只携带已知的 `kind` 与 `outcome` 取值。

## 配置

```yaml
plugins:
  tool-desktop:
    policy:
      rules:
        - bundleId: com.apple.Safari
          access: allow
        - bundleId: com.apple.Terminal
          access: deny
      default: deny
    gateAllow: false        # route even allow-listed apps through approval
    persistApproval: true   # cache a granted app for the process lifetime
    moveDurationMs: 400     # default humanized cursor-move duration
```

## 模型体验

### 桌面工具

#### 模型看到什么

三个工具及其 `{ ok, reason? }`（或截屏尺寸）结果。访问决策与审批提示留在审批缝上；模型只会看到放行操作的结果，或拒绝操作返回的 `ok: false` 原因。

#### Token 影响

除工具结果本身外为零 token。本插件不增加系统提示面；工具就是标准的模型可见调用。

#### KV Cache 影响

插件不改变提示前缀，已有 KV-cache 条目保持有效。访问策略、审批与审计记录落在会话事件流中，而非模型上下文里。

## 已知限制与待办工作

- **仅 macOS** —— 后端依赖 `screencapture` 与 JXA/`CGEvent`；Linux（X11/Wayland）与 Windows 尚未实现。
- **无辅助功能/录屏授权引导** —— 首次运行时为宿主进程授予辅助功能与屏幕录制权限的引导不在工具本身范围内。
- **仅主屏** —— 截屏与坐标假设单显示器；多显示器几何未处理。
- **静态图而非视频** —— `desktop_screenshot` 只捕获一帧；连续屏幕流式传输待办。
- **无按键回显与布局感知** —— 文本输入假设当前键盘布局，不校验实际键入内容。
- **人性化属启发式** —— 贝塞尔/缓入缓出路径近似自然动作，并非行为模型；未复制闭源的 Codex 平滑引擎。
