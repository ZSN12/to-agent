import type { Agent } from '@taskweaver/dsh-agent'

/** Current-turn UI verification policy, supplied only by the TaskWeaver Host. */
export interface UiVerifyPolicySnapshot {
  workspaceTrusted?: boolean
  autoAllowUiVerify?: boolean
}

export interface UiVerifyWorkspacePolicy {
  root: string
  trusted: boolean
  autoAllow: boolean
  artifactsDir: string
}

/** Host context capability shared by the session.prompt gateway and tool preset. */
export interface UiVerifyPolicyService {
  update(agent: Agent, snapshot: UiVerifyPolicySnapshot | undefined): void
  getWorkspace(agent: Agent): Promise<UiVerifyWorkspacePolicy | undefined>
}

declare module '@taskweaver/cordis' {
  interface Context {
    /** Missing provider or missing turn snapshot denies tool-ui-verify. */
    uiVerifyPolicy?: UiVerifyPolicyService
  }
}
