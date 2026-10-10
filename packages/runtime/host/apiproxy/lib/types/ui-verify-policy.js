import path from 'node:path';
import { runtimeHomePath } from '@taskweaver/dsh-home-paths';
/**
 * In-memory, per-agent policy handoff from the trusted TaskWeaver session.prompt
 * caller to agent-scoped tools. No model field can choose the root or artifact
 * directory; root comes from the immutable session header and artifacts stay
 * beneath the Host's DSH home.
 */
export function createUiVerifyPolicyService(artifactsRoot) {
    const root = path.resolve(artifactsRoot
        ?? runtimeHomePath('ui-verify'));
    const snapshots = new WeakMap();
    return {
        update(agent, snapshot) {
            if (!snapshot
                || typeof snapshot.workspaceTrusted !== 'boolean'
                || typeof snapshot.autoAllowUiVerify !== 'boolean') {
                snapshots.delete(agent);
                return;
            }
            snapshots.set(agent, {
                workspaceTrusted: snapshot.workspaceTrusted,
                autoAllowUiVerify: snapshot.autoAllowUiVerify,
            });
        },
        async getWorkspace(agent) {
            const snapshot = snapshots.get(agent);
            const workspaceRoot = agent.session.header.cwd;
            if (!snapshot || typeof workspaceRoot !== 'string' || !path.isAbsolute(workspaceRoot))
                return undefined;
            return {
                root: workspaceRoot,
                trusted: snapshot.workspaceTrusted === true,
                autoAllow: snapshot.autoAllowUiVerify === true,
                artifactsDir: path.join(root, encodeURIComponent(String(agent.session.id))),
            };
        },
    };
}
//# sourceMappingURL=ui-verify-policy.js.map