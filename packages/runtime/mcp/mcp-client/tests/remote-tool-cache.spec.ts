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
    const headers = { Authorization: 'Bearer header-secret-must-not-be-written' }
    try {
      const cache = createRemoteToolCache('remote-server', url, headers)
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
      expect(content).not.toContain('header-secret-must-not-be-written')
      expect(content).not.toContain(url)
      expect(await createRemoteToolCache('remote-server', 'https://other.test/mcp/').read()).toBeNull()
      expect(await createRemoteToolCache('remote-server', url, { authorization: headers.Authorization }).read()).toEqual(tools)
      expect(await createRemoteToolCache('remote-server', url, { Authorization: 'Bearer different-account' }).read()).toBeNull()

      await writeFile(cache.filePath, '{invalid json')
      expect(await cache.read()).toBeNull()
    } finally {
      if (previousHome === undefined) delete process.env.TASKWEAVER_HOME
      else process.env.TASKWEAVER_HOME = previousHome
      await rm(home, { recursive: true, force: true })
    }
  })

  it('keeps concurrent writes atomic and never returns one identity’s schema to another', async () => {
    const home = await mkdtemp(join(tmpdir(), 'tw-mcp-tool-cache-race-'))
    const previousHome = process.env.TASKWEAVER_HOME
    process.env.TASKWEAVER_HOME = home
    try {
      const first = createRemoteToolCache('shared-server', 'https://example.test/mcp/', { Authorization: 'Bearer account-a' })
      const second = createRemoteToolCache('shared-server', 'https://example.test/mcp/', { Authorization: 'Bearer account-b' })
      const firstTools = [{ name: 'account_a', inputSchema: { type: 'object' as const } }]
      const secondTools = [{ name: 'account_b', inputSchema: { type: 'object' as const } }]

      expect(await Promise.all([first.write(firstTools), second.write(secondTools)])).toEqual([true, true])
      const [firstRead, secondRead] = await Promise.all([first.read(), second.read()])
      expect(Number(firstRead !== null) + Number(secondRead !== null)).toBe(1)
      expect(firstRead ?? secondRead).toEqual(firstRead === null ? secondTools : firstTools)
    } finally {
      if (previousHome === undefined) delete process.env.TASKWEAVER_HOME
      else process.env.TASKWEAVER_HOME = previousHome
      await rm(home, { recursive: true, force: true })
    }
  })
})
