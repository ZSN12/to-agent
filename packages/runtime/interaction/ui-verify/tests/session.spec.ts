import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  assertTaskWeaverProject,
  createUiVerifyEnvironment,
  UiVerifySession,
  validateUiTarget,
} from '../src/index.ts'

let root: string | undefined

afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true })
  root = undefined
})

describe('TaskWeaver UI verify boundaries', () => {
  it('accepts only the TaskWeaver desktop root', async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'tw-ui-verify-'))
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'taskweaver-desktop' }))
    await mkdir(path.join(root, 'desktop/shell'), { recursive: true })
    await writeFile(path.join(root, 'desktop/shell/run.mjs'), 'export {}\n')
    await expect(assertTaskWeaverProject(root)).resolves.toBe(await realpath(root))
  })

  it('refuses an unrelated repository before launching the shell driver', async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'tw-ui-verify-'))
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'other-app' }))
    await expect(UiVerifySession.launch({ root, artifactsDir: path.join(root, 'artifacts') }))
      .rejects.toThrow('only for a TaskWeaver repository')
  })

  it('accepts only testid or exact accessible role/name targets', () => {
    expect(() => validateUiTarget({ testId: 'message-input' })).not.toThrow()
    expect(() => validateUiTarget({ role: 'button', name: '发送' })).not.toThrow()
    expect(() => validateUiTarget({ testId: ' ' } as never)).toThrow(/non-empty testId/)
    expect(() => validateUiTarget({ role: 'button', name: '' } as never)).toThrow(/non-empty accessible name/)
    expect(() => validateUiTarget({ selector: '.dangerous' } as never)).toThrow(/testid or role\/name/)
    expect(() => validateUiTarget({ testId: 'send', role: 'button', name: 'Send' } as never)).toThrow(/only a non-empty testId/)
  })

  it('isolates userData and the canonical runtime home without inheriting credentials or legacy home paths', () => {
    const env = createUiVerifyEnvironment('/tmp/taskweaver-ui-verify/session/user-data', {
      PATH: '/usr/bin',
      HOME: '/Users/example',
      TASKWEAVER_HOME: '/Users/example/.taskweaver/runtime',
      TASKWEAVER_RUNTIME: '/Users/example/old-vendor-runtime',
      Z_HOME: '/Users/example/.dsh',
      DSH_HOME: '/Users/example/.dsh',
      OPENAI_API_KEY: 'must-not-inherit',
      BRIDGE_SMOKE_MOCK: 'must-not-inherit',
    }, '/tmp/taskweaver-checkout/packages/runtime', '/tmp/taskweaver-ui-verify/session/startup-trace.jsonl')
    expect(env.TASKWEAVER_USER_DATA).toBe('/tmp/taskweaver-ui-verify/session/user-data')
    expect(env.TASKWEAVER_HOME).toBe('/tmp/taskweaver-ui-verify/session/user-data/runtime-home')
    expect(env.TASKWEAVER_RUNTIME).toBe('/tmp/taskweaver-checkout/packages/runtime')
    expect(env.TASKWEAVER_STARTUP_TRACE).toBe('1')
    expect(env.TASKWEAVER_STARTUP_TRACE_FILE).toBe('/tmp/taskweaver-ui-verify/session/startup-trace.jsonl')
    expect(env.TASKWEAVER_UI_VERIFY_MOCK).toBe('1')
    expect(env.Z_HOME).toBeUndefined()
    expect(env.DSH_HOME).toBeUndefined()
    expect(env.OPENAI_API_KEY).toBeUndefined()
    expect(env.BRIDGE_SMOKE_MOCK).toBeUndefined()
  })

})
