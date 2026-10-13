/**
 * One language-server instance: a connection plus the initialize handshake, the serialized abortable
 * query queue, the transient `didOpen`→request→`didClose` lifecycle, and bounded teardown. One
 * instance owns one `(provider id, canonical workspace)` process. Queries serialize through a single
 * queue so a cancellation that fails to stop the server can terminate it without killing unrelated
 * work; distinct instances run in parallel.
 * @module @taskweaver/dsh-lsp-stdio/instance
 */

import { LspError } from '@taskweaver/dsh-lsp'
import type {
  LspDiagnostic,
  LspOperation,
  LspProviderQuery,
  LspQueryResult,
} from '@taskweaver/dsh-lsp'
import { deadline } from '@taskweaver/dsh-timeout'
import { abortable, abortError } from './abort.ts'
import { LspConnection } from './connection.ts'
import type { ConnectionSpawner, ConnectionSpec, ConnectionWriter } from './connection.ts'
import type { HostSource } from './host.ts'
import type { WireInitializeResult, WireServerCapabilities } from './protocol.ts'
import {
  negotiatePositionEncoding,
  normalizeHover,
  normalizeLocations,
  requestMethod,
  supportsOperation,
  supportsTransientOpen,
} from './translate.ts'

/** Everything an instance needs beyond the connection spec. */
export interface InstanceSpec extends ConnectionSpec {
  /** Canonical workspace file URI supplied by the filesystem provider. */
  readonly workspaceUri: string
  /** Static `initialize` options forwarded to the server. */
  readonly initializationOptions: unknown
  /** Graceful `shutdown`/`exit` budget before escalation (ms). */
  readonly shutdownTimeoutMs: number
}

/**
 * A single initialized server process. Not exported as a provider — the provider single-flights and
 * pools these. `query()` serializes; `dispose()` rejects queued work and tears the process down.
 */
export class LspInstance {
  private readonly connection: LspConnection
  private capabilities: WireServerCapabilities | undefined
  /** The serialization tail: each query awaits the prior one, so lifecycles never interleave. */
  private queue: Promise<unknown> = Promise.resolve()
  private disposed = false
  /** The one teardown transaction shared by abort, failure, and explicit disposal. */
  private teardownPromise: Promise<void> | undefined
  /** Set once the process closes, so the pool can synchronously skip a dead instance. */
  private processClosed = false
  /** Latest diagnostics are kept per document URI, as LSP notifications are file-scoped. */
  private readonly diagnosticsByUri = new Map<string, CachedDiagnostics>()
  /** Waiters are scoped to one URI and one document version. */
  private readonly diagnosticWaiters = new Map<string, Set<DiagnosticWaiter>>()
  /** Versions sent by this client, kept monotonic for each document URI. */
  private readonly documentVersions = new Map<string, number>()
  /** Populated once `initialize` succeeds; a failed handshake rejects every query. */
  private readonly ready: Promise<void>

  /**
   * @param spec - the launch, initialize, and teardown parameters.
   * @param spawner - the subprocess seam's spawn function.
   * @param writer - optional connection writer used by transport conformance tests.
   */
  constructor(private readonly spec: InstanceSpec, spawner: ConnectionSpawner, writer?: ConnectionWriter) {
    this.connection = new LspConnection(
      spec,
      spawner,
      (method, params) => this.answerServerRequest(method, params),
      writer,
      (method, params) => this.acceptServerNotification(method, params),
    )
    this.ready = this.initialize()
    // A handshake rejection must not surface as an unhandled rejection before the first query awaits
    // it; queries attach the real handler.
    this.ready.catch(() => {})
    void this.connection.closed.then(() => { this.processClosed = true })
  }

  /** Synchronous liveness check: true once the process has closed or the instance was disposed. */
  get dead(): boolean {
    return this.processClosed || this.disposed || this.connection.failed
  }

  /**
   * Test whether a caught query error came from this instance's transport.
   * @param error - error caught by the provider.
   * @returns `true` only for the connection's retained fatal transport cause.
   */
  isTransportFailure(error: unknown): boolean {
    return this.connection.failedWith(error)
  }

  /**
   * Run one query through the serialized queue.
   * @param request - the resolved provider query.
   * @param source - the pre-validated, already-read host source (the provider reads before spawning).
   * @param signal - optional cancellation for this query's full lifecycle.
   * @returns the normalized result.
   */
  query(request: LspProviderQuery, source: HostSource, signal?: AbortSignal): Promise<LspQueryResult> {
    // Serialize behind prior work, but observe abort DURING the queue wait too: if an earlier query
    // hangs (e.g. a signal-less service caller), a later tool's timeout must still be able to give up
    // rather than block on the shared tail forever.
    const run = abortable(this.queue, signal)
      .then(() => this.runQuery(request, source, signal))
      .catch(async (error: unknown) => {
        if (this.isTransportFailure(error)) await this.startTeardown()
        throw error
      })
    // Keep the tail alive regardless of this query's outcome so the next caller still serializes. The
    // tail follows the ACTUAL prior work (this.queue), not the abortable view, so a caller giving up
    // on the wait does not deserialize the queue.
    this.queue = this.queue.then(() => run).then(() => undefined, () => undefined)
    return run
  }

  private async initialize(): Promise<void> {
    const initializeResult = await this.connection.request('initialize', {
      // A subprocess provider may run in another PID namespace or machine;
      // the host PID would let the server monitor an unrelated process.
      processId: null,
      rootUri: this.spec.workspaceUri,
      workspaceFolders: [{ uri: this.spec.workspaceUri, name: 'workspace' }],
      capabilities: CLIENT_CAPABILITIES,
      initializationOptions: this.spec.initializationOptions,
    }) as WireInitializeResult
    const capabilities = initializeResult.capabilities
    // An omitted encoding defaults to utf-16; any other value is a protocol error we reject here.
    negotiatePositionEncoding(capabilities.positionEncoding)
    this.capabilities = capabilities
    await this.connection.notify('initialized', {})
  }

  private async runQuery(request: LspProviderQuery, source: HostSource, signal?: AbortSignal): Promise<LspQueryResult> {
    if (this.disposed) throw new LspError('LSP instance was disposed', 'LSP_DISPOSED')
    /* v8 ignore next -- the abortable queue wait rejects a pre-aborted signal before runQuery; this is a belt-and-suspenders guard. */
    if (signal?.aborted) throw abortError(signal)
    // Observe abort during the handshake wait, and never pool a poisoned instance: if the wait ends
    // in failure — an abort on a still-pending handshake, OR `initialize` rejecting (utf-8
    // negotiation, malformed result) without the process exiting — tear the instance down so a
    // permanently-rejecting/pending `ready` can't make every later query for this workspace fail.
    try {
      await abortable(this.ready, signal)
    } catch (error) {
      if (!this.dead) {
        await this.startTeardown()
      }
      throw error
    }
    const capabilities = this.capabilities
    /* v8 ignore next -- `ready` resolves only after capabilities are set, else it rejects above; defensive. */
    if (capabilities === undefined) throw new Error('LSP instance is not initialized')
    if (!supportsOperation(capabilities, request.operation)) {
      throw new LspError(`server does not support ${request.operation}`, 'LSP_UNSUPPORTED_OPERATION')
    }
    if (!supportsTransientOpen(capabilities.textDocumentSync)) {
      throw new LspError('server does not support the transient textDocument/didOpen this host requires', 'LSP_UNSUPPORTED_OPERATION')
    }

    const uri = source.fileUrl
    let opened = false
    try {
      /* v8 ignore next -- guards an abort landing between the ready wait and didOpen; not deterministically reproducible. */
      if (signal?.aborted) throw abortError(signal)
      try {
        const version = this.nextDocumentVersion(uri)
        await abortable(this.connection.notify('textDocument/didOpen', {
          textDocument: { uri, languageId: request.languageId, version, text: source.text },
        }), signal)
      } catch (error) {
        // A canceled backpressured write or failed stdin leaves the protocol stream unusable before
        // `opened` can arm the didClose cleanup. Teardown here makes the pool evict the instance.
        await this.startTeardown()
        throw error
      }
      opened = true
      const payload = await this.sendRequest(request.operation, uri, request.position, signal)
      return this.normalize(request.operation, payload)
    } finally {
      // A disposed or closed instance (e.g. an aborted request whose server ignored
      // `$/cancelRequest`) is already tearing down; sending didClose would race that teardown and let
      // the next queued query's document lifecycle overlap the still-active request.
      if (opened && !this.dead) {
        try {
          await this.connection.notify('textDocument/didClose', { textDocument: { uri } })
        } catch {
          // A close-write failure does not replace the settled result/error, but the instance can no
          // longer be trusted: invalidate it and await bounded process termination.
          try {
            await this.startTeardown()
          } catch {
            /* v8 ignore next -- teardown owns all expected process races; this only preserves the
               already-settled query outcome if an unexpected cleanup primitive itself rejects. */
          }
        }
      }
    }
  }

  /**
   * Re-open a changed file and wait briefly for its next publishDiagnostics notification.
   * The provider calls this only for a live instance, so advisory diagnostics never launch an
   * otherwise-unused language server after an edit.
   */
  async getDiagnostics(
    source: HostSource,
    languageId: string,
    waitMs: number,
    signal?: AbortSignal,
  ): Promise<readonly LspDiagnostic[]> {
    if (this.disposed) throw new LspError('LSP instance was disposed', 'LSP_DISPOSED')
    if (signal?.aborted) throw abortError(signal)
    await abortable(this.ready, signal)
    const capabilities = this.capabilities
    if (capabilities === undefined || !supportsTransientOpen(capabilities.textDocumentSync)) return []

    const uri = source.fileUrl
    const version = this.nextDocumentVersion(uri)
    const previousRevision = this.diagnosticsByUri.get(uri)?.revision ?? 0
    let opened = false
    try {
      try {
        await abortable(this.connection.notify('textDocument/didOpen', {
          textDocument: { uri, languageId, version, text: source.text },
        }), signal)
      } catch (error) {
        await this.startTeardown()
        throw error
      }
      opened = true
      return await this.waitForDiagnostics(uri, previousRevision, version, waitMs, signal)
    } finally {
      if (opened && !this.dead) {
        try {
          await this.connection.notify('textDocument/didClose', { textDocument: { uri } })
        } catch {
          try {
            await this.startTeardown()
          } catch {
            // Diagnostics are advisory; preserve the already-settled wait outcome.
          }
        }
      }
    }
  }

  private nextDocumentVersion(uri: string): number {
    const previous = this.documentVersions.get(uri)
    // Keep this LRU bounded: long-lived workspaces may query thousands of different documents.
    if (previous === undefined && this.documentVersions.size >= MAX_TRACKED_DOCUMENT_VERSIONS) {
      const oldest = this.documentVersions.keys().next().value
      if (oldest !== undefined) this.documentVersions.delete(oldest)
    }
    this.documentVersions.delete(uri)
    const version = (previous ?? 0) + 1
    this.documentVersions.set(uri, version)
    return version
  }

  private acceptServerNotification(method: string, params: unknown): void {
    if (method !== 'textDocument/publishDiagnostics' || !isRecord(params)) return
    const uri = params.uri
    const rawDiagnostics = params.diagnostics
    if (typeof uri !== 'string' || uri.length === 0 || !Array.isArray(rawDiagnostics)) return
    const version = typeof params.version === 'number' && Number.isInteger(params.version)
      ? params.version
      : undefined
    const currentVersion = this.documentVersions.get(uri)
    if (version !== undefined && currentVersion !== undefined && version < currentVersion) return

    const diagnostics = rawDiagnostics
      .slice(0, MAX_CACHED_DIAGNOSTICS)
      .flatMap(normalizeDiagnostic)
    const revision = (this.diagnosticsByUri.get(uri)?.revision ?? 0) + 1
    // Refresh insertion order for a small per-file LRU so a long-lived server cannot retain every
    // file the agent has ever touched.
    this.diagnosticsByUri.delete(uri)
    this.diagnosticsByUri.set(uri, { diagnostics, revision, ...(version !== undefined ? { version } : {}) })
    while (this.diagnosticsByUri.size > MAX_DIAGNOSTIC_FILES) {
      const oldest = this.diagnosticsByUri.keys().next().value
      if (oldest === undefined) break
      this.diagnosticsByUri.delete(oldest)
    }

    const waiting = this.diagnosticWaiters.get(uri)
    if (waiting === undefined) return
    for (const waiter of [...waiting]) {
      if (revision > waiter.afterRevision && (version === undefined || version >= waiter.minimumVersion)) {
        waiter.resolve(diagnostics)
      }
    }
  }

  private waitForDiagnostics(
    uri: string,
    afterRevision: number,
    minimumVersion: number,
    waitMs: number,
    signal?: AbortSignal,
  ): Promise<readonly LspDiagnostic[]> {
    const cached = this.diagnosticsByUri.get(uri)
    if (cached !== undefined && cached.revision > afterRevision
      && (cached.version === undefined || cached.version >= minimumVersion)) {
      return Promise.resolve(cached.diagnostics)
    }
    if (signal?.aborted) return Promise.reject(abortError(signal))
    if (waitMs <= 0) return Promise.resolve([])

    return new Promise((resolve, reject) => {
      const waiting = this.diagnosticWaiters.get(uri) ?? new Set<DiagnosticWaiter>()
      let timer: ReturnType<typeof setTimeout> | undefined
      const finish = (diagnostics?: readonly LspDiagnostic[], error?: Error): void => {
        if (timer !== undefined) clearTimeout(timer)
        signal?.removeEventListener('abort', onAbort)
        waiting.delete(waiter)
        if (waiting.size === 0) this.diagnosticWaiters.delete(uri)
        if (error !== undefined) reject(error)
        else resolve(diagnostics ?? [])
      }
      const onAbort = (): void => finish(undefined, abortError(signal!))
      const waiter: DiagnosticWaiter = {
        afterRevision,
        minimumVersion,
        resolve: diagnostics => finish(diagnostics),
      }
      waiting.add(waiter)
      this.diagnosticWaiters.set(uri, waiting)
      timer = setTimeout(() => finish([]), waitMs)
      signal?.addEventListener('abort', onAbort, { once: true })
    })
  }

  private async sendRequest(
    operation: LspOperation,
    uri: string,
    position: LspProviderQuery['position'],
    signal?: AbortSignal,
  ): Promise<unknown> {
    const params = {
      textDocument: { uri },
      position: { line: position.line, character: position.character },
      // findReferences always includes declarations: the caller gets no flag and impact analysis
      // never omits the defining site.
      ...(operation === 'findReferences' ? { context: { includeDeclaration: true } } : {}),
    }
    const requestId = this.connection.peekNextId()
    const send = this.connection.request(requestMethod(operation), params)
    if (signal === undefined) return send
    return this.raceAbort(send, requestId, signal)
  }

  /**
   * Race a pending request against abort. On abort, send `$/cancelRequest` and give the server a
   * bounded grace to acknowledge; if it does not settle in time, invalidate and tear down the
   * instance so the still-active request cannot overlap the next queued query's document lifecycle.
   */
  private async raceAbort(send: Promise<unknown>, requestId: number, signal: AbortSignal): Promise<unknown> {
    try {
      return await abortable(send, signal)
    } catch (error) {
      if (!signal.aborted) throw error
      this.connection.cancel(requestId)
      // Wait, bounded, for the server to honor the cancellation. If it does not, the request is still
      // running: terminate the instance (disposal awaits process close) so nothing outlives the query.
      const grace = deadline(undefined, this.spec.killGraceMs, 'LSP_CANCEL_GRACE')
      try {
        // `settled` is true if the request finished (either outcome) before the grace elapsed.
        const settled = await Promise.race([
          send.then(markSettled, markSettled),
          new Promise<boolean>((resolve) => {
            /* v8 ignore next -- the cancel-grace deadline signal is freshly armed and not yet aborted here; defensive. */
            if (grace.signal.aborted) { resolve(false); return }
            grace.signal.addEventListener('abort', () => { resolve(false) }, { once: true })
          }),
        ])
        if (!settled) await this.startTeardown()
      } finally {
        grace[Symbol.dispose]()
      }
      throw error
    }
  }

  private normalize(operation: LspOperation, payload: unknown): LspQueryResult {
    if (operation === 'hover') {
      return { kind: 'hover', hover: normalizeHover(payload) }
    }
    // The filesystem provider owns URI syntax for the execution platform, which may differ from the
    // harness host. Preserve that coordinate through rendering instead of reparsing `spec.cwd` there.
    return { kind: 'locations', locations: normalizeLocations(payload), resolvedWorkspaceUri: this.spec.workspaceUri }
  }

  private answerServerRequest(method: string, params: unknown): Promise<unknown> {
    if (method === 'workspace/configuration') {
      // Answer every requested item with the one static configuration value.
      const record = params as { items?: unknown[] } | null
      /* v8 ignore next -- a configuration request always carries an items array; the empty fallback is defensive. */
      const items = Array.isArray(record?.items) ? record.items : []
      return Promise.resolve(items.map(() => this.spec.configuration))
    }
    if (LIFECYCLE_NOOP_METHODS.has(method)) {
      // Accept lifecycle bookkeeping requests with an empty result; we register nothing dynamic.
      return Promise.resolve(null)
    }
    if (method === 'workspace/applyEdit') {
      // This host never applies edits or runs commands.
      return Promise.reject(new Error('workspace/applyEdit is not permitted by this host'))
    }
    return Promise.reject(new Error(`unsupported server request: ${method}`))
  }

  /**
   * Reject queued work, attempt graceful `shutdown`/`exit`, then escalate SIGTERM→SIGKILL, awaiting
   * process close so nothing outlives disposal.
   */
  async dispose(): Promise<void> {
    await this.startTeardown()
  }

  /** Publish disposal once and make every caller await the same quiescence boundary. */
  private startTeardown(): Promise<void> {
    this.disposed = true
    this.teardownPromise ??= this.tearDown()
    return this.teardownPromise
  }

  private async tearDown(): Promise<void> {
    const shutdownDeadline = deadline(undefined, this.spec.shutdownTimeoutMs, 'LSP_SHUTDOWN')
    try {
      await this.gracefulShutdown(shutdownDeadline.signal)
    } catch {
      // Graceful shutdown failed or timed out; process-tree cleanup below remains authoritative.
    } finally {
      shutdownDeadline[Symbol.dispose]()
    }
    await this.forceTerminate()
  }

  /** Best-effort LSP `shutdown`/`exit`, including process close, bounded by `signal`. */
  private async gracefulShutdown(signal: AbortSignal): Promise<void> {
    await abortable(this.connection.request('shutdown', null), signal)
    await this.connection.notify('exit', null)
    await abortable(this.connection.closed, signal)
  }

  /**
   * Terminate the tree (the seam escalates SIGTERM→`killGraceMs`→SIGKILL),
   * then await leader and helper exit. The awaits are unbounded on purpose:
   * the seam's escalation already committed to SIGKILL, so quiescence — not
   * another timer — is the postcondition disposal owes its callers.
   */
  private async forceTerminate(): Promise<void> {
    this.connection.terminate()
    await Promise.all([
      this.connection.closed,
      this.connection.waitForProcessTreeExit(),
    ])
  }
}

interface CachedDiagnostics {
  readonly diagnostics: readonly LspDiagnostic[]
  readonly revision: number
  readonly version?: number
}

interface DiagnosticWaiter {
  readonly afterRevision: number
  readonly minimumVersion: number
  resolve(diagnostics: readonly LspDiagnostic[]): void
}

const MAX_CACHED_DIAGNOSTICS = 100
const MAX_DIAGNOSTIC_MESSAGE_CHARS = 1_000
const MAX_DIAGNOSTIC_FILES = 128
const MAX_TRACKED_DOCUMENT_VERSIONS = 512

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function normalizeDiagnostic(value: unknown): LspDiagnostic[] {
  if (!isRecord(value) || typeof value.message !== 'string' || !isRecord(value.range)) return []
  const start = normalizePosition(value.range.start)
  const end = normalizePosition(value.range.end)
  if (start === undefined || end === undefined) return []
  const severity = value.severity === 1 || value.severity === 2 || value.severity === 3 || value.severity === 4
    ? value.severity
    : undefined
  const code = typeof value.code === 'string' || (typeof value.code === 'number' && Number.isFinite(value.code))
    ? value.code
    : undefined
  const source = typeof value.source === 'string' ? value.source.slice(0, 100) : undefined
  return [{
    range: { start, end },
    message: value.message.slice(0, MAX_DIAGNOSTIC_MESSAGE_CHARS),
    ...(severity !== undefined ? { severity } : {}),
    ...(code !== undefined ? { code } : {}),
    ...(source !== undefined ? { source } : {}),
  }]
}

function normalizePosition(value: unknown): { line: number; character: number } | undefined {
  if (!isRecord(value) || !Number.isInteger(value.line) || !Number.isInteger(value.character)
    || (value.line as number) < 0 || (value.character as number) < 0) return undefined
  return { line: value.line as number, character: value.character as number }
}

/** Server→client request methods this host acknowledges with an empty result (no dynamic registration). */
const LIFECYCLE_NOOP_METHODS = new Set([
  'window/workDoneProgress/create',
  'client/registerCapability',
  'client/unregisterCapability',
])

/** Mark a settled request in the cancel-grace race (either outcome means the request finished). */
function markSettled(): boolean {
  return true
}

/**
 * The client capabilities advertised at `initialize`: UTF-16 positions, workspace folders and
 * configuration, markdown/plaintext hover, and link support for definition/implementation. No
 * dynamic registration; the server's returned capabilities are authoritative.
 */
const CLIENT_CAPABILITIES = {
  general: { positionEncodings: ['utf-16'] },
  workspace: { workspaceFolders: true, configuration: true },
  textDocument: {
    synchronization: { dynamicRegistration: false },
    hover: { contentFormat: ['markdown', 'plaintext'] },
    definition: { linkSupport: true },
    implementation: { linkSupport: true },
    references: {},
  },
} as const
