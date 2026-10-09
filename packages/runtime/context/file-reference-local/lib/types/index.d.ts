/**
 * Local-filesystem implementation of `ctx.fileReferences`.
 *
 * @module @z/dsh-file-reference-local
 */
import { Context } from '@z/cordis';
import z from '@z/schemastery';
import type { Agent } from '@z/dsh-agent';
import FileReferenceService, { type FileReferenceCandidate } from '@z/dsh-file-reference';
export { DEFAULT_FILE_SEARCH_EXCLUDED_DIRECTORIES, DEFAULT_FILE_SEARCH_MAX_ENTRIES, DEFAULT_FILE_SEARCH_MAX_RESULTS, WorkspaceFileSearch, } from './search.ts';
export type { FileSearchConfig } from './search.ts';
export { FILE_REFERENCE_PROMPT } from '@z/dsh-file-reference';
export { activeAtToken, formatFileMention } from '@z/dsh-file-reference/grammar';
/** Local file-reference discovery configuration. */
export interface Config {
    /** Maximum ranked candidates returned for one query. */
    maxResults?: number;
    /** Maximum indexed files and directories per agent workspace. */
    maxEntries?: number;
    /** Directory basenames never traversed or offered. */
    excludedDirectories?: string[];
}
/** Local-filesystem owner of the file-reference discovery service. */
export declare class LocalFileReferenceService extends FileReferenceService {
    static inject: string[];
    static Config: z<Config>;
    private readonly config;
    private readonly searches;
    private readonly promptFibers;
    private readonly promptDisposals;
    constructor(ctx: Context, config?: Config);
    list(agent: Agent, query: string, signal: AbortSignal): Promise<FileReferenceCandidate[]>;
}
export default LocalFileReferenceService;
//# sourceMappingURL=index.d.ts.map