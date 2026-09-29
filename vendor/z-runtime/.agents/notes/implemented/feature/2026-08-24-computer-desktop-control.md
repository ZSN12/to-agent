# Agent Note: macOS desktop control tools with app-level access policy

Status: implemented

English | [中文](2026-08-24-computer-desktop-control.zh.md)

## Problem

A model cannot operate a real computer the way a human does — see the screen, move the cursor, click, scroll, and type. Codex ships a computer-use feature for exactly this, but its execution engine (screen capture + cursor/keyboard simulation) lives in the closed-source desktop app; only the config, requirements, and remote-transport seams are open. DSH had no desktop-control surface at all, so agents were confined to terminal and file primitives.

## Research

From `openai/codex` (open source): `codex-rs/config/src/computer_use.rs` exposes the app-level access policy (`bundle_ids`/`aumids`/`exes` with `AllowDenyRequirementToml::{Allow,Deny}`), `ComputerUseRequirements.ts` exposes the requirement flags (`allowLockedComputerUse`, `allowPersistentApproval`, `defaultAppAccess`), and `app-server-transport/.../remote_control/` exposes the transport (pairing + websocket streams bridging the agent to a companion process). The actual cursor/mouse/keyboard/screenshot execution and the human-motion smoothing are proprietary and were not copied; the bezier/ease-in-out "humanize" core here is self-implemented pure logic.

## Decision

A new `@z/dsh-tool-desktop` function plugin provides model-facing `desktop_screenshot`, `desktop_mouse`, and `desktop_keyboard` tools. The macOS backend shells out to `screencapture` and JXA (`osascript` + `CGEvent`); the OS boundary is injected as a `RunCommand` runner so everything above it is unit-testable without the real desktop.

The design mirrors the Codex architecture at the layers that are open source:

- **App-level access policy** — `config.policy` holds `{ bundleId, access }` rules plus a `default`. An explicit `deny` is final; an explicit `allow` runs directly unless `gateAllow`; an unmatched app under a `deny` default defers to the approval waterfall (asked, not silently refused). `classifyDesktopAccess` is a pure function.
- **Persistent approval** — `config.persistApproval` caches a granted bundle id for the process lifetime so later actions on the same app do not re-prompt, mirroring Codex's `allowPersistentApproval`.
- **Enforcement seam** — access is decided by the approver, but actual enforcement stays with the `approval/request` waterfall (the approval service), matching Codex's separation between policy and the granting authority.
- **Humanized motion** — `planHumanizedMove` (pure, seeded) samples a cubic bezier with perpendicular control-point offsets, smoothstep ease-in-out, and ±0.5px jitter, ending exactly on the target.

Every applied or denied action appends a log-only `desktop/action` session event (`kind`, `outcome`, optional `bundleId`), and a package `./invariant` companion validates those records.

## Honest scope

macOS is the first target and is verified working on this machine (JXA CGEvent cursor position, `NSWorkspace.frontmostApplication`, and `/usr/sbin/screencapture` all respond). Cross-platform (X11/Wayland/Windows), video streaming, multi-display geometry, Accessibility/Screen-Recording onboarding prompts, and keystroke-echo/layout awareness are recorded as deferred work in the README, not faked as complete.

## Alternatives considered

Driving real pointer events from a Cordis consumer plugin via CGEvent is the standard macOS path and avoids adding a native addon. Shipping an injectable `RunCommand` runner keeps the deterministic motion planner, policy classifier, and approval flow 100% unit-covered while a REAL-composition test (real agent loop + real shell with a stubbed OS boundary) proves the assembled path. A native addon (e.g. via N-API) was rejected: it would couple the package to a build toolchain and complicate cross-version macOS deployment for no correctness gain over the CGEvent path.

## Consequences

The decision buys a fully testable desktop-control surface aligned with the open Codex architecture (app-level policy, persistent approval, enforcement via the `approval/request` waterfall) and a `desktop/action` audit trail, with the OS boundary injected so the motion, policy, and approval logic carry 100% unit coverage plus a REAL-composition proof. It costs first-version macOS-only support: X11/Wayland/Windows, video streaming, multi-display geometry, Accessibility/Screen-Recording onboarding prompts, and keystroke-echo/layout awareness remain deferred, and humanization is a heuristic approximation of the closed-source Codex smoothing engine rather than a copy of it.

## Verification

Eight test suites (86 tests) reach per-file 100% coverage on every `src` module, including a REAL-composition suite that boots the tool-desktop plugin over the real agent loop with a stubbed shell and asserts the durable `desktop/action` audit records. The package typechecks and its README/en/zh pair is recorded for the translation gate.

A runnable `examples/web-desktop/` overlay (`dsh web --patch examples/web-desktop/cordis.yml`, demo script `pnpm run demo:web-desktop`) layers the desktop tools onto the Web profile with a bundle-id allow-list and `deny`-default access; it boots the GUI on `http://127.0.0.1:3082` with the tools registered and the `verify-cordis-config` gate resolving `@z/dsh-tool-desktop` from `examples/package.json`.
