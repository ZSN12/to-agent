/**
 * Desktop orchestration: turn a model-facing action into a policy-checked,
 * approval-gated, humanized series of injected OS events. The motion planning
 * is pure; the approver (policy + approval waterfall) and the driver (OS) are
 * injected seams, so tests stub only those two boundaries.
 * @module @deepseek-ai/dsh-tool-desktop
 */

import type {
  KeyboardAction,
  KeyboardActionPlan,
  Modifier,
  MotionStep,
  MouseAction,
  Point,
  ScreenshotPlan,
} from './types.ts'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { DesktopDriver } from './macos.ts'
import { planHumanizedMove, mulberry32 } from './motion.ts'
import type { Rng } from './motion.ts'
import './session-events.ts'

/** Outcome of one desktop action after approval + motion planning. */
export type DesktopOutcome =
  | { kind: 'ok' }
  | { kind: 'denied'; reason: string }

/** Decide whether an action targeting a bundle id may run, on behalf of `agent`. */
export interface Approver {
  (
    agent: Agent,
    bundleId: string | null,
    action: string,
  ): Promise<{ ok: true } | { ok: false; reason: string }>
}

/** The desktop capability surface the tool calls. */
export interface DesktopService {
  /** Capture the display to `path` and report dimensions. */
  screenshot(path: string): Promise<ScreenshotPlan>
  /** Current cursor position. */
  cursorPosition(): Promise<Point | null>
  /** Frontmost app bundle id. */
  frontmostBundleId(): Promise<string | null>
  /** Move the cursor to `target`, humanized over the configured duration. */
  move(target: Point): Promise<DesktopOutcome>
  /** Click (or double-click) at `point`, humanized. */
  click(point: Point, double?: boolean): Promise<DesktopOutcome>
  /** Scroll by `deltaY` lines. */
  scroll(deltaY: number): Promise<DesktopOutcome>
  /** Type text at the focused field. */
  type(text: string): Promise<DesktopOutcome>
  /** Send a key combo with optional modifiers. */
  keyCombo(key: string, modifiers?: Modifier[]): Promise<DesktopOutcome>
}

/**
 * Build the desktop service over a driver, an approver, and a seeded RNG for
 * reproducible humanized motion. Every action first resolves the frontmost
 * bundle id, asks the approver (on behalf of `agent`), and only on approval
 * drives the OS.
 * @param driver - the OS backend
 * @param approver - resolves policy + approval for a target action
 * @param agent - the agent on whose behalf actions are approved and audited
 * @param durationMs - default humanized move duration
 * @param seed - RNG seed for reproducible paths
 * @returns the desktop service bound to `agent`
 */
export function createDesktopService(
  driver: DesktopDriver,
  approver: Approver,
  agent: Agent,
  durationMs = 400,
  seed = 1,
): DesktopService {
  const rng: Rng = mulberry32(seed)

  const audit = (kind: MouseAction | KeyboardAction | 'screenshot', bundleId: string | null, outcome: 'applied' | 'denied'): void => {
    agent.session.append('desktop/action', {
      kind,
      ...bundleId !== null ? { bundleId } : {},
      outcome,
    })
  }

  const authorize = async (
    bundleId: string | null,
    action: string,
  ): Promise<{ ok: true } | { ok: false; reason: string }> => {
    const decision = await approver(agent, bundleId, action)
    if (!decision.ok) return decision
    return { ok: true }
  }

  const move = async (target: Point): Promise<DesktopOutcome> => {
    const bundleId = await driver.frontmostBundleId()
    const auth = await authorize(bundleId, 'move')
    if (!auth.ok) {
      audit('move', bundleId, 'denied')
      return { kind: 'denied', reason: auth.reason }
    }
    const start = await driver.cursorPosition()
    const path: MotionStep[] = start
      ? planHumanizedMove(start, target, durationMs, rng)
      : [{ ...target, delayMs: 0 }]
    for (const step of path) {
      if (step.delayMs > 0) await new Promise(r => setTimeout(r, step.delayMs))
      await driver.mouse({ gesture: 'move', point: { x: step.x, y: step.y } })
    }
    audit('move', bundleId, 'applied')
    return { kind: 'ok' }
  }

  const click = async (point: Point, double = false): Promise<DesktopOutcome> => {
    const kind = double ? 'double_click' : 'click'
    const bundleId = await driver.frontmostBundleId()
    const auth = await authorize(bundleId, kind)
    if (!auth.ok) {
      audit(kind, bundleId, 'denied')
      return { kind: 'denied', reason: auth.reason }
    }
    await move(point)
    await driver.mouse({ gesture: kind, point })
    audit(kind, bundleId, 'applied')
    return { kind: 'ok' }
  }

  const scroll = async (deltaY: number): Promise<DesktopOutcome> => {
    const bundleId = await driver.frontmostBundleId()
    const auth = await authorize(bundleId, 'scroll')
    if (!auth.ok) {
      audit('scroll', bundleId, 'denied')
      return { kind: 'denied', reason: auth.reason }
    }
    await driver.mouse({ gesture: 'scroll', deltaY })
    audit('scroll', bundleId, 'applied')
    return { kind: 'ok' }
  }

  const type = async (text: string): Promise<DesktopOutcome> => {
    const bundleId = await driver.frontmostBundleId()
    const auth = await authorize(bundleId, 'type')
    if (!auth.ok) {
      audit('type', bundleId, 'denied')
      return { kind: 'denied', reason: auth.reason }
    }
    await driver.keyboard({ gesture: 'type', text })
    audit('type', bundleId, 'applied')
    return { kind: 'ok' }
  }

  const keyCombo = async (key: string, modifiers?: Modifier[]): Promise<DesktopOutcome> => {
    const bundleId = await driver.frontmostBundleId()
    const auth = await authorize(bundleId, 'key_combo')
    if (!auth.ok) {
      audit('key_combo', bundleId, 'denied')
      return { kind: 'denied', reason: auth.reason }
    }
    await driver.keyboard({
      gesture: 'key_combo',
      key,
      ...modifiers !== undefined ? { modifiers } : {},
    })
    audit('key_combo', bundleId, 'applied')
    return { kind: 'ok' }
  }

  const screenshot = async (path: string): Promise<ScreenshotPlan> => {
    const bundleId = await driver.frontmostBundleId()
    const auth = await authorize(bundleId, 'screenshot')
    if (!auth.ok) {
      audit('screenshot', bundleId, 'denied')
      throw new Error(auth.reason)
    }
    const plan = await driver.screenshot(path)
    audit('screenshot', bundleId, 'applied')
    return plan
  }

  return {
    screenshot,
    cursorPosition: () => driver.cursorPosition(),
    frontmostBundleId: () => driver.frontmostBundleId(),
    move,
    click,
    scroll,
    type,
    keyCombo,
  }
}

export type { KeyboardActionPlan }
