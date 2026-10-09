/**
 * The globally named `list_agents` tool: a thin model-facing adapter over
 * the continuable projection of `ctx.subagents.listChildren()` and, for the
 * `descendants` scope, `ctx.subagents.listDescendants()`. It stays separately
 * loadable from the root `send_message` plugin so a deployment can register
 * continuation delivery without exposing discovery.
 * @module @z/dsh-tool-subagent-control/list-agents
 */

import type { Context } from '@z/cordis'
import { defineTool } from '@z/dsh-tools'
import type { Agent } from '@z/dsh-agent'
import type { SessionId } from '@z/dsh-session'
import { assertNever } from '@z/dsh-llm'
import type { SubagentDescendantListEntry, SubagentListEntry } from '@z/dsh-subagent'

export const name = 'tool-subagent-list-agents'
export const inject = ['tools', 'subagents', 'agents']

type ListAgentsScope = 'children' | 'descendants'

interface ListAgentsRequest {
  readonly scope?: ListAgentsScope
}

interface ListAgentsSpec {
  readonly scope: ListAgentsScope
}

type ListAgentsEntry =
  | {
    readonly kind: 'child'
    readonly id: SessionId
    readonly label: string
    readonly status: 'running' | 'idle' | 'ready'
    readonly parent?: SessionId
    readonly depth?: number
  }
  | {
    readonly kind: 'diagnostic'
    readonly id: SessionId
    readonly reason: 'corrupt' | 'unsupported' | 'unavailable'
    readonly parent?: SessionId
    readonly depth?: number
  }

/** Resolve the optional model request into an internal required-scope spec. */
function resolveListAgentsRequest(request: ListAgentsRequest): ListAgentsSpec {
  return { scope: request.scope ?? 'children' }
}

/**
 * Refine one candidate's status through the live Agent registry: `running`
 * for an active driver, `idle` for a resident Agent between turns (possibly
 * waiting on agents it started), and `ready` when no live Agent remains.
 * `ready` preserves resumability without presenting an inactive conversation
 * as a terminal result to collect.
 */
function statusOf(agents: { get(id: SessionId): Agent | undefined }, id: SessionId): 'running' | 'idle' | 'ready' {
  const agent = agents.get(id)
  if (agent === undefined) return 'ready'
  return agent.status === 'running' ? 'running' : 'idle'
}

/** Project one service row into the model-facing entry, or omit a one-shot child. */
function project(
  agents: { get(id: SessionId): Agent | undefined },
  entry: SubagentListEntry,
  position?: Pick<SubagentDescendantListEntry, 'parentId' | 'depth'>,
): ListAgentsEntry | undefined {
  const at = position === undefined ? {} : { parent: position.parentId, depth: position.depth }
  if (entry.kind === 'diagnostic') {
    return { kind: 'diagnostic', id: entry.id, reason: entry.reason, ...at }
  }
  // One-shot children cannot be continued by send_message, so the model
  // never selects them; discovery still traversed them for descendants.
  if (entry.mode !== 'continuable') return undefined
  return {
    kind: 'child',
    id: entry.id,
    label: entry.label,
    status: statusOf(agents, entry.id),
    ...at,
  }
}

/**
 * Register the `list_agents` tool.
 * @param ctx - context carrying the tool registry, subagent service, and live Agent registry.
 */
export function apply(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'wait_agents',
    description:
      'Wait for a real lifecycle change in one of your currently running direct subagents. Use this instead '
      + 'of repeatedly calling `list_agents`: the call sleeps until at least one child stops running, the '
      + 'timeout expires, or your turn is cancelled. A child becoming idle can mean it is waiting for its own '
      + 'children, so inspect the returned snapshot before deciding what to do next. Prefer continuing useful '
      + 'independent work while background agents run; do not call this in a tight loop.',
    parameters: {
      timeout_ms: {
        type: 'number',
        description: 'Maximum wait in milliseconds (1,000–120,000; default 30,000).',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          changed: { type: 'boolean', required: true },
          statuses: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                id: { type: 'string', required: true },
                status: { type: 'string', required: true, enum: ['running', 'idle', 'ready'] },
              },
            },
          },
        },
      },
      render: (_args, result) => [{
        type: 'text',
        text: `${result.changed ? 'A subagent changed state' : 'No subagent state changed before timeout'}.\n`
          + (result.statuses.length === 0
            ? '(no continuable subagents)'
            : result.statuses.map(entry => `${entry.id} [${entry.status}]`).join('\n')),
      }],
    },
    async execute(args, exec) {
      const parent = exec.agent
      if (!parent) throw new Error('wait_agents requires a calling agent (exec.agent was undefined)')
      const timeoutMs = args.timeout_ms ?? 30_000
      if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 120_000) {
        throw new Error('wait_agents timeout_ms must be an integer from 1,000 to 120,000')
      }

      // Subscribe before taking the snapshot, then re-check live status after
      // the scan. This closes the event/snapshot race without polling.
      const childIds = new Set<SessionId>()
      const runningChildIds = new Set<SessionId>()
      const observedIdleIds = new Set<SessionId>()
      let observedChange = false
      let disposeStatus: (() => void) | undefined
      let settleWait: ((value: boolean) => void) | undefined
      const changed = new Promise<boolean>((resolve, reject) => {
        let settled = false
        const finish = (value: boolean): void => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          disposeStatus?.()
          exec.signal.removeEventListener('abort', onAbort)
          resolve(value)
        }
        const onAbort = (): void => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          disposeStatus?.()
          reject(exec.signal.reason instanceof Error ? exec.signal.reason : new Error('wait_agents cancelled'))
        }
        const timer = setTimeout(() => { finish(false) }, timeoutMs)
        settleWait = finish
        disposeStatus = ctx.on('agent/status', ({ agent, status }) => {
          if (status === 'idle') {
            observedIdleIds.add(agent.id)
            if (childIds.has(agent.id)) {
              observedChange = true
              finish(true)
            }
          }
        })
        if (exec.signal.aborted) onAbort()
        else exec.signal.addEventListener('abort', onAbort, { once: true })
      })
      // The snapshot read can fail or be cancelled before the caller reaches
      // the final await; attach a rejection observer immediately as well.
      void changed.catch(() => {})

      let children: SubagentListEntry[]
      try {
        children = await ctx.subagents.listChildren(parent.id, exec.signal)
      } catch (error) {
        settleWait?.(false)
        await changed.catch(() => undefined)
        throw error
      }
      for (const entry of children) {
        if (entry.kind !== 'child' || entry.mode !== 'continuable') continue
        childIds.add(entry.id)
        if (ctx.agents.get(entry.id)?.status === 'running') runningChildIds.add(entry.id)
      }
      // No active children means there is nothing useful to wait for.
      if (runningChildIds.size === 0) {
        observedChange = [...childIds].some(id => observedIdleIds.has(id))
        settleWait?.(observedChange)
        observedChange = await changed
      } else {
        // A child may have gone idle while the durable child catalog loaded.
        if ([...runningChildIds].some(id => ctx.agents.get(id)?.status !== 'running')
          || [...runningChildIds].some(id => observedIdleIds.has(id))) {
          observedChange = true
          settleWait?.(true)
        }
        observedChange = await changed
      }

      const statuses = children
        .filter((entry): entry is Extract<SubagentListEntry, { kind: 'child' }> =>
          entry.kind === 'child' && entry.mode === 'continuable')
        .map(entry => ({ id: entry.id, status: statusOf(ctx.agents, entry.id) }))
      return { changed: observedChange, statuses }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'list_agents',
    description:
      'List your continuable background subagents by durable id and label. Use it to recall which ones '
      + 'you started, not to poll for completion. When you must wait, call `wait_agents` to sleep until a real '
      + 'state change instead of repeatedly taking snapshots. Status comes from the live '
      + 'registry: running means the agent is working right now, idle means it is loaded but between turns '
      + '(it may be waiting on agents it started), and ready means it exists only in storage — resumable, not '
      + 'terminal, and not a result waiting to be collected; a `send_message` starts a new turn on the same '
      + 'conversation, and a direct child remains a `send_message` candidate in every status. The snapshot is not a delivery '
      + 'promise — `send_message` performs the authoritative check and may still fail. Children that could '
      + 'not be read are reported as diagnostics instead of being silently dropped. Scope `descendants` '
      + 'walks the whole tree below you in stable pre-order, annotating each entry with its durable direct-parent '
      + 'session id and depth. You may use `send_message` only for depth-1 entries; deeper entries are '
      + 'candidates for `interrupt_agent` only.',
    parameters: {
      scope: {
        type: 'string',
        enum: ['children', 'descendants'],
        description: 'children (default) lists direct children only; descendants walks the complete tree below you.',
      },
    },
    output: {
      schema: {
        type: 'array',
        items: {
          oneOf: [
            {
              type: 'object',
              additionalProperties: false,
              properties: {
                kind: { type: 'string', required: true, enum: ['child'] },
                id: { type: 'string', required: true },
                label: { type: 'string', required: true },
                status: { type: 'string', required: true, enum: ['running', 'idle', 'ready'] },
                parent: { type: 'string' },
                depth: { type: 'number' },
              },
            },
            {
              type: 'object',
              additionalProperties: false,
              properties: {
                kind: { type: 'string', required: true, enum: ['diagnostic'] },
                id: { type: 'string', required: true },
                reason: { type: 'string', required: true, enum: ['corrupt', 'unsupported', 'unavailable'] },
                parent: { type: 'string' },
                depth: { type: 'number' },
              },
            },
          ],
        },
      },
      render: (args, entries) => {
        const request = resolveListAgentsRequest(args)
        return [{
          type: 'text',
          text: entries.length === 0
            ? '(no subagents)'
            : entries.map((entry) => {
              // A descendants row always carries its position; children rows
              // never render it. String() spans the schema-optional shape
              // without a dead fallback branch.
              const at = request.scope === 'descendants'
                ? ` parent=${String(entry.parent)} depth=${String(entry.depth)}`
                : ''
              return entry.kind === 'child'
                ? `${entry.id} [${entry.status}]${at} — ${entry.label}`
                : `${entry.id} [diagnostic: ${entry.reason}]${at}`
            }).join('\n'),
        }]
      },
    },
    async execute(args, exec) {
      const parent = exec.agent
      if (!parent) {
        // Non-agent callers have no session whose children could be listed.
        throw new Error('list_agents requires a calling agent (exec.agent was undefined)')
      }
      const request = resolveListAgentsRequest(args)
      // The registry drains started tool bodies, so the scan must observe the
      // call's signal rather than finish a slow catalog after cancellation.
      switch (request.scope) {
        case 'children': {
          const entries = await ctx.subagents.listChildren(parent.id, exec.signal)
          return entries
            .map(entry => project(ctx.agents, entry))
            .filter(entry => entry !== undefined)
        }
        case 'descendants': {
          const entries = await ctx.subagents.listDescendants(parent.id, exec.signal)
          return entries
            .map(entry => project(ctx.agents, entry, entry))
            .filter(entry => entry !== undefined)
        }
        /* v8 ignore next 2 -- the resolver normalizes the schema-validated closed scope before dispatch. */
        default:
          return assertNever(request.scope, 'list_agents scope')
      }
    },
  }))
}
