import { describe, expect, it } from 'vitest'
import { Context } from '@taskweaver/cordis'
import AgentRegistry, { type Agent } from '@taskweaver/dsh-agent'
import SessionStore from '@taskweaver/dsh-session'
import OrchestrationService from '@taskweaver/dsh-orchestration'
import UserQuestionService from '@taskweaver/dsh-user-questions'
import type { ApiProxy, MuxFrame, RpcRequest } from '@taskweaver/dsh-host-apiproxy/api'
import { RpcId } from '@taskweaver/dsh-host-apiproxy/api/rpc'
import { createApiProxy } from '../src/api-proxy.ts'

async function harness(): Promise<{ ctx: Context; api: ApiProxy }> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(OrchestrationService)
  await ctx.plugin(UserQuestionService)
  return {
    ctx,
    api: createApiProxy(ctx, { defaultModelSelection: () => ({ provider: 'p', model: 'm' }), cwd: '/tmp' }),
  }
}

function agent(ctx: Context): Agent {
  const session = ctx.sessions.create()
  const value = { id: session.id, session, status: 'idle', ctx, inbox: { hasPending: false } } as Agent
  ctx.agents.register(value)
  return value
}

function openMux(api: ApiProxy, abort: AbortController): {
  envelopes: RpcRequest<MuxFrame>[]
  waitFor(type: 'orchestration/requested' | 'orchestration/cancelled'): Promise<RpcRequest<MuxFrame>>
} {
  const envelopes: RpcRequest<MuxFrame>[] = []
  const waiters = new Map<string, ((envelope: RpcRequest<MuxFrame>) => void)[]>()
  void (async () => {
    for await (const envelope of api.events.mux({ rpcId: RpcId('orchestration-mux'), payload: {} }, abort.signal)) {
      envelopes.push(envelope)
      const resolve = waiters.get(envelope.payload.type)?.shift()
      resolve?.(envelope)
    }
  })()
  return {
    envelopes,
    waitFor(type) {
      const found = envelopes.find(envelope => envelope.payload.type === type)
      if (found !== undefined) return Promise.resolve(found)
      return new Promise(resolve => {
        const queue = waiters.get(type) ?? []
        queue.push(resolve)
        waiters.set(type, queue)
      })
    },
  }
}

function requested(envelope: RpcRequest<MuxFrame>): Extract<MuxFrame, { type: 'orchestration/requested' }> {
  if (envelope.payload.type !== 'orchestration/requested') throw new Error(`unexpected frame: ${envelope.payload.type}`)
  return envelope.payload
}

function cancellationPayload(envelope: RpcRequest<MuxFrame>): Extract<MuxFrame, { type: 'orchestration/cancelled' }> {
  if (envelope.payload.type !== 'orchestration/cancelled') throw new Error(`unexpected frame: ${envelope.payload.type}`)
  return envelope.payload
}

describe('orchestration provider over the host mux', () => {
  it('round-trips a model request and validates the session-correlated result', async () => {
    const { ctx, api } = await harness()
    const abort = new AbortController()
    const mux = openMux(api, abort)
    const caller = agent(ctx)
    const running = ctx.orchestration.run({
      goal: 'build feature', context: 'entry point is src/main.ts', readOnly: true,
      callId: 'tool-call-1', agent: caller,
    })
    const frame = requested(await mux.waitFor('orchestration/requested'))
    expect(frame).toMatchObject({
      sessionId: caller.id, callId: 'tool-call-1', goal: 'build feature',
      context: 'entry point is src/main.ts', readOnly: true,
    })
    const envelope = mux.envelopes.find(item => item.payload.type === 'orchestration/requested')!

    expect(await api.respond({
      type: 'client-response',
      rpcId: envelope.rpcId,
      result: { ok: true, value: {
        sessionId: caller.id, summary: 'completed', runId: 'run-1',
        taskCount: 3, failedTaskCount: 1, cancelled: false,
        taskStatuses: [{ id: 'T1', title: '实施', status: 'completed' }], changedFiles: ['src/main.ts'],
      } },
    })).toEqual({ accepted: true })
    await expect(running).resolves.toEqual({
      summary: 'completed', runId: 'run-1', taskCount: 3, failedTaskCount: 1, cancelled: false,
      taskStatuses: [{ id: 'T1', title: '实施', status: 'completed' }], changedFiles: ['src/main.ts'],
    })
    expect(await api.respond({
      type: 'client-response', rpcId: envelope.rpcId, result: { ok: false, error: { code: 'cancelled', message: 'late', details: {} } },
    })).toEqual({ accepted: false, reason: 'not-pending' })
    abort.abort()
  })

  it('replays a pending request on reconnect with the same rpc id', async () => {
    const { ctx, api } = await harness()
    const firstAbort = new AbortController()
    const firstMux = openMux(api, firstAbort)
    const caller = agent(ctx)
    const running = ctx.orchestration.run({ goal: 'keep pending', callId: 'tool-call-2', agent: caller })
    const firstEnvelope = await firstMux.waitFor('orchestration/requested')
    firstAbort.abort()

    const secondAbort = new AbortController()
    const secondMux = openMux(api, secondAbort)
    const replay = await secondMux.waitFor('orchestration/requested')
    expect(replay.rpcId).toBe(firstEnvelope.rpcId)
    expect(replay.payload).toEqual(firstEnvelope.payload)
    const replayFrame = requested(replay)
    const requestEnvelope = secondMux.envelopes.find(item => item.payload.type === 'orchestration/requested')!
    await api.respond({
      type: 'client-response', rpcId: requestEnvelope.rpcId,
      result: { ok: true, value: {
        sessionId: replayFrame.sessionId, summary: 'done', runId: null,
        taskCount: 0, failedTaskCount: 0, cancelled: false, taskStatuses: [], changedFiles: [],
      } },
    })
    await expect(running).resolves.toMatchObject({ summary: 'done' })
    secondAbort.abort()
  })

  it('withdraws the desktop request when the calling tool aborts', async () => {
    const { ctx, api } = await harness()
    const muxAbort = new AbortController()
    const mux = openMux(api, muxAbort)
    const caller = agent(ctx)
    const controller = new AbortController()
    const running = ctx.orchestration.run({
      goal: 'cancel me', callId: 'tool-call-3', agent: caller, signal: controller.signal,
    })
    await mux.waitFor('orchestration/requested')
    controller.abort(new Error('turn ended'))

    const cancelledEnvelope = await mux.waitFor('orchestration/cancelled')
    expect(cancelledEnvelope.payload).toMatchObject({ type: 'orchestration/cancelled', sessionId: caller.id })
    await expect(running).rejects.toMatchObject({ code: 'ORCHESTRATION_ABORTED' })
    const cancelledPayload = cancellationPayload(cancelledEnvelope)
    expect(await api.respond({
      type: 'client-response', rpcId: cancelledPayload.orchestrationRpcId,
      result: { ok: false, error: { code: 'cancelled', message: 'runner stopped', details: {} } },
    })).toEqual({ accepted: true })
    expect(await api.respond({
      type: 'client-response', rpcId: cancelledPayload.orchestrationRpcId,
      result: { ok: false, error: { code: 'cancelled', message: 'duplicate ack', details: {} } },
    })).toEqual({ accepted: false, reason: 'not-pending' })
    muxAbort.abort()
  })

  it('replays cancellation after the mux disconnects and retires it on desktop acknowledgement', async () => {
    const { ctx, api } = await harness()
    const firstAbort = new AbortController()
    const firstMux = openMux(api, firstAbort)
    const caller = agent(ctx)
    const controller = new AbortController()
    const running = ctx.orchestration.run({
      goal: 'cancel while disconnected', callId: 'tool-call-4', agent: caller, signal: controller.signal,
    })
    const request = await firstMux.waitFor('orchestration/requested')
    firstAbort.abort()
    controller.abort(new Error('turn ended without a mux'))
    await expect(running).rejects.toMatchObject({ code: 'ORCHESTRATION_ABORTED' })

    const secondAbort = new AbortController()
    const secondMux = openMux(api, secondAbort)
    const cancelledEnvelope = await secondMux.waitFor('orchestration/cancelled')
    const cancelledPayload = cancellationPayload(cancelledEnvelope)
    expect(cancelledEnvelope.rpcId).not.toBe(request.rpcId)
    expect(cancelledPayload).toEqual({
      type: 'orchestration/cancelled', sessionId: caller.id, orchestrationRpcId: request.rpcId,
    })
    expect(await api.respond({
      type: 'client-response', rpcId: request.rpcId,
      result: { ok: false, error: { code: 'cancelled', message: 'runner already stopped', details: {} } },
    })).toEqual({ accepted: true })

    const thirdAbort = new AbortController()
    const thirdMux = openMux(api, thirdAbort)
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(thirdMux.envelopes.some(item => item.payload.type === 'orchestration/cancelled')).toBe(false)
    secondAbort.abort()
    thirdAbort.abort()
  })
})
