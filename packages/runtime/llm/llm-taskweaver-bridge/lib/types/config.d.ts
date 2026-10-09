/**
 * @module @z/dsh-llm-taskweaver-bridge/config
 */
import z from '@z/schemastery';
import type { BridgeProviderProfile } from '@z/dsh-bridge-core';
/** Settings document shape (schema output is cast at runtime boundaries). */
export interface Config {
    providers?: Record<string, BridgeProviderProfile>;
}
export declare const ConfigSchema: z<Schemastery.ObjectS<{
    providers: z<import("@z/cosmokit").Dict<{
        bridgeKind?: string | null;
        displayName?: string | null;
        models?: ({
            id?: string | null;
            name?: string | null;
            contextWindow?: number | null;
            maxTokens?: number | null;
            reasoning?: boolean | null;
            thinkingLevelMap?: import("@z/cosmokit").Dict<string, string> | null;
            defaultThinkingLevel?: string | null;
            compat?: import("@z/cosmokit").Dict<any, string> | null;
        } & import("@z/cosmokit").Dict)[] | null;
        loopbackBaseURL?: string | null;
        relayBaseURL?: string | null;
    } & import("@z/cosmokit").Dict, string>, import("@z/cosmokit").Dict<Schemastery.ObjectT<{
        bridgeKind: z<string, string>;
        displayName: z<string, string>;
        models: z<({
            id?: string | null;
            name?: string | null;
            contextWindow?: number | null;
            maxTokens?: number | null;
            reasoning?: boolean | null;
            thinkingLevelMap?: import("@z/cosmokit").Dict<string, string> | null;
            defaultThinkingLevel?: string | null;
            compat?: import("@z/cosmokit").Dict<any, string> | null;
        } & import("@z/cosmokit").Dict)[], Schemastery.ObjectT<{
            id: z<string, string>;
            name: z<string, string>;
            contextWindow: z<number, number>;
            maxTokens: z<number, number>;
            reasoning: z<boolean, boolean>;
            thinkingLevelMap: z<import("@z/cosmokit").Dict<string, string>, import("@z/cosmokit").Dict<string, string>>;
            defaultThinkingLevel: z<string, string>;
            compat: z<import("@z/cosmokit").Dict<any, string>, import("@z/cosmokit").Dict<any, string>>;
        }>[]>;
        loopbackBaseURL: z<string, string>;
        relayBaseURL: z<string, string>;
    }>, string>>;
}>, Schemastery.ObjectT<{
    providers: z<import("@z/cosmokit").Dict<{
        bridgeKind?: string | null;
        displayName?: string | null;
        models?: ({
            id?: string | null;
            name?: string | null;
            contextWindow?: number | null;
            maxTokens?: number | null;
            reasoning?: boolean | null;
            thinkingLevelMap?: import("@z/cosmokit").Dict<string, string> | null;
            defaultThinkingLevel?: string | null;
            compat?: import("@z/cosmokit").Dict<any, string> | null;
        } & import("@z/cosmokit").Dict)[] | null;
        loopbackBaseURL?: string | null;
        relayBaseURL?: string | null;
    } & import("@z/cosmokit").Dict, string>, import("@z/cosmokit").Dict<Schemastery.ObjectT<{
        bridgeKind: z<string, string>;
        displayName: z<string, string>;
        models: z<({
            id?: string | null;
            name?: string | null;
            contextWindow?: number | null;
            maxTokens?: number | null;
            reasoning?: boolean | null;
            thinkingLevelMap?: import("@z/cosmokit").Dict<string, string> | null;
            defaultThinkingLevel?: string | null;
            compat?: import("@z/cosmokit").Dict<any, string> | null;
        } & import("@z/cosmokit").Dict)[], Schemastery.ObjectT<{
            id: z<string, string>;
            name: z<string, string>;
            contextWindow: z<number, number>;
            maxTokens: z<number, number>;
            reasoning: z<boolean, boolean>;
            thinkingLevelMap: z<import("@z/cosmokit").Dict<string, string>, import("@z/cosmokit").Dict<string, string>>;
            defaultThinkingLevel: z<string, string>;
            compat: z<import("@z/cosmokit").Dict<any, string>, import("@z/cosmokit").Dict<any, string>>;
        }>[]>;
        loopbackBaseURL: z<string, string>;
        relayBaseURL: z<string, string>;
    }>, string>>;
}>>;
export interface ResolvedBridgeOptions {
    readonly providers: ReadonlyMap<string, BridgeProviderProfile>;
}
export declare function resolveBridgeOptions(raw: Config): ResolvedBridgeOptions;
export declare function parseConfig(raw: unknown): Config;
//# sourceMappingURL=config.d.ts.map