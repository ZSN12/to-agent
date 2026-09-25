const { app, safeStorage } = require('electron')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')

const userData = path.join(os.homedir(), 'Library', 'Application Support', 'taskweaver-desktop')
const credentialsPath = path.join(userData, 'taskweaver', 'credentials.enc')

async function pruneJsonStore(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    const json = JSON.parse(raw)
    if (!json['kimi-coding']) return false
    delete json['kimi-coding']
    await fs.writeFile(filePath, `${JSON.stringify(json, null, 2)}\n`, 'utf8')
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

app.whenReady().then(async () => {
  try {
    const encrypted = await fs.readFile(credentialsPath, 'utf8')
    const all = JSON.parse(safeStorage.decryptString(Buffer.from(encrypted.trim(), 'base64')))
    if (all['kimi-coding']) {
      delete all['kimi-coding']
      const next = safeStorage.encryptString(JSON.stringify(all)).toString('base64')
      await fs.writeFile(credentialsPath, `${next}\n`, { mode: 0o600 })
      console.log('已删除 credentials.enc 中的 kimi-coding 凭据')
    } else {
      console.log('credentials.enc 中无 kimi-coding')
    }
  } catch (error) {
    console.warn('credentials.enc:', error.message)
  }

  for (const rel of ['taskweaver/models-store.json', 'pi-runtime/models-store.json']) {
    const full = path.join(userData, rel)
    if (await pruneJsonStore(full)) console.log(`已从 ${rel} 移除 kimi-coding`)
  }

  app.exit(0)
})
