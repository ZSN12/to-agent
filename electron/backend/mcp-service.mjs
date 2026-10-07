import path from 'node:path'
import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/client/stdio'
import { createJsonStore } from './json-store.mjs'
import { canStartGitHubBrowserLogin, isGitHubMcpOAuthConfigured } from './github-mcp-oauth-app.mjs'
import { probeGitHubCliAuth, readGitHubTokenFromEnv } from './github-mcp-auth-bridge.mjs'

const SERVER_ID = /^[a-z][a-z0-9_-]{0,39}$/
const TOOL_NAME = /^[A-Za-z0-9_-]{1,80}$/

function validateServer(value) {
  if (!value || typeof value !== 'object' || !SERVER_ID.test(value.id ?? '')) throw new Error('MCP 服务 ID 无效')
  const transport = value.transport === 'http' ? 'http' : 'stdio'
  if (transport === 'stdio' && (typeof value.command !== 'string' || !value.command.trim())) throw new Error('MCP 启动命令不能为空')
  if (transport === 'http') {
    let url
    try {
      url = new URL(value.url)
    } catch {
      throw new Error('远程 MCP 地址无效')
    }
    if (value.id !== 'github' || url.protocol !== 'https:' || url.hostname !== 'api.githubcopilot.com' || url.pathname !== '/mcp/') {
      throw new Error('当前仅允许连接 GitHub 官方 MCP 地址')
    }
    if (!value.env?.GITHUB_PERSONAL_ACCESS_TOKEN?.trim()) {
      throw new Error('请先通过浏览器登录 GitHub 或配置 Personal Access Token')
    }
  }
  const args = value.args ?? []
  if (!Array.isArray(args) || !args.every((arg) => typeof arg === 'string')) throw new Error('MCP 参数必须是字符串数组')
  if (value.env && (typeof value.env !== 'object' || Array.isArray(value.env) || !Object.entries(value.env).every(([key, item]) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(key) && typeof item === 'string'))) {
    throw new Error('MCP 环境变量配置无效')
  }
  return {
    id: value.id,
    transport,
    ...(transport === 'http' ? { url: value.url } : { command: value.command.trim() }),
    args,
    env: value.env ?? {},
    enabled: value.enabled === true,
    authMethod: value.authMethod === 'oauth' ? 'oauth' : (value.authMethod === 'pat' ? 'pat' : undefined),
  }
}

function exposedServer(server, state) {
  return {
    id: server.id,
    transport: server.transport,
    ...(server.url ? { url: server.url } : { command: server.command }),
    args: server.args,
    envKeys: Object.keys(server.env),
    enabled: server.enabled,
    status: state?.status ?? 'disconnected',
    toolCount: state?.tools?.length ?? 0,
    error: state?.error ?? null,
    authMethod: server.authMethod ?? null,
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
    } else if (value.trim()) {
      if (!safeStorage?.isEncryptionAvailable?.()) {
        throw new Error('系统安全存储 (safeStorage) 不可用。为防止敏感环境变量凭据明文泄露，已拒绝保存 MCP 服务配置。')
      }
      try {
        const encrypted = safeStorage.encryptString(value).toString('base64')
        result[key] = `${ENC_PREFIX}${encrypted}`
      } catch {
        throw new Error('系统安全存储加密敏感环境变量凭据失败。为防止明文泄露，已拒绝保存 MCP 服务配置。')
      }
    } else {
      result[key] = ''
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

/** Describes whether TaskWeaver MCP configs are injected into the DSH Host Cordis runtime. */
export function getMcpDshRuntimeBinding() {
  return {
    dshWired: true,
    executionNote: 'MCP 工具已通过 Z Runtime 原生工具目录提供给主对话及启用工具的子任务。变更服务器配置后需重启 Z Host；服务器进程仍按其配置在本机运行。',
  }
}

function yamlString(value) {
  return JSON.stringify(String(value))
}

function runtimeServerName(id) {
  if (id.length <= 32) return id
  const suffix = crypto.createHash('sha256').update(id).digest('hex').slice(0, 8)
  return `${id.slice(0, 23)}_${suffix}`
}

function runtimeEnvName(serverId, key) {
  const suffix = crypto.createHash('sha256').update(`${serverId}:${key}`).digest('hex').slice(0, 10).toUpperCase()
  return `TASKWEAVER_MCP_${suffix}`
}

/** TaskWeaver-owned, opt-in MCP bridge for local stdio and the GitHub remote HTTP server. */
export function createMcpService({ userData, connectClient, safeStorage } = {}) {
  const store = createJsonStore(path.join(userData, 'taskweaver-mcp.json'), { servers: [] })
  const runtimePatchPath = path.join(userData, 'dsh', 'taskweaver-mcp.cordis.patch.yml')
  const connections = new Map()
  /** @type {AbortController | null} */
  let githubOAuthAbort = null

  async function configured() {
    const value = await store.read()
    if (!Array.isArray(value?.servers)) throw new Error('MCP 配置格式无效')
    const servers = value.servers.map(validateServer)

    // 检测历史明文配置并自动迁移为加密存储
    let needsMigration = false
    for (const server of servers) {
      for (const val of Object.values(server.env || {})) {
        if (typeof val === 'string' && val && !val.startsWith(ENC_PREFIX)) {
          needsMigration = true
          break
        }
      }
      if (needsMigration) break
    }

    if (needsMigration) {
      if (safeStorage?.isEncryptionAvailable?.()) {
        for (const server of servers) {
          server.env = encryptEnv(server.env, safeStorage)
        }
        await store.write({ servers })
      } else {
        // 如果 safeStorage 不可用，磁盘历史明文绝不能继续留存
        for (const server of servers) {
          for (const [k, v] of Object.entries(server.env || {})) {
            if (typeof v === 'string' && v && !v.startsWith(ENC_PREFIX)) {
              delete server.env[k]
            }
          }
        }
        await store.write({ servers })
        console.warn('[TaskWeaver-MCP] 检测到历史未加密的环境变量配置且当前系统 safeStorage 不可用，已安全清除磁盘上的明文凭据以防泄露。请在启用系统安全密钥环后重新配置。')
      }
    }

    return servers
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
          const transport = server.transport === 'http'
            ? new StreamableHTTPClientTransport(new URL(server.url), {
              authProvider: { token: async () => decryptedEnv.GITHUB_PERSONAL_ACCESS_TOKEN },
              onInsufficientScope: 'throw',
            })
            : new StdioClientTransport({
              command: server.command,
              args: server.args,
              env: { ...getDefaultEnvironment(), ...decryptedEnv },
              stderr: 'ignore',
            })
          await client.connect(transport, { timeout: 10_000 })
        }
        const listing = await client.listTools()
        if (listing?.error || !Array.isArray(listing?.tools)) throw new Error('invalid MCP tool listing')
        state.client = client
        state.tools = (listing.tools ?? []).filter((tool) => TOOL_NAME.test(tool.name ?? ''))
        state.status = 'connected'
        return state
      } catch (error) {
        await client?.close().catch(() => {})
        state.status = 'error'
        // Transport/provider errors can echo headers, environment values or URLs.
        // Never publish raw errors across the renderer boundary.
        state.error = 'MCP 连接或工具发现失败，请检查服务配置与授权。'
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

  async function testConnection(id) {
    if (!SERVER_ID.test(id ?? '')) throw new Error('MCP 服务 ID 无效')
    const server = (await configured()).find((item) => item.id === id)
    if (!server) throw new Error(`未找到 MCP 配置：${id}`)
    if (!server.enabled) throw new Error(`MCP 服务 ${id} 当前已停用`)
    const state = await connect(server)
    return exposedServer(server, state)
  }

  async function configureGitHub(token) {
    if (typeof token !== 'string') throw new Error('GitHub Token 格式无效')
    const previous = (await configured()).find((server) => server.id === 'github')
    const env = { ...(previous?.env ?? {}) }
    if (token.trim()) env.GITHUB_PERSONAL_ACCESS_TOKEN = token.trim()
    if (!env.GITHUB_PERSONAL_ACCESS_TOKEN) throw new Error('请输入 GitHub Personal Access Token')
    return saveServer({
      id: 'github',
      transport: 'http',
      url: 'https://api.githubcopilot.com/mcp/',
      args: [],
      env,
      enabled: true,
      authMethod: 'pat',
    })
  }

  async function saveGitHubAccessToken(accessToken, authMethod) {
    const saved = await saveServer({
      id: 'github',
      transport: 'http',
      url: 'https://api.githubcopilot.com/mcp/',
      args: [],
      env: { GITHUB_PERSONAL_ACCESS_TOKEN: accessToken },
      enabled: true,
      authMethod,
    })
    const tested = await testConnection('github')
    return { server: saved, connection: tested }
  }

  async function loginGitHubWithOAuth({ onStatus, openExternal } = {}) {
    if (githubOAuthAbort) githubOAuthAbort.abort()
    githubOAuthAbort = new AbortController()
    try {
      if (isGitHubMcpOAuthConfigured()) {
        const { runGitHubMcpOAuthLogin } = await import('./github-mcp-oauth.mjs')
        const token = await runGitHubMcpOAuthLogin({
          onStatus,
          openExternal,
          signal: githubOAuthAbort.signal,
        })
        return saveGitHubAccessToken(token.accessToken, 'oauth')
      }

      onStatus?.({ status: 'progress', instructions: '未配置 OAuth 应用，正在尝试 GitHub CLI (gh) 登录态…' })
      const gh = await probeGitHubCliAuth()
      if (gh.ok && gh.token) {
        onStatus?.({ status: 'progress', instructions: '已使用 gh 凭据连接 GitHub MCP…' })
        return saveGitHubAccessToken(gh.token, 'pat')
      }

      const envToken = readGitHubTokenFromEnv()
      if (envToken) {
        onStatus?.({ status: 'progress', instructions: '已使用环境变量 GH_TOKEN / GITHUB_TOKEN 连接…' })
        return saveGitHubAccessToken(envToken, 'pat')
      }

      throw new Error(
        '无法自动登录：请在本机终端运行 gh auth login 后重试，'
        + '或设置 TASKWEAVER_GITHUB_OAUTH_CLIENT_ID 以使用浏览器 OAuth（见 docs/GITHUB_MCP_OAUTH.md），'
        + '或在「高级」中粘贴 Personal Access Token。',
      )
    } finally {
      githubOAuthAbort = null
    }
  }

  function cancelGitHubOAuth() {
    githubOAuthAbort?.abort()
    githubOAuthAbort = null
    return true
  }

  function getGitHubOAuthAvailability() {
    return {
      configured: isGitHubMcpOAuthConfigured(),
      canLogin: canStartGitHubBrowserLogin(),
      hints: {
        oauthApp: isGitHubMcpOAuthConfigured(),
        ghCli: 'try_on_login',
        envToken: Boolean(readGitHubTokenFromEnv()),
      },
    }
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

  async function setEnabled(id, enabled) {
    if (!SERVER_ID.test(id ?? '')) throw new Error('MCP 服务 ID 无效')
    const server = (await configured()).find((item) => item.id === id)
    if (!server) throw new Error(`未找到 MCP 配置：${id}`)
    return saveServer({ ...server, enabled: enabled === true })
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
        const name = `mcp__${server.id}__${tool.name}`
        const legacyName = `mcp_${server.id}_${tool.name}`
        const execute = async (_toolCallId, params, signal) => {
          if (signal?.aborted) throw new Error('MCP 工具调用已停止')
          const current = connections.get(server.id)
          if (current?.status !== 'connected') throw new Error(`MCP 服务 ${server.id} 已断开`)
          let result
          try {
            result = await current.client.callTool({ name: tool.name, arguments: params }, signal ? { signal } : undefined)
          } catch {
            throw new Error('MCP 工具调用失败，请检查服务状态与授权。')
          }
          if (result?.isError || result?.error) throw new Error('MCP 服务返回工具错误。')
          const text = mcpResultToText(result)
          return { content: [{ type: 'text', text }] }
        }
        const def = {
          name,
          label: `${server.id} · ${tool.title || tool.name}`,
          description: tool.description || `MCP 工具 ${server.id}/${tool.name}`,
          parameters: tool.inputSchema ?? { type: 'object', properties: {} },
          execute,
        }
        definitions.push(def)
        if (legacyName !== name) {
          definitions.push({ ...def, name: legacyName })
        }
      }
    }
    return { tools: definitions, statuses }
  }

  async function prepareRuntimeIntegration() {
    const environment = {}
    const patches = []
    for (const server of await configured()) {
      if (!server.enabled) continue
      const envRefs = {}
      for (const [key, storedValue] of Object.entries(server.env ?? {})) {
        const value = decryptEnv({ [key]: storedValue }, safeStorage)[key] ?? ''
        if (!value) {
          envRefs[key] = ''
          continue
        }
        const envName = runtimeEnvName(server.id, key)
        environment[envName] = value
        envRefs[key] = `!!js process.env.${envName}`
      }

      const serverName = runtimeServerName(server.id)
      const row = [
        `    - id: ${yamlString(`taskweaver-mcp-${server.id}`)}`,
        `      name: ${yamlString('@z/dsh-mcp-client')}`,
        '      config:',
        `        serverName: ${yamlString(serverName)}`,
      ]
      if (server.transport === 'http') {
        const tokenKey = 'GITHUB_PERSONAL_ACCESS_TOKEN'
        if (!decryptEnv({ [tokenKey]: server.env?.[tokenKey] ?? '' }, safeStorage)[tokenKey]) continue
        const tokenEnvName = runtimeEnvName(server.id, tokenKey)
        const headerExpression = `\`Bearer \${process.env.${tokenEnvName}}\``
        row.push(
          '        transport: streamable-http',
          `        url: ${yamlString(server.url)}`,
          '        headers:',
          `          Authorization: !!js ${yamlString(headerExpression)}`,
        )
      } else {
        row.push(
          '        transport: stdio',
          `        command: ${yamlString(server.command)}`,
          `        args: ${JSON.stringify(server.args)}`,
        )
        const entries = Object.entries(envRefs)
        if (!entries.length) {
          row.push('        env: {}')
        } else {
          row.push('        env:')
          for (const [key, ref] of entries) {
            row.push(`          ${key}: ${ref.startsWith('!!js ') ? ref : yamlString(ref)}`)
          }
        }
        row.push('        cwd: !!js process.cwd()')
      }
      row.push('        failOnStartupError: false', '        toolCallTimeoutMs: 60000')
      patches.push(...row)
    }

    const content = patches.length ? `- insert:\n${patches.join('\n')}\n` : '[]\n'
    await fs.mkdir(path.dirname(runtimePatchPath), { recursive: true })
    const tempPath = `${runtimePatchPath}.${process.pid}.${crypto.randomUUID()}.tmp`
    await fs.writeFile(tempPath, content, { mode: 0o600 })
    await fs.rename(tempPath, runtimePatchPath)
    return { patchPath: runtimePatchPath, environment }
  }

  async function stopAll() {
    await Promise.all([...connections.keys()].map(disconnect))
  }

  async function installFromCatalog(config) {
    return saveServer(config)
  }

  return {
    listServers,
    saveServer,
    removeServer,
    setEnabled,
    getCustomTools,
    prepareRuntimeIntegration,
    testConnection,
    configureGitHub,
    loginGitHubWithOAuth,
    cancelGitHubOAuth,
    getGitHubOAuthAvailability,
    disconnect,
    stopAll,
    installFromCatalog,
    getDshRuntimeBinding: getMcpDshRuntimeBinding,
  }
}
