import type { Context } from '@taskweaver/cordis';
import z from '@taskweaver/schemastery';
export { storeDocumentSnapshot } from './documents.ts';
export type { StoreDocumentSnapshotOptions, StoredDocumentSnapshot } from './documents.ts';
export declare const name = "tool-document";
export declare const inject: string[];
export interface Config {
    /** Output ceiling aligned with the fs readMaxBytes default. */
    readMaxBytes?: number;
    /** PDF size limit; capped at the planned 100 MB ceiling. */
    maxPdfBytes?: number;
    /** Office Open XML size limit; capped at 50 MB. */
    maxOfficeBytes?: number;
    /** Maximum source bytes read before format-specific limits are applied. */
    maxFileReadBytes?: number;
    /** Private DSH-home directory for bounded, content-addressed parser results. */
    cacheDirectory?: string;
    /** Read-only location used for content-addressed documents attached outside a workspace. */
    documentsDirectory?: string;
    /** Maximum total size of the on-disk parser LRU. Set to zero to disable it. */
    cacheMaxBytes?: number;
    /** Optional explicit LibreOffice executable path; otherwise PATH and macOS defaults are checked. */
    sofficePath?: string;
    /** Maximum extracted segment held for spill/readback before requesting a narrower range. */
    maxSegmentBytes?: number;
}
export declare const Config: z<Config>;
export declare function apply(ctx: Context, config: Config): void;
//# sourceMappingURL=index.d.ts.map