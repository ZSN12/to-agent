/**
 * Vocabulary for the desktop-control tool: the action surface the model can
 * drive (screenshot, mouse, keyboard), the app-level access policy, and the
 * humanized cursor-motion plan.
 * @module @deepseek-ai/dsh-tool-desktop
 */

/** A point on the primary display, in display pixels (origin top-left). */
export interface Point {
  x: number
  y: number
}

/** One step of a humanized cursor path, injected with a per-step delay. */
export interface MotionStep extends Point {
  /** How long to wait before this step fires (ms). */
  delayMs: number
}

/** Mouse gestures the tool can inject. */
export type MouseAction =
  | 'move'
  | 'click'
  | 'double_click'
  | 'drag'
  | 'scroll'

/** Keyboard actions the tool can inject. */
export type KeyboardAction =
  | 'type'
  | 'key_combo'
  | 'shortcut'

/** Modifier keys usable in a key combo. */
export type Modifier = 'command' | 'control' | 'option' | 'shift'

/** Result of classifying a target app against the access policy. */
export type AccessVerdict = 'allow' | 'deny' | 'defer'

/** One allow/deny rule scoped to a macOS bundle id. */
export interface DesktopAccessRule {
  /** macOS bundle identifier of the target app (e.g. `com.apple.Safari`). */
  bundleId: string
  /** Whether this rule allows or denies desktop actions on that app. */
  access: 'allow' | 'deny'
}

/** App-level desktop access policy (mirrors Codex computer-use config). */
export interface DesktopAccessPolicy {
  /** Per-bundle-id allow/deny rules. */
  rules: DesktopAccessRule[]
  /** Default posture for an app with no matching rule: `allow` runs directly, `deny` defers to approval. */
  default: 'allow' | 'deny'
}

/** Normalized action a backend should inject for a mouse gesture. */
export interface MouseActionPlan {
  gesture: MouseAction
  /** Target point; present for move/click/double_click/drag end. */
  point?: Point
  /** Vertical scroll ticks (negative = down) for scroll. */
  deltaY?: number
  /** The humanized cursor path; absent for scroll. */
  path?: MotionStep[]
}

/** Normalized action a backend should inject for a keyboard gesture. */
export interface KeyboardActionPlan {
  gesture: KeyboardAction
  /** Text to type (for `type`). */
  text?: string
  /** Key + optional modifiers (for key_combo / shortcut). */
  key?: string
  modifiers?: Modifier[]
}

/** Where the macOS backend writes/reads the screen image. */
export interface ScreenshotPlan {
  /** Absolute path the screenshot was written to. */
  path: string
  /** Reported dimensions of the captured image. */
  width: number
  height: number
}
