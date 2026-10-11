import { randomUUID } from 'node:crypto'
import { spawn, type ChildProcess } from 'node:child_process'
import net from 'node:net'
import { mkdir, readFile, realpath } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright-core'
import type { AriaRole, Browser, BrowserContext, Locator, Page } from 'playwright-core'

export const ACTION_TIMEOUT_MS = 10_000
export const SESSION_TIMEOUT_MS = 5 * 60_000

export type UiTarget =
  | { testId: string; role?: never; name?: never }
  | { role: AriaRole; name: string; testId?: never }

export interface UiVerifyLaunchOptions {
  /** Supplied by the trusted Host from the active session cwd, never by model tool arguments. */
  root: string
  /** Host-chosen directory for screenshots, trace, and isolated user data. */
  artifactsDir: string
  actionTimeoutMs?: number
  sessionTimeoutMs?: number
  launchTimeoutMs?: number
}

export interface UiAssertion {
  kind: 'visible' | 'text'
  target: UiTarget
  text?: string
}

export interface UiAssertionResult {
  kind: UiAssertion['kind']
  target: UiTarget
  passed: boolean
  screenshot?: string
  error?: string
}

export function validateUiTarget(target: UiTarget): void {
  if (!target || typeof target !== 'object') throw new Error('UI actions require a testid or role/name target')
  if ('testId' in target) {
    if (typeof target.testId !== 'string' || target.testId.trim() === '' || 'role' in target || 'name' in target) {
      throw new Error('testId targets must contain only a non-empty testId')
    }
    return
  }
  if (!('role' in target) || !('name' in target)) {
    throw new Error('UI actions require a testid or role/name target')
  }
  if (typeof target.role !== 'string' || typeof target.name !== 'string' || !target.name.trim()) {
    throw new Error('role targets require both role and a non-empty accessible name')
  }
}

export function createUiVerifyEnvironment(
  userDataPath: string,
  sourceEnvironment: NodeJS.ProcessEnv = process.env,
  runtimeRoot?: string,
  startupTracePath?: string,
): NodeJS.ProcessEnv {
  const allow = ['PATH', 'HOME', 'TMPDIR', 'TEMP', 'TMP', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TERM', 'SYSTEMROOT', 'WINDIR']
  const env: NodeJS.ProcessEnv = {}
  for (const key of allow) {
    const value = sourceEnvironment[key]
    if (value !== undefined) env[key] = value
  }
  env.TASKWEAVER_E2E = '1'
  env.TASKWEAVER_UI_VERIFY = '1'
  env.TASKWEAVER_UI_VERIFY_MOCK = '1'
  env.TASKWEAVER_USER_DATA = userDataPath
  // Keep the Host's canonical runtime home in the same isolated userData tree.
  // Do not pass legacy home variables: runtime migration treats them as source
  // directories and could otherwise copy real user credentials into the E2E.
  const runtimeHome = path.join(userDataPath, 'runtime-home')
  env.TASKWEAVER_HOME = runtimeHome
  // Resolve the current checkout's retained Host artifacts explicitly. A
  // developer may have an ignored/stale vendor deployment from an earlier
  // package build; UI verification must not silently pick that up.
  if (runtimeRoot) env.TASKWEAVER_RUNTIME = path.resolve(runtimeRoot)
  if (startupTracePath) {
    env.TASKWEAVER_STARTUP_TRACE = '1'
    env.TASKWEAVER_STARTUP_TRACE_FILE = path.resolve(startupTracePath)
  }
  return env
}

async function assertTaskWeaverRoot(root: string): Promise<string> {
  const canonical = await realpath(root)
  const manifestPath = path.join(canonical, 'package.json')
  const manifest: unknown = JSON.parse(await readFile(manifestPath, 'utf8'))
  if (!manifest || typeof manifest !== 'object' || (manifest as { name?: unknown }).name !== 'taskweaver-desktop') {
    throw new Error('UI verification is enabled only for a TaskWeaver repository (package.json name must be taskweaver-desktop)')
  }
  const shellEntry = path.join(canonical, 'backend/shell/run.mjs')
  await readFile(shellEntry, 'utf8').catch(() => {
    throw new Error('TaskWeaver UI verification requires the shell backend entry at backend/shell/run.mjs')
  })
  return canonical
}

async function reserveLoopbackPort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      server.close((error) => (error ? reject(error) : resolve(port)))
    })
  })
}

async function waitForShellHealth(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/shell/v1/health`, { signal: AbortSignal.timeout(1_500) })
      if (response.ok) return
    } catch {
      /* retry */
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`Shell backend did not become healthy on port ${port} within ${timeoutMs}ms`)
}

/**
 * A bounded, isolated Playwright session (Vite + shell HTTP backend) for the
 * current TaskWeaver development checkout.
 */
export class UiVerifySession {
  readonly root: string
  readonly artifactsDir: string
  readonly userDataPath: string
  readonly startupTracePath: string
  readonly actionTimeoutMs: number
  readonly sessionTimeoutMs: number
  private readonly startedAt = Date.now()
  private browser: Browser | null = null
  private context: BrowserContext | null = null
  private shellProcess: ChildProcess | null = null
  private page: Page | null = null
  private readonly errors: string[] = []
  private readonly processLogs: string[] = []
  private screenshotCounter = 0
  private closed = false
  private sessionTimeout: ReturnType<typeof setTimeout> | undefined
  private traceStarted = false

  private constructor(options: UiVerifyLaunchOptions, root: string) {
    this.root = root
    this.artifactsDir = path.resolve(options.artifactsDir, `${Date.now()}-${randomUUID()}`)
    this.userDataPath = path.join(this.artifactsDir, 'user-data')
    this.startupTracePath = path.join(this.artifactsDir, 'startup-trace.jsonl')
    this.actionTimeoutMs = Math.max(1, Math.min(options.actionTimeoutMs ?? ACTION_TIMEOUT_MS, ACTION_TIMEOUT_MS))
    this.sessionTimeoutMs = Math.max(1, Math.min(options.sessionTimeoutMs ?? SESSION_TIMEOUT_MS, SESSION_TIMEOUT_MS))
  }

  static async launch(options: UiVerifyLaunchOptions): Promise<UiVerifySession> {
    const root = await assertTaskWeaverRoot(options.root)
    const session = new UiVerifySession(options, root)
    await mkdir(session.artifactsDir, { recursive: true })
    await mkdir(session.userDataPath, { recursive: true })
    // A pre-existing destination makes first-start migration skip all legacy
    // home candidates (including ~/.dsh) for this disposable UI session.
    await mkdir(path.join(session.userDataPath, 'runtime-home'), { recursive: true })
    const shellPort = await reserveLoopbackPort()
    const shellEnv = createUiVerifyEnvironment(
      session.userDataPath,
      process.env,
      path.join(root, 'packages/runtime'),
      session.startupTracePath,
    )
    shellEnv.TASKWEAVER_SHELL_SERVER = '1'
    shellEnv.TASKWEAVER_SHELL_PORT = String(shellPort)
    shellEnv.TASKWEAVER_SHELL_HOST = '127.0.0.1'
    const shellEntry = path.join(root, 'backend/shell/run.mjs')
    const shellProcess = spawn(process.execPath, [shellEntry], {
      cwd: root,
      env: shellEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    session.shellProcess = shellProcess
    for (const [streamName, stream] of [['stdout', shellProcess.stdout], ['stderr', shellProcess.stderr]] as const) {
      stream?.on('data', (chunk: Buffer | string) => {
        session.processLogs.push(`[${streamName}] ${String(chunk)}`)
        while (session.processLogs.reduce((size, line) => size + line.length, 0) > 32_000) {
          session.processLogs.shift()
        }
      })
    }
    const launchTimeout = options.launchTimeoutMs ?? 60_000
    try {
      await waitForShellHealth(shellPort, launchTimeout)
      const browser = await chromium.launch({ timeout: launchTimeout })
      session.browser = browser
      const context = await browser.newContext()
      session.context = context
      await context.tracing.start({ screenshots: true, snapshots: true, sources: false })
      session.traceStarted = true
      const page = await context.newPage()
      session.observePage(page)
      const shellApi = encodeURIComponent(`http://127.0.0.1:${shellPort}`)
      await page.goto(`http://127.0.0.1:5173/?shellApi=${shellApi}`, { timeout: launchTimeout, waitUntil: 'domcontentloaded' })
      session.page = page
      const remaining = session.sessionTimeoutMs - (Date.now() - session.startedAt)
      if (remaining <= 0) throw new Error(`UI verification session exceeded its ${session.sessionTimeoutMs}ms limit during launch`)
      session.sessionTimeout = setTimeout(() => {
        void session.close().catch((error) => {
          session.errors.push(`session timeout cleanup: ${error instanceof Error ? error.message : String(error)}`)
        })
      }, remaining)
      session.sessionTimeout.unref?.()
      return session
    } catch (error) {
      await session.close()
      throw error
    }
  }

  async startupTraceEvents(): Promise<Array<{ event: string; elapsedMs: number; [key: string]: unknown }>> {
    const raw = await readFile(this.startupTracePath, 'utf8').catch(() => '')
    return raw.split(/\r?\n/).filter(Boolean).flatMap((line) => {
      try {
        const event: unknown = JSON.parse(line)
        if (!event || typeof event !== 'object') return []
        const row = event as { event?: unknown; elapsedMs?: unknown }
        if (typeof row.event !== 'string' || !Number.isFinite(row.elapsedMs)) return []
        return [event as { event: string; elapsedMs: number; [key: string]: unknown }]
      } catch {
        return []
      }
    })
  }

  private readonly observedPages = new WeakSet<Page>()

  private observePage(page: Page): void {
    if (this.observedPages.has(page)) return
    this.observedPages.add(page)
    page.on('console', (message) => {
      if (message.type() === 'error') this.errors.push(`console: ${message.text()}`)
    })
    page.on('pageerror', (error) => this.errors.push(`pageerror: ${error.stack ?? error.message}`))
    page.on('crash', () => this.errors.push('page crashed'))
  }

  private currentPage(): Page {
    if (this.closed || !this.page) throw new Error('UI verification session is not running')
    if (Date.now() - this.startedAt >= this.sessionTimeoutMs) {
      throw new Error(`UI verification session exceeded its ${this.sessionTimeoutMs}ms limit`)
    }
    return this.page
  }

  private locator(target: UiTarget): Locator {
    validateUiTarget(target)
    const page = this.currentPage()
    return 'testId' in target
      ? page.getByTestId(target.testId)
      : page.getByRole(target.role, { name: target.name, exact: true })
  }

  private async action<T>(operation: (page: Page) => Promise<T>): Promise<T> {
    const page = this.currentPage()
    const remaining = this.sessionTimeoutMs - (Date.now() - this.startedAt)
    if (remaining <= 0) throw new Error(`UI verification session exceeded its ${this.sessionTimeoutMs}ms limit`)
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        operation(page),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error(`UI action exceeded ${this.actionTimeoutMs}ms`)), Math.min(this.actionTimeoutMs, remaining))
        }),
      ])
    } finally {
      if (timer !== undefined) clearTimeout(timer)
    }
  }

  async snapshot(): Promise<string> {
    return await this.action((page) => page.locator('body').ariaSnapshot({ timeout: this.actionTimeoutMs }))
  }

  async click(target: UiTarget): Promise<void> {
    const locator = this.locator(target)
    await this.action(() => locator.click({ timeout: this.actionTimeoutMs }))
  }

  async fill(target: UiTarget, value: string): Promise<void> {
    const locator = this.locator(target)
    await this.action(() => locator.fill(value, { timeout: this.actionTimeoutMs }))
  }

  async press(target: UiTarget, key: string): Promise<void> {
    if (typeof key !== 'string' || key.length === 0 || key.length > 40) throw new Error('key must be a non-empty short Playwright key name')
    const locator = this.locator(target)
    await this.action(() => locator.press(key, { timeout: this.actionTimeoutMs }))
  }

  async waitFor(target: UiTarget, state: 'visible' | 'hidden' = 'visible'): Promise<void> {
    const locator = this.locator(target)
    await this.action(() => locator.waitFor({ state, timeout: this.actionTimeoutMs }))
  }

  async expectVisible(target: UiTarget): Promise<void> {
    await this.waitFor(target, 'visible')
  }

  async expectText(target: UiTarget, text: string): Promise<void> {
    if (typeof text !== 'string' || text.length > 2_000) throw new Error('expected text must be a string of at most 2000 characters')
    const locator = this.locator(target)
    await this.action(() => locator.getByText(text, { exact: false }).waitFor({ state: 'visible', timeout: this.actionTimeoutMs }))
  }

  screenshotPath(name?: string): string {
    this.currentPage()
    const label = (name ?? `step-${++this.screenshotCounter}`)
      .replace(/[^a-z0-9._-]/giu, '-')
      .slice(0, 80) || `step-${++this.screenshotCounter}`
    return path.join(this.artifactsDir, `${label}.png`)
  }

  async screenshot(name?: string): Promise<string> {
    const page = this.currentPage()
    const output = this.screenshotPath(name)
    await this.action(() => page.screenshot({ path: output, fullPage: false, timeout: this.actionTimeoutMs }))
    return output
  }

  consoleErrors(): string[] {
    return [...this.errors]
  }

  processOutput(): string {
    return this.processLogs.join('').slice(-32_000)
  }

  async saveTrace(): Promise<string | undefined> {
    const context = this.context
    if (!context || !this.traceStarted) return undefined
    this.traceStarted = false
    const output = path.join(this.artifactsDir, 'trace.zip')
    await context.tracing.stop({ path: output })
    return output
  }

  processId(): number | undefined {
    const pid = this.shellProcess?.pid
    return Number.isSafeInteger(pid) && (pid ?? 0) > 0 ? pid : undefined
  }

  async check(assertions: readonly UiAssertion[]): Promise<UiAssertionResult[]> {
    if (assertions.length === 0 || assertions.length > 20) throw new Error('ui_check requires between 1 and 20 assertions')
    const results: UiAssertionResult[] = []
    for (const assertion of assertions) {
      try {
        if (assertion.kind === 'visible') await this.expectVisible(assertion.target)
        else if (assertion.kind === 'text' && assertion.text !== undefined) await this.expectText(assertion.target, assertion.text)
        else throw new Error('text assertions require expected text')
        results.push({ kind: assertion.kind, target: assertion.target, passed: true, screenshot: await this.screenshot() })
      } catch (error) {
        results.push({
          kind: assertion.kind,
          target: assertion.target,
          passed: false,
          error: error instanceof Error ? error.message : String(error),
          screenshot: this.page ? await this.screenshot().catch(() => undefined) : undefined,
        })
      }
    }
    return results
  }

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    if (this.sessionTimeout !== undefined) clearTimeout(this.sessionTimeout)
    this.sessionTimeout = undefined
    const browser = this.browser
    const context = this.context
    const shellProcess = this.shellProcess
    this.browser = null
    this.context = null
    this.shellProcess = null
    this.page = null
    try {
      if (this.traceStarted && context) {
        this.traceStarted = false
        await context.tracing.stop({ path: path.join(this.artifactsDir, 'trace.zip') })
      }
    } catch (error) {
      this.errors.push(`trace cleanup: ${error instanceof Error ? error.message : String(error)}`)
    }
    try {
      await Promise.race([
        browser?.close(),
        new Promise<void>((resolve) => setTimeout(resolve, 5_000)),
      ])
    } catch (error) {
      this.errors.push(`browser cleanup: ${error instanceof Error ? error.message : String(error)}`)
    }
    if (shellProcess && shellProcess.exitCode === null && shellProcess.signalCode === null) {
      const exited = new Promise<void>((resolve) => shellProcess.once('exit', () => resolve()))
      shellProcess.kill('SIGTERM')
      await Promise.race([exited, new Promise<void>((resolve) => setTimeout(resolve, 2_000))])
      if (shellProcess.exitCode === null && shellProcess.signalCode === null) shellProcess.kill('SIGKILL')
    }
  }
}

export async function assertTaskWeaverProject(root: string): Promise<string> {
  return await assertTaskWeaverRoot(root)
}
