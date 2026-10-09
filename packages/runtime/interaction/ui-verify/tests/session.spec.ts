import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { assertTaskWeaverProject, UiVerifySession, validateUiTarget } from '../src/index.ts'

let root: string | undefined

afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true })
  root = undefined
})

describe('TaskWeaver UI verify boundaries', () => {
  it('accepts only the TaskWeaver desktop root', async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'tw-ui-verify-'))
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'taskweaver-desktop', main: 'electron/main.cjs' }))
    await expect(assertTaskWeaverProject(root)).resolves.toBe(root)
  })

  it('refuses an unrelated repository before launching Electron', async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'tw-ui-verify-'))
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'other-app', main: 'electron/main.cjs' }))
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

})
