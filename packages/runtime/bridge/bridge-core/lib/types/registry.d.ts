/**
 * @module @taskweaver/dsh-bridge-core/registry
 */
import type { StreamChunk } from '@taskweaver/dsh-llm';
import type { BridgeBackend, BridgeKind, BridgeStreamContext } from './types.ts';
/** Resolve the runtime root while keeping the former env spellings read-only for one release. */
export declare function resolveBridgeRuntimeRoot(env?: Record<string, string | undefined>, warn?: (message: string) => void): string | undefined;
export declare function registerBridgeBackend(backend: BridgeBackend): void;
export declare function getBridgeBackend(kind: BridgeKind): BridgeBackend;
export declare function streamThroughBridge(context: BridgeStreamContext): AsyncIterable<StreamChunk>;
export declare function installDefaultBridgeBackends(): void;
/** Best-effort load of repo-root transport package; returns false when absent. */
export declare function installTaskWeaverTransportBackends(): Promise<boolean>;
//# sourceMappingURL=registry.d.ts.map