import { describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRemoteToolCache } from '@taskweaver/dsh-mcp-client/src/remote-tool-cache.ts'

describe('remote MCP tool cache', () => {
  it('stores validated schemas privately and scopes them to the endpoint without storing URL credentials', async () => {
    const home = await mkdtemp(join(tmpdir(), 'tw-mcp-tool-cache-'))
    const previousHome = process.env.TASKWEAVER_HOME
    process.env.TASKWEAVER_HOME = home
    const url = 'https://example.test/mcp/?token=cache-secret-must-not-be-written'
    try {
      const cache = createRemoteToolCache('remote-server', url)
      const tools = [{
        name: 'search',
        description: 'Search remote documents',
        inputSchema: { type: 'object' as const, properties: { query: { type: 'string' } } },
      }]

      expect(await cache.write(tools)).toBe(true)
      expect(await cache.read()).toEqual(tools)
      expect((await stat(cache.filePath)).mode & 0o777).toBe(0o600)
      const content = await readFile(cache.filePath, 'utf8')
      expect(content).not.toContain('cache-secret-must-not-be-written')
      expect(content).not.toContain(url)
      expect(await createRemoteToolCache('remote-server', 'https://other.test/mcp/').read()).toBeNull()

      await writeFile(cache.filePath, '{invalid json')
      expect(await cache.read()).toBeNull()
    } finally {
      if (previousHome === undefined) delete process.env.TASKWEAVER_HOME
      else process.env.TASKWEAVER_HOME = previousHome
      await rm(home, { recursive: true, force: true })
    }
  })
})
