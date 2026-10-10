import type { DocumentOptions, ParsedDocumentResult } from './protocol.ts';
export declare const DOCUMENT_PARSER_VERSION = "taskweaver-document-parser-v3";
export declare const DEFAULT_DOCUMENT_CACHE_BYTES: number;
export declare function documentCacheKey(bytes: Uint8Array, options: DocumentOptions): string;
/** Private DSH-home cache with content-addressed entries and a disk LRU ceiling. */
export declare class DocumentResultCache {
    private readonly directory;
    private readonly maxBytes;
    private maintenance;
    constructor(directory: string, maxBytes?: number);
    private ensureDirectory;
    private fileFor;
    read(key: string): Promise<ParsedDocumentResult | undefined>;
    write(key: string, value: ParsedDocumentResult): Promise<void>;
    private withMaintenance;
    private prune;
}
//# sourceMappingURL=cache.d.ts.map