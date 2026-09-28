/**
 * OS-level bash sandbox + DSH-style sandbox_permissions escalation on bash schema.
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { Type, type Static } from 'typebox'
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { createBashTool, type BashOperations } from '@earendil-works/pi-coding-agent'

const SANDBOX_BRIDGE_KEY = Symbol.for('taskweaver.sandbox')
type SandboxBridge = {
  probe: () => { available: boolean; platform: string; runner?: string | null }
  getPolicy: () => { mode: string; workspaceRoot: string }
  resolvePolicy?: () => {
    bash: { mode: string }
    file: { mode: string }
    workspaceRoot: string
    standingMode?: string
  }
  wrapBashInvocation: (
    command: string,
    cwd: string,
    policy: { mode: string; workspaceRoot: string },
  ) => { program: string; args: string[]; cwd: string }
  approveBashEscalation?: (request: {
    requestedMode: string
    justification: string
    effectiveMode: string
    toolCallId: string
  }) => Promise<string>
}

const baseBashSchema = Type.Object({
  command: Type.String({ description: 'Bash command to execute' }),
  timeout: Type.Optional(Type.Number({ description: 'Timeout in seconds (optional)' })),
})

const taskweaverBashSchema = Type.Object({
  command: Type.String({ description: 'Bash command to execute' }),
  timeout: Type.Optional(Type.Number({ description: 'Timeout in seconds (optional)' })),
  sandbox_permissions: Type.Optional(
    Type.Union([Type.Literal('workspace-write'), Type.Literal('danger-full-access')], {
      description:
        'Wider sandbox mode for a one-shot retry after a sandbox denial. Requires justification; user must approve.',
    }),
  ),
  justification: Type.Optional(
    Type.String({
      description: 'Required with sandbox_permissions: one sentence explaining why this exact command needs wider access.',
    }),
  ),
})

type TaskweaverBashInput = Static<typeof taskweaverBashSchema>

function getBridge(): SandboxBridge | null {
  return (globalThis as unknown as Record<symbol, SandboxBridge>)[SANDBOX_BRIDGE_KEY] ?? null
}

function validateEscalationPair(sandboxPermissions?: string, justification?: string) {
  if (sandboxPermissions !== undefined && justification === undefined) {
    throw new Error('invalid escalation: sandbox_permissions requires a justification')
  }
  if (justification !== undefined && sandboxPermissions === undefined) {
    throw new Error('invalid escalation: justification is only valid together with sandbox_permissions')
  }
  if (justification !== undefined && justification.trim().length === 0) {
    throw new Error('invalid justification: expected a non-empty sentence')
  }
}

function bashDescription(escalationEnabled: boolean): string {
  const base =
    'Execute a bash command. Commands may run under a file sandbox; denials look like policy failures, not command bugs. '
  if (!escalationEnabled) return base
  return (
    base
    + 'When denied, retry the exact same command once with sandbox_permissions (narrowest wider mode) and justification; '
    + 'the user approval prompt is raised automatically. Do not escalate speculatively without a real denial.'
  )
}

let lastExecStderr = ''

function createDshSandboxBashOps(cwd: string, policy: { mode: string; workspaceRoot: string }): BashOperations {
  return {
    async exec(command, workdir, { onData, signal, timeout }) {
      const dir = workdir || cwd
      if (!existsSync(dir)) {
        throw new Error(`Working directory does not exist: ${dir}`)
      }
      const bridge = getBridge()
      const wrapped = bridge?.wrapBashInvocation(command, dir, policy) ?? {
        program: 'bash',
        args: ['-c', command],
        cwd: dir,
      }
      lastExecStderr = ''

      return new Promise((resolve, reject) => {
        const child = spawn(wrapped.program, wrapped.args, {
          cwd: wrapped.cwd,
          detached: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        })

        let timedOut = false
        let timeoutHandle: NodeJS.Timeout | undefined

        if (timeout !== undefined && timeout > 0) {
          timeoutHandle = setTimeout(() => {
            timedOut = true
            if (child.pid) {
              try {
                process.kill(-child.pid, 'SIGKILL')
              } catch {
                child.kill('SIGKILL')
              }
            }
          }, timeout * 1000)
        }

        child.stdout?.on('data', onData)
        child.stderr?.on('data', (chunk: Buffer) => {
          lastExecStderr += chunk.toString('utf8')
          onData(chunk)
        })

        child.on('error', (err) => {
          if (timeoutHandle) clearTimeout(timeoutHandle)
          reject(err)
        })

        const onAbort = () => {
          if (child.pid) {
            try {
              process.kill(-child.pid, 'SIGKILL')
            } catch {
              child.kill('SIGKILL')
            }
          }
        }

        signal?.addEventListener('abort', onAbort, { once: true })

        child.on('close', (code) => {
          if (timeoutHandle) clearTimeout(timeoutHandle)
          signal?.removeEventListener('abort', onAbort)

          if (signal?.aborted) {
            reject(new Error('aborted'))
          } else if (timedOut) {
            reject(new Error(`timeout:${timeout}`))
          } else {
            resolve({ exitCode: code })
          }
        })
      })
    },
  }
}

function policyFromGrantedMode(
  granted: string,
  workspaceRoot: string,
): { mode: string; workspaceRoot: string } {
  if (granted === 'danger-full-access') return { mode: 'off', workspaceRoot }
  return { mode: granted, workspaceRoot }
}

function augmentDenialMessage(message: string, effectiveMode: string, bridge: SandboxBridge | null): string {
  const runner = bridge?.probe()?.runner
  if (!runner || !lastExecStderr) return message
  const hay = lastExecStderr.toLowerCase()
  const sigs: Record<string, string[]> = {
    seatbelt: ['operation not permitted'],
    bwrap: ['read-only file system'],
    landlock: ['permission denied'],
  }
  const matched = (sigs[runner] || []).some((s) => hay.includes(s))
  if (!matched) return message
  return `${message}\n[sandbox: file access denied under ${effectiveMode} mode]\n[sandbox: escalation available — retry this exact command once with sandbox_permissions (the narrowest wider mode that suffices) + justification; the approval prompt asks the user]`
}

export default function registerTaskWeaverDshSandbox(pi: ExtensionAPI) {
  const localCwd = process.cwd()
  const localBash = createBashTool(localCwd)
  let sandboxActive = false
  let escalationEnabled = false

  pi.on('session_start', async (_event, ctx) => {
    const bridge = getBridge()
    const probe = bridge?.probe()
    const resolved = bridge?.resolvePolicy?.() ?? null
    const bashMode = resolved?.bash.mode ?? bridge?.getPolicy()?.mode ?? 'off'
    sandboxActive = Boolean(probe?.available && bashMode && bashMode !== 'off')
    escalationEnabled = Boolean(resolved?.file.mode && resolved.file.mode !== 'off') || sandboxActive
    if (sandboxActive) {
      const label = bashMode === 'read-only' ? 'read-only' : 'workspace-write'
      ctx.ui.setStatus('sandbox', ctx.ui.theme.fg('accent', `🔒 DSH bash 沙箱: ${label}`))
    } else if (resolved?.file.mode && resolved.file.mode !== 'off') {
      ctx.ui.setStatus('sandbox', ctx.ui.theme.fg('accent', `🔒 文件沙箱: ${resolved.file.mode}`))
    }
  })

  pi.registerTool({
    ...localBash,
    label: sandboxActive ? 'bash (dsh-sandbox)' : localBash.label,
    description: bashDescription(escalationEnabled),
    parameters: escalationEnabled ? taskweaverBashSchema : baseBashSchema,
    async execute(id, params, signal, onUpdate, ctx) {
      const bridge = getBridge()
      const resolved = bridge?.resolvePolicy?.()
      const standingMode = resolved?.standingMode || resolved?.bash.mode || resolved?.file.mode || 'read-only'
      const workspaceRoot = resolved?.workspaceRoot || bridge?.getPolicy()?.workspaceRoot || localCwd

      const input = params as TaskweaverBashInput
      validateEscalationPair(input.sandbox_permissions, input.justification)

      let runPolicy = bridge?.getPolicy() ?? { mode: 'off', workspaceRoot }

      if (input.sandbox_permissions && input.justification) {
        if (!bridge?.approveBashEscalation) {
          throw new Error('sandbox_permissions is not available (approval bridge missing)')
        }
        const granted = await bridge.approveBashEscalation({
          requestedMode: input.sandbox_permissions,
          justification: input.justification,
          effectiveMode: standingMode === 'off' ? 'workspace-write' : standingMode,
          toolCallId: String(id),
        })
        runPolicy = policyFromGrantedMode(granted, workspaceRoot)
      }

      const useSandbox = Boolean(
        bridge?.probe()?.available && runPolicy.mode && runPolicy.mode !== 'off',
      )

      const bashParams = { command: input.command, timeout: input.timeout }
      try {
        if (!useSandbox && runPolicy.mode === 'off') {
          return localBash.execute(id, bashParams, signal, onUpdate, ctx)
        }
        const sandboxed = createBashTool(localCwd, {
          operations: createDshSandboxBashOps(localCwd, runPolicy),
        })
        return await sandboxed.execute(id, bashParams, signal, onUpdate, ctx)
      } catch (err) {
        if (err instanceof Error) {
          throw new Error(augmentDenialMessage(err.message, standingMode, bridge))
        }
        throw err
      }
    },
  })
}
