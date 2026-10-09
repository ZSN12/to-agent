/**
 * Model-facing macOS desktop-control tools over a driver + approval seam:
 * `desktop_screenshot`, `desktop_mouse`, `desktop_keyboard`. Every action is
 * scoped to the frontmost app's bundle id, gated by an app-level access policy
 * and the `approval/request` waterfall, and (for cursor moves) humanized with a
 * seeded bezier path. Enforcement stays with the approval service; these tools
 * only propose and interpret.
 * @module @z/dsh-tool-desktop
 */
import type { Context } from '@z/cordis';
import z from '@z/schemastery';
import type { DesktopAccessPolicy } from './types.ts';
export declare const name = "tool-desktop";
export declare const inject: string[];
/** Configuration for the desktop-control tool. */
export interface Config {
    /**
     * App-level access policy. `rules` match macOS bundle ids; an unmatched app
     * falls back to `default`. An explicit `deny` rule is final; an unmatched
     * app under a `deny` default is deferred to the approval waterfall.
     */
    policy: DesktopAccessPolicy;
    /**
     * If true, every action (even on an `allow` bundle) is routed through the
     * approval waterfall. Defaults to false: `allow` runs directly.
     */
    gateAllow?: boolean;
    /**
     * If true, an approved bundle id is cached so later actions on the same app
     * in this process do not re-prompt. Defaults to false.
     */
    persistApproval?: boolean;
    /** Default humanized cursor-move duration in ms. */
    moveDurationMs?: number;
}
/** Runtime configuration schema for the desktop tool plugin. */
export declare const Config: z<Config>;
export declare function apply(ctx: Context, config: Config): void;
//# sourceMappingURL=index.d.ts.map