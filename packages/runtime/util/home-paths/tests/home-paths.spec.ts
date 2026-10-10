import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_RUNTIME_HOME_DISPLAY,
  DSH_HOME_ENV,
  TASKWEAVER_HOME_ENV,
  TASKWEAVER_EMBEDDED_ENV,
  RUNTIME_HOME_DIR_NAME,
  canonicalizeWatchPath,
  defaultRuntimeHome,
  dshHomePath,
  expandHomePath,
  readTaskWeaverEnvironment,
  resolveDshHome,
  resolveRuntimeHome,
  runtimeHomeDisplay,
  runtimeHomePath,
  taskweaverEmbeddedFromEnv,
  Z_HOME_ENV,
} from '@taskweaver/dsh-home-paths'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('TaskWeaver runtime home helpers', () => {
  it('owns the default runtime directory under the TaskWeaver namespace', () => {
    expect(RUNTIME_HOME_DIR_NAME).toBe('runtime')
    expect(DEFAULT_RUNTIME_HOME_DISPLAY).toBe('~/.taskweaver/runtime')
    expect(defaultRuntimeHome()).toBe(join(homedir(), '.taskweaver', 'runtime'))
  })

  it('expands tilde paths without changing non-tilde paths', () => {
    expect(expandHomePath('~')).toBe(homedir())
    expect(expandHomePath('~/.taskweaver/runtime')).toBe(join(homedir(), '.taskweaver', 'runtime'))
    expect(expandHomePath('~\\.taskweaver\\runtime')).toBe(join(homedir(), '.taskweaver', 'runtime'))
    expect(expandHomePath('/tmp/.taskweaver/runtime')).toBe('/tmp/.taskweaver/runtime')
    expect(expandHomePath('~other/.taskweaver/runtime')).toBe('~other/.taskweaver/runtime')
  })

  it('prefers configured and canonical paths, then accepts legacy variables', () => {
    const canonical = join(homedir(), 'canonical-runtime')
    const zHome = join(homedir(), 'old-z-home')
    const dshHome = join(homedir(), 'old-dsh-home')
    expect(resolveRuntimeHome('/tmp/explicit-runtime', { [TASKWEAVER_HOME_ENV]: canonical, Z_HOME: zHome })).toBe(resolve('/tmp/explicit-runtime'))
    expect(resolveRuntimeHome(undefined, { [TASKWEAVER_HOME_ENV]: '~/canonical-runtime', Z_HOME: zHome })).toBe(canonical)
    expect(resolveRuntimeHome(undefined, { [Z_HOME_ENV]: '~/old-z-home', [DSH_HOME_ENV]: '~/old-dsh-home' })).toBe(zHome)
    expect(resolveRuntimeHome(undefined, { [DSH_HOME_ENV]: '~/old-dsh-home' })).toBe(dshHome)
    expect(resolveRuntimeHome(undefined, {})).toBe(defaultRuntimeHome())
  })

  it('warns once when a legacy environment name is consumed', () => {
    const warn = vi.fn()
    const env = { OLD_TASKWEAVER_HOME_COMPAT_TEST: '/tmp/old-home' }
    expect(readTaskWeaverEnvironment(env, TASKWEAVER_HOME_ENV, ['OLD_TASKWEAVER_HOME_COMPAT_TEST'], warn)).toBe('/tmp/old-home')
    expect(readTaskWeaverEnvironment(env, TASKWEAVER_HOME_ENV, ['OLD_TASKWEAVER_HOME_COMPAT_TEST'], warn)).toBe('/tmp/old-home')
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]?.[0]).toContain(TASKWEAVER_HOME_ENV)
  })

  it('reads the canonical embedded flag and accepts legacy flags', () => {
    expect(taskweaverEmbeddedFromEnv({ [TASKWEAVER_EMBEDDED_ENV]: '1' })).toBe(true)
    expect(taskweaverEmbeddedFromEnv({ Z_TASKWEAVER_EMBEDDED: '1' })).toBe(true)
    expect(taskweaverEmbeddedFromEnv({ DSH_TASKWEAVER_EMBEDDED: '1' })).toBe(true)
    expect(taskweaverEmbeddedFromEnv({})).toBe(false)
  })

  it('treats blank home overrides as unset', () => {
    expect(resolveRuntimeHome(undefined, { [TASKWEAVER_HOME_ENV]: '' })).toBe(defaultRuntimeHome())
    expect(resolveRuntimeHome(undefined, { [TASKWEAVER_HOME_ENV]: '   ', [DSH_HOME_ENV]: '  ' })).toBe(defaultRuntimeHome())
  })

  it('joins paths and keeps deprecated helper names as aliases', () => {
    vi.stubEnv(TASKWEAVER_HOME_ENV, '~/custom-runtime')
    expect(runtimeHomePath()).toBe(join(homedir(), 'custom-runtime'))
    expect(runtimeHomePath('sessions', 'cache')).toBe(join(homedir(), 'custom-runtime', 'sessions', 'cache'))
    expect(resolveDshHome()).toBe(resolveRuntimeHome())
    expect(dshHomePath('sessions')).toBe(runtimeHomePath('sessions'))
  })

  it('labels the default and custom runtime roots without exposing absolute paths', () => {
    expect(runtimeHomeDisplay(resolve(defaultRuntimeHome()))).toBe('~/.taskweaver/runtime')
    expect(runtimeHomeDisplay('/some/other/root')).toBe('$TASKWEAVER_HOME')
  })

  it('canonicalizes a watcher ancestor while preserving a missing suffix', async () => {
    const root = await mkdtemp(join(tmpdir(), 'taskweaver-watch-path-'))
    const target = join(root, 'target')
    const alias = join(root, 'alias')
    try {
      await mkdir(target)
      await symlink(target, alias, process.platform === 'win32' ? 'junction' : 'dir')
      await expect(canonicalizeWatchPath(join(alias, 'later', 'config.yml'))).resolves.toBe(
        join(await realpath(target), 'later', 'config.yml'),
      )
      const file = join(root, 'file')
      await writeFile(file, 'not a directory')
      await expect(canonicalizeWatchPath(join(file, 'child'))).rejects.toMatchObject({ code: 'ENOTDIR' })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
