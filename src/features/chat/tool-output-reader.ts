import type { IpcResult } from '../../shared/model-api'

export type ToolOutput = { text: string; truncated: boolean }
export type ToolOutputReader = (payload: {
  conversationId: string
  outputId: string
}) => Promise<IpcResult<ToolOutput | null>>

export type ToolOutputReadState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'missing-conversation' }
  | { kind: 'unavailable' }
  | { kind: 'failed' }
  | { kind: 'loaded'; output: ToolOutput }

/** Read one transient result using its exact owning conversation and opaque reference. */
export async function readToolOutput(
  reader: ToolOutputReader | undefined,
  conversationId: string | null | undefined,
  outputId: string,
): Promise<ToolOutputReadState> {
  if (!conversationId) return { kind: 'missing-conversation' }
  if (typeof reader !== 'function') return { kind: 'failed' }

  try {
    const result = await reader({ conversationId, outputId })
    if (!result?.ok) return { kind: 'failed' }
    if (result.data === null) return { kind: 'unavailable' }
    if (typeof result.data.text !== 'string' || typeof result.data.truncated !== 'boolean') {
      return { kind: 'failed' }
    }
    return { kind: 'loaded', output: result.data }
  } catch {
    return { kind: 'failed' }
  }
}
