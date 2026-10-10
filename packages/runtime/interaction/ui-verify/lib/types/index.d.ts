import type { AriaRole } from 'playwright-core';
export declare const ACTION_TIMEOUT_MS = 10000;
export declare const SESSION_TIMEOUT_MS: number;
export type UiTarget = {
    testId: string;
    role?: never;
    name?: never;
} | {
    role: AriaRole;
    name: string;
    testId?: never;
};
export interface UiVerifyLaunchOptions {
    /** Supplied by the trusted Host from the active session cwd, never by model tool arguments. */
    root: string;
    /** Host-chosen directory for screenshots, trace, and isolated user data. */
    artifactsDir: string;
    actionTimeoutMs?: number;
    sessionTimeoutMs?: number;
    launchTimeoutMs?: number;
}
export interface UiAssertion {
    kind: 'visible' | 'text';
    target: UiTarget;
    text?: string;
}
export interface UiAssertionResult {
    kind: UiAssertion['kind'];
    target: UiTarget;
    passed: boolean;
    screenshot?: string;
    error?: string;
}
export declare function validateUiTarget(target: UiTarget): void;
export declare function createUiVerifyEnvironment(userDataPath: string, sourceEnvironment?: NodeJS.ProcessEnv, runtimeRoot?: string, startupTracePath?: string): NodeJS.ProcessEnv;
/**
 * A bounded, isolated Playwright Electron session for the current TaskWeaver
 * development checkout. Locators deliberately expose no arbitrary CSS or URL
 * surface to callers.
 */
export declare class UiVerifySession {
    readonly root: string;
    readonly artifactsDir: string;
    readonly userDataPath: string;
    readonly startupTracePath: string;
    readonly actionTimeoutMs: number;
    readonly sessionTimeoutMs: number;
    private readonly startedAt;
    private app;
    private page;
    private readonly errors;
    private readonly processLogs;
    private screenshotCounter;
    private closed;
    private sessionTimeout;
    private traceStarted;
    private constructor();
    static launch(options: UiVerifyLaunchOptions): Promise<UiVerifySession>;
    startupTraceEvents(): Promise<Array<{
        event: string;
        elapsedMs: number;
        [key: string]: unknown;
    }>>;
    private readonly observedPages;
    private observePage;
    private currentPage;
    private locator;
    private action;
    snapshot(): Promise<string>;
    click(target: UiTarget): Promise<void>;
    fill(target: UiTarget, value: string): Promise<void>;
    press(target: UiTarget, key: string): Promise<void>;
    waitFor(target: UiTarget, state?: 'visible' | 'hidden'): Promise<void>;
    expectVisible(target: UiTarget): Promise<void>;
    expectText(target: UiTarget, text: string): Promise<void>;
    screenshotPath(name?: string): string;
    screenshot(name?: string): Promise<string>;
    consoleErrors(): string[];
    processOutput(): string;
    saveTrace(): Promise<string | undefined>;
    processId(): number | undefined;
    check(assertions: readonly UiAssertion[]): Promise<UiAssertionResult[]>;
    close(): Promise<void>;
}
export declare function assertTaskWeaverProject(root: string): Promise<string>;
//# sourceMappingURL=index.d.ts.map