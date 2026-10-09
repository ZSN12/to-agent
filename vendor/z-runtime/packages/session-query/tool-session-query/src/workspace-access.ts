/**
 * Caller identity, workspace authorization, and visible lineage projection.
 *
 * @module @z/dsh-tool-session-query/workspace-access
 */

import type { Context } from '@z/cordis'
import { HarnessError } from '@z/dsh-llm'
import { execFile } from 'node:child_process'
import { realpath } from 'node:fs/promises'
import path from 'node:path'
import {
  SessionId,
  type SessionEvent,
  type SessionHeader,
  type SessionId as SessionIdValue,
} from '@z/dsh-session'
import type {
  SessionLineageNode,
  SessionRecord,
} from '@z/dsh-session-query'
import type { ToolRunContext } from '@z/dsh-tools'
import { serviceBoundary } from './service-boundary.ts'

interface Caller {
  readonly id: SessionIdValue
  readonly header: SessionHeader
  readonly events: readonly SessionEvent[]
  readonly repositoryIdentity: (cwd: string) => Promise<string | null>
}

interface TitleView {
  readonly text: string
  readonly unavailableCode?: string
}

interface CompleteTitleMap extends ReadonlyMap<SessionIdValue, TitleView> {
  get(id: SessionIdValue): TitleView
}

interface AuthorizedDescendant {
  readonly record: SessionRecord
  readonly descendants: Array<AuthorizedDescendant | null>
}

interface DescendantProjectionFrame {
  readonly node: SessionLineageNode
  readonly target: Array<AuthorizedDescendant | null>
  readonly next: DescendantProjectionFrame | undefined
}

interface DescendantVisit {
  readonly node: AuthorizedDescendant | null
  readonly depth: number
  readonly next: DescendantVisit | undefined
}

function callerOf(exec: ToolRunContext): Caller {
  const agent = exec.agent
  if (agent === undefined) {
    throw new HarnessError(
      'session query tools require an agent-bound caller',
      'SESSION_QUERY_TOOL_MISSING_AGENT',
    )
  }
  const identities = new Map<string, Promise<string | null>>()
  return {
    id: agent.session.id,
    header: agent.session.header,
    events: agent.session.events,
    repositoryIdentity(cwd) {
      let pending = identities.get(cwd)
      if (pending === undefined) {
        pending = resolveRepositoryIdentity(cwd)
        identities.set(cwd, pending)
      }
      return pending
    },
  }
}

function targetId(args: { readonly session_id?: string }, caller: Caller): SessionIdValue {
  return args.session_id === undefined ? caller.id : SessionId(args.session_id)
}

async function authorizeTarget(
  ctx: Context,
  caller: Caller,
  target: SessionIdValue,
  signal: AbortSignal,
): Promise<void> {
  if (target === caller.id) return
  const records = await serviceBoundary.call(ctx, signal, 'target authorization', () =>
    ctx.sessionQuery.filterSessions([{ kind: 'id', values: [target] }], signal))
  if (records.length !== 1 || !(await recordAuthorized(records[0]!, caller))) {
    throw serviceBoundary.unauthorizedTarget()
  }
}

function recordAuthorized(record: SessionRecord, caller: Caller): Promise<boolean> {
  return headerAuthorized(record.header, caller)
}

async function headerAuthorized(header: SessionHeader, caller: Caller): Promise<boolean> {
  const callerCwd = caller.header.cwd
  const targetCwd = header.cwd
  // A session cannot become a different workspace merely by reusing its id.
  if (header.id === caller.id) return targetCwd === callerCwd
  if (callerCwd === undefined || targetCwd === undefined) return false
  if (targetCwd === callerCwd) return true
  const [callerRoot, targetRoot] = await Promise.all([
    caller.repositoryIdentity(callerCwd),
    caller.repositoryIdentity(targetCwd),
  ])
  return callerRoot !== null && callerRoot === targetRoot
}

function assertObservedTargetAuthorized(
  caller: Caller,
  target: SessionIdValue,
  observed: SessionHeader,
): Promise<void> {
  return (async () => {
    if (observed.id !== target || !(await headerAuthorized(observed, caller))) {
      throw serviceBoundary.unauthorizedTarget()
    }
  })()
}

async function authorizeSessionIds(
  ctx: Context,
  caller: Caller,
  ids: readonly SessionIdValue[],
  signal: AbortSignal,
): Promise<ReadonlySet<SessionIdValue>> {
  const unique = [...new Set(ids)]
  const authorized = new Set<SessionIdValue>()
  if (unique.includes(caller.id)) authorized.add(caller.id)
  const other = unique.filter(id => id !== caller.id)
  if (other.length === 0) return authorized
  const records = await serviceBoundary.call(ctx, signal, 'session-id authorization', () =>
    ctx.sessionQuery.filterSessions([{ kind: 'id', values: other }], signal))
  const requested = new Set(other)
  for (const record of records) {
    if (requested.has(record.header.id) && await recordAuthorized(record, caller)) {
      authorized.add(record.header.id)
    }
  }
  return authorized
}

async function resolveRepositoryIdentity(cwd: string): Promise<string | null> {
  let physicalCwd: string
  try {
    physicalCwd = await realpath(cwd)
  } catch {
    physicalCwd = path.resolve(cwd)
  }
  const commonDirectory = await readGitCommonDirectory(cwd)
  if (commonDirectory === null) return `directory:${physicalCwd}`
  let physicalCommonDirectory: string
  try {
    physicalCommonDirectory = await realpath(path.resolve(cwd, commonDirectory))
  } catch {
    physicalCommonDirectory = path.resolve(cwd, commonDirectory)
  }
  return `git:${physicalCommonDirectory}`
}

function readGitCommonDirectory(cwd: string): Promise<string | null> {
  return new Promise(resolve => {
    execFile(
      'git',
      ['rev-parse', '--path-format=absolute', '--git-common-dir'],
      { cwd, timeout: 1_500, windowsHide: true, encoding: 'utf8' },
      (error, stdout) => {
        const value = typeof stdout === 'string' ? stdout.trim() : ''
        resolve(error === null && value.length > 0 ? value : null)
      },
    )
  })
}

async function readTitles(
  ctx: Context,
  caller: Caller,
  ids: readonly SessionIdValue[],
  signal: AbortSignal,
): Promise<CompleteTitleMap> {
  const result = new Map<SessionIdValue, TitleView>()
  const observations = await serviceBoundary.call(ctx, signal, 'title observation', () =>
    ctx.sessionQuery.readTitleSnapshots(ids, signal))
  for (const observation of observations) {
    if (observation.status === 'rejected') {
      result.set(observation.sessionId, unavailableTitle(ctx, observation.reason))
      continue
    }
    await assertObservedTargetAuthorized(caller, observation.sessionId, observation.value.session)
    result.set(observation.sessionId, { text: observation.value.title?.title ?? 'untitled' })
  }
  return result as CompleteTitleMap
}

async function readTitle(
  ctx: Context,
  caller: Caller,
  id: SessionIdValue,
  signal: AbortSignal,
): Promise<TitleView> {
  return (await readTitles(ctx, caller, [id], signal)).get(id)
}

function unavailableTitle(
  ctx: Context,
  error: unknown,
): TitleView {
  const sanitized = serviceBoundary.sanitizeError(ctx, 'title observation item', error)
  if (sanitized.code === 'SESSION_QUERY_TOOL_UNAUTHORIZED') throw sanitized
  return { text: 'untitled', unavailableCode: sanitized.code }
}

async function authorizeDescendants(
  nodes: readonly SessionLineageNode[],
  caller: Caller,
): Promise<Array<AuthorizedDescendant | null>> {
  const result: Array<AuthorizedDescendant | null> = []
  let pending: DescendantProjectionFrame | undefined
  for (const node of [...nodes].reverse()) {
    pending = { node, target: result, next: pending }
  }
  while (pending !== undefined) {
    const current = pending
    pending = current.next
    if (!(await recordAuthorized(current.node.session, caller))) {
      current.target.push(null)
      continue
    }
    const projected: AuthorizedDescendant = {
      record: current.node.session,
      descendants: [],
    }
    current.target.push(projected)
    for (const child of [...current.node.descendants].reverse()) {
      pending = {
        node: child,
        target: projected.descendants,
        next: pending,
      }
    }
  }
  return result
}

function * visitDescendants(
  nodes: readonly (AuthorizedDescendant | null)[],
): Generator<DescendantVisit> {
  let pending: DescendantVisit | undefined
  for (const node of [...nodes].reverse()) {
    pending = { node, depth: 0, next: pending }
  }
  while (pending !== undefined) {
    const current = pending
    pending = current.next
    yield current
    if (current.node === null) continue
    for (const child of [...current.node.descendants].reverse()) {
      pending = {
        node: child,
        depth: current.depth + 1,
        next: pending,
      }
    }
  }
}

function descendantIds(nodes: readonly (AuthorizedDescendant | null)[]): SessionIdValue[] {
  const ids: SessionIdValue[] = []
  for (const { node } of visitDescendants(nodes)) {
    if (node !== null) ids.push(node.record.header.id)
  }
  return ids
}

function titleText(view: TitleView): string {
  return view.unavailableCode === undefined
    ? view.text
    : `${view.text} (title unavailable: ${view.unavailableCode})`
}

/** Workspace-scoped caller authorization, title access, and lineage projection. */
export const workspaceAccess = {
  callerOf,
  targetId,
  authorizeTarget,
  recordAuthorized,
  assertObservedTargetAuthorized,
  authorizeSessionIds,
  readTitles,
  readTitle,
  authorizeDescendants,
  visitDescendants,
  descendantIds,
  titleText,
}
