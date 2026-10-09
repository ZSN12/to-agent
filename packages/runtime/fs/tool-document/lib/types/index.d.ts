import type { Context } from '@z/cordis';
import z from '@z/schemastery';
export declare const name = "tool-document";
export declare const inject: string[];
export interface Config {
    /** Output ceiling aligned with the fs readMaxBytes default. */
    readMaxBytes?: number;
    /** Small enough to stay well below the PDF worker's transfer overhead. */
    maxFileReadBytes?: number;
}
export declare const Config: z<Config>;
export declare function apply(ctx: Context, config: Config): void;
//# sourceMappingURL=index.d.ts.map