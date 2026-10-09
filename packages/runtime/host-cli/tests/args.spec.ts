import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseDshArgs } from '../src/args.ts'

const parse = (argv: string[]) => parseDshArgs(argv, '1.2.3')

/** Capture the process exit code while muting Commander's output. */
function exitCode(argv: string[]): number {
  const exit = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit') })
  vi.spyOn(process.stdout, 'write').mockReturnValue(true)
  vi.spyOn(process.stderr, 'write').mockReturnValue(true)
  try {
    parse(argv)
    throw new Error(`expected ${JSON.stringify(argv)} to exit`)
  } catch {
    return exit.mock.calls.at(-1)?.[0] as number
  } finally {
    vi.restoreAllMocks()
  }
}

afterEach(() => { vi.restoreAllMocks() })

describe('parseDshArgs', () => {
  it('routes a named profile and its launcher overlays', () => {
    expect(parse(['--profile', 'taskweaver'])).toEqual({ mode: 'profile', profile: 'taskweaver', patches: [], args: [] })
    expect(parse(['--profile', 'taskweaver', '--patch', 'a.yml', '--patch', 'b.yml']))
      .toEqual({ mode: 'profile', profile: 'taskweaver', patches: ['a.yml', 'b.yml'], args: [] })
  })

  it('ends the launcher flags at the first token it does not own', () => {
    // App flags, including its -h, and positionals reach the app verbatim.
    expect(parse(['--profile', 'taskweaver', '--resume', 'abc']))
      .toEqual({ mode: 'profile', profile: 'taskweaver', patches: [], args: ['--resume', 'abc'] })
    expect(parse(['--profile', 'taskweaver', '-h']))
      .toEqual({ mode: 'profile', profile: 'taskweaver', patches: [], args: ['-h'] })
    expect(parse(['--profile', 'taskweaver', '--host', '127.0.0.1', '--future-app-flag']))
      .toEqual({ mode: 'profile', profile: 'taskweaver', patches: [], args: ['--host', '127.0.0.1', '--future-app-flag'] })
    expect(parse(['--profile', 'taskweaver', 'run', 'the', 'tests']))
      .toEqual({ mode: 'profile', profile: 'taskweaver', patches: [], args: ['run', 'the', 'tests'] })
    // Launcher flags placed after that boundary belong to the app too.
    expect(parse(['--profile', 'taskweaver', '--patch', 'a.yml', '--resume', 'b', '--patch', 'late.yml']))
      .toEqual({ mode: 'profile', profile: 'taskweaver', patches: ['a.yml'], args: ['--resume', 'b', '--patch', 'late.yml'] })
  })

  it('routes the plugin pnpm forwarder', () => {
    expect(parse(['plugin', '--profile', 'tui', 'add', 'turtle-ui']))
      .toEqual({ mode: 'plugin', profile: 'tui', args: ['add', 'turtle-ui'] })
    expect(parse(['plugin', '--profile', 'tui', 'remove', 'turtle-ui']))
      .toEqual({ mode: 'plugin', profile: 'tui', args: ['remove', 'turtle-ui'] })
    expect(parse(['plugin', '--profile', 'tui', 'why', '@z/cordis']))
      .toEqual({ mode: 'plugin', profile: 'tui', args: ['why', '@z/cordis'] })
    // Unknown pnpm flags forward verbatim.
    expect(parse(['plugin', '--profile', 'tui', 'add', '--save-dev', 'x']))
      .toEqual({ mode: 'plugin', profile: 'tui', args: ['add', '--save-dev', 'x'] })
  })

  it('routes config dumps for a named profile', () => {
    expect(parse(['--profile', 'taskweaver', '--dump-config']))
      .toEqual({ mode: 'dump-config', profile: 'taskweaver', defaultOnly: false, patches: [] })
    expect(parse(['--profile', 'taskweaver', '--dump-default-config']))
      .toEqual({ mode: 'dump-config', profile: 'taskweaver', defaultOnly: true, patches: [] })
    expect(parse(['--profile', 'custom', '--dump-config', '--patch', 'x.yml']))
      .toEqual({ mode: 'dump-config', profile: 'custom', defaultOnly: false, patches: ['x.yml'] })
  })

  it('rejects missing profile, removed flags, and contradictory inputs', () => {
    expect(exitCode([])).toBe(1)
    expect(exitCode(['tui'])).toBe(1) // an app argument without --profile has no app to reach
    expect(exitCode(['--config', 'c.yml'])).toBe(1) // removed
    expect(exitCode(['-p', 'task'])).toBe(1) // removed
    expect(exitCode(['run', 'task'])).toBe(1) // app-owned task replaced the launcher subcommand
    expect(exitCode(['--profile', ''])).toBe(1)
    expect(exitCode(['--profile', 'x', '--patch='])).toBe(1)
    expect(exitCode(['--dump-config'])).toBe(1)
    expect(exitCode(['--profile', 'x', '--dump-config', '--dump-default-config'])).toBe(1)
    expect(exitCode(['--profile', 'x', '--dump-default-config', '--patch', 'p.yml'])).toBe(1)
    expect(exitCode(['--profile', 'x', '--dump-config', 'task'])).toBe(1)
    expect(exitCode(['--bogus'])).toBe(1)
    expect(exitCode(['web'])).toBe(1) // the removed alias does not select a profile
    expect(exitCode(['--profile', 'taskweaver', '--dump-config', '-h'])).toBe(1)
    expect(parse(['--profile', 'custom', 'serve']))
      .toEqual({ mode: 'profile', profile: 'custom', patches: [], args: ['serve'] })
    expect(exitCode(['plugin', 'add', 'x'])).toBe(1) // --profile required
    expect(exitCode(['plugin', '--profile', 'tui'])).toBe(1) // nothing to forward
    expect(exitCode(['plugin', '--profile', ''])).toBe(1)
    expect(exitCode(['--profile', 'x', 'plugin', 'add', 'y'])).toBe(1)
  })

  it('keeps its own help for an invocation with no app to hand it to', () => {
    expect(exitCode(['--help'])).toBe(0)
    expect(exitCode(['-h'])).toBe(0)
    expect(exitCode(['--version'])).toBe(0)
  })
})
