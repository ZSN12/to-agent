/**
 * CPython subprocess implementation of `ctx.codeRuntime`.
 * @module @taskweaver/dsh-code-runtime-python/src/python-runtime
 */

import { constants as fsConstants } from 'node:fs'
import { access } from 'node:fs/promises'
import { delimiter, dirname, resolve } from 'node:path'
import { spawn, type ChildProcess } from 'node:child_process'
import type { Duplex, Readable } from 'node:stream'
import { StringDecoder } from 'node:string_decoder'
import { fileURLToPath } from 'node:url'
import { Context } from '@taskweaver/cordis'
import z from '@taskweaver/schemastery'
import { CodeRuntime, DUNDER_MEMBER, PORTABLE_RESERVED_WORDS, RESERVED_BINDING_GLOBALS, RESERVED_ERROR_MEMBERS } from '@taskweaver/dsh-code-runtime'
import type { CodeBindingNamespace, CodeJsonValue, CodeRunFailure, CodeRunRequest, CodeRunResult } from '@taskweaver/dsh-code-runtime'
import type { SandboxExecutionPolicy, SandboxPolicy } from '@taskweaver/dsh-sandbox'
import { snapshotJsonValue } from '@taskweaver/dsh-session'
import type {} from '@taskweaver/dsh-sandbox'
import type {} from '@taskweaver/dsh-sandbox-policy'
import { checkDoneValue, encodeJsonPlain, hasUnsafeIntegerToken, PROTOCOL_FD, validateChildFrame } from './protocol.ts'

// Resolve the package's `py/` folder from both src/ and lib/ entrypoints.
const RUNNER_PATH = fileURLToPath(new URL('../py/runner.py', import.meta.url))
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/
const MAX_TIMER_DELAY_MS = 2_147_483_647
const PYTHON_PROBE_TIMEOUT_MS = 2_500
const KILL_GRACE_MS = 250
const MIN_OUTPUT_BYTES = 4
const INSTALL_GUIDANCE = 'Install CPython 3.9 or newer and make its python3 executable available on PATH.'

/** Runtime limits for Python code execution. */
export interface Config {
  /** Wall-clock ceiling, including interpreter startup and binding waits. */
  maxWallMs?: number
  /** CPython CPU-time limit in seconds where the platform supports RLIMIT_CPU. */
  cpuSeconds?: number
  /** Linux address-space ceiling; macOS relies on wall time and output caps. */
  addressSpaceBytes?: number
  /** Child-side combined UTF-8 stdout/stderr cap. */
  maxLogBytes?: number
  /** Maximum compact JSON completion value size. */
  maxValueBytes?: number
  /** Host-side combined result payload cap, including logs and failure text. */
  maxOutputBytes?: number
  /** Maximum size of any one inbound fd-3 JSON frame. */
  maxFrameBytes?: number
}

type ResolvedConfig = Required<Config>

/** A validated Python interpreter found on the user's PATH. */
export interface PythonExecutable {
  path: string
  version: string
}

/** Interpreter discovery either returns one usable CPython or actionable guidance. */
export type PythonDiscovery = { executable: PythonExecutable } | { error: string }

interface LiveRun {
  abort(failure: CodeRunFailure): void
  finished: Promise<void>
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function isCommandLineToolsStub(executablePath: string, detail: string): boolean {
  const normalized = executablePath.replaceAll('\\', '/')
  return /(?:^|\/)CommandLineTools\/usr\/bin\/python3$/.test(normalized)
    || /xcode-select|Command Line Tools|developer tools were found/i.test(detail)
}

function unavailablePythonMessage(sawCltStub: boolean): string {
  return sawCltStub
    ? `The macOS Command Line Tools python3 entry is only an inactive installer stub. ${INSTALL_GUIDANCE}`
    : `A usable python3 executable was not found. ${INSTALL_GUIDANCE}`
}

function pythonVersion(output: string): string | undefined {
  const match = /(?:^|\n)(\d+)\.(\d+)\.(\d+)(?:\n|$)/.exec(output.trim())
  if (match === null) return undefined
  const major = Number(match[1])
  const minor = Number(match[2])
  return major > 3 || (major === 3 && minor >= 9) ? `${match[1]}.${match[2]}.${match[3]}` : undefined
}

function pathCandidates(pathValue: string | undefined, platform: string): string[] {
  if (platform === 'win32') return []
  const names = ['python3']
  const candidates = new Set<string>()
  for (const directory of (pathValue ?? '').split(delimiter)) {
    if (directory.length === 0) continue
    for (const name of names) candidates.add(resolve(directory, name))
  }
  return [...candidates]
}

async function probeExecutable(executablePath: string): Promise<{ version?: string; detail: string }> {
  return await new Promise((resolveProbe) => {
    let stdout = ''
    let stderr = ''
    let settled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const child = spawn(executablePath, ['-I', '-B', '-c', 'import sys; print("%d.%d.%d" % sys.version_info[:3])'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      env: process.env,
    })
    const finish = (result: { version?: string; detail: string }): void => {
      if (settled) return
      settled = true
      if (timer !== undefined) clearTimeout(timer)
      resolveProbe(result)
    }
    const capture = (sink: 'stdout' | 'stderr', chunk: Buffer): void => {
      if (settled) return
      const target = sink === 'stdout' ? stdout : stderr
      if (target.length < 2048) {
        const text = chunk.toString('utf8')
        if (sink === 'stdout') stdout += text.slice(0, 2048 - stdout.length)
        else stderr += text.slice(0, 2048 - stderr.length)
      }
    }
    child.stdout?.on('data', (chunk: Buffer) => capture('stdout', chunk))
    child.stderr?.on('data', (chunk: Buffer) => capture('stderr', chunk))
    child.once('error', error => finish({ detail: error.message }))
    child.once('close', code => {
      const output = `${stdout}\n${stderr}`
      const version = code === 0 ? pythonVersion(stdout) : undefined
      finish({ ...(version === undefined ? {} : { version }), detail: output.trim() || `python3 exited with code ${String(code)}` })
    })
    timer = setTimeout(() => {
      try { child.kill('SIGKILL') } catch { /* The close/error event remains the completion signal. */ }
      finish({ detail: `python3 probe exceeded ${PYTHON_PROBE_TIMEOUT_MS}ms` })
    }, PYTHON_PROBE_TIMEOUT_MS)
    timer.unref?.()
  })
}

/**
 * Probe only executables named `python3` on PATH. The probe executes no user
 * code and rejects macOS Command Line Tools' placeholder, non-CPython output,
 * and interpreters older than the package's supported Python 3.9 floor.
 */
export async function discoverPython3(
  pathValue: string | undefined = process.env.PATH,
  platform: string = process.platform,
): Promise<PythonDiscovery> {
  if (platform === 'win32') {
    return { error: `The TaskWeaver Python code runtime does not support Windows yet. ${INSTALL_GUIDANCE}` }
  }
  let sawCltStub = false
  for (const candidate of pathCandidates(pathValue, platform)) {
    try {
      await access(candidate, fsConstants.X_OK)
    } catch {
      continue
    }
    const probe = await probeExecutable(candidate)
    if (probe.version !== undefined) return { executable: { path: candidate, version: probe.version } }
    sawCltStub ||= isCommandLineToolsStub(candidate, probe.detail)
  }
  return { error: unavailablePythonMessage(sawCltStub) }
}

function validateBindings(request: CodeRunRequest): Map<string, CodeBindingNamespace> {
  const bindings = new Map<string, CodeBindingNamespace>()
  for (const namespace of request.bindings) {
    if (!IDENTIFIER.test(namespace.global) || PORTABLE_RESERVED_WORDS.has(namespace.global)) {
      throw new Error(`dsh-code-runtime-python: binding global ${JSON.stringify(namespace.global)} is not a usable identifier`)
    }
    if (RESERVED_BINDING_GLOBALS.has(namespace.global)) {
      throw new Error(`dsh-code-runtime-python: reserved binding global ${JSON.stringify(namespace.global)}`)
    }
    if (bindings.has(namespace.global)) {
      throw new Error(`dsh-code-runtime-python: duplicate binding global ${JSON.stringify(namespace.global)}`)
    }
    bindings.set(namespace.global, namespace)
  }
  const injectedNames = new Set<string>()
  for (const namespace of request.bindings) {
    const descriptor = namespace.errorClass
    if (descriptor === undefined) continue
    if (!IDENTIFIER.test(descriptor.name) || PORTABLE_RESERVED_WORDS.has(descriptor.name)) {
      throw new Error(`dsh-code-runtime-python: binding error class ${JSON.stringify(descriptor.name)} is not a usable identifier`)
    }
    if (RESERVED_BINDING_GLOBALS.has(descriptor.name) || bindings.has(descriptor.name) || injectedNames.has(descriptor.name)) {
      throw new Error(`dsh-code-runtime-python: duplicate or reserved injected global ${JSON.stringify(descriptor.name)}`)
    }
    const member = descriptor.memberNameProperty
    if (member.length === 0 || RESERVED_ERROR_MEMBERS.has(member) || DUNDER_MEMBER.test(member)) {
      throw new Error(`dsh-code-runtime-python: binding error member property ${JSON.stringify(member)} is not usable`)
    }
    injectedNames.add(descriptor.name)
  }
  return bindings
}

/** Exact escaped JSON byte size for one string; stops without allocating its escaped form. */
function jsonStringBytesUpTo(text: string, maxBytes: number): number | undefined {
  let bytes = 2
  if (bytes > maxBytes) return undefined
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index)
    if (code === 0x22 || code === 0x5c || code === 0x08 || code === 0x09 || code === 0x0a || code === 0x0c || code === 0x0d) bytes += 2
    else if (code < 0x20) bytes += 6
    else if (code < 0x80) bytes += 1
    else if (code < 0x800) bytes += 2
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < text.length) {
      const next = text.charCodeAt(index + 1)
      if (next >= 0xdc00 && next <= 0xdfff) { bytes += 4; index++ }
      else bytes += 6
    } else if (code >= 0xd800 && code <= 0xdfff) bytes += 6
    else bytes += 3
    if (bytes > maxBytes) return undefined
  }
  return bytes
}

function truncateJsonString(text: string, maxBytes: number): string {
  const prefix: string[] = []
  let bytes = 2
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index)
    let width: number
    let part = text[index] as string
    if (code === 0x22 || code === 0x5c || code === 0x08 || code === 0x09 || code === 0x0a || code === 0x0c || code === 0x0d) width = 2
    else if (code < 0x20) width = 6
    else if (code < 0x80) width = 1
    else if (code < 0x800) width = 2
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < text.length) {
      const next = text.charCodeAt(index + 1)
      if (next >= 0xdc00 && next <= 0xdfff) { width = 4; part += text[++index] as string }
      else width = 6
    } else if (code >= 0xd800 && code <= 0xdfff) width = 6
    else width = 3
    if (bytes + width > maxBytes) break
    bytes += width
    prefix.push(part)
  }
  return prefix.join('')
}

/** Host-side result ledger bounds logs plus completion value or failure text. */
class OutputLedger {
  private bytes = 2
  private entries = 0

  constructor(private readonly maxBytes: number) {}

  admit(text: string, logs: string[]): boolean {
    const separator = this.entries > 0 ? 1 : 0
    const size = jsonStringBytesUpTo(text, this.maxBytes - this.bytes - separator)
    if (size === undefined) return false
    this.bytes += separator + size
    this.entries++
    logs.push(text)
    return true
  }

  success(logs: string[], value?: CodeJsonValue): CodeRunResult {
    if (value !== undefined && !checkDoneValue(value, this.maxBytes - this.bytes).ok) return this.limit(logs)
    return { logs, ...(value === undefined ? {} : { value }) }
  }

  failure(logs: string[], error: CodeRunFailure): CodeRunResult {
    if (jsonStringBytesUpTo(error.message, this.maxBytes - this.bytes) === undefined) return this.limit(logs)
    return { logs, error }
  }

  limit(logs: string[]): CodeRunResult {
    const fullMessage = `outer output exceeded ${this.maxBytes} bytes`
    const retained: string[] = []
    let used = 2
    const messageBudget = Math.max(2, this.maxBytes - used)
    const message = truncateJsonString(fullMessage, messageBudget)
    const messageBytes = jsonStringBytesUpTo(message, messageBudget) ?? message.length + 2
    const logsBudget = Math.max(2, this.maxBytes - messageBytes)
    for (const text of logs) {
      const separator = retained.length > 0 ? 1 : 0
      const available = logsBudget - used - separator
      const exact = jsonStringBytesUpTo(text, available)
      if (exact !== undefined) {
        retained.push(text)
        used += separator + exact
        continue
      }
      const prefix = truncateJsonString(text, available)
      if (prefix.length > 0 && jsonStringBytesUpTo(prefix, available) !== undefined) retained.push(prefix)
      break
    }
    return { logs: retained, error: { kind: 'output-limit', message } }
  }
}

function processEnvForPython(pythonPath: string): NodeJS.ProcessEnv {
  const pathEntries = [dirname(pythonPath), '/usr/local/bin', '/opt/homebrew/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin']
  return {
    PATH: [...new Set(pathEntries)].join(delimiter),
    PYTHONIOENCODING: 'utf-8',
    PYTHONDONTWRITEBYTECODE: '1',
  }
}

function signalProcessTree(child: ChildProcess, signal: NodeJS.Signals): void {
  if (child.pid === undefined) return
  try {
    if (process.platform !== 'win32') process.kill(-child.pid, signal)
    else child.kill(signal)
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException)?.code !== 'ESRCH') {
      try { child.kill(signal) } catch { /* The process may have exited between the two signals. */ }
    }
  }
}

/**
 * CPython subprocess code runtime. Each call gets a fresh interpreter process;
 * model code runs only after the resolved sandbox policy has been applied.
 */
export class PythonCodeRuntime extends CodeRuntime {
  static Config: z<Config> = z.object({
    maxWallMs: z.number().default(60_000),
    cpuSeconds: z.number().default(30),
    addressSpaceBytes: z.number().default(1_073_741_824),
    maxLogBytes: z.number().default(4_194_304),
    maxValueBytes: z.number().default(8_388_608),
    maxOutputBytes: z.number().default(16_777_216),
    maxFrameBytes: z.number().default(16_777_728),
  })

  readonly language = 'python'
  readonly isolation = 'process'

  private readonly config: ResolvedConfig
  private pythonPromise: Promise<PythonDiscovery> | undefined
  private readonly live = new Set<LiveRun>()
  private disposed = false

  constructor(ctx: Context, config: Config) {
    super(ctx)
    this.config = config as ResolvedConfig
    for (const [key, value] of Object.entries(this.config)) {
      if (!(Number.isSafeInteger(value) && value > 0)) {
        throw new Error(`dsh-code-runtime-python: config.${key} must be a positive safe integer, got ${String(value)}`)
      }
    }
    if (this.config.maxWallMs > MAX_TIMER_DELAY_MS) {
      throw new Error(`dsh-code-runtime-python: config.maxWallMs must be at most ${MAX_TIMER_DELAY_MS}`)
    }
    if (this.config.maxOutputBytes < MIN_OUTPUT_BYTES) {
      throw new Error(`dsh-code-runtime-python: config.maxOutputBytes must be at least ${MIN_OUTPUT_BYTES}`)
    }
    if (this.config.maxFrameBytes < Math.max(1024, this.config.maxValueBytes + 128)) {
      throw new Error('dsh-code-runtime-python: config.maxFrameBytes must fit maxValueBytes plus a protocol envelope and be at least 1024 bytes')
    }
    ctx.effect(() => () => this.teardown(), 'python code-runtime teardown')
  }

  private async teardown(): Promise<void> {
    this.disposed = true
    const runs = [...this.live]
    for (const run of runs) run.abort({ kind: 'abort', message: 'runtime disposed' })
    await Promise.all(runs.map(run => run.finished))
  }

  async run(request: CodeRunRequest): Promise<CodeRunResult> {
    if (this.disposed) throw new Error('dsh-code-runtime-python: run() after disposal')
    const bindings = validateBindings(request)
    const output = new OutputLedger(this.config.maxOutputBytes)
    if (request.signal?.aborted) return output.failure([], { kind: 'abort', message: String(request.signal.reason) })
    if (Buffer.byteLength(request.program, 'utf8') + 64 > this.config.maxFrameBytes) {
      return output.failure([], { kind: 'output-limit', message: `program exceeded the ${this.config.maxFrameBytes}-byte protocol frame limit` })
    }

    this.pythonPromise ??= discoverPython3()
    const discovered = await this.pythonPromise
    if ('error' in discovered) return output.failure([], { kind: 'worker-exit', message: discovered.error })
    if (request.signal?.aborted) return output.failure([], { kind: 'abort', message: String(request.signal.reason) })
    return await this.execute(request, bindings, discovered.executable)
  }

  private async execute(
    request: CodeRunRequest,
    bindings: Map<string, CodeBindingNamespace>,
    python: PythonExecutable,
  ): Promise<CodeRunResult> {
    const output = new OutputLedger(this.config.maxOutputBytes)
    const logs: string[] = []
    const answered = new Set<number>()
    const defaultPolicy = this.ctx.get('sandboxPolicy')?.resolve()
    // Resolve a direct source build against the exported seam shape too. Some
    // consumers typecheck this package against the last generated declaration
    // while the source migration is in flight, so keep the newer optional
    // request extension explicit at this boundary.
    const requestedPolicy = (request as CodeRunRequest & { sandboxPolicy?: SandboxExecutionPolicy }).sandboxPolicy
    const policy: SandboxExecutionPolicy | undefined = requestedPolicy ?? defaultPolicy
    if (policy === undefined) {
      return output.failure([], { kind: 'worker-exit', message: 'sandboxPolicy service is unavailable; refusing to launch Python code' })
    }

    const programArgv = [python.path, '-I', '-B', RUNNER_PATH]
    let argv: string[]
    try {
      if (policy.mode === 'danger-full-access') argv = programArgv
      else {
        const confinedPolicy: SandboxPolicy = {
          mode: policy.mode,
          workspaceRoot: policy.workspaceRoot,
          ...(policy.sessionId === undefined ? {} : { sessionId: policy.sessionId }),
        }
        argv = this.ctx.sandbox.confine(programArgv, confinedPolicy).argv
      }
    } catch (error: unknown) {
      return output.failure([], { kind: 'worker-exit', message: `Python sandbox setup failed: ${messageOf(error)}` })
    }

    let child: ChildProcess
    try {
      child = spawn(argv[0] as string, argv.slice(1), {
        cwd: policy.workspaceRoot,
        env: processEnvForPython(python.path),
        stdio: ['ignore', 'pipe', 'pipe', 'pipe'],
        detached: process.platform !== 'win32',
        windowsHide: true,
      })
    } catch (error: unknown) {
      return output.failure([], { kind: 'worker-exit', message: `Python process could not be started: ${messageOf(error)}` })
    }

    const protocol = child.stdio[PROTOCOL_FD] as Duplex | null
    const stdout = child.stdout as Readable | null
    const stderr = child.stderr as Readable | null
    if (protocol === null || stdout === null || stderr === null) {
      signalProcessTree(child, 'SIGKILL')
      return output.failure([], { kind: 'worker-exit', message: 'Python subprocess did not expose the required fd-3/stdout/stderr pipes' })
    }

    return await new Promise<CodeRunResult>((resolveResult) => {
      let settled = false
      let closed = false
      let completed = false
      let gotBootAck = false
      let childLogTruncated = false
      let terminalOverride: CodeRunResult | undefined
      let finalizer: (() => CodeRunResult) | undefined
      let killTimer: ReturnType<typeof setTimeout> | undefined
      let lineParts: string[] = []
      let lineBytes = 0
      let fdDecoder = new StringDecoder('utf8')
      const stdoutDecoder = new StringDecoder('utf8')
      const stderrDecoder = new StringDecoder('utf8')
      let finishResolve!: () => void
      const finished = new Promise<void>((done) => { finishResolve = done })
      let live!: LiveRun

      const finish = (makeResult: () => CodeRunResult, terminate = true): void => {
        if (settled) return
        settled = true
        finalizer = makeResult
        clearTimeout(wallTimer)
        request.signal?.removeEventListener('abort', onAbort)
        if (terminate && !closed && child.exitCode === null && child.signalCode === null) {
          signalProcessTree(child, 'SIGTERM')
          killTimer = setTimeout(() => signalProcessTree(child, 'SIGKILL'), KILL_GRACE_MS)
          killTimer.unref?.()
        }
        if (closed) complete()
      }

      const complete = (): void => {
        if (!closed || !settled || completed) return
        completed = true
        if (killTimer !== undefined) clearTimeout(killTimer)
        this.live.delete(live)
        const result = terminalOverride ?? finalizer?.() ?? output.failure(logs, { kind: 'worker-exit', message: 'Python process ended without a result' })
        finishResolve()
        resolveResult(result)
      }

      const appendLog = (text: string): void => {
        if (text.length === 0) return
        if (!output.admit(text, logs)) {
          terminalOverride = output.limit([...logs, text])
          finish(() => terminalOverride as CodeRunResult)
        }
      }

      const sendFrame = (frame: unknown): void => {
        if (settled || protocol.destroyed || !protocol.writable) return
        let encoded: string
        try { encoded = `${encodeJsonPlain(frame)}\n` }
        catch (error: unknown) {
          finish(() => output.failure(logs, { kind: 'worker-exit', message: `could not encode host protocol frame: ${messageOf(error)}` }))
          return
        }
        if (Buffer.byteLength(encoded, 'utf8') - 1 > this.config.maxFrameBytes) {
          finish(() => output.failure(logs, { kind: 'output-limit', message: `host protocol frame exceeded ${this.config.maxFrameBytes} bytes` }))
          return
        }
        try {
          protocol.write(encoded, (error?: Error | null) => {
            if (error !== undefined && error !== null) {
              finish(() => output.failure(logs, { kind: 'worker-exit', message: `Python protocol write failed: ${error.message}` }))
            }
          })
        } catch (error: unknown) {
          finish(() => output.failure(logs, { kind: 'worker-exit', message: `Python protocol write failed: ${messageOf(error)}` }))
        }
      }

      const sendRun = (): void => sendFrame({ type: 'run', program: request.program })

      const onCall = (message: Extract<NonNullable<ReturnType<typeof validateChildFrame>>, { type: 'call' }>): void => {
        if (settled || answered.has(message.id)) return
        answered.add(message.id)
        const namespace = bindings.get(message.global)
        const functions = namespace?.functions
        const fn = functions !== undefined && Object.hasOwn(functions, message.name) ? functions[message.name] : undefined
        const reply = (value: unknown): void => {
          if (settled) return
          sendFrame(value)
        }
        if (typeof fn !== 'function') {
          reply({ type: 'reply', id: message.id, ok: false, message: `unknown binding ${JSON.stringify(`${message.global}.${message.name}`)}` })
          return
        }
        void (async () => {
          try {
            const resolved = await fn(message.args)
            const snapshot = snapshotJsonValue(resolved)
            if (snapshot === undefined) {
              reply({ type: 'reply', id: message.id, ok: false, message: 'binding resolution must be lossless JSON' })
              return
            }
            const replyOutput = JSON.parse(encodeJsonPlain(snapshot)) as unknown
            if (!checkDoneValue(replyOutput, this.config.maxFrameBytes - 128).ok) {
              reply({ type: 'reply', id: message.id, ok: false, message: 'binding resolution must be lossless JSON and fit the protocol frame limit' })
              return
            }
            reply({ type: 'reply', id: message.id, ok: true, value: replyOutput })
          } catch (error: unknown) {
            reply({ type: 'reply', id: message.id, ok: false, message: truncateJsonString(messageOf(error), this.config.maxFrameBytes - 256) })
          }
        })()
      }

      const processLine = (line: string): void => {
        if (line.length === 0 || settled) return
        if (hasUnsafeIntegerToken(line)) return
        let raw: unknown
        try { raw = JSON.parse(line) as unknown }
        catch { return }
        const frame = validateChildFrame(raw)
        if (frame === undefined) return
        if (frame.type === 'boot-ack') {
          if (!gotBootAck) {
            gotBootAck = true
            sendRun()
          }
          return
        }
        if (frame.type === 'log') {
          if (childLogTruncated) return
          appendLog(frame.text)
          if (frame.truncated === true) childLogTruncated = true
          return
        }
        if (frame.type === 'call') {
          onCall(frame)
          return
        }
        if (frame.type === 'done') {
          if (frame.error !== undefined) {
            finish(() => output.failure(logs, frame.error as CodeRunFailure))
            return
          }
          if (frame.value === undefined) {
            finish(() => output.success(logs))
            return
          }
          const checked = checkDoneValue(frame.value, this.config.maxValueBytes)
          if (!checked.ok) {
            const kind = checked.reason === 'over-budget' ? 'output-limit' : 'invalid-output'
            const message = checked.reason === 'over-budget'
              ? `completion value exceeded ${this.config.maxValueBytes} bytes`
              : 'program completion must be lossless JSON'
            finish(() => output.failure(logs, { kind, message }))
            return
          }
          finish(() => output.success(logs, frame.value as CodeJsonValue))
        }
      }

      const receiveProtocol = (text: string): void => {
        let rest = text
        while (rest.length > 0 && !settled) {
          const newline = rest.indexOf('\n')
          const part = newline < 0 ? rest : rest.slice(0, newline)
          const addedBytes = Buffer.byteLength(part, 'utf8') + (newline < 0 ? 0 : 1)
          if (lineBytes + addedBytes > this.config.maxFrameBytes) {
            terminalOverride = output.failure(logs, { kind: 'output-limit', message: `protocol frame exceeded ${this.config.maxFrameBytes} bytes` })
            finish(() => terminalOverride as CodeRunResult)
            return
          }
          lineParts.push(part)
          lineBytes += addedBytes
          if (newline < 0) break
          const line = lineParts.join('')
          lineParts = []
          lineBytes = 0
          processLine(line)
          rest = rest.slice(newline + 1)
        }
      }

      const capture = (decoder: StringDecoder, chunk: Buffer): void => appendLog(decoder.write(chunk))
      stdout.on('data', (chunk: Buffer) => capture(stdoutDecoder, chunk))
      stderr.on('data', (chunk: Buffer) => capture(stderrDecoder, chunk))
      protocol.on('data', (chunk: Buffer) => receiveProtocol(fdDecoder.write(chunk)))
      protocol.once('end', () => receiveProtocol(fdDecoder.end()))
      child.once('error', (error: Error) => {
        finish(() => output.failure(logs, { kind: 'worker-exit', message: `Python process error: ${error.message}` }))
      })
      child.once('close', (code: number | null, signal: NodeJS.Signals | null) => {
        closed = true
        appendLog(stdoutDecoder.end())
        appendLog(stderrDecoder.end())
        receiveProtocol(fdDecoder.end())
        if (!settled) {
          const detail = gotBootAck ? 'before completing' : 'before acknowledging boot'
          finish(() => output.failure(logs, {
            kind: 'worker-exit',
            message: `Python process exited ${detail} (code ${String(code)}, signal ${String(signal)})`,
          }), false)
        }
        complete()
      })

      const onAbort = (): void => finish(() => output.failure(logs, { kind: 'abort', message: String(request.signal?.reason) }))
      request.signal?.addEventListener('abort', onAbort, { once: true })
      const wallTimer = setTimeout(() => {
        finish(() => output.failure(logs, { kind: 'timeout', message: `wall-clock ceiling reached (${this.config.maxWallMs}ms)` }))
      }, this.config.maxWallMs)
      wallTimer.unref?.()
      live = { abort: failure => finish(() => output.failure(logs, failure)), finished }
      this.live.add(live)

      const bootFrame = {
        type: 'boot',
        cpuSeconds: this.config.cpuSeconds,
        addressSpaceBytes: this.config.addressSpaceBytes,
        maxLogBytes: this.config.maxLogBytes,
        maxValueBytes: this.config.maxValueBytes,
        namespaces: [...bindings].map(([global, namespace]) => ({
          global,
          names: Object.keys(namespace.functions),
          ...(namespace.errorClass === undefined ? {} : { errorClass: namespace.errorClass }),
        })),
      }
      sendFrame(bootFrame)
    })
  }
}

export default PythonCodeRuntime
