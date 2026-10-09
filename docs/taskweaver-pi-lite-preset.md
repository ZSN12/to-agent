# taskweaver-pi-lite 预设

参考本机 [Pi coding-agent](https://github.com/badlogic/pi-mono)（`packages/coding-agent/src/core/system-prompt.ts`）的做法：

- **短且固定的 system 文本**（`persona` + `complete: true`，不再叠加各工具的 `systemPrompt.section` 长段落）
- **工具 JSON schema** 仍由 Host 在 API 请求里单独发送
- **工具集**：read / bash / edit / write / grep / glob + 基础 compaction
- **AGENTS 预算**：8192 字节（`agent-instructions`）

## 自动选用

`electron/backend/primary-agent-preset.mjs` 在**新 Host 会话**创建前解析 preset：

| 条件 | Preset |
|------|--------|
| 寒暄 / 确认等 `CONVERSATION` 意图 | `taskweaver-pi-lite` |
| 改代码、规划 | `standard` |
| 多文件路径或批量只读句式 | `code` |
| 其余 | `standard` |
| Cursor 系模型 | `standard` |

已绑定旧 preset 的会话不会自动切换；**新开线程**后发「你好」才会走 pi-lite。

## 文件位置

- `vendor/z-runtime/apps/cli/config/agent-presets/taskweaver-pi-lite/`
- 打包时随 `build-z-runtime.mjs` 复制到 `vendor/taskweaver-z-runtime/config/agent-presets/`

开发模式若未重建 runtime，需执行 `npm run build:z-runtime`（或 `dsh:runtime`）后重启应用。

## 验证

```bash
npm run test:user-intent
```

发「你好」后看输入框旁上下文环：**系统提示词**应明显低于 `standard` 全量 agent。
