#!/usr/bin/env node
/**
 * 从 TaskWeaver 本机数据目录移除 kimi-coding 凭据与缓存目录项。
 * 用法: node scripts/purge-kimi-credentials.mjs
 */
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createCredentialStore } from '../backend/credential-store.mjs'

const userData = process.env.TASKWEAVER_USER_DATA
  || path.join(os.homedir(), 'Library', 'Application Support', 'taskweaver-desktop')
const credentialsPath = path.join(userData, 'taskweaver', 'credentials.enc')

process.env.TASKWEAVER_SHELL_SERVER = '1'

async function pruneJsonStore(filePath, providerId) {
  const raw = await fs.readFile(filePath, 'utf8').catch(() => null)
  if (!raw) return
  const data = JSON.parse(raw)
  if (!data || typeof data !== 'object') return
  delete data[providerId]
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
}

const store = createCredentialStore({
  filePath: credentialsPath,
  safeStorage: { isEncryptionAvailable: () => false },
})

await store.delete('kimi-coding').catch(() => {})
await pruneJsonStore(path.join(userData, 'taskweaver-models.json'), 'kimi-coding')
console.log('purge-kimi-credentials: ok')
