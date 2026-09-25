#!/usr/bin/env node
/**
 * 从 TaskWeaver 本机数据目录移除 kimi-coding 凭据与缓存目录项。
 * 用法: npx electron scripts/purge-kimi-credentials.mjs
 */
import { app, safeStorage } from 'electron'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createCredentialStore } from '../electron/backend/credential-store.mjs'

const userData = path.join(os.homedir(), 'Library', 'Application Support', 'taskweaver-desktop')
const credentialsPath = path.join(userData, 'taskweaver', 'credentials.enc')

async function pruneJsonStore(filePath, providerId) {
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    const json = JSON.parse(raw)
    if (!json[providerId]) return false
    delete json[providerId]
    await fs.writeFile(filePath, `${JSON.stringify(json, null, 2)}\n`, 'utf8')
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

await app.whenReady()

const store = createCredentialStore({ filePath: credentialsPath, safeStorage })
const hadCred = Boolean(await store.read('kimi-coding'))
if (hadCred) {
  await store.delete('kimi-coding')
  console.log('已删除 taskweaver/credentials.enc 中的 kimi-coding 凭据')
} else {
  console.log('credentials.enc 中未发现 kimi-coding 凭据')
}

const stores = [
  path.join(userData, 'taskweaver', 'models-store.json'),
  path.join(userData, 'pi-runtime', 'models-store.json'),
]
for (const filePath of stores) {
  const pruned = await pruneJsonStore(filePath, 'kimi-coding')
  if (pruned) console.log(`已从 ${path.relative(userData, filePath)} 移除 kimi-coding 缓存`)
}

await app.quit()
