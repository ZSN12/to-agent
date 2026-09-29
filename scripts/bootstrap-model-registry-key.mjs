#!/usr/bin/env node
import { generateKeyPairSync } from 'node:crypto'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const privateDir = path.join(root, '.taskweaver-signing')
const privatePath = path.join(privateDir, 'model-registry-private.pem')
const publicPath = path.join(root, 'registry', 'model-registry-public-key.der.b64')
try {
  await fsp.access(privatePath)
  await fsp.access(publicPath)
  console.log(`签名密钥已经存在：${privatePath}`)
} catch {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  await fsp.mkdir(privateDir, { recursive: true, mode: 0o700 })
  await fsp.writeFile(privatePath, privateKey.export({ format: 'pem', type: 'pkcs8' }), { mode: 0o600 })
  await fsp.writeFile(publicPath, `${publicKey.export({ format: 'der', type: 'spki' }).toString('base64')}\n`)
  console.log(`已生成本地私钥（已被 .gitignore 排除）：${privatePath}`)
  console.log(`请将私钥文件的 Base64 内容保存为 GitHub Secret MODEL_REGISTRY_SIGNING_PRIVATE_KEY_BASE64。`)
}
