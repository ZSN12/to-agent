/**
 * @module @z/dsh-bridge-core/registry
 */
import type { StreamChunk } from '@z/dsh-llm';
import type { BridgeBackend, BridgeKind, BridgeStreamContext } from './types.ts';
export declare function registerBridgeBackend(backend: BridgeBackend): void;
export declare function getBridgeBackend(kind: BridgeKind): BridgeBackend;
export declare function streamThroughBridge(context: BridgeStreamContext): AsyncIterable<StreamChunk>;
export declare function installDefaultBridgeBackends(): void;
/** Best-effort load of repo-root transport package; returns false when absent. */
export declare function installTaskWeaverTransportBackends(): Promise<boolean>;
//# sourceMappingURL=registry.d.ts.map