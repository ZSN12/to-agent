/**
 * Model-facing Codex-format multi-file patch tool. All content is prepared in
 * memory and committed through the Host filesystem's sandboxed batch API.
 * @module @taskweaver/dsh-tool-fs/src/apply-patch
 */
import type { Context } from '@taskweaver/cordis';
import type { FsSandboxController } from './sandbox.ts';
export interface ParsedPatchFile {
    path: string;
    operation: 'add' | 'update';
    content?: string;
    hunks?: PatchHunk[];
}
interface PatchLine {
    kind: 'context' | 'remove' | 'add';
    text: string;
}
interface PatchHunk {
    lines: PatchLine[];
}
/** Parse the supported Codex patch subset. Delete/move directives are rejected. */
export declare function parseCodexPatch(patch: string): ParsedPatchFile[];
export declare function applyApplyPatchTool(ctx: Context, sandbox: FsSandboxController): void;
export {};
//# sourceMappingURL=apply-patch.d.ts.map