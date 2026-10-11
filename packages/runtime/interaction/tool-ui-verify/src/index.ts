import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { Context } from '@taskweaver/cordis'
import z from '@taskweaver/schemastery'
import type { Agent } from '@taskweaver/dsh-agent'
import type { ImageAttachmentRef } from '@taskweaver/dsh-attachment'
import type { ContentBlock } from '@taskweaver/dsh-llm'
import type { UiVerifyWorkspacePolicy } from '@taskweaver/dsh-host-apiproxy/api'
import { defineTool } from '@taskweaver/dsh-tools'
import type { ApprovalOutcome } from '@taskweaver/dsh-user-approval'
import { assertTaskWeaverProject, UiVerifySession } from '@taskweaver/ui-verify'
import type { UiAssertion, UiTarget } from '@taskweaver/ui-verify'
import { MacNativeUiFallback } from './native/macos.ts'
import type { NativePoint } from './native/macos.ts'
import './session-events.ts'

export const name = 'tool-ui-verify'
export const inject = ['tools', 'approval', 'attachments', 'uiVerifyPolicy']

export interface Config {
  /** Native macOS fallback is off unless explicitly enabled by trusted Host configuration. */
  nativeFallbackEnabled?: boolean
}

export const Config: z<Config> = z.object({
  nativeFallbackEnabled: z.boolean().default(false),
})

interface ToolResult {
  ok: boolean
  [key: string]: unknown
}

const TARGET_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    testId: { type: 'string', description: 'Exact data-testid value.' },
    role: { type: 'string', description: 'Accessible role, such as button, textbox, dialog, or region.' },
    name: { type: 'string', description: 'Exact accessible name; required when role is supplied.' },
  },
}

const RESULT_SCHEMA = {
  type: 'object',
  additionalProperties: true,
  properties: {
    ok: { type: 'boolean', required: true },
    message: { type: 'string' },
    path: { type: 'string' },
    snapshot: { type: 'string' },
    errors: { type: 'array', items: { type: 'string' } },
    results: { type: 'array', items: { type: 'object', additionalProperties: true } },
    passed: { type: 'boolean' },
  },
}

const sessions = new Map<string, UiVerifySession>()
const approvedSessionRoots = new Map<string, string>()

function isTaskWeaverRepository(root: unknown): boolean {
  if (typeof root !== 'string' || !path.isAbsolute(root)) return false
  try {
    const canonicalRoot = realpathSync(root)
    const manifest = JSON.parse(readFileSync(path.join(canonicalRoot, 'package.json'), 'utf8')) as {
      name?: unknown
      main?: unknown
    }
    if (manifest?.name !== 'taskweaver-desktop') return false
    return existsSync(path.join(canonicalRoot, 'backend/shell/run.mjs'))
  } catch {
    return false
  }
}

function sessionKey(agent: Agent): string {
  return String(agent.session.id)
}

function requireAgent(agent: Agent | undefined): Agent {
  if (!agent) throw new Error('tool-ui-verify requires a live agent session')
  return agent
}

async function getWorkspacePolicy(ctx: Context, agent: Agent): Promise<UiVerifyWorkspacePolicy> {
  const policy = ctx.uiVerifyPolicy
  if (!policy) throw new Error('UI verification is unavailable: the TaskWeaver Host did not inject uiVerifyPolicy')
  const workspace = await policy.getWorkspace(agent)
  if (!workspace || workspace.trusted !== true) {
    throw new Error('UI verification is unavailable: the active workspace is not trusted')
  }
  if (!workspace.root || !workspace.artifactsDir) {
    throw new Error('UI verification is unavailable: the Host did not provide a workspace root and artifact directory')
  }
  const canonicalRoot = await assertTaskWeaverProject(workspace.root)
  return { ...workspace, root: canonicalRoot, artifactsDir: path.resolve(workspace.artifactsDir) }
}

async function requestLaunchApproval(ctx: Context, agent: Agent, workspace: UiVerifyWorkspacePolicy): Promise<void> {
  const key = sessionKey(agent)
  if (approvedSessionRoots.get(key) === workspace.root) return
  if (workspace.trusted && workspace.autoAllow === true) {
    approvedSessionRoots.set(key, workspace.root)
    return
  }
  const result: ApprovalOutcome = await ctx.approval.request({
    agent,
    toolName: 'ui_launch',
    reason: '启动 TaskWeaver 开发构建的隔离实例做 UI 验证',
  })
  if (result !== 'allowed-once') throw new Error(`UI verification launch was not approved (${result})`)
  approvedSessionRoots.set(key, workspace.root)
}

function requireSession(agent: Agent): UiVerifySession {
  const session = sessions.get(sessionKey(agent))
  if (!session) throw new Error('No isolated UI verification instance is running; call ui_launch first')
  return session
}

async function requireTrustedSession(ctx: Context, agent: Agent): Promise<UiVerifySession> {
  const session = requireSession(agent)
  const workspace = await getWorkspacePolicy(ctx, agent)
  if (workspace.root !== session.root) throw new Error('UI verification workspace changed; close the isolated instance and launch again')
  return session
}

async function closeSession(agent: Agent): Promise<UiVerifySession | undefined> {
  const key = sessionKey(agent)
  const session = sessions.get(key)
  if (!session) return undefined
  sessions.delete(key)
  try {
    await session.close()
  } finally {
    agent.session.append('ui-verify/lifecycle', {
      action: 'close', root: session.root, artifactsDir: session.artifactsDir,
    })
  }
  return session
}

function contentWithImage(pathName: string, image: ImageAttachmentRef): ContentBlock[] {
  return [
    { type: 'text', text: `TaskWeaver UI verification screenshot: ${pathName}` },
    { type: 'image', attachment: image },
  ]
}

async function attachScreenshot(ctx: Context, screenshotPath: string): Promise<ImageAttachmentRef> {
  const attachments = ctx.get('attachments')
  if (!attachments) throw new Error('Screenshot attachment service is unavailable')
  return await attachments.saveImage({
    data: await readFile(screenshotPath),
    mediaType: 'image/png',
    name: path.basename(screenshotPath),
  })
}

async function nativeFallbackForSession(
  config: Config,
  session: UiVerifySession,
): Promise<MacNativeUiFallback> {
  if (config.nativeFallbackEnabled !== true) throw new Error('Native UI fallback is disabled by Host policy')
  if (process.platform !== 'darwin') throw new Error('Native UI fallback is macOS-only')
  const pid = session.processId()
  if (!pid) throw new Error('Native UI fallback cannot identify the isolated TaskWeaver process')
  const native = new MacNativeUiFallback(pid)
  const permissions = await native.permissions()
  if (!permissions.accessibility || !permissions.screenRecording) {
    throw new Error(`Native UI fallback requires macOS Accessibility and Screen Recording permissions (accessibility=${permissions.accessibility}, screenRecording=${permissions.screenRecording})`)
  }
  return native
}

function parseTarget(target: { testId?: string; role?: string; name?: string }): UiTarget {
  if (target.testId !== undefined) {
    if (target.role !== undefined || target.name !== undefined) throw new Error('Use either testId or role/name, not both')
    return { testId: target.testId }
  }
  if (!target.role || target.name === undefined) throw new Error('UI target requires a testId or both role and name')
  const roles = new Set([
    'alert', 'alertdialog', 'application', 'article', 'banner', 'blockquote', 'button', 'caption', 'cell', 'checkbox',
    'code', 'columnheader', 'combobox', 'complementary', 'contentinfo', 'definition', 'deletion', 'dialog', 'directory',
    'document', 'emphasis', 'feed', 'figure', 'form', 'generic', 'grid', 'gridcell', 'group', 'heading', 'img', 'insertion',
    'link', 'list', 'listbox', 'listitem', 'log', 'main', 'marquee', 'math', 'meter', 'menu', 'menubar', 'menuitem',
    'menuitemcheckbox', 'menuitemradio', 'navigation', 'none', 'note', 'option', 'paragraph', 'presentation', 'progressbar',
    'radio', 'radiogroup', 'region', 'row', 'rowgroup', 'rowheader', 'scrollbar', 'search', 'searchbox', 'separator', 'slider',
    'spinbutton', 'status', 'strong', 'subscript', 'superscript', 'switch', 'tab', 'table', 'tablist', 'tabpanel', 'term',
    'textbox', 'time', 'timer', 'toolbar', 'tooltip', 'tree', 'treegrid', 'treeitem',
  ])
  if (!roles.has(target.role)) throw new Error(`Unsupported accessible role: ${target.role}`)
  type RoleTarget = Extract<UiTarget, { role: unknown }>
  return { role: target.role as RoleTarget['role'], name: target.name }
}

export function apply(ctx: Context, config: Config): void {
  // Presets are shared across repositories. Do not even publish these tool
  // schemas outside a TaskWeaver checkout; execution revalidates the root too.
  if (!ctx.agent || !isTaskWeaverRepository(ctx.agent.session.header.cwd)) return

  ctx.tools.register(defineTool({
    name: 'ui_launch',
    description: 'Start one isolated TaskWeaver development instance for UI verification. The Host supplies the active workspace root; the model cannot provide paths, URLs, or commands.',
    parameters: {},
    output: { schema: RESULT_SCHEMA, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    async execute(_args, exec): Promise<ToolResult> {
      const agent = requireAgent(exec.agent)
      const key = sessionKey(agent)
      const workspace = await getWorkspacePolicy(ctx, agent)
      const existing = sessions.get(key)
      if (existing) {
        if (existing.root !== workspace.root) {
          throw new Error('UI verification workspace changed; close the isolated instance and launch again')
        }
        return { ok: true, message: 'TaskWeaver UI verification instance is already running.', artifactsDir: existing.artifactsDir }
      }
      await requestLaunchApproval(ctx, agent, workspace)
      const session = await UiVerifySession.launch({ root: workspace.root, artifactsDir: workspace.artifactsDir })
      sessions.set(key, session)
      try {
        agent.session.append('ui-verify/lifecycle', {
          action: 'launch', root: workspace.root, artifactsDir: session.artifactsDir,
        })
      } catch (error) {
        sessions.delete(key)
        await session.close()
        throw error
      }
      return { ok: true, message: 'Isolated TaskWeaver development instance started.', artifactsDir: session.artifactsDir }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'ui_snapshot',
    description: 'Read the isolated TaskWeaver window accessibility tree as YAML. Use this as the primary UI observation surface.',
    parameters: {},
    output: { schema: RESULT_SCHEMA, render: (_args, value) => [{ type: 'text', text: String(value.snapshot ?? '') }] },
    async execute(_args, exec): Promise<ToolResult> {
      const session = await requireTrustedSession(ctx, requireAgent(exec.agent))
      return { ok: true, snapshot: await session.snapshot() }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'ui_act',
    description: 'Click, fill, or press using only a data-testid or exact accessible role/name. The optional native fallback is host-disabled by default and accepts only window-relative coordinates for the isolated TaskWeaver window.',
    parameters: {
      action: { type: 'string', enum: ['click', 'fill', 'press'], required: true },
      target: TARGET_SCHEMA,
      value: { type: 'string', description: 'Value for fill.' },
      key: { type: 'string', description: 'Playwright key name for press.' },
      native: { type: 'boolean', description: 'Use the opt-in narrow macOS native-dialog fallback.' },
      point: {
        type: 'object', additionalProperties: false,
        properties: {
          x: { type: 'number', required: true },
          y: { type: 'number', required: true },
        },
        description: 'Only for native fallback: coordinates relative to the isolated TaskWeaver window, in points.',
      },
      modifiers: {
        type: 'array', items: { type: 'string', enum: ['command', 'control', 'option', 'shift'] },
      },
    },
    output: { schema: RESULT_SCHEMA, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    async execute(args, exec): Promise<ToolResult> {
      const agent = requireAgent(exec.agent)
      const session = await requireTrustedSession(ctx, agent)
      if (args.native === true) {
        const native = await nativeFallbackForSession(config, session)
        if (args.action === 'click') {
          if (!args.point) throw new Error('Native click requires a window-relative point')
          await native.click(args.point as NativePoint)
        } else if (args.action === 'fill') {
          if (!args.point || typeof args.value !== 'string') throw new Error('Native fill requires a window-relative point and value')
          await native.fill(args.point as NativePoint, args.value)
        } else {
          if (typeof args.key !== 'string') throw new Error('Native press requires key')
          await native.press(args.key, (args.modifiers ?? []) as ('command' | 'control' | 'option' | 'shift')[])
        }
        return { ok: true, message: `Completed native ${args.action} inside the isolated TaskWeaver window.` }
      }
      if (!args.target) throw new Error('Playwright UI actions require a testId or role/name target')
      const target = parseTarget(args.target)
      if (args.action === 'click') await session.click(target)
      else if (args.action === 'fill') {
        if (typeof args.value !== 'string') throw new Error('ui_act fill requires value')
        await session.fill(target, args.value)
      } else {
        if (typeof args.key !== 'string') throw new Error('ui_act press requires key')
        await session.press(target, args.key)
      }
      return { ok: true, message: `Completed ${args.action} on the selected TaskWeaver UI element.` }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'ui_screenshot',
    description: 'Capture only the isolated TaskWeaver window and attach the PNG image to this result.',
    parameters: {
      native: { type: 'boolean', description: 'Capture using the opt-in macOS window-only native fallback for native dialogs.' },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          path: { type: 'string', required: true },
          image: {
            type: 'object', additionalProperties: false,
            properties: {
              attachmentId: { type: 'string', required: true }, mediaType: { type: 'string', required: true },
              bytes: { type: 'integer', required: true }, width: { type: 'integer', required: true }, height: { type: 'integer', required: true },
            },
          },
        },
      },
      render: (_args, value) => contentWithImage(value.path, value.image),
    },
    async execute(args, exec) {
      const session = await requireTrustedSession(ctx, requireAgent(exec.agent))
      let screenshotPath: string
      if (args.native === true) {
        const native = await nativeFallbackForSession(config, session)
        screenshotPath = session.screenshotPath('native-window')
        await native.screenshot(screenshotPath)
      } else {
        screenshotPath = await session.screenshot()
      }
      const image = await attachScreenshot(ctx, screenshotPath)
      return { path: screenshotPath, image }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'ui_check',
    description: 'Run up to 20 visible/text assertions against the isolated TaskWeaver UI and capture evidence screenshots for each step.',
    parameters: {
      assertions: {
        type: 'array', required: true,
        items: {
          type: 'object', additionalProperties: false,
          properties: {
            kind: { type: 'string', enum: ['visible', 'text'], required: true },
            target: { ...TARGET_SCHEMA, required: true },
            text: { type: 'string', description: 'Expected substring for text assertion.' },
          },
        },
      },
    },
    output: {
      schema: RESULT_SCHEMA,
      render: (_args, value) => {
        const results = Array.isArray(value.results) ? value.results : []
        const passed = results.filter((result) => result.passed === true).length
        const failed = results.length - passed
        const content: ContentBlock[] = [{
          type: 'text',
          text: `TaskWeaver UI 验证${value.passed === true ? '通过' : '失败'}：${passed} 项通过，${failed} 项失败。\n`
            + results.map((result, index) => `${index + 1}. ${result.kind ?? '断言'} ${result.passed === true ? '通过' : `失败：${String(result.error ?? '未知错误')}`}`).join('\n')
            + (Array.isArray(value.errors) && value.errors.length > 0 ? `\n控制台错误：\n${value.errors.map(String).join('\n')}` : ''),
        }]
        for (const result of results) {
          if (result.image && typeof result.image === 'object' && 'attachmentId' in result.image) {
            content.push({ type: 'image', attachment: result.image as ImageAttachmentRef })
          }
        }
        return content
      },
    },
    async execute(args, exec): Promise<ToolResult> {
      const session = await requireTrustedSession(ctx, requireAgent(exec.agent))
      const assertions: UiAssertion[] = args.assertions.map((assertion) => ({
        kind: assertion.kind,
        target: parseTarget(assertion.target),
        ...assertion.text === undefined ? {} : { text: assertion.text },
      }))
      const results = await session.check(assertions)
      const attachedResults = await Promise.all(results.map(async (result) => {
        if (!result.screenshot) return result
        try {
          return { ...result, image: await attachScreenshot(ctx, result.screenshot) }
        } catch (error) {
          return { ...result, attachmentError: error instanceof Error ? error.message : String(error) }
        }
      }))
      return {
        ok: attachedResults.every((result) => result.passed),
        passed: attachedResults.every((result) => result.passed),
        results: attachedResults,
        errors: session.consoleErrors(),
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'ui_close',
    description: 'Close the isolated TaskWeaver UI verification process and record its output directory.',
    parameters: {},
    output: { schema: RESULT_SCHEMA, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    async execute(_args, exec): Promise<ToolResult> {
      const agent = requireAgent(exec.agent)
      const session = await closeSession(agent)
      if (!session) return { ok: true, message: 'No UI verification instance is running.' }
      return { ok: true, message: 'Isolated TaskWeaver UI verification instance closed.', artifactsDir: session.artifactsDir }
    },
  }))

  ctx.on('agent/disposed', ({ agent }) => {
    approvedSessionRoots.delete(sessionKey(agent))
    void closeSession(agent).catch((error) => {
      ctx.logger('tool-ui-verify').warn('Failed to close UI verification app during agent disposal', error)
    })
  })
}
