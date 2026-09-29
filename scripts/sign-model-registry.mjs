#!/usr/bin/env node
import { createHash, createPrivateKey, sign } from 'node:crypto'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const registryPath = path.resolve(process.argv[2] || path.join(root, 'registry', 'model-registry.v1.json'))
const outputDir = path.resolve(process.argv[3] || path.dirname(registryPath))
let privatePem
if (process.env.MODEL_REGISTRY_SIGNING_PRIVATE_KEY_BASE64) {
  privatePem = Buffer.from(process.env.MODEL_REGISTRY_SIGNING_PRIVATE_KEY_BASE64, 'base64').toString('utf8')
} else {
  privatePem = await fsp.readFile(path.join(root, '.taskweaver-signing', 'model-registry-private.pem'), 'utf8')
}
const privateKey = createPrivateKey(privatePem)
const bytes = await fsp.readFile(registryPath)
const registry = JSON.parse(bytes.toString('utf8'))
const signature = sign(null, bytes, privateKey).toString('base64')
const fileName = 'model-registry.v1.json'
const baseUrl = process.env.MODEL_REGISTRY_ASSET_BASE_URL
  || 'https://github.com/ZSN12/to-agent/releases/download/model-registry'
const manifest = {
  schemaVersion: 1,
  registryVersion: registry.registryVersion,
  registryUrl: `${baseUrl}/${fileName}`,
  sha256: createHash('sha256').update(bytes).digest('hex'),
  signature,
  keyId: process.env.MODEL_REGISTRY_KEY_ID || 'taskweaver-registry-2026-01',
  publishedAt: new Date().toISOString(),
}
await fsp.mkdir(outputDir, { recursive: true })
await fsp.copyFile(registryPath, path.join(outputDir, fileName))
await fsp.writeFile(path.join(outputDir, 'model-registry.v1.sig'), `${signature}\n`)
await fsp.writeFile(path.join(outputDir, 'model-registry-manifest.v1.json'), `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`sign-model-registry: ${registry.registryVersion}`)
