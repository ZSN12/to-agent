/** Host-owned MCP directory and execution surface. */

import type { JsonValue, SessionId } from '@z/dsh-session/types'
import type { RpcRequest, RpcResponse } from './rpc.ts'

export interface McpToolView {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export interface McpApi {
  list(request: RpcRequest<{}>): Promise<RpcResponse<{ tools: McpToolView[] }>>
  call(
    request: RpcRequest<{ sessionId: SessionId; name: string; arguments: Record<string, JsonValue> }>,
    signal?: AbortSignal,
  ): Promise<RpcResponse<{ isError: boolean; content: string[]; value?: JsonValue }>>
}
