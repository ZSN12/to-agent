import type { UiVerifyPolicyService } from './api/ui-verify-policy.ts';
/**
 * In-memory, per-agent policy handoff from the trusted TaskWeaver session.prompt
 * caller to agent-scoped tools. No model field can choose the root or artifact
 * directory; root comes from the immutable session header and artifacts stay
 * beneath the Host's DSH home.
 */
export declare function createUiVerifyPolicyService(artifactsRoot?: string): UiVerifyPolicyService;
//# sourceMappingURL=ui-verify-policy.d.ts.map