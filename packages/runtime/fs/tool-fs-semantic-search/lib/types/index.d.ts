import type { Context } from '@taskweaver/cordis';
import z from '@taskweaver/schemastery';
export declare const name = "tool-fs-semantic-search";
export declare const inject: string[];
export interface Config {
    embeddingProvider?: 'jina' | 'openai';
    jinaApiKey?: string;
    openaiApiKey?: string;
    maxFiles?: number;
    maxFileBytes?: number;
    maxTotalBytes?: number;
}
export declare const Config: z<Config>;
export declare function apply(ctx: Context, config: Config): void;
//# sourceMappingURL=index.d.ts.map