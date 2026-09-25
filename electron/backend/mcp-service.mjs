import path from 'node:path'
import { Client } from '@modelcontextprotocol/client'
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/client/stdio'
import { createJsonStore } from './json-store.mjs'

const SERVER_ID = /^[a-z][a-z0-9_-]{0,39}$/
const TOOL_NAME = /^[A-Za-z0-9_-]{1,80}$/

function validateServer(value) {
  if (!value || typeof value !== 'object' || !SERVER_ID.test(value.id ?? '')) throw new Error('MCP 服务 ID 无效')
  if (typeof value.command !== 'string' || !value.command.trim()) throw new Error('MCP 启动命令不能为空')
  if (!Array.isArray(value.args) || !value.args.every((arg) => typeof arg === 'string')) throw new Error('MCP 参数必须是字符串数组')
  if (value.env && (typeof value.env !== 'object' || Array.isArray(value.env) || !Object.entries(value.env).every(([key, item]) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(key) && typeof item === 'string'))) {
    throw new Error('MCP 环境变量配置无效')
  }
  return {
    id: value.id,
    command: value.command.trim(),
    args: value.args,
    env: value.env ?? {},
    enabled: value.enabled === true,
  }
}

function exposedServer(server, state) {
  return {
    id: server.id,
    command: server.command,
    args: server.args,
    envKeys: Object.keys(server.env),
    enabled: server.enabled,
    status: state?.status ?? 'disconnected',
    toolCount: state?.tools?.length ?? 0,
    error: state?.error ?? null,
  }
}

function mcpResultToText(result) {
  const parts = []
  for (const item of result?.content ?? []) {
    if (item?.type === 'text' && typeof item.text === 'string') parts.push(item.text)
    else if (item?.type === 'resource_link') parts.push(`[资源] ${item.uri ?? item.name ?? ''}`)
    else if (item?.type === 'image') parts.push('[MCP 返回图片；当前文本工具视图暂不显示二进制内容]')
    else if (item?.type === 'audio') parts.push('[MCP 返回音频；当前文本工具视图暂不显示二进制内容]')
  }
  return parts.join('\n').slice(0, 100_000) || 'MCP 工具没有返回文本。'
}

const ENC_PREFIX = 'enc:aes256:'

function encryptEnv(env, safeStorage) {
  if (!env || typeof env !== 'object') return {}
  const result = {}
  for (const [key, value] of Object.entries(env)) {
    if (typeof value !== 'string') continue
    if (value.startsWith(ENC_PREFIX)) {
      result[key] = value
    } else if (safeStorage?.isEncryptionAvailable?.()) {
      try {
        const encrypted = safeStorage.encryptString(value).toString('base64')
        result[key] = `${ENC_PREFIX}${encrypted}`
      } catch {
        result[key] = value
      }
    } else {
      result[key] = value
    }
  }
  return result
}

function decryptEnv(env, safeStorage) {
  if (!env || typeof env !== 'object') return {}
  const result = {}
  for (const [key, value] of Object.entries(env)) {
    if (typeof value !== 'string') continue
    if (value.startsWith(ENC_PREFIX)) {
      if (safeStorage?.isEncryptionAvailable?.()) {
        try {
          const raw = Buffer.from(value.slice(ENC_PREFIX.length), 'base64')
          result[key] = safeStorage.decryptString(raw)
        } catch {
          result[key] = ''
        }
      } else {
        result[key] = ''
      }
    } else {
      result[key] = value
    }
  }
  return result
}

/** TaskWeaver-owned, opt-in stdio MCP bridge. No server starts until enabled. */
export function createMcpService({ userData, connectClient, safeStorage } = {}) {
  const store = createJsonStore(path.join(userData, 'taskweaver-mcp.json'), { servers: [] })
  const connections = new Map()

  async function configured() {
    const value = await store.read()
    if (!Array.isArray(value?.servers)) throw new Error('MCP 配置格式无效')
    return value.servers.map(validateServer)
  }

  async function disconnect(id) {
    const state = connections.get(id)
    connections.delete(id)
    if (state?.client) await state.client.close()
  }

  async function connect(server) {
    const existing = connections.get(server.id)
    if (existing?.status === 'connected') return existing
    if (existing?.status === 'connecting') return existing.pending

    const state = { status: 'connecting', client: null, tools: [], error: null, pending: null }
    connections.set(server.id, state)
    state.pending = (async () => {
      let client
      try {
        const decryptedEnv = decryptEnv(server.env, safeStorage)
        if (connectClient) {
          client = await connectClient({ ...server, env: decryptedEnv })
        } else {
          client = new Client({ name: 'TaskWeaver', version: '0.1.0' }, { versionNegotiation: { mode: 'legacy' } })
          const transport = new StdioClientTransport({
            command: server.command,
            args: server.args,
            env: { ...getDefaultEnvironment(), ...decryptedEnv },
            stderr: 'ignore',
          })
          await client.connect(transport, { timeout: 10_000 })
        }
        const listing = await client.listTools()
        state.client = client
        state.tools = (listing.tools ?? []).filter((tool) => TOOL_NAME.test(tool.name ?? ''))
        state.status = 'connected'
        return state
      } catch (error) {
        await client?.close().catch(() => {})
        state.status = 'error'
        state.error = error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300)
        return state
      } finally {
        state.pending = null
      }
    })()
    return state.pending
  }

  async function listServers() {
    const servers = await configured()
    return servers.map((server) => exposedServer(server, connections.get(server.id)))
  }

  async function saveServer(input) {
    const server = validateServer(input)
    server.env = encryptEnv(server.env, safeStorage)
    await disconnect(server.id)
    const servers = await configured()
    const index = servers.findIndex((item) => item.id === server.id)
    if (index >= 0) servers[index] = server
    else servers.push(server)
    await store.write({ servers })
    return exposedServer(server)
  }

  async function removeServer(id) {
    if (!SERVER_ID.test(id ?? '')) throw new Error('MCP 服务 ID 无效')
    await disconnect(id)
    const servers = await configured()
    await store.write({ servers: servers.filter((item) => item.id !== id) })
    return true
  }

  async function getCustomTools({ taskType } = {}) {
    const definitions = []
    const statuses = []
    for (const server of await configured()) {
      if (!server.enabled) continue
      const state = await connect(server)
      statuses.push(exposedServer(server, state))
      if (state.status !== 'connected') continue
      for (const tool of state.tools) {
        if (taskType && taskType !== 'implementation' && tool.annotations?.readOnlyHint !== true) continue
        const name = `mcp_${server.id}__${tool.name}`
        definitions.push({
          name,
          label: `${server.id} · ${tool.title || tool.name}`,
          description: tool.description || `MCP 工具 ${server.id}/${tool.name}`,
          parameters: tool.inputSchema ?? { type: 'object', properties: {} },
          execute: async (_toolCallId, params, signal) => {
            if (signal?.aborted) throw new Error('MCP 工具调用已停止')
            const current = connections.get(server.id)
            if (current?.status !== 'connected') throw new Error(`MCP 服务 ${server.id} 已断开`)
            const result = await current.client.callTool({ name: tool.name, arguments: params }, signal ? { signal } : undefined)
            const text = mcpResultToText(result)
            if (result.isError) throw new Error(text)
            return { content: [{ type: 'text', text }] }
          },
        })
      }
    }
    return { tools: definitions, statuses }
  }

  async function stopAll() {
    await Promise.all([...connections.keys()].map(disconnect))
  }

  return { listServers, saveServer, removeServer, getCustomTools, disconnect, stopAll }
}
