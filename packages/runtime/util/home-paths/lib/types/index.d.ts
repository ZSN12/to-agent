/**
 * Shared filesystem path helpers for TaskWeaver runtime user data.
 *
 * @module @taskweaver/dsh-home-paths
 */
/** Directory below the OS home used for TaskWeaver runtime state. */
export declare const RUNTIME_HOME_DIR_NAME = "runtime";
/** Stable user-facing display form for the default runtime home. */
export declare const DEFAULT_RUNTIME_HOME_DISPLAY = "~/.taskweaver/runtime";
/** Canonical environment variable overriding the runtime home. */
export declare const TASKWEAVER_HOME_ENV = "TASKWEAVER_HOME";
/** Canonical embedded-host flag. */
export declare const TASKWEAVER_EMBEDDED_ENV = "TASKWEAVER_EMBEDDED";
/** Legacy environment variables accepted during the one-version migration window. */
export declare const LEGACY_HOME_ENV_VARS: readonly ["Z_HOME", "DSH_HOME"];
export declare const LEGACY_EMBEDDED_ENV_VARS: readonly ["Z_TASKWEAVER_EMBEDDED", "DSH_TASKWEAVER_EMBEDDED"];
/** @deprecated Use {@link RUNTIME_HOME_DIR_NAME}. */
export declare const DSH_HOME_DIR_NAME = ".dsh";
/** @deprecated Use {@link DEFAULT_RUNTIME_HOME_DISPLAY}. */
export declare const DEFAULT_DSH_HOME_DISPLAY = "~/.dsh";
/** @deprecated Use {@link TASKWEAVER_HOME_ENV}. */
export declare const DSH_HOME_ENV = "DSH_HOME";
/** @deprecated Use {@link TASKWEAVER_HOME_ENV}. */
export declare const Z_HOME_ENV = "Z_HOME";
/** @deprecated Use {@link TASKWEAVER_EMBEDDED_ENV}. */
export declare const Z_TASKWEAVER_EMBEDDED_ENV = "Z_TASKWEAVER_EMBEDDED";
/** @deprecated Use {@link TASKWEAVER_EMBEDDED_ENV}. */
export declare const DSH_TASKWEAVER_EMBEDDED_ENV = "DSH_TASKWEAVER_EMBEDDED";
/**
 * Read a canonical TaskWeaver environment variable, falling back to legacy
 * names for one compatibility release. Each legacy name warns once per
 * process so old launch scripts can be updated without flooding logs.
 */
export declare function readTaskWeaverEnvironment(env: Record<string, string | undefined>, canonicalName: string, legacyNames?: readonly string[], warn?: (message: string) => void): string | undefined;
/**
 * Give a native filesystem watcher one canonical spelling of a path, even
 * when its final components do not exist yet. The deepest existing ancestor
 * is resolved through {@link realpath}; when a suffix is missing, that
 * ancestor is also proved to be an enumerable directory before the suffix is
 * restored. This prevents Windows from treating a regular-file ancestor as
 * ordinary absence, and prevents short-name aliases from being mixed with
 * long paths emitted by the native watcher backend.
 * @param path - Watch target or root, resolved against the current directory.
 * @returns the target with its existing ancestor canonicalized.
 * @throws when ancestor traversal encounters an error other than absence, or
 * the existing ancestor of a missing suffix is not an enumerable directory.
 */
export declare function canonicalizeWatchPath(path: string): Promise<string>;
/** Resolve the default TaskWeaver runtime home. */
export declare function defaultRuntimeHome(): string;
/** @deprecated Use {@link defaultRuntimeHome}. */
export declare const defaultDshHome: typeof defaultRuntimeHome;
/**
 * Expand supported tilde prefixes against the operating-system home.
 * @param path - configured path that may begin with `~`, `~/`, or `~\\`.
 * @returns the expanded path, or the original value when no supported prefix is present.
 */
export declare function expandHomePath(path: string): string;
/**
 * Resolve the TaskWeaver runtime home. An explicit configured path wins,
 * followed by `TASKWEAVER_HOME`; old `Z_HOME` and `DSH_HOME` remain readable
 * during the compatibility window and emit a warning when used.
 */
export declare function resolveRuntimeHome(configured?: string, env?: Record<string, string | undefined>): string;
/** @deprecated Use {@link resolveRuntimeHome}. */
export declare const resolveDshHome: typeof resolveRuntimeHome;
/** Join path segments onto the resolved TaskWeaver runtime home. */
export declare function runtimeHomePath(...segments: string[]): string;
/** @deprecated Use {@link runtimeHomePath}. */
export declare const dshHomePath: typeof runtimeHomePath;
/** Describe a resolved runtime home without exposing a machine-specific path. */
export declare function runtimeHomeDisplay(resolvedHome: string): string;
/** @deprecated Use {@link runtimeHomeDisplay}. */
export declare const dshHomeDisplay: typeof runtimeHomeDisplay;
/** Whether this process is TaskWeaver's embedded Host. */
export declare function taskweaverEmbeddedFromEnv(env?: Record<string, string | undefined>): boolean;
//# sourceMappingURL=index.d.ts.map