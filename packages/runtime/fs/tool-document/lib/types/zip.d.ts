export interface ZipEntryInfo {
    name: string;
    compressedBytes: number;
    expandedBytes: number;
    method: number;
    localOffset: number;
}
export declare const ZIP_MAX_ENTRIES = 10000;
export declare const ZIP_MAX_EXPANDED_BYTES: number;
export declare const ZIP_MAX_RATIO = 100;
export declare const ZIP_MAX_XML_PART_BYTES: number;
/** Inspect central-directory sizes before any decompression takes place. */
export declare function inspectZip(bytes: Uint8Array): Map<string, ZipEntryInfo>;
/** Decompress only requested entries after the entire archive has passed size checks. */
export declare function extractZipEntries(bytes: Uint8Array, catalog: ReadonlyMap<string, ZipEntryInfo>, requested: ReadonlySet<string>, maxPartBytes?: number): Map<string, Uint8Array>;
export declare function textPart(parts: ReadonlyMap<string, Uint8Array>, name: string, maxBytes?: number): string;
//# sourceMappingURL=zip.d.ts.map