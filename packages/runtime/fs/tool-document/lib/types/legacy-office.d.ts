export type LegacyOfficeExtension = '.doc' | '.ppt' | '.xls';
export type LegacyOfficeTarget = 'docx' | 'pdf' | 'xlsx';
export declare function isOleCompoundFile(bytes: Uint8Array): boolean;
export declare function legacyOfficeExtension(path: string): LegacyOfficeExtension | undefined;
export declare function officeEncryptionMarkersPresent(bytes: Uint8Array): boolean;
export declare function legacyOfficeTarget(extension: LegacyOfficeExtension): LegacyOfficeTarget;
/** Locate LibreOffice without invoking a shell or inheriting any child environment. */
export declare function findLibreOffice(configuredPath?: string, searchPath?: string): Promise<string | undefined>;
/**
 * Convert an already sandbox-authorized OLE document from a private snapshot.
 * The source path supplied by the user is never passed to LibreOffice.
 */
export declare function convertLegacyOffice(bytes: Uint8Array, extension: LegacyOfficeExtension, options?: {
    sofficePath?: string;
    signal?: AbortSignal;
}): Promise<Uint8Array>;
//# sourceMappingURL=legacy-office.d.ts.map