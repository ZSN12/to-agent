import { mkdir, readFile, realpath } from 'node:fs/promises'
import path from 'node:path'
import { _electron } from 'playwright-core'
import type { AriaRole, ElectronApplication, Locator, Page } from 'playwright-core'

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
  if (!('role' in target) || !('name' in target) || !target.name.trim()) {
    throw new Error('role targets require both role and a non-empty accessible name')
  }
}

function safeEnvironment(userDataPath: string): NodeJS.ProcessEnv {
  const allow = ['PATH', 'HOME', 'TMPDIR', 'TEMP', 'TMP', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TERM', 'SYSTEMROOT', 'WINDIR']
  const env: NodeJS.ProcessEnv = {}
  for (const key of allow) {
    const value = process.env[key]
    if (value !== undefined) env[key] = value
  }
  env.TASKWEAVER_E2E = '1'
  env.TASKWEAVER_USER_DATA = userDataPath
  // The current pre-P5.9 bridge fake never uses user credentials. P5.9 can
  // replace this with the dedicated local llm-mock-server contract.
  env.BRIDGE_SMOKE_MOCK = '1'
  return env
}

async function assertTaskWeaverRoot(root: string): Promise<string> {
  const canonical = await realpath(root)
  const manifestPath = path.join(canonical, 'package.json')
  const manifest: unknown = JSON.parse(await readFile(manifestPath, 'utf8'))
  if (!manifest || typeof manifest !== 'object' || (manifest as { name?: unknown }).name !== 'taskweaver-desktop') {
    throw new Error('UI verification is enabled only for a TaskWeaver repository (package.json name must be taskweaver-desktop)')
  }
  if ((manifest as { main?: unknown }).main !== 'electron/main.cjs') {
    throw new Error('TaskWeaver UI verification requires the repository Electron entry at electron/main.cjs')
  }
  return canonical
}

/**
 * A bounded, isolated Playwright Electron session for the current TaskWeaver
 * development checkout. Locators deliberately expose no arbitrary CSS or URL
 * surface to callers.
 */
export class UiVerifySession {
  readonly root: string
  readonly artifactsDir: string
  readonly userDataPath: string
  readonly actionTimeoutMs: number
  readonly sessionTimeoutMs: number
  private readonly startedAt = Date.now()
  private app: ElectronApplication | null = null
  private page: Page | null = null
  private readonly errors: string[] = []
  private screenshotCounter = 0
  private closed = false

  private constructor(options: UiVerifyLaunchOptions, root: string) {
    this.root = root
    this.artifactsDir = path.resolve(options.artifactsDir)
    this.userDataPath = path.join(this.artifactsDir, 'user-data')
    this.actionTimeoutMs = Math.min(options.actionTimeoutMs ?? ACTION_TIMEOUT_MS, ACTION_TIMEOUT_MS)
    this.sessionTimeoutMs = Math.min(options.sessionTimeoutMs ?? SESSION_TIMEOUT_MS, SESSION_TIMEOUT_MS)
  }

  static async launch(options: UiVerifyLaunchOptions): Promise<UiVerifySession> {
    const root = await assertTaskWeaverRoot(options.root)
    const session = new UiVerifySession(options, root)
    await mkdir(session.artifactsDir, { recursive: true })
    await mkdir(session.userDataPath, { recursive: true })
    const app = await _electron.launch({
      args: [root],
      cwd: root,
      env: safeEnvironment(session.userDataPath),
      timeout: options.launchTimeoutMs ?? 60_000,
    })
    session.app = app
    try {
      const page = await app.firstWindow({ timeout: options.launchTimeoutMs ?? 60_000 })
      await page.waitForLoadState('domcontentloaded', { timeout: options.launchTimeoutMs ?? 60_000 })
      session.page = page
      page.on('console', (message) => {
        if (message.type() === 'error') session.errors.push(`console: ${message.text()}`)
      })
      page.on('pageerror', (error) => session.errors.push(`pageerror: ${error.stack ?? error.message}`))
      return session
    } catch (error) {
      await session.close()
      throw error
    }
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

  async screenshot(name?: string): Promise<string> {
    const page = this.currentPage()
    const label = (name ?? `step-${++this.screenshotCounter}`)
      .replace(/[^a-z0-9._-]/giu, '-')
      .slice(0, 80) || `step-${++this.screenshotCounter}`
    const output = path.join(this.artifactsDir, `${label}.png`)
    await this.action(() => page.screenshot({ path: output, fullPage: false, timeout: this.actionTimeoutMs }))
    return output
  }

  consoleErrors(): string[] {
    return [...this.errors]
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
    const app = this.app
    this.app = null
    this.page = null
    if (!app) return
    const child = app.process()
    try {
      await Promise.race([
        app.close(),
        new Promise<void>((resolve) => setTimeout(resolve, 8_000)),
      ])
    } finally {
      if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGTERM')
    }
  }
}

export async function assertTaskWeaverProject(root: string): Promise<string> {
  return await assertTaskWeaverRoot(root)
}
