import fs from 'node:fs'
import path from 'node:path'

const CUTOVER_MARKER_FILE = 'taskweaver-p19-cutover.json'

/**
 * Scan legacy encrypted secrets on first run of the native Swift backend,
 * archive old safeStorage artifacts, and return items that need user re-entry.
 *
 * @param {string} userDataPath
 * @returns {Promise<{ items: Array<{ kind: 'model' | 'mcp' | 'websearch', label: string }>, dismissed: boolean }>}
 */
export async function inspectFirstRunSecrets(userDataPath) {
  const markerPath = path.join(userDataPath, CUTOVER_MARKER_FILE)
  if (fs.existsSync(markerPath)) {
    try {
      const saved = JSON.parse(fs.readFileSync(markerPath, 'utf8'))
      return { items: saved.items || [], dismissed: Boolean(saved.dismissed) }
    } catch {}
  }

  const items = []

  // 1. Archive legacy credentials.enc
  const credPath = path.join(userDataPath, 'credentials.enc')
  if (fs.existsSync(credPath)) {
    try {
      const backupPath = `${credPath}.electron-legacy`
      if (!fs.existsSync(backupPath)) {
        fs.copyFileSync(credPath, backupPath)
      }
      fs.unlinkSync(credPath)
    } catch (e) {
      console.error('[LegacySecrets] failed to archive credentials.enc:', e)
    }
  }

  // 2. Scan models.json for providers requiring API Keys
  const modelsPath = path.join(userDataPath, 'models.json')
  if (fs.existsSync(modelsPath)) {
    try {
      const modelsData = JSON.parse(fs.readFileSync(modelsPath, 'utf8'))
      const providers = modelsData.providers || {}
      for (const [providerId, config] of Object.entries(providers)) {
        if (config && typeof config === 'object') {
          // If auth requires api key or not marked as oauth
          const authType = config.authType || config.auth
          if (authType !== 'oauth' && providerId !== 'ollama' && providerId !== 'lmstudio') {
            items.push({
              kind: 'model',
              label: `模型服务: ${config.name || providerId}`,
            })
          }
        }
      }
    } catch (e) {
      console.error('[LegacySecrets] failed to parse models.json:', e)
    }
  }

  // 3. Scan MCP configs
  const mcpPath = path.join(userDataPath, 'taskweaver-mcp.json')
  if (fs.existsSync(mcpPath)) {
    try {
      const mcpData = JSON.parse(fs.readFileSync(mcpPath, 'utf8'))
      const servers = mcpData.servers || {}
      for (const [serverName, srv] of Object.entries(servers)) {
        if (srv.env) {
          for (const [envKey, envVal] of Object.entries(srv.env)) {
            if (typeof envVal === 'string' && (envVal.startsWith('enc:') || envVal.startsWith('keychain:'))) {
              items.push({
                kind: 'mcp',
                label: `MCP 服务 [${serverName}] 环境变量 ${envKey}`,
              })
            }
          }
        }
      }
    } catch (e) {}
  }

  // 4. Scan Web Search config
  const searchPath = path.join(userDataPath, 'taskweaver-web-search.json')
  if (fs.existsSync(searchPath)) {
    try {
      const searchData = JSON.parse(fs.readFileSync(searchPath, 'utf8'))
      if (searchData.apiKey && typeof searchData.apiKey === 'string') {
        items.push({
          kind: 'websearch',
          label: '网页搜索 (Tavily / Google / Bing) API Key',
        })
      }
    } catch (e) {}
  }

  const record = {
    migratedAt: new Date().toISOString(),
    items,
    dismissed: false,
  }

  try {
    fs.writeFileSync(markerPath, JSON.stringify(record, null, 2), 'utf8')
  } catch (e) {
    console.error('[LegacySecrets] failed to save marker:', e)
  }

  return { items, dismissed: false }
}

/**
 * Mark the first run notice as dismissed by the user.
 * @param {string} userDataPath
 */
export async function dismissFirstRunNotice(userDataPath) {
  const markerPath = path.join(userDataPath, CUTOVER_MARKER_FILE)
  if (fs.existsSync(markerPath)) {
    try {
      const record = JSON.parse(fs.readFileSync(markerPath, 'utf8'))
      record.dismissed = true
      fs.writeFileSync(markerPath, JSON.stringify(record, null, 2), 'utf8')
      return true
    } catch {}
  }
  return false
}
