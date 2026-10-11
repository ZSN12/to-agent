import { describe, expect, it, vi, beforeEach } from 'vitest'
import { Context } from '@taskweaver/cordis'
import SystemPrompt from '@taskweaver/dsh-system-prompt'
import ToolRuntime from '@taskweaver/dsh-tools'
import type { Config } from '@taskweaver/dsh-mcp-client'

const {
  mockConnect,
  mockClose,
  mockListTools,
  mockCallTool,
  mockSetNotificationHandler,
  pendingConnects,
  MockClient,
} = vi.hoisted(() => {
  const pendingConnects: Array<() => void> = []
  const mockConnect = vi.fn<() => Promise<void>>()
  const mockClose = vi.fn(function (this: { onclose?: () => void }) {
    this.onclose?.()
    for (const resolve of pendingConnects.splice(0)) resolve()
    return Promise.resolve()
  })
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
    onclose?: () => void
  }
  return {
    mockConnect,
    mockClose,
    mockListTools,
    mockCallTool,
    mockSetNotificationHandler,
    pendingConnects,
    MockClient,
  }
})

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({ Client: MockClient }))
vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({ StdioClientTransport: vi.fn() }))
vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({ StreamableHTTPClientTransport: vi.fn() }))

import { apply, inject } from '@taskweaver/dsh-mcp-client/src/index.ts'

async function mountRuntime(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  return ctx
}

async function awaitActivationWithinBudget(activation: Promise<unknown>, serverName: string): Promise<void> {
  let timer: NodeJS.Timeout | undefined
  try {
    await Promise.race([
      activation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`${serverName} blocked plugin activation`)), 1_000)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function measureActivation(mcpCount: number): Promise<number> {
  const ctx = await mountRuntime()
  try {
    const startedAt = performance.now()
    for (let index = 0; index < mcpCount; index += 1) {
      const serverName = `slow_${index}`
      const config: Config = {
        transport: 'stdio',
        serverName,
        command: 'fixture-delayed-mcp',
        startupWaitMs: 0,
        failOnStartupError: false,
      }
      await awaitActivationWithinBudget(
        ctx.plugin({ name: `mcp-client-${serverName}`, inject, apply }, config),
        serverName,
      )
    }
    const elapsedMs = performance.now() - startedAt
    expect(mockConnect).toHaveBeenCalledTimes(mcpCount)
    expect(pendingConnects).toHaveLength(mcpCount)
    return elapsedMs
  } finally {
    await ctx.fiber.dispose()
  }
}

describe('nonblocking MCP startup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    pendingConnects.splice(0)
    mockConnect.mockImplementation(() => new Promise<void>((resolve) => pendingConnects.push(resolve)))
    mockListTools.mockResolvedValue({ tools: [], nextCursor: undefined })
    mockCallTool.mockResolvedValue({ content: [] })
  })

  it('keeps plugin activation within 300ms of baseline with three stalled MCP connections', async () => {
    const noMcpMs = await measureActivation(0)
    const threeMcpMs = await measureActivation(3)

    // Connections stay pending throughout activation, modeling slow MCP startup
    // without launching child processes or contacting external services.
    expect(threeMcpMs - noMcpMs).toBeLessThanOrEqual(300)
  }, 10_000)
})
