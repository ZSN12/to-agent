import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createMcpService } from '../electron/backend/mcp-service.mjs'

const userData = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-mcp-test-'))
let connects = 0
let closes = 0
let lastCall = null
const service = createMcpService({
  userData,
  connectClient: async () => {
    connects += 1
    return {
      listTools: async () => ({ tools: [
        { name: 'lookup', description: 'Read one item', inputSchema: { type: 'object', properties: { id: { type: 'string' } } }, annotations: { readOnlyHint: true } },
        { name: 'modify', description: 'Modify one item', inputSchema: { type: 'object', properties: {} } },
      ] }),
      callTool: async (call) => {
        lastCall = call
        return { content: [{ type: 'text', text: 'found' }] }
      },
      close: async () => { closes += 1 },
    }
  },
})

try {
  assert.deepEqual(await service.listServers(), [])
  await service.saveServer({ id: 'local', command: 'node', args: ['server.mjs'], env: { API_TOKEN: 'secret' }, enabled: false })
  assert.equal((await service.getCustomTools()).tools.length, 0)
  assert.equal(connects, 0)

  await service.saveServer({ id: 'local', command: 'node', args: ['server.mjs'], env: { API_TOKEN: 'secret' }, enabled: true })
  const listed = await service.listServers()
  assert.deepEqual(listed[0].envKeys, ['API_TOKEN'])
  assert.equal(JSON.stringify(listed).includes('secret'), false)
  const implementation = await service.getCustomTools({ taskType: 'implementation' })
  assert.deepEqual(implementation.tools.map((tool) => tool.name), ['mcp_local__lookup', 'mcp_local__modify'])
  assert.equal(implementation.statuses[0].status, 'connected')
  const lookup = implementation.tools[0]
  assert.deepEqual(await lookup.execute('call-1', { id: 'x' }), { content: [{ type: 'text', text: 'found' }] })
  assert.deepEqual(lastCall, { name: 'lookup', arguments: { id: 'x' } })
  assert.deepEqual((await service.getCustomTools({ taskType: 'research' })).tools.map((tool) => tool.name), ['mcp_local__lookup'])
  await service.removeServer('local')
  assert.equal(closes, 1)
  assert.deepEqual(await service.listServers(), [])
  await assert.rejects(() => service.saveServer({ id: '../escape', command: 'node', args: [], enabled: true }), /ID 无效/)

  const realService = createMcpService({ userData: path.join(userData, 'real') })
  try {
    await realService.saveServer({ id: 'echo', command: process.execPath, args: [path.join(import.meta.dirname, 'fixtures', 'mcp-echo-server.mjs')], enabled: true })
    const { tools, statuses } = await realService.getCustomTools()
    assert.equal(statuses[0].status, 'connected')
    assert.deepEqual(tools.map((tool) => tool.name), ['mcp_echo__echo'])
    assert.deepEqual(await tools[0].execute('real-call', { text: 'hello' }), { content: [{ type: 'text', text: 'hello' }] })
  } finally {
    await realService.stopAll()
  }
} finally {
  await service.stopAll()
  await fs.rm(userData, { recursive: true, force: true })
}

console.log('MCP service checks passed: disabled default, explicit config, status, tool bridge, read-only filtering, secret hiding')
