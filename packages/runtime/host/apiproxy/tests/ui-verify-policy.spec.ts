import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Agent } from '@taskweaver/dsh-agent'
import { createUiVerifyPolicyService } from '../src/ui-verify-policy.ts'

function agent(id: string, cwd?: string): Agent {
  return {
    id,
    session: { id, header: { ...(cwd === undefined ? {} : { cwd }) } },
  } as unknown as Agent
}

describe('Host UI verification policy handoff', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('stores artifacts under the canonical runtime home', async () => {
    vi.stubEnv('TASKWEAVER_HOME', '/private/taskweaver-runtime')
    const service = createUiVerifyPolicyService()
    const subject = agent('session-canonical', '/workspace/taskweaver')
    service.update(subject, { workspaceTrusted: true, autoAllowUiVerify: false })

    await expect(service.getWorkspace(subject)).resolves.toMatchObject({
      artifactsDir: path.join('/private/taskweaver-runtime', 'ui-verify', 'session-canonical'),
    })
  })

  it('fails closed until Electron supplies both policy booleans', async () => {
    const service = createUiVerifyPolicyService('/private/host/ui-verify')
    const subject = agent('session 1', '/workspace/taskweaver')

    expect(await service.getWorkspace(subject)).toBeUndefined()
    service.update(subject, { workspaceTrusted: true })
    expect(await service.getWorkspace(subject)).toBeUndefined()
    service.update(subject, undefined)
    expect(await service.getWorkspace(subject)).toBeUndefined()
  })

  it('uses only the immutable session cwd and Host artifact root', async () => {
    const service = createUiVerifyPolicyService('/private/host/ui-verify')
    const subject = agent('session/2', '/workspace/taskweaver')
    service.update(subject, {
      workspaceTrusted: true,
      autoAllowUiVerify: true,
      root: '/model/controlled/root',
      artifactsDir: '/model/controlled/artifacts',
    } as never)

    await expect(service.getWorkspace(subject)).resolves.toEqual({
      root: '/workspace/taskweaver',
      trusted: true,
      autoAllow: true,
      artifactsDir: path.join('/private/host/ui-verify', encodeURIComponent('session/2')),
    })
  })

  it('preserves explicit untrusted and auto-allow-off decisions', async () => {
    const service = createUiVerifyPolicyService('/private/host/ui-verify')
    const subject = agent('session-3', '/workspace/taskweaver')
    service.update(subject, { workspaceTrusted: false, autoAllowUiVerify: true })
    await expect(service.getWorkspace(subject)).resolves.toMatchObject({ trusted: false, autoAllow: true })
    service.update(subject, { workspaceTrusted: true, autoAllowUiVerify: false })
    await expect(service.getWorkspace(subject)).resolves.toMatchObject({ trusted: true, autoAllow: false })
  })

  it('fails closed when the session has no absolute workspace cwd', async () => {
    const service = createUiVerifyPolicyService('/private/host/ui-verify')
    const subject = agent('session-4', 'relative/path')
    service.update(subject, { workspaceTrusted: true, autoAllowUiVerify: true })
    expect(await service.getWorkspace(subject)).toBeUndefined()
  })
})
