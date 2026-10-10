/**
 * CPython subprocess implementation of `ctx.codeRuntime`.
 * @module @taskweaver/dsh-code-runtime-python/src/python-runtime
 */
import { Context } from '@taskweaver/cordis';
import z from '@taskweaver/schemastery';
import { CodeRuntime } from '@taskweaver/dsh-code-runtime';
import type { CodeRunRequest, CodeRunResult } from '@taskweaver/dsh-code-runtime';
/** Runtime limits for Python code execution. */
export interface Config {
    /** Wall-clock ceiling, including interpreter startup and binding waits. */
    maxWallMs?: number;
    /** CPython CPU-time limit in seconds where the platform supports RLIMIT_CPU. */
    cpuSeconds?: number;
    /** Linux address-space ceiling; macOS relies on wall time and output caps. */
    addressSpaceBytes?: number;
    /** Child-side combined UTF-8 stdout/stderr cap. */
    maxLogBytes?: number;
    /** Maximum compact JSON completion value size. */
    maxValueBytes?: number;
    /** Host-side combined result payload cap, including logs and failure text. */
    maxOutputBytes?: number;
    /** Maximum size of any one inbound fd-3 JSON frame. */
    maxFrameBytes?: number;
}
/** A validated Python interpreter found on the user's PATH. */
export interface PythonExecutable {
    path: string;
    version: string;
}
/** Interpreter discovery either returns one usable CPython or actionable guidance. */
export type PythonDiscovery = {
    executable: PythonExecutable;
} | {
    error: string;
};
export declare function isCommandLineToolsStub(executablePath: string, detail: string): boolean;
/**
 * Probe only executables named `python3` on PATH. The probe executes no user
 * code and rejects macOS Command Line Tools' placeholder, non-CPython output,
 * and interpreters older than the package's supported Python 3.9 floor.
 */
export declare function discoverPython3(pathValue?: string | undefined, platform?: string): Promise<PythonDiscovery>;
/**
 * CPython subprocess code runtime. Each call gets a fresh interpreter process;
 * model code runs only after the resolved sandbox policy has been applied.
 */
export declare class PythonCodeRuntime extends CodeRuntime {
    static Config: z<Config>;
    readonly language = "python";
    readonly isolation = "process";
    private readonly config;
    private pythonPromise;
    private readonly live;
    private disposed;
    constructor(ctx: Context, config: Config);
    private teardown;
    run(request: CodeRunRequest): Promise<CodeRunResult>;
    private execute;
}
export default PythonCodeRuntime;
//# sourceMappingURL=python-runtime.d.ts.map