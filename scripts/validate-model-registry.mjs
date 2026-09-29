#!/usr/bin/env node
import fsp from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateRegistry } from '../electron/backend/model-registry-updater.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const file = path.resolve(process.argv[2] || path.join(root, 'registry', 'model-registry.v1.json'))
const registry = validateRegistry(JSON.parse(await fsp.readFile(file, 'utf8')))
const bundledFile = path.join(root, 'registry', 'model-registry.v1.json')
const allowedInputs = new Set(['text', 'image', 'audio', 'video'])
for (const [key, model] of Object.entries(registry.models)) {
  if (!registry.providers[model.provider]) throw new Error(`${key}: provider 未定义`)
  if (!registry.providers[model.provider].protocols?.includes(model.api)) throw new Error(`${key}: api 不在 provider.protocols`)
  if (model.contextWindow !== undefined && (!Number.isInteger(model.contextWindow) || model.contextWindow <= 0)) throw new Error(`${key}: contextWindow 无效`)
  if (model.maxTokens !== undefined && (!Number.isInteger(model.maxTokens) || model.maxTokens <= 0)) throw new Error(`${key}: maxTokens 无效`)
  if (model.input?.some((item) => !allowedInputs.has(item))) throw new Error(`${key}: input 模态无效`)
  for (const [kind, value] of Object.entries(model.pricing ?? {})) {
    if (!Number.isFinite(value) || value < 0 || value > 1_000_000) throw new Error(`${key}: pricing.${kind} 异常`)
  }
}

// A catalog hot update may add models only inside provider/protocol boundaries
// already shipped by the current runtime. Anything else needs adapter or OAuth
// code and therefore belongs in a reviewed application/runtime release.
if (path.resolve(file) !== path.resolve(bundledFile)) {
  const bundled = validateRegistry(JSON.parse(await fsp.readFile(bundledFile, 'utf8')))
  for (const [providerId, provider] of Object.entries(registry.providers)) {
    const shipped = bundled.providers[providerId]
    if (!shipped) throw new Error(`${providerId}: 新提供方不能通过目录热更新发布，需要 Runtime 升级`)
    const newProtocols = (provider.protocols ?? []).filter((protocol) => !(shipped.protocols ?? []).includes(protocol))
    if (newProtocols.length > 0) {
      throw new Error(`${providerId}: 新协议 ${newProtocols.join(', ')} 不能通过目录热更新发布，需要 Runtime 升级`)
    }
  }
}
console.log(`validate-model-registry: ${Object.keys(registry.models).length} models OK`)
