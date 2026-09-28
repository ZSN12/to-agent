# @deepseek-ai/dsh-tool-desktop

English | [中文](README.zh.md)

macOS desktop control tools that let an agent operate the computer as a human would: capture the screen, move the cursor along a natural bezier path, click, scroll, and type. Modeled on the open-source surface of Codex's computer-use feature, the package owns a consumer-side seam over `screenshot`, mouse, and keyboard primitives, gated per-application by an app-level access policy and the `approval/request` waterfall, with every action audited as a log-only `desktop/action` session event.

The package is a Consumer of the `shell` capability seam for the macOS backend: `screencapture` for screenshots and JXA (`osascript`) + `CGEvent` for cursor and keyboard input. The OS boundary is injected as a `RunCommand` runner so the motion planner, access policy, and approval flow are fully unit-testable without touching the real desktop.

## Tools

Three model-facing tools are registered when the plugin mounts:

- `desktop_screenshot` — capture the primary display to a PNG path and report `{ path, width, height }`. Use it before clicking so the model can see the screen.
- `desktop_mouse` — `move`, `click`, `double_click`, or `scroll`. Cursor moves are humanized: a slight perpendicular curve with ease-in-out acceleration and sub-pixel hand wobble, seeded for reproducibility.
- `desktop_keyboard` — `type` text or send a `key_combo` (with optional `command`/`control`/`option`/`shift` modifiers) at the focused field.

## App-level access policy

Access is scoped to the macOS bundle id of the frontmost application (`NSWorkspace.frontmostApplication`). `config.policy` holds a `rules` list of `{ bundleId, access: 'allow' | 'deny' }` plus a `default`:

- An explicit `deny` rule is final and never prompts.
- An explicit `allow` rule runs directly unless `config.gateAllow` forces every action through the waterfall.
- An app with no matching rule falls back to `default`: `allow` runs directly, `deny` asks the human (deferred to the waterfall rather than silently refused).

Each action calls the approver, which classifies the bundle id and then either allows, denies, or dispatches `approval/request` through the interactive `ask` policy. With `config.persistApproval`, a granted bundle id is cached for the process lifetime so later actions on the same app do not re-prompt.

## Humanized cursor motion

`planHumanizedMove` in `src/motion.ts` is a pure, seeded function: it samples a cubic bezier whose control points are offset perpendicular to the chord by 8–15% of its length, applies smoothstep ease-in-out, adds ±0.5px jitter, and emits steps at ~10ms intervals ending exactly on the target. A fixed seed produces a reproducible path, which keeps tests deterministic.

## Audit trail

Every applied or denied action appends a log-only `desktop/action` session event with `kind`, `outcome`, and (when the frontmost app is known) `bundleId`. The event is not a surface event and carries no `surfaceOp`. The package's `./invariant` companion (`tool-desktop-invariant`) validates that records carry only known `kind` and `outcome` values.

## Config

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

## Model Experience

### Desktop tools

#### What the model sees

The three tools and their `{ ok, reason? }` (or screenshot dimensions) results. Access decisions and approval prompts stay on the approval seam; the model only sees an allowed action's result or a refused action's `ok: false` reason.

#### Token effect

Zero tokens beyond the tool result itself. The plugin adds no system-prompt surface; the tools are standard model-facing calls.

#### KV Cache effect

The prompt prefix is unchanged by the plugin, so existing KV-cache entries remain valid. Access policy, approval, and audit records live in the session event stream, not in the model context.

## Known Limitations and Deferred Work

- **macOS only** — the backend shells out to `screencapture` and JXA/`CGEvent`; Linux (X11/Wayland) and Windows are not implemented.
- **No Accessibility/Screen-Recording onboarding** — first-run prompts to grant the host process Accessibility and Screen Recording permission are out of scope for the tool itself.
- **Primary display only** — screenshots and coordinates assume a single display; multi-display geometry is not handled.
- **Still images, not video** — `desktop_screenshot` captures one frame; continuous screen streaming is deferred.
- **No keystroke echo or layout awareness** — text input assumes the current keyboard layout and does not verify what was actually typed.
- **Humanization is heuristic** — the bezier/ease-in-out path approximates natural motion but is not a behavioral model; the closed-source Codex smoothing engine is not copied.
