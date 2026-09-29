/**
 * Model-facing macOS desktop-control tools over a driver + approval seam:
 * `desktop_screenshot`, `desktop_mouse`, `desktop_keyboard`. Every action is
 * scoped to the frontmost app's bundle id, gated by an app-level access policy
 * and the `approval/request` waterfall, and (for cursor moves) humanized with a
 * seeded bezier path. Enforcement stays with the approval service; these tools
 * only propose and interpret.
 * @module @z/dsh-tool-desktop
 */

import type { Context } from '@z/cordis'
import z from '@z/schemastery'
import type { Agent } from '@z/dsh-agent'
import type {} from '@z/dsh-shell'
import { defineTool } from '@z/dsh-tools'
import type { DesktopAccessPolicy } from './types.ts'
import { macosDriver } from './macos.ts'
import { createDesktopService } from './desktop.ts'
import { createApprover, PersistentGrantCache } from './approval.ts'
import type { DesktopService } from './desktop.ts'
import type { DesktopOutcome } from './desktop.ts'

export const name = 'tool-desktop'
export const inject = ['tools', 'approval', 'shell']

/** Configuration for the desktop-control tool. */
export interface Config {
  /**
   * App-level access policy. `rules` match macOS bundle ids; an unmatched app
   * falls back to `default`. An explicit `deny` rule is final; an unmatched
   * app under a `deny` default is deferred to the approval waterfall.
   */
  policy: DesktopAccessPolicy
  /**
   * If true, every action (even on an `allow` bundle) is routed through the
   * approval waterfall. Defaults to false: `allow` runs directly.
   */
  gateAllow?: boolean
  /**
   * If true, an approved bundle id is cached so later actions on the same app
   * in this process do not re-prompt. Defaults to false.
   */
  persistApproval?: boolean
  /** Default humanized cursor-move duration in ms. */
  moveDurationMs?: number
}

/** Runtime configuration schema for the desktop tool plugin. */
export const Config: z<Config> = z.object({
  policy: z.object({
    rules: z.array(
      z.object({
        bundleId: z.string(),
        access: z.union([z.const('allow'), z.const('deny')]),
      }),
    ),
    default: z.union([z.const('allow'), z.const('deny')]).default('deny'),
  }),
  gateAllow: z.boolean().default(false),
  persistApproval: z.boolean().default(false),
  moveDurationMs: z.number().default(400),
})

/** Map a desktop outcome to a model-safe result object. */
function outcomeResult(outcome: DesktopOutcome): Record<string, unknown> {
  if (outcome.kind === 'denied') return { ok: false, reason: outcome.reason }
  return { ok: true }
}

/** Build the per-call desktop service bound to the current agent. */
function serviceFor(
  ctx: Context,
  config: Config,
  agent: Agent,
  run: (script: string) => Promise<string>,
  cache: PersistentGrantCache,
): DesktopService {
  const driver = macosDriver(run)
  const approver = createApprover(
    {
      policy: config.policy,
      approval: ctx.approval,
      ...config.gateAllow === true ? { gateAllow: true } : {},
      ...config.persistApproval === true ? { persist: true } : {},
    },
    cache,
  )
  return createDesktopService(driver, approver, agent, config.moveDurationMs)
}

/** A runnable command backed by the shell capability. */
function shellRunner(ctx: Context): (script: string) => Promise<string> {
  return async (script) => {
    const result = await ctx.shell.run(ctx.shell.resolve({
      command: script,
      workdir: process.cwd(),
      timeoutMs: 15_000,
      stdoutMaxBytes: 64 * 1024,
    }))
    return result.stdout.text
  }
}

export function apply(ctx: Context, config: Config): void {
  const run = shellRunner(ctx)
  const cache = new PersistentGrantCache()

  ctx.tools.register(defineTool({
    name: 'desktop_screenshot',
    description: 'Capture the primary display and report where the PNG was written. Use before clicking so you can see the screen.',
    parameters: {
      path: {
        type: 'string',
        description: 'Absolute path to write the PNG to, e.g. a workspace file you can read_image.',
        required: true,
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          path: { type: 'string' },
          width: { type: 'number' },
          height: { type: 'number' },
        },
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    async execute(args, exec) {
      if (!exec.agent) throw new Error('desktop_screenshot requires an agent context')
      const service = serviceFor(ctx, config, exec.agent, run, cache)
      const shot = await service.screenshot(args.path)
      return { path: shot.path, width: shot.width, height: shot.height }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'desktop_mouse',
    description: 'Move, click, or scroll the macOS cursor. Moves are humanized (a slight curve with ease-in-out).',
    parameters: {
      action: {
        type: 'string',
        required: true,
        description: 'One of: move, click, double_click, scroll.',
      },
      x: { type: 'number', description: 'Target x (display pixels). Required for move/click/double_click.' },
      y: { type: 'number', description: 'Target y (display pixels). Required for move/click/double_click.' },
      delta_y: { type: 'number', description: 'Vertical scroll ticks (negative = down). Required for scroll.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean' },
          reason: { type: 'string' },
        },
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    async execute(args, exec) {
      if (!exec.agent) throw new Error('desktop_mouse requires an agent context')
      const service = serviceFor(ctx, config, exec.agent, run, cache)
      if (args.action === 'move' || args.action === 'click' || args.action === 'double_click') {
        if (args.x === undefined || args.y === undefined) {
          throw new Error(`desktop_mouse ${args.action} requires x and y`)
        }
        const outcome = args.action === 'move'
          ? await service.move({ x: args.x, y: args.y })
          : await service.click({ x: args.x, y: args.y }, args.action === 'double_click')
        return outcomeResult(outcome)
      }
      if (args.action === 'scroll') {
        if (args.delta_y === undefined) throw new Error('desktop_mouse scroll requires delta_y')
        return outcomeResult(await service.scroll(args.delta_y))
      }
      throw new Error(`desktop_mouse: unknown action ${args.action}`)
    },
  }))

  ctx.tools.register(defineTool({
    name: 'desktop_keyboard',
    description: 'Type text or send a key combo (with optional modifiers) at the focused field.',
    parameters: {
      action: {
        type: 'string',
        required: true,
        description: 'One of: type, key_combo.',
      },
      text: { type: 'string', description: 'Text to type (required for type).' },
      key: {
        type: 'string',
        description: 'Key for a combo (required for key_combo). Common keys: return, tab, escape, arrow keys, a-z, 0-9.',
      },
      modifiers: {
        type: 'array',
        items: { type: 'string', enum: ['command', 'control', 'option', 'shift'] },
        description: 'Modifier keys held during a key_combo.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean' },
          reason: { type: 'string' },
        },
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    async execute(args, exec) {
      if (!exec.agent) throw new Error('desktop_keyboard requires an agent context')
      const service = serviceFor(ctx, config, exec.agent, run, cache)
      if (args.action === 'type') {
        if (args.text === undefined) throw new Error('desktop_keyboard type requires text')
        return outcomeResult(await service.type(args.text))
      }
      if (args.action === 'key_combo') {
        if (args.key === undefined) throw new Error('desktop_keyboard key_combo requires key')
        return outcomeResult(await service.keyCombo(args.key, args.modifiers))
      }
      throw new Error(`desktop_keyboard: unknown action ${args.action}`)
    },
  }))
}
