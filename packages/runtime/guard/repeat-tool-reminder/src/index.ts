/**
 * Per-agent repeat-call detector. It enriches post-execute decisions with
 * logged model context, nudges scoped read-only searches toward reading source,
 * and latches a search scope after an exact glob/grep cycle repeats; it never
 * rewrites calls or imposes a total-task tool/time/token budget. Configuration and semantics live in the package
 * README; rationale lives in the repeat-tool-reminder Agent Note.
 * @module @z/dsh-repeat-tool-reminder
 */

import type { Context } from '@z/cordis'
import z from '@z/schemastery'
import type { Agent, PreStepDecision } from '@z/dsh-agent'
import { createUserMessage } from '@z/dsh-llm'
import type { MessageSource } from '@z/dsh-llm'
import type { UserMessage } from '@z/dsh-session'
import type { PostToolDecision, PreToolDecision, ToolExecution } from '@z/dsh-tools'

export const name = 'repeat-tool-reminder'

/**
 * Plugin config, validated by the same-named schemastery schema plus the
 * load-time checks in `apply` (misconfiguration fails loud: an empty
 * `thresholds` list, a non-integer, a value below 2, or a duplicate throws at
 * plugin load, never a silent fall-back). `include`/`exclude` entries are
 * `*`-wildcard predicates over tool names at call time, not references to
 * registry entries — a pattern matching no currently registered tool is valid
 * (`exclude: [mcp_*]` must stay legal in a deployment that loads no MCP tools).
 */
export interface Config {
  /** Repeat counts that trigger a reminder (default `[3, 5, 8]`). */
  thresholds?: number[]
  /** Tool-name patterns to track; empty means every tool is tracked. */
  include?: string[]
  /** Tool-name patterns transparent to the chain (neither count nor reset). */
  exclude?: string[]
  /**
   * Maximum characters of canonical arguments quoted in the DETAILED reminder
   * (default 500). Large payloads (a `write` body, a long command) would
   * otherwise ride into the next request unbounded — precisely in a loop
   * scenario; the cap bounds the reminder, never the detection (the chain key
   * always compares the FULL canonical string).
   */
  argumentsPreviewChars?: number
}

export const Config: z<Config> = z.object({
  thresholds: z.array(z.number()).default([3, 5, 8]),
  include: z.array(z.string()).default([]),
  exclude: z.array(z.string()).default([]),
  argumentsPreviewChars: z.number().default(500),
})

/**
 * The `{kind:'plugin'}` source stamped on every reminder this guard injects —
 * the label is load-bearing (an unlabeled context would render as a user
 * prompt in derived history).
 */
const PLUGIN_SOURCE: MessageSource = { kind: 'plugin', plugin: 'repeat-tool-reminder' }

/** Only discovery tools participate; this is not a per-task call or time budget. */
const SEARCH_TOOLS = new Set(['glob', 'grep'])
const SCOPED_READ_TOOLS = new Set(['read', 'read_image'])
const SCOPED_SEARCH_TOOLS = new Set(['glob', 'grep', 'find', 'ls'])
const FOCUS_SEARCH_TOOLS = new Set(['glob', 'grep', 'find', 'ls'])
const SEARCH_FOCUS_REMINDER_THRESHOLDS = new Set([2, 4])
const READONLY_SCOPE_SEARCH_REMINDER_AT = 6
const MAX_READONLY_SCOPE_SEARCH_CALLS = 10
const MAX_READONLY_FILE_READ_CALLS = 8
const MAX_READONLY_IDENTICAL_READ_CALLS = 3
const READONLY_SCOPE_OPEN = '<taskweaver-readonly-scope-v1>'
const READONLY_SCOPE_CLOSE = '</taskweaver-readonly-scope-v1>'
const MAX_SEARCH_CYCLE_PERIOD = 8
const SEARCH_CYCLE_HISTORY_SIZE = MAX_SEARCH_CYCLE_PERIOD * 2
/** After a cycle is latched, allow one model step to switch to a narrower action. */
const MAX_BLOCKED_SCOPE_RETRIES = 1

interface BlockedSearchScopeState {
  blockedRetries: number
  reason?: 'cycle' | 'readonly-search-limit'
}

/**
 * The gentle first-threshold reminder. Keyed to `thresholds[0]`, not a literal
 * count, so a custom first threshold keeps the gentle-then-detailed escalation.
 */
const GENTLE_REMINDER =
  'You are repeating the exact same tool call with identical arguments. '
  + 'Carefully analyze the previous result before calling again: if the task is '
  + 'not complete, try a different approach or different arguments instead of '
  + 'repeating the call.'

/** The detailed later-threshold reminder naming the tool, the run length, and the canonical arguments. */
function detailedReminder(toolName: string, count: number, canonicalArguments: string): string {
  return 'Repeated tool call detected:\n'
    + `- tool: ${toolName}\n`
    + `- consecutive_calls: ${count}\n`
    + `- arguments: ${canonicalArguments}\n`
    + 'The repeated calls are not making progress. Do not call this tool with '
    + 'these exact arguments again. Inspect the latest result and choose a '
    + 'different action, different arguments, or finish the task if enough '
    + 'evidence has been gathered.'
}

/**
 * Deep key-sort of a parsed-JSON value so two argument objects that differ
 * only in property order canonicalize identically. Arguments reach the guard
 * as the loop's `JSON.parse` output (or its raw-string fallback for malformed
 * argument JSON), so JSON's value domain is the whole input domain — no
 * bigint, cycle, or `undefined` handling exists because no input path can
 * produce them.
 */
function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonValue)
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(record).sort()) {
      sorted[key] = sortJsonValue(record[key])
    }
    return sorted
  }
  return value
}

/** Canonical string form of a call's arguments: deep key-sort, then stringify. */
function canonicalize(argumentsValue: unknown): string {
  return JSON.stringify(sortJsonValue(argumentsValue))
}

/** Compile one `*`-wildcard pattern to an anchored RegExp (every other regex metacharacter is matched literally). */
function wildcardToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[|\\{}()[\]^$+?.]/g, String.raw`\$&`)
  return new RegExp(`^${escaped.replaceAll('*', '.*')}$`)
}

/**
 * Head-truncate the canonical arguments for quoting in the detailed reminder,
 * marking how much was omitted. Bounds only the model-visible text — the
 * chain key always uses the full canonical string.
 */
function previewArguments(canonical: string, cap: number): string {
  if (canonical.length <= cap) return canonical
  return `${canonical.slice(0, cap)}… (+${canonical.length - cap} more chars)`
}

/**
 * Validate `thresholds` per the fail-loud contract and return them sorted
 * ascending (the escalation rule reads `thresholds[0]` as the gentle tier, so
 * order is normalized here, once).
 */
function validateThresholds(values: number[]): number[] {
  if (values.length === 0) {
    throw new Error('repeat-tool-reminder: `thresholds` must not be empty')
  }
  for (const value of values) {
    if (!Number.isInteger(value) || value < 2) {
      throw new Error(`repeat-tool-reminder: invalid threshold ${value} — every threshold must be an integer >= 2`)
    }
  }
  if (new Set(values).size !== values.length) {
    throw new Error('repeat-tool-reminder: `thresholds` must not contain duplicates')
  }
  return [...values].sort((a, b) => a - b)
}

/** Keep nudging after configured thresholds, using the final threshold spacing as cadence. */
function shouldRemindAt(count: number, thresholds: number[], thresholdSet: Set<number>): boolean {
  if (thresholdSet.has(count)) return true
  const last = thresholds.at(-1)
  if (last === undefined || count <= last) return false
  const previous = thresholds.at(-2)
  const cadence = previous === undefined ? last : last - previous
  return cadence > 0 && (count - last) % cadence === 0
}

/** One agent's consecutive exact-call chain: the last tracked call's identity key and its run length. */
interface Chain {
  key: string
  count: number
}

/** Reads of one file are often range-by-range and evade exact-argument repeat detection. */
function readTarget(exec: ToolExecution): string | undefined {
  if (exec.name !== 'read' || exec.arguments === null || typeof exec.arguments !== 'object') return undefined
  const filePath = (exec.arguments as Record<string, unknown>).file_path
  if (typeof filePath !== 'string' || filePath.trim() === '') return undefined
  return filePath.trim().normalize('NFC')
}

interface ReadOnlyTaskScope {
  paths: string[]
  invalid: boolean
}

/** Normalize a literal workspace-relative path; reject roots, traversal, globs, and absolute paths. */
function normalizeScopedPath(raw: unknown): string | undefined {
  if (typeof raw !== 'string' || raw.trim() === '') return undefined
  const candidate = raw.trim().normalize('NFC').replaceAll('\\', '/')
  const segments = candidate.split('/')
  if (
    candidate.startsWith('/')
    || /^[a-z]:/i.test(candidate)
    || /[\u0000-\u001f\u007f]/.test(candidate)
    || /[*?{}\[\]]/.test(candidate)
    || segments.includes('..')
  ) return undefined
  const normalized = segments.filter(segment => segment !== '' && segment !== '.').join('/')
  return normalized || undefined
}

/**
 * Read the marker only from the direct user prompt of the current turn. It is
 * appended after planner text, so planner-provided prompt content cannot
 * shadow the enforceable boundary with an earlier marker.
 */
function readOnlyTaskScope(agent: Agent): ReadOnlyTaskScope | undefined {
  const events = agent.session.events
  let turnStart = events.length - 1
  while (turnStart >= 0 && events[turnStart]?.type !== 'turn/start') turnStart -= 1
  if (turnStart < 0) turnStart = 0

  for (let index = events.length - 1; index >= turnStart; index -= 1) {
    const event = events[index]
    if (event?.type !== 'user/message' || event.data.source.kind !== 'user') continue
    const text = event.data.content
      .map(block => block.type === 'text' ? block.text : '')
      .join('\n')
    const openIndex = text.lastIndexOf(READONLY_SCOPE_OPEN)
    if (openIndex < 0) return undefined
    const valueStart = openIndex + READONLY_SCOPE_OPEN.length
    const closeIndex = text.indexOf(READONLY_SCOPE_CLOSE, valueStart)
    if (closeIndex < 0) return { paths: [], invalid: true }
    try {
      const parsed: unknown = JSON.parse(text.slice(valueStart, closeIndex))
      if (parsed === null || typeof parsed !== 'object' || !Array.isArray((parsed as { paths?: unknown }).paths)) {
        return { paths: [], invalid: true }
      }
      const rawPaths = (parsed as { paths: unknown[] }).paths
      const paths = rawPaths.map(normalizeScopedPath)
      if (paths.length === 0 || paths.some(path => path === undefined)) return { paths: [], invalid: true }
      return { paths: [...new Set(paths as string[])], invalid: false }
    } catch {
      return { paths: [], invalid: true }
    }
  }
  return undefined
}

function scopedToolPath(exec: ToolExecution): string | undefined {
  const args = exec.arguments !== null && typeof exec.arguments === 'object'
    ? exec.arguments as Record<string, unknown>
    : {}
  // Models sometimes call glob with only an exact pattern, leaving `path` at
  // the workspace root. Treat that as the named target (not as permission to
  // search the root); wildcard patterns at `.` remain denied below.
  if (exec.name === 'glob' && (args.path === undefined || args.path === '.')) {
    const literalPattern = normalizeScopedPath(args.pattern)
    if (literalPattern) return literalPattern
  }
  const raw = SCOPED_READ_TOOLS.has(exec.name)
    ? args.file_path
    : args.path ?? args.directory ?? args.cwd ?? '.'
  if (typeof raw !== 'string' || raw.trim() === '') return undefined
  if (raw.trim() === '.') return '.'
  return normalizeScopedPath(raw)
}

function isInsideReadOnlyScope(target: string | undefined, paths: readonly string[]): boolean {
  if (!target || target === '.') return false
  return paths.some(scope => target === scope || target.startsWith(`${scope}/`))
}

function readOnlyScopeDenial(exec: ToolExecution, scope: ReadOnlyTaskScope, target: string | undefined): string {
  const requested = typeof target === 'string' ? target : '(missing or invalid path)'
  const allowed = scope.paths.length ? scope.paths.join(', ') : '(none; invalid scope marker)'
  return `TaskWeaver read-only scope denied ${exec.name} at ${requested} before execution. `
    + `Allowed workspace-relative paths: ${allowed}. Stay within the assigned files/directories; do not retry a broader search. `
    + 'Use evidence already collected, or report the missing evidence and finish the subtask. This is a path boundary, not a total tool-call budget.'
}

/** A distinct reminder for sequential ranges of the same file (advisory only; legitimate long reads remain possible). */
function readTargetReminder(filePath: string, count: number, detailed: boolean, previewChars: number): string {
  if (!detailed) {
    return 'You have read the same file several times '
      + `(${previewArguments(JSON.stringify(filePath), previewChars)}), possibly in different line ranges. Reuse the excerpts already gathered; `
      + 'request another range only when you can name the specific missing information, then synthesize your findings.'
  }
  return 'Repeated reads of the same file detected:\n'
    + `- file_path: ${previewArguments(JSON.stringify(filePath), previewChars)}\n`
    + `- reads_of_file: ${count}\n`
    + 'Avoid overlapping ranges and stop rereading once the relevant evidence is sufficient. Summarize what is known now; '
    + 'if a necessary section is still missing, request only that concrete, non-overlapping range.'
}

/** A per-scope nudge for TaskWeaver read-only agents that keep searching without opening source. */
function searchFocusReminder(scope: string, count: number): string {
  return `You have run ${count} filesystem searches in scope ${scope} without reading the matching source. `
    + 'Stop varying search terms for now; read the relevant range from the known file path and cite its line numbers. '
    + 'If the symbol is still not found after one targeted search, report that evidence gap and finish. '
    + 'This is a per-scope progress reminder, not a total tool-call, time, or token budget.'
}

function readOnlyScopeSearchReminder(scope: string, count: number): string {
  return `You have made ${count} filesystem searches in the assigned read-only scope ${scope}. `
    + 'The source paths are already known. Stop varying search expressions; read only the relevant source ranges and synthesize the findings. '
    + `A single scope permits at most ${MAX_READONLY_SCOPE_SEARCH_CALLS} search attempts to prevent repetitive search loops; this does not limit reads, other scopes, or the task as a whole.`
}

function readOnlyScopeSearchLimitDenial(scope: string): string {
  return `Filesystem search at assigned read-only scope ${scope} was denied after ${MAX_READONLY_SCOPE_SEARCH_CALLS} search attempts in this same scope. `
    + 'Use the known paths and evidence already gathered, read a relevant range if needed, then finish and state any remaining evidence gap. '
    + 'One recovery response is allowed; retrying this blocked scope again ends the turn before another model request. This is not a task-wide budget.'
}

function readOnlyIdenticalReadDenial(filePath: string): string {
  return `The identical read of ${filePath} has already returned the same source three times, so this read was denied before execution. `
    + 'Use the excerpts already gathered, request a specific non-overlapping range if evidence is missing, or finish and state the gap. '
    + 'One recovery response is allowed; retrying this identical read again ends the turn before another model request. This is not a task-wide budget.'
}

function readOnlyFileReadLimitDenial(filePath: string): string {
  return `Reads of ${filePath} were denied after ${MAX_READONLY_FILE_READ_CALLS} in-scope reads of this same file in the current agent turn. `
    + 'Use the excerpts already gathered, continue with another already-authorized file, or finish and state any specific evidence gap. '
    + 'One recovery response is allowed; retrying this file again ends the turn before another model request. This is a per-file loop guard, not a task-wide budget.'
}

function blockedFileReadDenial(filePath: string): string {
  return `Further reads of ${filePath} remain blocked after the one recovery response. `
    + 'Use the existing excerpts or another already-authorized file; the turn will end before another model request.'
}

function blockedIdenticalReadDenial(filePath: string): string {
  return `The identical read of ${filePath} remains blocked after its one recovery response. `
    + 'Use the existing excerpts or a different, concrete range; the turn will end before another model request.'
}

/** Return a repeated period when the next tool/scope signature completes a third search cycle. */
function repeatedSearchCycleLength(history: readonly string[], nextKey: string): number | undefined {
  for (let period = 2; period <= MAX_SEARCH_CYCLE_PERIOD; period += 1) {
    if (history.length < period * 2 || history.at(-period) !== nextKey) continue
    const firstCycle = history.slice(-period * 2, -period)
    const secondCycle = history.slice(-period)
    if (firstCycle.every((key, index) => key === secondCycle[index])) return period
  }
  return undefined
}

/** Search-cycle identity includes the normalized query/options, so distinct useful searches are not mistaken for a loop. */
function searchCallSignature(exec: ToolExecution): string {
  const args = exec.arguments !== null && typeof exec.arguments === 'object'
    ? exec.arguments as Record<string, unknown>
    : {}
  const queryAndOptions = Object.fromEntries(
    Object.entries(args).filter(([key]) => !['path', 'directory', 'cwd'].includes(key)),
  )
  return JSON.stringify([exec.name, searchScope(exec), canonicalize(normalizeSearchValue(queryAndOptions))])
}

function normalizeSearchValue(value: unknown): unknown {
  if (typeof value === 'string') return value.normalize('NFC')
  if (Array.isArray(value)) return value.map(normalizeSearchValue)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, normalizeSearchValue(child)]))
  }
  return value
}

function searchScope(exec: ToolExecution): string {
  const args = exec.arguments !== null && typeof exec.arguments === 'object'
    ? exec.arguments as Record<string, unknown>
    : {}
  const raw = args.path ?? args.directory ?? args.cwd ?? '.'
  if (typeof raw !== 'string') return canonicalize(raw)
  const normalized = raw.trim().replaceAll('\\', '/').replace(/^(?:\.\/)+/, '').replace(/\/+$/, '')
  return normalized || '.'
}

function searchCycleDenial(exec: ToolExecution, period: number, previewChars: number, scope: string): string {
  const args = previewArguments(canonicalize(exec.arguments), previewChars)
  return `Repeated filesystem-search cycle detected: the same ${period}-call glob/grep sequence with identical search arguments at scope ${scope} has already repeated. `
    + `This search was denied before execution (tool: ${exec.name}; arguments: ${args}). `
    + `Further glob/grep calls at the same search scope (${scope}) are now denied for this agent turn. `
    + 'Stop broad filesystem discovery for this turn. Use evidence already gathered and answer now, clearly stating any gaps. '
    + 'Only read a file whose path is already known if one specific missing fact is essential; do not restart or repeat the directory scan.'
}

function blockedSearchScopeDenial(exec: ToolExecution, previewChars: number, scope: string, reason: BlockedSearchScopeState['reason']): string {
  const args = previewArguments(canonicalize(exec.arguments), previewChars)
  if (reason === 'readonly-search-limit') {
    return `Filesystem search at assigned read-only scope ${scope} remains blocked after its one recovery response. `
      + `This variant was denied before execution (tool: ${exec.name}; arguments: ${args}). `
      + 'Use evidence already gathered or read a different, already-known path; the agent turn will stop before another model request.'
  }
  return `Filesystem search at scope ${scope} was disabled after a repeated glob/grep cycle. `
    + `This variant was denied before execution (tool: ${exec.name}; arguments: ${args}). `
    + 'This uses the one allowed model retry after the cycle warning; the agent turn will stop before another model request if this blocked scope is retried. '
    + 'Do not try another filesystem search in this scope. Synthesize the answer from evidence already found; if essential, read one already-known path, then answer and state any gaps.'
}

/**
 * Install the guard's listeners.
 * @param ctx - plugin context; listeners are scoped to it and disposed with it.
 * @param config - validated {@link Config}; `thresholds` is re-checked fail-loud here.
 */
export function apply(ctx: Context, config: Config): void {
  // schemastery's .default() guarantees the fields are set after validation.
  const thresholds = validateThresholds(config.thresholds as number[])
  const thresholdSet = new Set(thresholds)
  const includePatterns = (config.include as string[]).map(wildcardToRegExp)
  const excludePatterns = (config.exclude as string[]).map(wildcardToRegExp)
  const argumentsPreviewChars = config.argumentsPreviewChars as number
  if (!Number.isInteger(argumentsPreviewChars) || argumentsPreviewChars < 1) {
    throw new Error(`repeat-tool-reminder: invalid argumentsPreviewChars ${argumentsPreviewChars} — must be an integer >= 1`)
  }

  const chains = new WeakMap<Agent, Chain>()
  const readTargetCounts = new WeakMap<Agent, Map<string, number>>()
  const searchFocusCounts = new WeakMap<Agent, Map<string, number>>()
  const readOnlyScopeSearchCounts = new WeakMap<Agent, Map<string, number>>()
  const readOnlyIdenticalReadCounts = new WeakMap<Agent, Map<string, number>>()
  const blockedReadTargets = new WeakMap<Agent, Map<string, BlockedSearchScopeState>>()
  const blockedIdenticalReads = new WeakMap<Agent, Map<string, BlockedSearchScopeState>>()
  const searchHistories = new WeakMap<Agent, string[]>()
  const blockedSearchScopes = new WeakMap<Agent, Map<string, BlockedSearchScopeState>>()
  const stopBeforeNextStep = new WeakMap<Agent, string>()

  /** Whether a tool participates in the chain (untracked calls are transparent: they neither count nor reset). */
  function tracked(toolName: string): boolean {
    if (includePatterns.length > 0 && !includePatterns.some(pattern => pattern.test(toolName))) return false
    return !excludePatterns.some(pattern => pattern.test(toolName))
  }

  /**
   * Advance the calling agent's chain for one attempt and return the reminder
   * to deliver, if this attempt's run length hits a configured threshold.
   * Counting happens here — in post-execute — because denied calls also flow
   * through this waterfall (`ToolRuntime.execute` routes a deny through the
   * same pipeline), and a model hammering a denied call is exactly the loop
   * worth breaking.
   */
  function observe(exec: ToolExecution): UserMessage | undefined {
    // A direct `ctx.tools.execute()` caller has no model to remind and no id
    // to key on; only agent-loop calls participate.
    if (!exec.agent) return undefined
    if (!tracked(exec.name)) return undefined

    const path = readTarget(exec)
    if (path !== undefined) {
      // Keep same-file reads independent from the exact-call chain: useful
      // searches or reads of other files between ranges must not erase the
      // advisory signal for a file the agent keeps reopening.
      chains.delete(exec.agent)
      const counts = readTargetCounts.get(exec.agent) ?? new Map<string, number>()
      const count = (counts.get(path) ?? 0) + 1
      counts.set(path, count)
      readTargetCounts.set(exec.agent, counts)
      if (!shouldRemindAt(count, thresholds, thresholdSet)) return undefined
      return createUserMessage({
        content: [{ type: 'text', text: readTargetReminder(path, count, count !== thresholds[0], argumentsPreviewChars) }],
        source: { ...PLUGIN_SOURCE, form: 'notice', summary: `${exec.name} ${path} × ${count}` },
      })
    }

    const canonical = canonicalize(exec.arguments)
    const key = JSON.stringify([exec.name, canonical])
    const chain = chains.get(exec.agent)
    const count = chain !== undefined && chain.key === key ? chain.count + 1 : 1
    chains.set(exec.agent, { key, count })
    if (!shouldRemindAt(count, thresholds, thresholdSet)) return undefined
    const text = count === thresholds[0]
      ? GENTLE_REMINDER
      : detailedReminder(exec.name, count, previewArguments(canonical, argumentsPreviewChars))
    return createUserMessage({
      content: [{ type: 'text', text }],
      source: { ...PLUGIN_SOURCE, form: 'notice', summary: `${exec.name} × ${count}` },
    })
  }

  /** Count discovery searches per literal scope until a source read demonstrates progress. */
  function observeSearchFocus(exec: ToolExecution): UserMessage | undefined {
    if (!exec.agent || !tracked(exec.name)) return undefined
    const counts = searchFocusCounts.get(exec.agent) ?? new Map<string, number>()
    searchFocusCounts.set(exec.agent, counts)

    const readPath = readTarget(exec)
    if (readPath !== undefined) {
      for (const scope of counts.keys()) {
        if (scope === '.' || readPath === scope || readPath.startsWith(`${scope}/`) || scope.startsWith(`${readPath}/`)) {
          counts.delete(scope)
        }
      }
      return undefined
    }
    if (!FOCUS_SEARCH_TOOLS.has(exec.name) || !readOnlyTaskScope(exec.agent)) return undefined

    const scope = searchScope(exec)
    const count = (counts.get(scope) ?? 0) + 1
    counts.set(scope, count)
    if (!SEARCH_FOCUS_REMINDER_THRESHOLDS.has(count)) return undefined
    return createUserMessage({
      content: [{ type: 'text', text: searchFocusReminder(scope, count) }],
      source: { ...PLUGIN_SOURCE, form: 'notice', summary: `${exec.name} ${scope} × ${count}` },
    })
  }

  /** Count varied discovery calls per assigned literal scope; reads never reset this loop guard. */
  function observeReadOnlyScopeSearch(exec: ToolExecution): UserMessage | undefined {
    if (!exec.agent || !tracked(exec.name) || !FOCUS_SEARCH_TOOLS.has(exec.name)) return undefined
    if (!readOnlyTaskScope(exec.agent)) return undefined
    const scope = searchScope(exec)
    const counts = readOnlyScopeSearchCounts.get(exec.agent) ?? new Map<string, number>()
    const count = (counts.get(scope) ?? 0) + 1
    counts.set(scope, count)
    readOnlyScopeSearchCounts.set(exec.agent, counts)
    if (count !== READONLY_SCOPE_SEARCH_REMINDER_AT) return undefined
    return createUserMessage({
      content: [{ type: 'text', text: readOnlyScopeSearchReminder(scope, count) }],
      source: { ...PLUGIN_SOURCE, form: 'notice', summary: `${exec.name} ${scope} × ${count}` },
    })
  }

  /** Exact repeat reads add no new evidence; distinct ranges of a long file remain available. */
  function recordReadOnlyIdenticalRead(exec: ToolExecution): void {
    if (!exec.agent || !tracked(exec.name) || !SCOPED_READ_TOOLS.has(exec.name)) return
    if (!readOnlyTaskScope(exec.agent)) return
    const canonical = canonicalize(exec.arguments)
    const key = JSON.stringify([exec.name, canonical])
    const counts = readOnlyIdenticalReadCounts.get(exec.agent) ?? new Map<string, number>()
    counts.set(key, (counts.get(key) ?? 0) + 1)
    readOnlyIdenticalReadCounts.set(exec.agent, counts)
  }

  /** Keep a short per-agent suffix of tool/scope/query signatures to recognize exact repeating search cycles. */
  function recordSearchCall(exec: ToolExecution): void {
    if (!exec.agent || !tracked(exec.name)) return
    if (!SEARCH_TOOLS.has(exec.name)) {
      searchHistories.delete(exec.agent)
      return
    }
    const history = searchHistories.get(exec.agent) ?? []
    history.push(searchCallSignature(exec))
    if (history.length > SEARCH_CYCLE_HISTORY_SIZE) history.splice(0, history.length - SEARCH_CYCLE_HISTORY_SIZE)
    searchHistories.set(exec.agent, history)
  }

  // A recurring multi-query search cycle evades the consecutive-identical-call
  // advisory. Cycle identity includes tool, normalized scope, and canonical
  // query/options, so genuinely different searches remain available. Once an
  // exact cycle is confirmed, latch that path for the rest of the agent turn;
  // other scopes and direct reads remain usable.
  ctx.on('tools/pre-execute', async (exec, next): Promise<PreToolDecision> => {
    if (!exec.agent) return next()
    if (SCOPED_READ_TOOLS.has(exec.name) || SCOPED_SEARCH_TOOLS.has(exec.name)) {
      const scope = readOnlyTaskScope(exec.agent)
      if (scope) {
        const target = scopedToolPath(exec)
        if (scope.invalid || !isInsideReadOnlyScope(target, scope.paths)) {
          return { kind: 'deny', reason: readOnlyScopeDenial(exec, scope, target) }
        }
        if (SCOPED_READ_TOOLS.has(exec.name) && tracked(exec.name)) {
          const filePath = readTarget(exec)
          const blockedTargets = blockedReadTargets.get(exec.agent)
          const blockedTarget = filePath ? blockedTargets?.get(filePath) : undefined
          if (filePath && blockedTarget) {
            blockedTarget.blockedRetries += 1
            if (blockedTarget.blockedRetries >= MAX_BLOCKED_SCOPE_RETRIES) stopBeforeNextStep.set(exec.agent, filePath)
            return { kind: 'deny', reason: blockedFileReadDenial(filePath) }
          }
          if (filePath && (readTargetCounts.get(exec.agent)?.get(filePath) ?? 0) >= MAX_READONLY_FILE_READ_CALLS) {
            const nextBlockedTargets = blockedReadTargets.get(exec.agent) ?? new Map<string, BlockedSearchScopeState>()
            nextBlockedTargets.set(filePath, { blockedRetries: 0 })
            blockedReadTargets.set(exec.agent, nextBlockedTargets)
            return { kind: 'deny', reason: readOnlyFileReadLimitDenial(filePath) }
          }
          const signature = JSON.stringify([exec.name, canonicalize(exec.arguments)])
          const blockedReads = blockedIdenticalReads.get(exec.agent)
          const blockedRead = blockedReads?.get(signature)
          if (blockedRead) {
            blockedRead.blockedRetries += 1
            if (blockedRead.blockedRetries >= MAX_BLOCKED_SCOPE_RETRIES) stopBeforeNextStep.set(exec.agent, signature)
            const filePath = readTarget(exec) ?? target ?? '(unknown file)'
            return { kind: 'deny', reason: blockedIdenticalReadDenial(filePath) }
          }
          if ((readOnlyIdenticalReadCounts.get(exec.agent)?.get(signature) ?? 0) >= MAX_READONLY_IDENTICAL_READ_CALLS) {
            const nextBlockedReads = blockedIdenticalReads.get(exec.agent) ?? new Map<string, BlockedSearchScopeState>()
            nextBlockedReads.set(signature, { blockedRetries: 0 })
            blockedIdenticalReads.set(exec.agent, nextBlockedReads)
            const filePath = readTarget(exec) ?? target ?? '(unknown file)'
            return { kind: 'deny', reason: readOnlyIdenticalReadDenial(filePath) }
          }
        }
      }
    }
    if (!tracked(exec.name) || !SEARCH_TOOLS.has(exec.name)) return next()
    const scope = searchScope(exec)
    const blocked = blockedSearchScopes.get(exec.agent)?.get(scope)
    if (blocked) {
      blocked.blockedRetries += 1
      if (blocked.blockedRetries >= MAX_BLOCKED_SCOPE_RETRIES) stopBeforeNextStep.set(exec.agent, scope)
      return { kind: 'deny', reason: blockedSearchScopeDenial(exec, argumentsPreviewChars, scope, blocked.reason) }
    }
    if (readOnlyTaskScope(exec.agent) && (readOnlyScopeSearchCounts.get(exec.agent)?.get(scope) ?? 0) >= MAX_READONLY_SCOPE_SEARCH_CALLS) {
      const blockedScopes = blockedSearchScopes.get(exec.agent) ?? new Map<string, BlockedSearchScopeState>()
      blockedScopes.set(scope, { blockedRetries: 0, reason: 'readonly-search-limit' })
      blockedSearchScopes.set(exec.agent, blockedScopes)
      return { kind: 'deny', reason: readOnlyScopeSearchLimitDenial(scope) }
    }
    const history = searchHistories.get(exec.agent) ?? []
    const key = searchCallSignature(exec)
    const period = repeatedSearchCycleLength(history, key)
    if (period === undefined) return next()
    const blockedScopes = blockedSearchScopes.get(exec.agent) ?? new Map<string, BlockedSearchScopeState>()
    blockedScopes.set(scope, { blockedRetries: 0, reason: 'cycle' })
    blockedSearchScopes.set(exec.agent, blockedScopes)
    return { kind: 'deny', reason: searchCycleDenial(exec, period, argumentsPreviewChars, scope) }
  })

  // Observe-and-enrich: count first (state advances regardless of the downstream
  // outcome), DELEGATE so later listeners can still block or replace, then fold
  // the reminder onto whatever came back — additionalContexts rides both
  // decision variants, so a blocked call still gets the nudge.
  ctx.on('tools/post-execute', async (exec, _result, next): Promise<PostToolDecision> => {
    recordSearchCall(exec)
    recordReadOnlyIdenticalRead(exec)
    const focusReminder = observeSearchFocus(exec)
    const scopeSearchReminder = observeReadOnlyScopeSearch(exec)
    const reminder = observe(exec)
    const downstream = await next()
    const reminders = [focusReminder, scopeSearchReminder, reminder].filter((item): item is UserMessage => item !== undefined)
    if (reminders.length === 0) return downstream
    if (downstream.kind === 'block') {
      return { kind: 'block', feedback: downstream.feedback, additionalContexts: [...reminders, ...(downstream.additionalContexts ?? [])] }
    }
    return {
      ...downstream,
      additionalContexts: [...reminders, ...(downstream.additionalContexts ?? [])],
    }
  })

  // A user interjection changes the context; repetition across it is not a
  // loop. Pure reset hook: always delegates (attaching nothing, vetoing
  // nothing).
  ctx.on('agent/pre-step', ({ agent, messages }, next): Promise<PreStepDecision> => {
    const userInterjection = messages.some(message => message.source.kind === 'user')
    if (userInterjection) {
      chains.delete(agent)
      readTargetCounts.delete(agent)
      searchFocusCounts.delete(agent)
      readOnlyScopeSearchCounts.delete(agent)
      readOnlyIdenticalReadCounts.delete(agent)
      blockedReadTargets.delete(agent)
      blockedIdenticalReads.delete(agent)
      searchHistories.delete(agent)
      blockedSearchScopes.delete(agent)
      stopBeforeNextStep.delete(agent)
      return next()
    }
    // The tool result from the single retry above has already been logged and
    // made visible. Reject the next step before it can incur another LLM call.
    if (stopBeforeNextStep.has(agent)) {
      stopBeforeNextStep.delete(agent)
      return Promise.resolve({ kind: 'reject' })
    }
    return next()
  })
}
