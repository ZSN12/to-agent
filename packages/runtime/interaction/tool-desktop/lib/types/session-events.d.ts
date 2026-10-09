/**
 * Session-event augmentation for desktop control: the `desktop/action` log-only
 * audit record appended to the owning session when a desktop action is applied
 * (like `hook/*`, NOT a surface event — carries no `surfaceOp`).
 * @module @z/dsh-tool-desktop
 */
import type { MouseAction, KeyboardAction } from './types.ts';
declare module '@z/dsh-session/types' {
    interface SessionEventMap {
        /**
         * One applied desktop action — log-only audit. `kind` is the gesture or
         * keyboard action; `bundleId` is the frontmost app at injection time;
         * `outcome` records whether it was applied or denied by policy.
         */
        'desktop/action': {
            kind: MouseAction | KeyboardAction | 'screenshot';
            bundleId?: string;
            outcome: 'applied' | 'denied';
        };
    }
}
export type {};
//# sourceMappingURL=session-events.d.ts.map