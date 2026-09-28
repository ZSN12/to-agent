# web-desktop

English | [中文](README.zh.md)

macOS desktop control layered onto the DSH Web profile via [`@deepseek-ai/dsh-tool-desktop`](../../packages/interaction/tool-desktop/README.md). The model can capture the screen, move the cursor along a humanized bezier path, click, scroll, and type — real input events on the host Mac, not a simulation.

## Run it

```sh
pnpm run demo:web-desktop
```

This starts the browser interface at `http://127.0.0.1:3082` and requires `DEEPSEEK_API_KEY`. The base Web profile already mounts the `approval` (dsh-user-approval) and `shell` seams, so this overlay only inserts the `tool-desktop` plugin.

## Access policy

Access is scoped by the macOS bundle id of the frontmost app:

- `com.apple.Safari` and `com.apple.Terminal` run directly (allow).
- Any other frontmost app defers to the interactive approval waterfall — the GUI asks you before the tool drives the OS.

`config.gateAllow`, `config.persistApproval`, and `config.moveDurationMs` tune whether even allow-listed apps are gated, whether a granted app is cached for the process lifetime, and the humanized cursor-move duration.

## Host requirements

- **macOS** only (first version targets `screencapture` + JXA/`CGEvent`).
- The host process needs **Screen Recording** permission to capture the display, and **Accessibility** permission to post cursor/keyboard events. macOS grants these once per host binary through System Settings → Privacy & Security.
- The tools act on the real desktop of the machine running the GUI, so only run this on a host you control.

Known limitations and deferred work (cross-platform, video streaming, multi-display, keystroke echo) are listed in the [package README](../../packages/interaction/tool-desktop/README.md).
