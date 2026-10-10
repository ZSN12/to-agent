/**
 * File-reference discovery seam shared by host-backed user interfaces.
 *
 * @module @taskweaver/dsh-file-reference
 */
import type { Context } from '@taskweaver/cordis';
import type { Agent } from '@taskweaver/dsh-agent';
import { TypertRemoteService } from '@taskweaver/dsh-typert-protocol';
import type { FileReferenceCandidate } from './types.ts';
export { activeAtToken, formatFileMention } from './grammar.ts';
export type { ActiveAtToken } from './grammar.ts';
export type { FileReferenceCandidate } from './types.ts';
/** Model guidance for path-only references selected by a user interface. */
export declare const FILE_REFERENCE_PROMPT = "Paths prefixed with @ are files explicitly referenced by the user. Use the read tool when their contents are needed; do not claim to have inspected a file before reading it.";
declare module '@taskweaver/cordis' {
    interface Context {
        fileReferences: FileReferenceService;
    }
}
/** Host capability for cancellable file-reference discovery. */
export declare abstract class FileReferenceService extends TypertRemoteService {
    constructor(ctx: Context);
    /**
     * List file and directory candidates for one agent's working directory.
     * @param agent - target agent whose session cwd bounds discovery.
     * @param query - path text following `@` or `@"`.
     * @param signal - caller cancellation.
     * @returns deterministic path-only candidates.
     */
    abstract list(agent: Agent, query: string, signal: AbortSignal): Promise<FileReferenceCandidate[]>;
    /**
     * Remote face of {@link list}; the decorator cannot mark the abstract
     * member, so this concrete adapter carries the identical contract.
     * @param agent - target agent whose session cwd bounds discovery.
     * @param query - path text following `@` or `@"`.
     * @param signal - caller cancellation.
     * @returns deterministic path-only candidates.
     */
    remoteExportList(agent: Agent, query: string, signal: AbortSignal): Promise<FileReferenceCandidate[]>;
}
export default FileReferenceService;
//# sourceMappingURL=index.d.ts.map