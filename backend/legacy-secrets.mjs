import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import path from 'node:path'

const CUTOVER_MARKER_FILE = 'taskweaver-p19-cutover.json'

function readDismissedState(userDataPath) {
  const markerPath = path.join(userDataPath, CUTOVER_MARKER_FILE)
  try {
    const saved = JSON.parse(fs.readFileSync(markerPath, 'utf8'))
    return saved && typeof saved === 'object' ? saved : null
  } catch {
    return null
  }
}

function hasChromiumEncryptedCredential(userDataPath) {
  const credentialPath = path.join(userDataPath, 'credentials.enc')
  try {
    const encoded = fs.readFileSync(credentialPath, 'utf8').trim()
    const bytes = Buffer.from(encoded, 'base64')
    return bytes.length >= 3 && bytes[0] === 0x76 && bytes[1] === 0x31 && bytes[2] === 0x30
  } catch {
    return false
  }
}

/**
 * Read-only scan of credentials that need to be re-entered in the native app.
 * Legacy tw-b64 credentials are deliberately left untouched so credential-store
 * can migrate them into Keychain when it first reads the store.
 *
 * @param {string} userDataPath
 * @returns {Promise<{ items: Array<{ kind: 'model' | 'mcp' | 'websearch', label: string }>, dismissed: boolean }>}
 */
export async function inspectFirstRunSecrets(userDataPath) {
  const saved = readDismissedState(userDataPath)
  const items = []

  if (hasChromiumEncryptedCredential(userDataPath)) {
    items.push({
      kind: 'model',
      label: '旧版模型凭据无法迁移，请在「模型与来源」重新保存密钥',
    })
  }

  const modelsPath = path.join(userDataPath, 'models.json')
  if (fs.existsSync(modelsPath)) {
    try {
      const modelsData = JSON.parse(fs.readFileSync(modelsPath, 'utf8'))
      const providers = modelsData.providers || {}
      for (const [providerId, config] of Object.entries(providers)) {
        if (!config || typeof config !== 'object') continue
        const authType = config.authType || config.auth
        if (authType !== 'oauth' && providerId !== 'ollama' && providerId !== 'lmstudio') {
          items.push({
            kind: 'model',
            label: `模型服务: ${config.name || providerId}`,
          })
        }
      }
    } catch (error) {
      console.error('[LegacySecrets] failed to parse models.json:', error)
    }
  }

  const mcpPath = path.join(userDataPath, 'taskweaver-mcp.json')
  if (fs.existsSync(mcpPath)) {
    try {
      const mcpData = JSON.parse(fs.readFileSync(mcpPath, 'utf8'))
      const servers = Array.isArray(mcpData.servers)
        ? mcpData.servers
        : Object.entries(mcpData.servers || {}).map(([id, server]) => ({ id, ...server }))
      for (const server of servers) {
        if (!server || typeof server !== 'object' || !server.env || typeof server.env !== 'object') continue
        const serverName = server.name || server.id || '未知服务'
        for (const [envKey, envVal] of Object.entries(server.env)) {
          if (typeof envVal === 'string' && envVal.startsWith('enc:')) {
            items.push({
              kind: 'mcp',
              label: `MCP 服务 [${serverName}] 环境变量 ${envKey}`,
            })
          }
        }
      }
    } catch (error) {
      console.error('[LegacySecrets] failed to parse taskweaver-mcp.json:', error)
    }
  }

  const searchPath = path.join(userDataPath, 'taskweaver-web-search.json')
  if (fs.existsSync(searchPath)) {
    try {
      const searchData = JSON.parse(fs.readFileSync(searchPath, 'utf8'))
      if (typeof searchData.apiKey === 'string' && searchData.apiKey.length > 0) {
        items.push({
          kind: 'websearch',
          label: '网页搜索 (Tavily / Google / Bing) API Key',
        })
      }
    } catch (error) {
      console.error('[LegacySecrets] failed to parse taskweaver-web-search.json:', error)
    }
  }

  return {
    items: saved?.dismissed && Array.isArray(saved.items) ? saved.items : items,
    dismissed: saved?.dismissed === true,
  }
}

/**
 * Mark the first run notice as dismissed by the user.
 * This is the only operation in this module that writes to disk.
 * @param {string} userDataPath
 */
export async function dismissFirstRunNotice(userDataPath) {
  const markerPath = path.join(userDataPath, CUTOVER_MARKER_FILE)
  const current = readDismissedState(userDataPath)
  const items = current && Array.isArray(current.items)
    ? current.items
    : (await inspectFirstRunSecrets(userDataPath)).items
  await fsWriteMarker(markerPath, {
    migratedAt: current?.migratedAt || new Date().toISOString(),
    items,
    dismissed: true,
  })
  return true
}

async function fsWriteMarker(markerPath, record) {
  await fsPromises.mkdir(path.dirname(markerPath), { recursive: true, mode: 0o700 })
  const temporaryPath = `${markerPath}.${process.pid}.tmp`
  try {
    await fsPromises.writeFile(temporaryPath, `${JSON.stringify(record, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
    await fsPromises.rename(temporaryPath, markerPath)
    await fsPromises.chmod(markerPath, 0o600)
  } catch (error) {
    try { await fsPromises.unlink(temporaryPath) } catch {}
    throw error
  }
}
