import { createInterface } from 'node:readline'
import { appendFile } from 'node:fs/promises'

const input = createInterface({ input: process.stdin })
const pendingToolCalls = new Map()
input.on('line', async (line) => {
  let message
  try { message = JSON.parse(line) } catch { return }
  if (message.id === undefined) {
    if (message.method === 'notifications/cancelled') {
      if (process.env.TASKWEAVER_MCP_CANCEL_LOG) {
        await appendFile(process.env.TASKWEAVER_MCP_CANCEL_LOG, `${JSON.stringify({ kind: 'cancelled', method: message.method, params: message.params })}\n`, 'utf8')
      }
      const requestId = message.params?.requestId
      if (pendingToolCalls.has(requestId)) {
        pendingToolCalls.delete(requestId)
        process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: requestId, error: { code: -32800, message: 'Request cancelled' } })}\n`)
      }
    }
    return
  }
  let result
  if (message.method === 'initialize') {
    result = { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'test-echo', version: '1.0.0' } }
  } else if (message.method === 'tools/list') {
    result = { tools: [{ name: 'echo', description: 'Echo text', inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] }, annotations: { readOnlyHint: true } }] }
  } else if (message.method === 'tools/call') {
    const text = String(message.params?.arguments?.text ?? '')
    if (process.env.TASKWEAVER_MCP_SMOKE_LOG) {
      await appendFile(process.env.TASKWEAVER_MCP_SMOKE_LOG, `${text}\n`, 'utf8')
    }
    if (text === 'mcp-cancel-marker') {
      pendingToolCalls.set(message.id, true)
      if (process.env.TASKWEAVER_MCP_CANCEL_LOG) {
        await appendFile(process.env.TASKWEAVER_MCP_CANCEL_LOG, `${JSON.stringify({ kind: 'pending-call', requestId: message.id, marker: text })}\n`, 'utf8')
      }
      return
    }
    result = text === 'mcp-fail-marker'
      ? { content: [{ type: 'text', text: 'synthetic MCP tool failure' }], isError: true }
      : { content: [{ type: 'text', text }] }
  } else {
    process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Method not found' } })}\n`)
    return
  }
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: message.id, result })}\n`)
})
