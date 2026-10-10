/**
 * Shared filesystem path helpers for TaskWeaver runtime user data.
 *
 * @module @taskweaver/dsh-home-paths
 */

import { opendir, realpath } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve, sep } from 'node:path'

/** Directory below the OS home used for TaskWeaver runtime state. */
export const RUNTIME_HOME_DIR_NAME = 'runtime'

/** Stable user-facing display form for the default runtime home. */
export const DEFAULT_RUNTIME_HOME_DISPLAY = '~/.taskweaver/runtime'

/** Canonical environment variable overriding the runtime home. */
export const TASKWEAVER_HOME_ENV = 'TASKWEAVER_HOME'

/** Canonical embedded-host flag. */
export const TASKWEAVER_EMBEDDED_ENV = 'TASKWEAVER_EMBEDDED'

/** Legacy environment variables accepted during the one-version migration window. */
export const LEGACY_HOME_ENV_VARS = ['Z_HOME', 'DSH_HOME'] as const
export const LEGACY_EMBEDDED_ENV_VARS = ['Z_TASKWEAVER_EMBEDDED', 'DSH_TASKWEAVER_EMBEDDED'] as const

/** @deprecated Use {@link RUNTIME_HOME_DIR_NAME}. */
export const DSH_HOME_DIR_NAME = '.dsh'
/** @deprecated Use {@link DEFAULT_RUNTIME_HOME_DISPLAY}. */
export const DEFAULT_DSH_HOME_DISPLAY = `~/${DSH_HOME_DIR_NAME}`
/** @deprecated Use {@link TASKWEAVER_HOME_ENV}. */
export const DSH_HOME_ENV = 'DSH_HOME'
/** @deprecated Use {@link TASKWEAVER_HOME_ENV}. */
export const Z_HOME_ENV = 'Z_HOME'
/** @deprecated Use {@link TASKWEAVER_EMBEDDED_ENV}. */
export const Z_TASKWEAVER_EMBEDDED_ENV = 'Z_TASKWEAVER_EMBEDDED'
/** @deprecated Use {@link TASKWEAVER_EMBEDDED_ENV}. */
export const DSH_TASKWEAVER_EMBEDDED_ENV = 'DSH_TASKWEAVER_EMBEDDED'

const warnedLegacyVariables = new Set<string>()

/**
 * Read a canonical TaskWeaver environment variable, falling back to legacy
 * names for one compatibility release. Each legacy name warns once per
 * process so old launch scripts can be updated without flooding logs.
 */
export function readTaskWeaverEnvironment(
  env: Record<string, string | undefined>,
  canonicalName: string,
  legacyNames: readonly string[] = [],
  warn: (message: string) => void = (message) => console.warn(message),
): string | undefined {
  const canonical = nonBlankEnv(env, canonicalName)
  for (const legacyName of legacyNames) {
    const legacyValue = nonBlankEnv(env, legacyName)
    if (legacyValue === undefined) continue
    if (!warnedLegacyVariables.has(legacyName)) {
      warnedLegacyVariables.add(legacyName)
      warn(`[TaskWeaver] ${legacyName} 已弃用，请改用 ${canonicalName}。旧名称将在一个版本后移除。`)
    }
    if (canonical === undefined) return legacyValue
  }
  return canonical
}

function nonBlankEnv(env: Record<string, string | undefined>, key: string): string | undefined {
  const value = env[key]
  if (value === undefined || value.trim().length === 0) return undefined
  return value
}

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
export async function canonicalizeWatchPath(path: string): Promise<string> {
  let current = resolve(path)
  const missing: string[] = []
  while (true) {
    try {
      const canonical = await realpath(current)
      if (missing.length > 0) {
        // A Windows file-as-parent probe reports ENOENT. Opening the resolved
        // ancestor preserves the cross-platform directory requirement.
        const directory = await opendir(canonical)
        await directory.close()
      }
      return join(canonical, ...missing.reverse())
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      const parent = dirname(current)
      /* v8 ignore next -- a filesystem root exists, so traversal resolves before this guard */
      if (parent === current) throw error
      missing.push(basename(current))
      current = parent
    }
  }
}

/** Resolve the default TaskWeaver runtime home. */
export function defaultRuntimeHome(): string {
  return join(homedir(), '.taskweaver', RUNTIME_HOME_DIR_NAME)
}

/** @deprecated Use {@link defaultRuntimeHome}. */
export const defaultDshHome = defaultRuntimeHome

/**
 * Expand supported tilde prefixes against the operating-system home.
 * @param path - configured path that may begin with `~`, `~/`, or `~\\`.
 * @returns the expanded path, or the original value when no supported prefix is present.
 */
export function expandHomePath(path: string): string {
  if (path === '~') return homedir()
  if (path.startsWith('~/') || path.startsWith('~\\')) {
    const suffix = sep === '/' ? path.slice(2).replaceAll('\\', '/') : path.slice(2).replaceAll('/', '\\')
    return join(homedir(), suffix)
  }
  return path
}

/**
 * Resolve the TaskWeaver runtime home. An explicit configured path wins,
 * followed by `TASKWEAVER_HOME`; old `Z_HOME` and `DSH_HOME` remain readable
 * during the compatibility window and emit a warning when used.
 */
export function resolveRuntimeHome(
  configured?: string,
  env: Record<string, string | undefined> = process.env,
): string {
  const fromEnv = readTaskWeaverEnvironment(env, TASKWEAVER_HOME_ENV, LEGACY_HOME_ENV_VARS)
  const selected = configured ?? fromEnv ?? defaultRuntimeHome()
  return resolve(expandHomePath(selected))
}

/** @deprecated Use {@link resolveRuntimeHome}. */
export const resolveDshHome = resolveRuntimeHome

/** Join path segments onto the resolved TaskWeaver runtime home. */
export function runtimeHomePath(...segments: string[]): string {
  return join(resolveRuntimeHome(), ...segments)
}

/** @deprecated Use {@link runtimeHomePath}. */
export const dshHomePath = runtimeHomePath

/** Describe a resolved runtime home without exposing a machine-specific path. */
export function runtimeHomeDisplay(resolvedHome: string): string {
  return resolvedHome === resolve(defaultRuntimeHome())
    ? DEFAULT_RUNTIME_HOME_DISPLAY
    : `$${TASKWEAVER_HOME_ENV}`
}

/** @deprecated Use {@link runtimeHomeDisplay}. */
export const dshHomeDisplay = runtimeHomeDisplay

/** Whether this process is TaskWeaver's embedded Host. */
export function taskweaverEmbeddedFromEnv(env: Record<string, string | undefined> = process.env): boolean {
  return readTaskWeaverEnvironment(env, TASKWEAVER_EMBEDDED_ENV, LEGACY_EMBEDDED_ENV_VARS) !== undefined
}
