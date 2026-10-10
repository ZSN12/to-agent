declare const EXTENSION_BY_KIND: {
    readonly pdf: ".pdf";
    readonly pptx: ".pptx";
    readonly docx: ".docx";
    readonly xlsx: ".xlsx";
    readonly ppt: ".ppt";
    readonly doc: ".doc";
    readonly xls: ".xls";
};
export interface StoreDocumentSnapshotOptions {
    /** Overrides the default TaskWeaver runtime `documents/` directory. */
    directory?: string;
    /** Optional display name. It never influences the storage path. */
    name?: string;
    /** Session that may read the returned @doc reference. */
    sessionId: string;
}
export interface StoredDocumentSnapshot {
    reference: string;
    sha256: string;
    name: string;
    kind: keyof typeof EXTENSION_BY_KIND;
    bytes: number;
}
/**
 * Save a bounded external document snapshot outside the workspace. Host upload
 * adapters can pass received bytes here and send only the returned `@doc:` ref
 * to the agent; the path is derived from verified content, never caller input.
 */
export declare function storeDocumentSnapshot(bytes: Uint8Array, options: StoreDocumentSnapshotOptions): Promise<StoredDocumentSnapshot>;
export {};
//# sourceMappingURL=documents.d.ts.map