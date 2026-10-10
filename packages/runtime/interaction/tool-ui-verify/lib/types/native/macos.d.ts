export interface NativePoint {
    /** Horizontal offset from the isolated TaskWeaver window's top-left, in points. */
    x: number;
    /** Vertical offset from the isolated TaskWeaver window's top-left, in points. */
    y: number;
}
export interface NativeWindow {
    id: number;
    x: number;
    y: number;
    width: number;
    height: number;
}
export interface NativePermissions {
    accessibility: boolean;
    screenRecording: boolean;
}
export interface MacNativeRunner {
    (file: string, args: readonly string[]): Promise<string>;
}
/**
 * macOS-only fallback, bound to one live TaskWeaver Electron PID. It cannot
 * activate an app, enumerate arbitrary app windows, or click outside the
 * current on-screen TaskWeaver window. Native point coordinates are window
 * relative; screenshots are captured by window id and resized to point size.
 */
export declare class MacNativeUiFallback {
    private readonly run;
    private readonly pid;
    constructor(pid: number, runner?: MacNativeRunner);
    private jxa;
    permissions(): Promise<NativePermissions>;
    targetWindow(): Promise<NativeWindow>;
    private frontmostGuard;
    screenshot(outputPath: string): Promise<string>;
    click(point: NativePoint): Promise<void>;
    fill(point: NativePoint, text: string): Promise<void>;
    type(point: NativePoint, text: string): Promise<void>;
    private typeFocused;
    press(key: string, modifiers?: readonly ('command' | 'control' | 'option' | 'shift')[]): Promise<void>;
}
//# sourceMappingURL=macos.d.ts.map