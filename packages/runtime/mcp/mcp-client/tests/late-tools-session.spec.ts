import { describe, expect, it, vi, beforeEach } from 'vitest'
import { Context } from '@taskweaver/cordis'
import SystemPrompt from '@taskweaver/dsh-system-prompt'
import ToolRuntime from '@taskweaver/dsh-tools'
import type { Config } from '@taskweaver/dsh-mcp-client'

const { mockConnect, mockClose, mockListTools, mockCallTool, mockSetNotificationHandler, MockClient } = vi.hoisted(() => {
  const mockConnect = vi.fn<() => Promise<void>>()
  const mockClose = vi.fn<() => Promise<void>>()
  const mockListTools = vi.fn<(_params?: Record<string, unknown>) => Promise<unknown>>()
  const mockCallTool = vi.fn<(
    _params?: Record<string, unknown>, _compatibilitySchema?: unknown, _options?: unknown,
  ) => Promise<unknown>>()
  const mockSetNotificationHandler = vi.fn()
  const mockRequest = vi.fn(async (
    request: { method: string; params?: Record<string, unknown> },
    _schema: unknown,
    options?: unknown,
  ): Promise<unknown> => {
    if (request.method === 'tools/list') return await mockListTools(request.params)
    if (request.method === 'tools/call') return await mockCallTool(request.params, undefined, options)
    throw new Error(`unexpected MCP request: ${request.method}`)
  })
  class MockClient {
    connect = mockConnect
    close = mockClose
    listTools = mockListTools
    callTool = mockCallTool
    request = mockRequest
    setNotificationHandler = mockSetNotificationHandler
  }
  return { mockConnect, mockClose, mockListTools, mockCallTool, mockSetNotificationHandler, MockClient }
})

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: MockClient,
}))

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: vi.fn(),
}))

vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: vi.fn(),
}))

import { apply } from '@taskweaver/dsh-mcp-client/src/index.ts'

function sleep(ms: number): Promise<void> {
  const gate: PromiseWithResolvers<void> = Promise.withResolvers()
  setTimeout(gate.resolve, ms)
  return gate.promise
}

describe('late MCP tools session visibility', () => {
  let ctx: Context

  beforeEach(async () => {
    vi.clearAllMocks()
    ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
  })

  it('unblocks startup with startupWaitMs=0 and exposes tools dynamically in subsequent turns', async () => {
    let connectResolve: () => void = () => {}
    mockConnect.mockImplementation(() => new Promise<void>((resolve) => {
      connectResolve = resolve
    }))

    mockListTools.mockResolvedValue({
      tools: [{
        name: 'delayed_tool',
        description: 'A tool that arrived late',
        inputSchema: { type: 'object', properties: { q: { type: 'string' } } },
      }],
      nextCursor: undefined,
    })

    const slowConfig: Config = {
      transport: 'stdio',
      serverName: 'slow_srv',
      command: 'node',
      startupWaitMs: 0,
      failOnStartupError: false,
    }

    // 1. apply completes immediately without blocking because startupWaitMs is 0
    const startApplyTime = Date.now()
    await apply(ctx, slowConfig)
    const applyElapsed = Date.now() - startApplyTime
    expect(applyElapsed).toBeLessThan(100)

    // 2. Initial assembly before connection completes: tool is not yet present
    const firstAssembly = await ctx.systemPrompt.assemble({ agentId: 'test-agent' } as never)
    const toolNamesFirst = (firstAssembly.tools ?? []).map((t: { name: string }) => t.name)
    expect(toolNamesFirst).not.toContain('mcp__slow_srv__delayed_tool')

    // 3. MCP connection completes asynchronously in the background
    connectResolve()
    await vi.waitFor(() => {
      expect(mockListTools).toHaveBeenCalled()
      expect(ctx.tools.get('mcp__slow_srv__delayed_tool')).toBeDefined()
    }, { timeout: 4000 })

    // 4. Subsequent assembly turn: dynamically reflects the newly registered late tool
    const secondAssembly = await ctx.systemPrompt.assemble()
    const toolNamesSecond = (secondAssembly.tools ?? []).map((t: { name: string }) => t.name)
    expect(toolNamesSecond).toContain('mcp__slow_srv__delayed_tool')

    // Cleanup
    await ctx.fiber.dispose()
  }, 10_000)
})
