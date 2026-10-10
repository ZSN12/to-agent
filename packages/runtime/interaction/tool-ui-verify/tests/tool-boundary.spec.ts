import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Context } from '@taskweaver/cordis'
import type { Agent } from '@taskweaver/dsh-agent'
import { apply } from '../src/index.ts'

const TASKWEAVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../')
let temporaryRoot: string | undefined

afterEach(async () => {
  if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true })
  temporaryRoot = undefined
})

function pluginContext(root?: string): { context: Context; registered: Array<{ name: string; execute: Function }> } {
  const registered: Array<{ name: string; execute: Function }> = []
  const agent = root === undefined
    ? undefined
    : { session: { id: 'test-session', header: { cwd: root } } } as unknown as Agent
  const context = {
    agent,
    tools: {
      register(definition: { name: string; execute: Function }) {
        registered.push(definition)
        return () => undefined
      },
    },
    on: vi.fn(),
  } as unknown as Context
  return { context, registered }
}

describe('TaskWeaver UI verification tool boundary', () => {
  it('does not publish UI control tools in a non-TaskWeaver repository', async () => {
    temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'tw-ui-verify-outside-'))
    await writeFile(path.join(temporaryRoot, 'package.json'), JSON.stringify({ name: 'other-app', main: 'desktop/main.cjs' }))
    const { context, registered } = pluginContext(temporaryRoot)

    apply(context, { nativeFallbackEnabled: false })

    expect(registered).toHaveLength(0)
  })

  it('publishes only the bounded UI verification tool set in the TaskWeaver repository', () => {
    const { context, registered } = pluginContext(TASKWEAVER_ROOT)

    apply(context, { nativeFallbackEnabled: false })

    expect(registered.map(tool => tool.name)).toEqual([
      'ui_launch', 'ui_snapshot', 'ui_act', 'ui_screenshot', 'ui_check', 'ui_close',
    ])
  })

  it('fails closed when the Host policy provider is missing', async () => {
    const { context, registered } = pluginContext(TASKWEAVER_ROOT)
    apply(context, { nativeFallbackEnabled: false })
    const launch = registered.find(tool => tool.name === 'ui_launch')
    const agent = (context as unknown as { agent: Agent }).agent

    await expect(launch?.execute({}, { agent })).rejects.toThrow(/did not inject uiVerifyPolicy/)
  })
})
