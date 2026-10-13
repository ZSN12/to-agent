import path from 'node:path'
import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import { createJsonStore } from './json-store.mjs'
import { formatKeychainRef, isKeychainRef, parseKeychainRef } from './secret-store.mjs'
import { canStartGitHubBrowserLogin, isGitHubMcpOAuthConfigured } from './github-mcp-oauth-app.mjs'
import {
  hasGitHubCliAuth,
  hasGitHubTokenInEnv,
  readGitHubCliToken,
  readGitHubTokenFromEnv,
} from './github-mcp-auth-bridge.mjs'

const SERVER_ID = /^[a-z][a-z0-9_-]{0,39}$/
const ENC_PREFIX = 'enc:aes256:'
const RUNTIME_PATCH_BASENAME = 'taskweaver-mcp.cordis.patch.yml'

function validateServer(value) {
  if (!value || typeof value !== 'object' || !SERVER_ID.test(value.id ?? '')) throw new Error('MCP 服务 ID 无效')
  const transport = value.transport === 'http' ? 'http' : 'stdio'
  if (transport === 'stdio' && (typeof value.command !== 'string' || !value.command.trim())) throw new Error('MCP 启动命令不能为空')
  if (transport === 'http') {
    let url
    try { url = new URL(value.url) } catch { throw new Error('远程 MCP 地址无效') }
    if (value.id !== 'github' || url.protocol !== 'https:' || url.hostname !== 'api.githubcopilot.com' || url.pathname !== '/mcp/') {
      throw new Error('当前仅允许连接 GitHub 官方 MCP 地址')
    }
    if (!value.needsCredential && !value.env?.GITHUB_PERSONAL_ACCESS_TOKEN?.trim()) {
      throw new Error('请先通过浏览器登录 GitHub 或配置 Personal Access Token')
    }
  }
  const args = value.args ?? []
  if (!Array.isArray(args) || !args.every(arg => typeof arg === 'string')) throw new Error('MCP 参数必须是字符串数组')
  if (value.env && (typeof value.env !== 'object' || Array.isArray(value.env)
    || !Object.entries(value.env).every(([key, item]) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(key) && typeof item === 'string'))) {
    throw new Error('MCP 环境变量配置无效')
  }
  return {
    id: value.id,
    transport,
    ...(transport === 'http' ? { url: value.url } : { command: value.command.trim() }),
    args,
    env: value.env ?? {},
    enabled: value.enabled === true,
    authMethod: value.authMethod === 'oauth' ? 'oauth' : value.authMethod === 'pat' ? 'pat' : undefined,
    version: typeof value.version === 'string' ? value.version : undefined,
    pinned: typeof value.pinned === 'boolean' ? value.pinned : undefined,
    installedAt: typeof value.installedAt === 'string' ? value.installedAt : undefined,
    marketplaceId: typeof value.marketplaceId === 'string' ? value.marketplaceId : undefined,
    needsCredential: value.needsCredential === true,
  }
}

function exposedServer(server, { status = 'disconnected', toolCount = 0, error = null } = {}) {
  return {
    id: server.id,
    transport: server.transport,
    ...(server.url ? { url: server.url } : { command: server.command }),
    args: server.args,
    envKeys: Object.keys(server.env),
    enabled: server.enabled,
    status,
    toolCount,
    error: server.needsCredential ? 'MCP 凭据不可用，请重新保存该服务器的凭据。' : error,
    authMethod: server.authMethod ?? null,
    version: server.version ?? null,
    pinned: server.pinned ?? false,
    installedAt: server.installedAt ?? null,
    marketplaceId: server.marketplaceId ?? null,
  }
}

function assertMcpKeychainRef(value, serverId, key) {
  const account = parseKeychainRef(value)
  const stableAccount = `mcp:${serverId}:${key}`
  const versionedPrefix = `mcp:v1:${serverId}:${key}:`
  if (account !== stableAccount && !account.startsWith(versionedPrefix)) {
    throw new Error(`MCP 环境变量 ${key} 的 Keychain 引用与服务器不匹配。`)
  }
  return account
}

async function encryptEnv(env, safeStorage, secrets, serverId, createdAccounts = []) {
  if (!env || typeof env !== 'object') return {}
  const result = {}
  for (const [key, value] of Object.entries(env)) {
    if (typeof value !== 'string') continue
    if (value.startsWith(ENC_PREFIX)) result[key] = value
    else if (isKeychainRef(value)) {
      assertMcpKeychainRef(value, serverId, key)
      result[key] = value
    }
    else if (value.trim()) {
      if (secrets) {
        const account = `mcp:v1:${serverId}:${key}:${crypto.randomUUID()}`
        await secrets.set(account, value)
        createdAccounts.push(account)
        result[key] = formatKeychainRef(account)
      } else {
        if (!safeStorage?.isEncryptionAvailable?.()) throw new Error('系统安全存储不可用，已拒绝保存 MCP 凭据。')
        try { result[key] = `${ENC_PREFIX}${safeStorage.encryptString(value).toString('base64')}` }
        catch { throw new Error('系统安全存储加密 MCP 凭据失败，已拒绝保存。') }
      }
    } else result[key] = ''
  }
  return result
}

async function decryptEnv(env, safeStorage, secrets, serverId) {
  if (!env || typeof env !== 'object') return {}
  const result = {}
  for (const [key, value] of Object.entries(env)) {
    if (typeof value !== 'string') continue
    if (isKeychainRef(value)) {
      const account = assertMcpKeychainRef(value, serverId, key)
      if (!secrets) throw new Error(`MCP 凭据 ${key} 使用 Keychain，但当前平台没有安全存储服务。`)
      const secret = await secrets.get(account)
      if (typeof secret !== 'string') {
        const error = new Error(`MCP 凭据 ${key} 在 Keychain 中不存在。`)
        error.code = 'MCP_CREDENTIAL_MISSING'
        throw error
      }
      result[key] = secret
    } else if (!value.startsWith(ENC_PREFIX)) result[key] = value
    else if (safeStorage?.isEncryptionAvailable?.()) {
      try { result[key] = safeStorage.decryptString(Buffer.from(value.slice(ENC_PREFIX.length), 'base64')) }
      catch {
        const error = new Error(`MCP 凭据 ${key} 无法解密，请重新保存。`)
        error.code = 'MCP_CREDENTIAL_UNREADABLE'
        throw error
      }
    } else {
      const error = new Error(`MCP 凭据 ${key} 需要系统安全存储，请重新保存。`)
      error.code = 'MCP_CREDENTIAL_UNREADABLE'
      throw error
    }
  }
  return result
}

/** Describes whether MCP tools are mounted in the single Z Host runtime. */
export function getMcpDshRuntimeBinding() {
  return {
    dshWired: true,
    executionNote: 'MCP 工具由 Z Host 统一连接并提供给主对话及启用工具的子任务。变更服务器配置后需重载 Z Host。',
  }
}

const yamlString = value => JSON.stringify(String(value))

function runtimeServerName(id) {
  if (id.length <= 32) return id
  const suffix = crypto.createHash('sha256').update(id).digest('hex').slice(0, 8)
  return `${id.slice(0, 23)}_${suffix}`
}

function runtimeEnvName(serverId, key) {
  const suffix = crypto.createHash('sha256').update(`${serverId}:${key}`).digest('hex').slice(0, 10).toUpperCase()
  return `TASKWEAVER_MCP_${suffix}_SECRET`
}

function yamlProcessEnv(bindings) {
  const entries = Object.entries(bindings)
  if (!entries.length) return '        processEnv: {}'
  const lines = ['        processEnv:']
  for (const [childKey, hostVar] of entries) {
    lines.push(`          ${yamlString(childKey)}: ${yamlString(hostVar)}`)
  }
  return lines.join('\n')
}

/** Stores MCP configuration; Z Host owns every server connection and tool call. */
export function createMcpService({
  userData,
  safeStorage,
  secrets = null,
  getHostTools,
  isOAuthConfigured = isGitHubMcpOAuthConfigured,
  localGitHubAuth = {},
} = {}) {
  const store = createJsonStore(path.join(userData, 'taskweaver-mcp.json'), { servers: [] })
  const runtimePatchPath = path.join(userData, RUNTIME_PATCH_BASENAME)
  let githubOAuthAbort = null
  const githubAuth = {
    hasCliAuth: localGitHubAuth.hasCliAuth ?? hasGitHubCliAuth,
    hasEnvToken: localGitHubAuth.hasEnvToken ?? hasGitHubTokenInEnv,
    readCliToken: localGitHubAuth.readCliToken ?? readGitHubCliToken,
    readEnvToken: localGitHubAuth.readEnvToken ?? readGitHubTokenFromEnv,
  }

  async function configured() {
    const value = await store.read()
    if (!Array.isArray(value?.servers)) throw new Error('MCP 配置格式无效')
    const servers = value.servers.map(validateServer)
    const needsMigration = servers.some(server => Object.values(server.env).some(value =>
      typeof value === 'string' && value && !value.startsWith(ENC_PREFIX) && !isKeychainRef(value)))
    let shouldWrite = false
    if (needsMigration) {
      const createdAccounts = []
      try {
        if (secrets || safeStorage?.isEncryptionAvailable?.()) {
          for (const server of servers) server.env = await encryptEnv(server.env, safeStorage, secrets, server.id, createdAccounts)
          for (const server of servers) server.needsCredential = false
        } else {
          for (const server of servers) {
            for (const [key, value] of Object.entries(server.env)) {
              if (typeof value === 'string' && value && !value.startsWith(ENC_PREFIX)) delete server.env[key]
            }
            server.needsCredential = true
          }
          console.warn('[TaskWeaver-MCP] 已清除无法安全迁移的历史明文凭据。')
        }
        await store.write({ servers })
      } catch (error) {
        if (secrets) await Promise.all(createdAccounts.map(account => secrets.delete(account).catch(() => {})))
        throw error
      }
      shouldWrite = false
    }

    for (const server of servers) {
      const hasCredential = Object.values(server.env).some(value => typeof value === 'string' && value.trim())
      if (server.needsCredential && !hasCredential) continue
      try {
        await decryptEnv(server.env, safeStorage, secrets, server.id)
        if (server.needsCredential) {
          server.needsCredential = false
          shouldWrite = true
        }
      } catch {
        server.needsCredential = true
        shouldWrite = true
      }
    }
    if (shouldWrite) await store.write({ servers })
    return servers
  }

  async function listServers({ refresh = false } = {}) {
    const servers = await configured()
    const tools = getHostTools ? await getHostTools({ startHost: refresh }) : null
    return servers.map(server => {
      const toolCount = tools?.filter(tool => tool.name.startsWith(`mcp__${runtimeServerName(server.id)}__`)).length ?? 0
      // MCP clients connect in the background. An empty Host tool directory can mean
      // startup is still in progress, so it is not enough evidence to report a failure.
      const status = server.needsCredential
        ? 'error'
        : !server.enabled || tools === null
          ? 'disconnected'
          : toolCount > 0
            ? 'connected'
            : 'connecting'
      const error = server.needsCredential
        ? 'MCP 凭据不可用，请重新保存该服务器的凭据。'
        : status === 'error' ? 'Z Host 中未发现该 MCP 服务的工具，请检查服务配置与授权。' : null
      return exposedServer(server, { status, toolCount, error })
    })
  }

  async function testConnection(id) {
    if (!SERVER_ID.test(id ?? '')) throw new Error('MCP 服务 ID 无效')
    const server = (await configured()).find(item => item.id === id)
    if (!server) throw new Error(`未找到 MCP 配置：${id}`)
    if (server.needsCredential) {
      return exposedServer(server, { status: 'error', error: 'MCP 凭据不可用，请重新保存该服务器的凭据。' })
    }
    if (!server.enabled) throw new Error(`MCP 服务 ${id} 当前已停用`)
    try {
      const tools = getHostTools ? await getHostTools({ startHost: true }) : null
      const toolCount = tools?.filter(tool => tool.name.startsWith(`mcp__${runtimeServerName(id)}__`)).length ?? 0
      return exposedServer(server, {
        toolCount,
        status: tools === null ? 'disconnected' : toolCount > 0 ? 'connected' : 'connecting',
        error: null,
      })
    } catch {
      return exposedServer(server, { status: 'error', error: '无法读取 Z Host MCP 工具目录。' })
    }
  }

  async function getGitHubPersonalAccessToken() {
    const server = (await configured()).find(item => item.id === 'github')
    if (!server?.env?.GITHUB_PERSONAL_ACCESS_TOKEN || server.needsCredential) return null
    const token = String((await decryptEnv(server.env, safeStorage, secrets, server.id)).GITHUB_PERSONAL_ACCESS_TOKEN ?? '').trim()
    return token || null
  }

  async function saveServer(input) {
    const server = validateServer(input)
    const servers = await configured()
    const index = servers.findIndex(item => item.id === server.id)
    const previous = index >= 0 ? servers[index] : null
    const createdAccounts = []
    try {
      server.env = await encryptEnv(server.env, safeStorage, secrets, server.id, createdAccounts)
      const hasCredential = Object.values(server.env).some(value => typeof value === 'string' && value.trim())
      if (hasCredential) {
        try {
          await decryptEnv(server.env, safeStorage, secrets, server.id)
          server.needsCredential = false
        } catch {
          server.needsCredential = true
        }
      } else if (!server.needsCredential) {
        server.needsCredential = false
      }
      if (index >= 0) servers[index] = server
      else servers.push(server)
      await store.write({ servers })
    } catch (error) {
      if (secrets) await Promise.all(createdAccounts.map(account => secrets.delete(account).catch(() => {})))
      throw error
    }
    await deleteRemovedMcpSecrets(previous, server, secrets)
    return exposedServer(server)
  }

  async function deleteRemovedMcpSecrets(previous, next, secretPlatform) {
    if (!secretPlatform || !previous) return
    const retained = new Set(Object.values(next?.env ?? {}).filter(isKeychainRef).map(parseKeychainRef))
    const removed = Object.values(previous.env ?? {}).filter(isKeychainRef)
      .map(parseKeychainRef).filter(account => !retained.has(account))
    await Promise.all(removed.map(account => secretPlatform.delete(account).catch(() => {})))
  }

  async function configureGitHub(token) {
    if (typeof token !== 'string') throw new Error('GitHub Token 格式无效')
    const previous = (await configured()).find(server => server.id === 'github')
    const env = { ...(previous?.env ?? {}) }
    if (token.trim()) env.GITHUB_PERSONAL_ACCESS_TOKEN = token.trim()
    if (!env.GITHUB_PERSONAL_ACCESS_TOKEN) throw new Error('请输入 GitHub Personal Access Token')
    return saveServer({
      id: 'github', transport: 'http', url: 'https://api.githubcopilot.com/mcp/',
      args: [], env, enabled: true, authMethod: 'pat',
    })
  }

  async function saveGitHubAccessToken(accessToken, authMethod) {
    return saveServer({
      id: 'github', transport: 'http', url: 'https://api.githubcopilot.com/mcp/',
      args: [], env: { GITHUB_PERSONAL_ACCESS_TOKEN: accessToken }, enabled: true, authMethod,
    })
  }

  async function loginGitHubWithOAuth({ onStatus, openExternal, confirmLocalCredential } = {}) {
    githubOAuthAbort?.abort()
    githubOAuthAbort = new AbortController()
    try {
      if (isOAuthConfigured()) {
        const { runGitHubMcpOAuthLogin } = await import('./github-mcp-oauth.mjs')
        const token = await runGitHubMcpOAuthLogin({ onStatus, openExternal, signal: githubOAuthAbort.signal })
        return { server: await saveGitHubAccessToken(token.accessToken, 'oauth') }
      }
      onStatus?.({ status: 'progress', instructions: '未配置 OAuth 应用，正在检查本机 GitHub 登录方式…' })
      if (await githubAuth.hasCliAuth()) {
        const approved = await confirmLocalCredential?.({ source: 'gh-cli' })
        if (approved !== true) return { cancelled: true, source: 'gh-cli' }
        const gh = await githubAuth.readCliToken()
        if (gh.ok && gh.token) {
          onStatus?.({ status: 'progress', instructions: '已确认使用 GitHub CLI 凭据，正在启用 GitHub MCP…' })
          return { server: await saveGitHubAccessToken(gh.token, 'pat') }
        }
      }
      if (githubAuth.hasEnvToken()) {
        const approved = await confirmLocalCredential?.({ source: 'environment' })
        if (approved !== true) return { cancelled: true, source: 'environment' }
        const envToken = githubAuth.readEnvToken()
        if (envToken) {
          onStatus?.({ status: 'progress', instructions: '已确认使用环境变量凭据，正在启用 GitHub MCP…' })
          return { server: await saveGitHubAccessToken(envToken, 'pat') }
        }
      }
      throw new Error('无法自动登录：请先运行 gh auth login，或设置 OAuth Client ID，也可在高级设置中粘贴 Personal Access Token。')
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
      configured: isOAuthConfigured(),
      canLogin: canStartGitHubBrowserLogin(),
      hints: { oauthApp: isOAuthConfigured(), ghCli: 'confirm_before_use', envToken: githubAuth.hasEnvToken() },
    }
  }

  async function removeServer(id) {
    if (!SERVER_ID.test(id ?? '')) throw new Error('MCP 服务 ID 无效')
    const servers = await configured()
    const removed = servers.find(server => server.id === id)
    await store.write({ servers: servers.filter(server => server.id !== id) })
    if (removed && secrets) {
      await Promise.all(Object.values(removed.env).filter(isKeychainRef)
        .map(parseKeychainRef).map(account => secrets.delete(account).catch(() => {})))
    }
    return true
  }

  async function setEnabled(id, enabled) {
    if (!SERVER_ID.test(id ?? '')) throw new Error('MCP 服务 ID 无效')
    const server = (await configured()).find(item => item.id === id)
    if (!server) throw new Error(`未找到 MCP 配置：${id}`)
    return saveServer({ ...server, enabled: enabled === true })
  }

  async function disconnect(id) {
    await setEnabled(id, false)
    return true
  }

  async function prepareRuntimeIntegration() {
    const environment = {}
    const patches = []
    for (const server of await configured()) {
      if (!server.enabled) continue
      if (server.needsCredential) continue
      const envRefs = new Map()
      for (const [key, value] of Object.entries(await decryptEnv(server.env, safeStorage, secrets, server.id))) {
        const name = runtimeEnvName(server.id, key)
        environment[name] = value
        envRefs.set(key, name)
      }
      const row = [
        `    - id: ${yamlString(`taskweaver-mcp-${server.id}`)}`,
        `      name: ${yamlString('@taskweaver/dsh-mcp-client')}`,
        '      config:',
        `        serverName: ${yamlString(runtimeServerName(server.id))}`,
      ]
      if (server.transport === 'http') {
        const tokenKey = 'GITHUB_PERSONAL_ACCESS_TOKEN'
        const tokenName = envRefs.get(tokenKey)
        if (!tokenName || !environment[tokenName]) continue
        row.push(
          '        transport: streamable-http',
          `        url: ${yamlString(server.url)}`,
          `        bearerTokenEnvVar: ${yamlString(tokenName)}`,
        )
      } else {
        row.push(
          '        transport: stdio',
          `        command: ${yamlString(server.command)}`,
          `        args: ${JSON.stringify(server.args)}`,
          yamlProcessEnv(Object.fromEntries(envRefs)),
        )
      }
      row.push('        failOnStartupError: false', '        startupWaitMs: 0', '        toolCallTimeoutMs: 60000')
      patches.push(...row)
    }
    const content = patches.length ? `- insert:\n${patches.join('\n')}\n` : '[]\n'
    const tempPath = `${runtimePatchPath}.${process.pid}.${crypto.randomUUID()}.tmp`
    await fs.writeFile(tempPath, content, { mode: 0o600 })
    await fs.rename(tempPath, runtimePatchPath)
    return {
      patchPath: patches.length ? runtimePatchPath : undefined,
      environment,
    }
  }

  async function installFromCatalog(config) { return saveServer(config) }

  return {
    listServers, saveServer, removeServer, setEnabled, disconnect, prepareRuntimeIntegration,
    testConnection, configureGitHub, getGitHubPersonalAccessToken, loginGitHubWithOAuth,
    cancelGitHubOAuth, getGitHubOAuthAvailability, installFromCatalog,
    getDshRuntimeBinding: getMcpDshRuntimeBinding,
  }
}
