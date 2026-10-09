import type { Context } from '@z/cordis'
import type { Agent } from '@z/dsh-agent'

/** Trusted Host data for one agent's active workspace. No member is model-supplied. */
export interface UiVerifyWorkspacePolicy {
  /** Canonical workspace root derived from the live agent session. */
  root: string
  /** False or absent must prevent launch. Unknown trust is never treated as trusted. */
  trusted: boolean
  /** True only when the user enabled this preference for trusted workspaces. */
  autoAllow: boolean
  /** Host-selected artifact location, normally beneath TaskWeaver user data. */
  artifactsDir: string
}

/** Host integration seam for WorkspaceTrust and the user's UI-verify preference. */
export interface UiVerifyPolicyService {
  getWorkspace(agent: Agent): Promise<UiVerifyWorkspacePolicy | undefined>
}

declare module '@z/cordis' {
  interface Context {
    /** Optional by design; tool-ui-verify fails closed if the Host did not inject it. */
    uiVerifyPolicy?: UiVerifyPolicyService
  }
}

export function getUiVerifyPolicy(ctx: Context): UiVerifyPolicyService | undefined {
  return ctx.uiVerifyPolicy
}
