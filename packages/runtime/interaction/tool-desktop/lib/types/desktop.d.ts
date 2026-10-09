/**
 * Desktop orchestration: turn a model-facing action into a policy-checked,
 * approval-gated, humanized series of injected OS events. The motion planning
 * is pure; the approver (policy + approval waterfall) and the driver (OS) are
 * injected seams, so tests stub only those two boundaries.
 * @module @z/dsh-tool-desktop
 */
import type { KeyboardActionPlan, Modifier, Point, ScreenshotPlan } from './types.ts';
import type { Agent } from '@z/dsh-agent';
import type { DesktopDriver } from './macos.ts';
import './session-events.ts';
/** Outcome of one desktop action after approval + motion planning. */
export type DesktopOutcome = {
    kind: 'ok';
} | {
    kind: 'denied';
    reason: string;
};
/** Decide whether an action targeting a bundle id may run, on behalf of `agent`. */
export interface Approver {
    (agent: Agent, bundleId: string | null, action: string): Promise<{
        ok: true;
    } | {
        ok: false;
        reason: string;
    }>;
}
/** The desktop capability surface the tool calls. */
export interface DesktopService {
    /** Capture the display to `path` and report dimensions. */
    screenshot(path: string): Promise<ScreenshotPlan>;
    /** Current cursor position. */
    cursorPosition(): Promise<Point | null>;
    /** Frontmost app bundle id. */
    frontmostBundleId(): Promise<string | null>;
    /** Move the cursor to `target`, humanized over the configured duration. */
    move(target: Point): Promise<DesktopOutcome>;
    /** Click (or double-click) at `point`, humanized. */
    click(point: Point, double?: boolean): Promise<DesktopOutcome>;
    /** Scroll by `deltaY` lines. */
    scroll(deltaY: number): Promise<DesktopOutcome>;
    /** Type text at the focused field. */
    type(text: string): Promise<DesktopOutcome>;
    /** Send a key combo with optional modifiers. */
    keyCombo(key: string, modifiers?: Modifier[]): Promise<DesktopOutcome>;
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
export declare function createDesktopService(driver: DesktopDriver, approver: Approver, agent: Agent, durationMs?: number, seed?: number): DesktopService;
export type { KeyboardActionPlan };
//# sourceMappingURL=desktop.d.ts.map