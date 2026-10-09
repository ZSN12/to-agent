/**
 * @module @z/dsh-bridge-core
 */

export type {
  BridgeBackend,
  BridgeCatalogModel,
  BridgeKind,
  BridgeProviderProfile,
  BridgeStreamContext,
} from './types.ts'
export { BUILTIN_BRIDGE_KINDS } from './types.ts'
export {
  getBridgeBackend,
  installDefaultBridgeBackends,
  registerBridgeBackend,
  streamThroughBridge,
  installTaskWeaverTransportBackends,
} from './registry.ts'
export { createPendingBridgeBackend } from './backends/pending.ts'
