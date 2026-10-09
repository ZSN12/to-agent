/**
 * @module @z/dsh-bridge-core/registry
 */

import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { StreamChunk } from '@z/dsh-llm'
import type { BridgeBackend, BridgeKind, BridgeStreamContext } from './types.ts'
import { createPendingBridgeBackend } from './backends/pending.ts'

const backends = new Map<BridgeKind, BridgeBackend>()

export function registerBridgeBackend(backend: BridgeBackend): void {
  backends.set(backend.kind, backend)
}

export function getBridgeBackend(kind: BridgeKind): BridgeBackend {
  const hit = backends.get(kind)
  if (hit) return hit
  return createPendingBridgeBackend(kind)
}

export async function* streamThroughBridge(context: BridgeStreamContext): AsyncIterable<StreamChunk> {
  const backend = getBridgeBackend(context.profile.bridgeKind)
  yield* backend.stream(context)
}

export function installDefaultBridgeBackends(): void {
  for (const kind of [
    'cursor',
    'google-antigravity',
    'openai-compat-relay',
  ]) {
    if (!backends.has(kind)) {
      registerBridgeBackend(createPendingBridgeBackend(kind))
    }
  }
}

function transportModuleCandidates(): string[] {
  const fromEnv = process.env.TASKWEAVER_BRIDGE_TRANSPORT?.trim()
  if (fromEnv) return [fromEnv]
  const zRuntime = process.env.TASKWEAVER_Z_RUNTIME?.trim()
  if (zRuntime) {
    const staged = join(zRuntime, 'electron-vendor', 'taskweaver-bridge-transport', 'index.mjs')
    return [pathToFileURL(staged).href]
  }
  return [
    '../../../../../../packages/taskweaver-bridge-transport/index.mjs',
    '../../../../../../../packages/taskweaver-bridge-transport/index.mjs',
    '../../../../../electron-vendor/taskweaver-bridge-transport/index.mjs',
    '../../../../electron-vendor/taskweaver-bridge-transport/index.mjs',
  ]
}

/** Best-effort load of repo-root transport package; returns false when absent. */
export async function installTaskWeaverTransportBackends(): Promise<boolean> {
  for (const rel of transportModuleCandidates()) {
    try {
      const url = new URL(rel, import.meta.url)
      const mod = await import(url.href)
      if (typeof mod.installBridgeTransportBackends === 'function') {
        mod.installBridgeTransportBackends({ registerBridgeBackend })
        return true
      }
    } catch {
      /* try next candidate */
    }
  }
  return false
}
