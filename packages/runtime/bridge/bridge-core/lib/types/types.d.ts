/**
 * TaskWeaver model bridge — shared types for in-process provider backends.
 * @module @z/dsh-bridge-core/types
 */
import type { GenerateOptions, StreamChunk } from '@z/dsh-llm';
/** Wire catalog entry mirrored from TaskWeaver `models.json`. */
export interface BridgeCatalogModel {
    readonly id: string;
    readonly name?: string;
    readonly contextWindow?: number;
    readonly maxTokens?: number;
    readonly reasoning?: boolean;
    readonly thinkingLevelMap?: Record<string, string | null>;
    readonly defaultThinkingLevel?: string;
    readonly compat?: Record<string, unknown>;
}
/**
 * Known bridge kinds. Extend by registering a {@link BridgeBackend} at runtime.
 * - `cursor` — Composer / Cursor subscription transport
 * - `google-antigravity` — Google Antigravity wire
 * - `openai-compat-relay` — custom reverse proxy speaking OpenAI-compatible HTTP (in-process client, no fixed 10100)
 */
export type BridgeKind = string;
export interface BridgeProviderProfile {
    readonly bridgeKind: BridgeKind;
    readonly displayName: string;
    readonly models: readonly BridgeCatalogModel[];
    /**
     * Transitional: loopback OpenAI-compatible base (e.g. legacy ocx on 10100).
     * Removed once the matching in-process backend is implemented.
     */
    readonly loopbackBaseURL?: string;
    /** Custom OpenAI-compatible relay for `openai-compat-relay` bridgeKind. */
    readonly relayBaseURL?: string;
    /** Antigravity Cloud Code Assist endpoint (from models.json / ocx export). */
    readonly baseUrl?: string;
    readonly project?: string;
}
export interface BridgeStreamContext {
    readonly providerId: string;
    readonly profile: BridgeProviderProfile;
    readonly options: GenerateOptions;
    /** Harness home (`Z_HOME` / `DSH_HOME`) for OAuth and state stores. */
    readonly harnessHome: string;
}
export interface BridgeBackend {
    readonly kind: BridgeKind;
    stream(context: BridgeStreamContext): AsyncIterable<StreamChunk>;
}
export declare const BUILTIN_BRIDGE_KINDS: Readonly<{
    readonly CURSOR: "cursor";
    readonly GOOGLE_ANTIGRAVITY: "google-antigravity";
    readonly OPENAI_COMPAT_RELAY: "openai-compat-relay";
}>;
//# sourceMappingURL=types.d.ts.map