/**
 * Shared path resolution and regular-file validation for model-facing read tools.
 * @module @z/dsh-tool-fs/src/read-target
 */
import type { Context } from '@z/cordis';
import type { FsInfo, FsTarget } from '@z/dsh-fs';
import type { ToolExecution } from '@z/dsh-tools';
/**
 * Resolve a model-supplied path, observe absence, and require a regular file.
 * @param ctx - the plugin context providing filesystem resolution and observation events.
 * @param exec - the current tool execution, including session cwd and cancellation.
 * @param requestedPath - the raw path supplied to the tool.
 * @returns the resolved target and its single stat result.
 */
export declare function resolveRegularReadTarget(ctx: Context, exec: ToolExecution, requestedPath: string): Promise<{
    target: FsTarget;
    info: FsInfo;
}>;
//# sourceMappingURL=read-target.d.ts.map