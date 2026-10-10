/**
 * This retained package's source fixture exercises the generic MCP client
 * contract and proves the real Cordis Loader discovers a keyless tool.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { Context } from '@taskweaver/cordis'
import type { PatchOptions } from '@taskweaver/cordis-plugin-include'
import { boot, loadOverlayPatches } from '@taskweaver/dsh-app-boot'
import SystemPrompt from '@taskweaver/dsh-system-prompt'
import ToolRuntime from '@taskweaver/dsh-tools'
import * as McpClient from '@taskweaver/dsh-mcp-client/src/index.ts'

interface InsertedRow {
  id?: string
  name?: string
  config?: Record<string, unknown>
}

const root = resolve(import.meta.dirname, '../..')
const baseConfig = resolve(import.meta.dirname, 'fixtures/memory-mcp-base.cordis.yml')
const overlayFile = resolve(import.meta.dirname, 'fixtures/memory-mcp-overlay.cordis.yml')
const fixtureServer = resolve(root, 'mcp/mcp-client/tests/fixture-server.ts')

const contract = {
  id: 'memory-fixture',
  name: '@taskweaver/dsh-mcp-client',
  serverName: 'memory_fixture',
  transport: 'stdio',
} as const

const liveContexts = new Set<Context>()

afterEach(async () => {
  await Promise.all([...liveContexts].map(async ctx => ctx.fiber.dispose()))
  liveContexts.clear()
})

function insertedRow(patches: PatchOptions[]): InsertedRow {
  expect(patches).toHaveLength(1)
  const insert = patches[0]?.insert
  expect(insert).toHaveLength(1)
  return insert?.[0] as InsertedRow
}

async function waitForTool(ctx: Context, name: string): Promise<void> {
  const deadline = Date.now() + 10_000
  while (!ctx.tools.schemas().some(schema => schema.name === name)) {
    if (Date.now() >= deadline) throw new Error(`timed out waiting for ${name}`)
    await new Promise(resolveWait => setTimeout(resolveWait, 25))
  }
}

describe('TaskWeaver MCP client overlay', () => {
  it('parses the package contract without credentials', () => {
    const source = readFileSync(overlayFile, 'utf8')
    const row = insertedRow(loadOverlayPatches('memory-mcp-config-test', overlayFile))

    expect(row.id).toBe(contract.id)
    expect(row.name).toBe(contract.name)
    expect(row.config?.serverName).toBe(contract.serverName)
    expect(row.config?.transport).toBe(contract.transport)
    expect(source).not.toMatch(/\bsk-[A-Za-z0-9_-]{8,}\b/u)
    expect(source).not.toContain('DEEPSEEK_API_KEY')
  })

  it('loads the overlay and discovers a keyless fixture tool', async () => {
    const patches = loadOverlayPatches('memory-mcp-config-test', overlayFile)
    // The unit test maps the workspace package to its source module so a clean
    // checkout needs no prebuilt `lib/` artifacts to exercise Loader/MCP.
    insertedRow(patches).name = 'cordis:memory-test-mcp-client'
    const fixturePatch: PatchOptions = {
      id: contract.id,
      config: {
        serverName: contract.serverName,
        transport: 'stdio',
        command: process.execPath,
        args: [fixtureServer],
        env: {},
        cwd: root,
        toolCallTimeoutMs: 5_000,
      },
    }
    const ctx = await boot(
      'memory-mcp-config-test',
      baseConfig,
      [...patches, fixturePatch],
      (ctx) => {
        liveContexts.add(ctx)
        ctx.loader.builtins['memory-test-system-prompt'] = SystemPrompt
        ctx.loader.builtins['memory-test-tools'] = ToolRuntime
        ctx.loader.builtins['memory-test-mcp-client'] = McpClient
      },
    )
    await waitForTool(ctx, `mcp__${contract.serverName}__greet`)
  }, 15_000)
})
