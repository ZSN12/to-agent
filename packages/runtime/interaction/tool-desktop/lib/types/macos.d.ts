/**
 * macOS desktop backend: capture the screen and inject real input events
 * (cursor, mouse, keyboard) through `osascript -l JavaScript` (JXA + the
 * CoreGraphics/AppKit ObjC bridge) and `screencapture`. The whole OS boundary
 * is behind an injectable `RunCommand` so REAL-composition tests can stub only
 * this seam.
 * @module @z/dsh-tool-desktop
 */
import type { KeyboardActionPlan, MouseActionPlan, Point, ScreenshotPlan } from './types.ts';
/** Execute one native command and return its combined output. */
export interface RunCommand {
    (script: string): Promise<string>;
}
/** The OS-facing surface the desktop backend needs. */
export interface DesktopDriver {
    /** Capture the primary display and write it to `path`; return dimensions. */
    screenshot(path: string): Promise<ScreenshotPlan>;
    /** Current cursor position, or null if it cannot be read. */
    cursorPosition(): Promise<Point | null>;
    /** Bundle id of the frontmost app, or null if unknown. */
    frontmostBundleId(): Promise<string | null>;
    /** Inject one mouse action plan (move/click/double_click/scroll/drag). */
    mouse(plan: MouseActionPlan): Promise<void>;
    /** Inject one keyboard action plan (type/key_combo/shortcut). */
    keyboard(plan: KeyboardActionPlan): Promise<void>;
}
/**
 * macOS driver shelling out to `osascript` and `screencapture`.
 * @param run - command runner (subprocess / ctx.shell), injected for testability
 * @returns a desktop driver over the OS boundary
 */
export declare function macosDriver(run: RunCommand): DesktopDriver;
//# sourceMappingURL=macos.d.ts.map