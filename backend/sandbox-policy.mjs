import path from 'node:path'
import { probeSandboxSupport } from './sandbox-service.mjs'
import { effectiveSandboxMode } from './sandbox-session-mode.mjs'

/** @typedef {'off' | 'read-only' | 'workspace-write' | 'danger-full-access'} ConfinedMode */

/**
 * @param {{ bashSandbox?: string, permissionMode?: string, workspacePath?: string, sessionSandboxMode?: string | null }} input
 */
export function resolveSandboxPolicy(input = {}) {
  const workspaceRoot = path.resolve(input.workspacePath || process.cwd())
  const bashSandbox = input.bashSandbox ?? 'auto'
  const permissionMode = input.permissionMode ?? 'ask'
  const sessionMode = input.sessionSandboxMode || null

  if (permissionMode === 'readonly') {
    return {
      workspaceRoot,
      file: { mode: 'read-only' },
      bash: { mode: 'read-only' },
      standingMode: 'read-only',
    }
  }

  if (permissionMode === 'full' || sessionMode === 'danger-full-access') {
    return {
      workspaceRoot,
      file: { mode: 'off' },
      bash: { mode: 'off' },
      standingMode: 'danger-full-access',
    }
  }

  if (bashSandbox === 'off' && !sessionMode) {
    return {
      workspaceRoot,
      file: { mode: 'off' },
      bash: { mode: 'off' },
      standingMode: 'off',
    }
  }

  const baseFile = bashSandbox === 'auto' ? 'workspace-write' : bashSandbox
  const fileMode = effectiveSandboxMode(baseFile, sessionMode)

  let bashMode = bashSandbox
  if (sessionMode && sessionMode !== 'danger-full-access') {
    bashMode = sessionMode
  }
  if (bashMode === 'auto') {
    const probe = probeSandboxSupport()
    bashMode = probe.available ? 'workspace-write' : 'off'
  }

  return {
    workspaceRoot,
    file: { mode: fileMode === 'danger-full-access' ? 'off' : fileMode },
    bash: { mode: bashMode === 'danger-full-access' ? 'off' : bashMode },
    standingMode: fileMode,
  }
}

/**
 * @param {{ mode: ConfinedMode, workspaceRoot: string }} filePolicy
 */
export function renderFileSandboxContext(filePolicy, workspaceRoot) {
  switch (filePolicy.mode) {
    case 'read-only':
      return 'Current TaskWeaver file policy: read-only. File write/edit tools cannot modify files in this mode. If denied, you may request sandbox_permissions escalation (user approval). Bash may be OS-confined when a runner is available.'
    case 'workspace-write':
      return `Current TaskWeaver file policy: workspace-write. File write/edit may modify files under the session workspace ${JSON.stringify(workspaceRoot)} and platform temp areas (/tmp, user temp), matching Z sandbox writableRoots. Escalation to danger-full-access requires user approval via sandbox_permissions + justification.`
    default:
      return 'Current TaskWeaver file policy: off (full access at the in-process fence; permission prompts still apply).'
  }
}
