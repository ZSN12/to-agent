import { Context } from '@taskweaver/cordis';
import z from '@taskweaver/schemastery';
import './session-events.ts';
export declare const name = "tool-ui-verify";
export declare const inject: string[];
export interface Config {
    /** Native macOS fallback is off unless explicitly enabled by trusted Host configuration. */
    nativeFallbackEnabled?: boolean;
}
export declare const Config: z<Config>;
export declare function apply(ctx: Context, config: Config): void;
//# sourceMappingURL=index.d.ts.map