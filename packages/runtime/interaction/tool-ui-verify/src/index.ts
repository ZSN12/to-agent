import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { Context } from '@z/cordis'
import z from '@z/schemastery'
import type { Agent } from '@z/dsh-agent'
import type { ImageAttachmentRef } from '@z/dsh-attachment'
import type { ContentBlock } from '@z/dsh-llm'
import { defineTool } from '@z/dsh-tools'
import type { ApprovalOutcome } from '@z/dsh-user-approval'
import { assertTaskWeaverProject, UiVerifySession } from '@taskweaver/ui-verify'
import type { UiAssertion, UiTarget } from '@taskweaver/ui-verify'
import { getUiVerifyPolicy } from '@taskweaver/ui-verify/src/policy.ts'
import type { UiVerifyWorkspacePolicy } from '@taskweaver/ui-verify/src/policy.ts'
import './session-events.ts'

export const name = 'tool-ui-verify'
export const inject = ['tools', 'approval']

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
    results: { type: 'array', items: { type: 'object' } },
    passed: { type: 'boolean' },
  },
}

const sessions = new Map<string, UiVerifySession>()
const approvedSessionIds = new Set<string>()

function sessionKey(agent: Agent): string {
  return String(agent.session.id)
}

function requireAgent(agent: Agent | undefined): Agent {
  if (!agent) throw new Error('tool-ui-verify requires a live agent session')
  return agent
}

async function getWorkspacePolicy(ctx: Context, agent: Agent): Promise<UiVerifyWorkspacePolicy> {
  const policy = getUiVerifyPolicy(ctx)
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
  if (approvedSessionIds.has(key) || (workspace.trusted && workspace.autoAllow === true)) return
  const result: ApprovalOutcome = await ctx.approval.request({
    agent,
    toolName: 'ui_launch',
    reason: '启动 TaskWeaver 开发构建的隔离实例做 UI 验证',
  })
  if (result !== 'allowed-once') throw new Error(`UI verification launch was not approved (${result})`)
  approvedSessionIds.add(key)
}

function requireSession(agent: Agent): UiVerifySession {
  const session = sessions.get(sessionKey(agent))
  if (!session) throw new Error('No isolated UI verification instance is running; call ui_launch first')
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

function parseTarget(target: { testId?: string; role?: string; name?: string }): UiTarget {
  if (target.testId !== undefined) {
    if (target.role !== undefined || target.name !== undefined) throw new Error('Use either testId or role/name, not both')
    return { testId: target.testId }
  }
  if (!target.role || target.name === undefined) throw new Error('UI target requires a testId or both role and name')
  return { role: target.role as UiTarget extends { role: infer R } ? R : never, name: target.name } as UiTarget
}

export function apply(ctx: Context, config: Config): void {
  ctx.tools.register(defineTool({
    name: 'ui_launch',
    description: 'Start one isolated TaskWeaver development instance for UI verification. The Host supplies the active workspace root; the model cannot provide paths, URLs, or commands.',
    parameters: {},
    output: { schema: RESULT_SCHEMA, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    async execute(_args, exec): Promise<ToolResult> {
      const agent = requireAgent(exec.agent)
      const key = sessionKey(agent)
      const existing = sessions.get(key)
      if (existing) return { ok: true, message: 'TaskWeaver UI verification instance is already running.' }
      const workspace = await getWorkspacePolicy(ctx, agent)
      await requestLaunchApproval(ctx, agent, workspace)
      const session = await UiVerifySession.launch({ root: workspace.root, artifactsDir: workspace.artifactsDir })
      sessions.set(key, session)
      agent.session.append('ui-verify/lifecycle', {
        action: 'launch', root: workspace.root, artifactsDir: workspace.artifactsDir,
      })
      return { ok: true, message: 'Isolated TaskWeaver development instance started.', artifactsDir: workspace.artifactsDir }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'ui_snapshot',
    description: 'Read the isolated TaskWeaver window accessibility tree as YAML. Use this as the primary UI observation surface.',
    parameters: {},
    output: { schema: RESULT_SCHEMA, render: (_args, value) => [{ type: 'text', text: String(value.snapshot ?? '') }] },
    async execute(_args, exec): Promise<ToolResult> {
      const session = requireSession(requireAgent(exec.agent))
      return { ok: true, snapshot: await session.snapshot() }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'ui_act',
    description: 'Click, fill, or press using only a data-testid or exact accessible role/name. The optional native fallback is host-disabled by default and accepts only window-relative coordinates for the isolated TaskWeaver window.',
    parameters: {
      action: { type: 'string', enum: ['click', 'fill', 'press'], required: true },
      target: { ...TARGET_SCHEMA, required: true },
      value: { type: 'string', description: 'Value for fill.' },
      key: { type: 'string', description: 'Playwright key name for press.' },
      native: { type: 'boolean', description: 'Use the opt-in narrow macOS native-dialog fallback.' },
    },
    output: { schema: RESULT_SCHEMA, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    async execute(args, exec): Promise<ToolResult> {
      const agent = requireAgent(exec.agent)
      const session = requireSession(agent)
      if (args.native === true) {
        if (config.nativeFallbackEnabled !== true) throw new Error('Native UI fallback is disabled by Host policy')
        throw new Error('Native UI fallback is not enabled for this action; use Playwright accessible locators')
      }
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
    parameters: {},
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
    async execute(_args, exec) {
      const session = requireSession(requireAgent(exec.agent))
      const screenshotPath = await session.screenshot()
      const image = await attachScreenshot(ctx, screenshotPath)
      return { path: screenshotPath, image }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'ui_check',
    description: 'Run up to 20 visible/text assertions against the isolated TaskWeaver UI and capture evidence screenshots for each step.',
    parameters: {
      assertions: {
        type: 'array', required: true, minItems: 1, maxItems: 20,
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
        const content: ContentBlock[] = [{ type: 'text', text: JSON.stringify(value.results ?? []) }]
        for (const result of value.results ?? []) {
          if (result.image && typeof result.image === 'object' && 'attachmentId' in result.image) {
            content.push({ type: 'image', attachment: result.image as ImageAttachmentRef })
          }
        }
        return content
      },
    },
    async execute(args, exec): Promise<ToolResult> {
      const session = requireSession(requireAgent(exec.agent))
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

  registerTool(ctx, defineTool({
    name: 'ui_close',
    description: 'Close the isolated TaskWeaver UI verification process and record its output directory.',
    parameters: {},
    output: { schema: RESULT_SCHEMA, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    async execute(_args, exec): Promise<ToolResult> {
      const agent = requireAgent(exec.agent)
      const key = sessionKey(agent)
      const session = sessions.get(key)
      if (!session) return { ok: true, message: 'No UI verification instance is running.' }
      sessions.delete(key)
      await session.close()
      agent.session.append('ui-verify/lifecycle', {
        action: 'close', root: session.root, artifactsDir: session.artifactsDir,
      })
      return { ok: true, message: 'Isolated TaskWeaver UI verification instance closed.', artifactsDir: session.artifactsDir }
    },
  }))

  ctx.on('agent/disposed', ({ agent }) => {
    const session = sessions.get(sessionKey(agent))
    sessions.delete(sessionKey(agent))
    approvedSessionIds.delete(sessionKey(agent))
    if (session) void session.close()
  })
}
