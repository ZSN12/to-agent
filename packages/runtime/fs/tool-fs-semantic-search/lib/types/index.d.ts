import type { Context } from '@taskweaver/cordis';
import z from '@taskweaver/schemastery';
export declare const name = "tool-fs-semantic-search";
export declare const inject: string[];
export type EmbeddingProvider = 'jina' | 'openai';
export interface Config {
    embeddingProvider?: EmbeddingProvider;
    maxFiles?: number;
    maxFileBytes?: number;
    maxTotalBytes?: number;
}
export declare const Config: z<Config>;
export declare const SETTINGS_NAMESPACE: import("@taskweaver/dsh-settings").SettingsNamespace;
export declare function apply(ctx: Context, config: Config): Promise<void>;
//# sourceMappingURL=index.d.ts.map