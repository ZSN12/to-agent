/**
 * Placeholder backend until opencodex transport is wired in-process per kind.
 * @module @z/dsh-bridge-core/backends/pending
 */

import { LlmError } from '@z/dsh-llm'
import type { StreamChunk } from '@z/dsh-llm'
import type { BridgeBackend, BridgeKind, BridgeStreamContext } from '../types.ts'

export function createPendingBridgeBackend(kind: BridgeKind): BridgeBackend {
  return {
    kind,
    async *stream(_context: BridgeStreamContext): AsyncIterable<StreamChunk> {
      throw new LlmError(
        `TaskWeaver 模型桥「${kind}」的内置传输尚未接入（方案 C 进行中）。`
        + ' 过渡期请继续使用 models.json 中的 loopback 提供方（如 opencodex + baseUrl），'
        + ' 或配置 api: "openai-compat" 的直连 API。',
        'BRIDGE_BACKEND_PENDING',
      )
    },
  }
}
