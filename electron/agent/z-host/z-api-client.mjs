import path from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  resolveRuntimeNodePath,
  TASKWEAVER_Z_RUNTIME_CLIENT_DIR,
} from './resolve-runtime.mjs'

/**
 * Load Z runtime's contract-validating API client from the deploy tree.
 */
export async function createZApiClient({ runtimeRoot, baseUrl }) {
  if (typeof runtimeRoot !== 'string' || !runtimeRoot) throw new Error('Z runtime 路径无效')
  const normalizedBase = new URL(baseUrl)
  if (normalizedBase.protocol !== 'http:' || normalizedBase.hostname !== '127.0.0.1') {
    throw new Error('Z Host 必须绑定到本机回环地址')
  }

  const rel = 'lib/types/client/web-api-client.js'
  const packagesRoot = resolveRuntimeNodePath(runtimeRoot)
  const candidates = [
    packagesRoot ? path.join(packagesRoot, '@z/client-connection', rel) : null,
    packagesRoot ? path.join(packagesRoot, '@z/dsh-client-connection', rel) : null,
    packagesRoot ? path.join(packagesRoot, '@deepseek-ai/dsh-client-connection', rel) : null,
    path.join(runtimeRoot, TASKWEAVER_Z_RUNTIME_CLIENT_DIR, rel),
    path.join(runtimeRoot, 'taskweaver-dsh-client', rel),
    path.join(runtimeRoot, 'packages/client/connection', rel),
  ].filter(Boolean)
  let WebApiClient
  let lastError
  for (const candidate of candidates) {
    try {
      ;({ WebApiClient } = await import(pathToFileURL(candidate).href))
      break
    } catch (error) {
      lastError = error
    }
  }
  if (!WebApiClient) {
    throw new Error(`无法加载 Z API 客户端；请先运行 npm run build:z-runtime。${lastError instanceof Error ? ` ${lastError.message}` : ''}`)
  }

  return new (class TaskWeaverZApiClient extends WebApiClient {
    resolveBase() {
      return normalizedBase.origin
    }
  })()
}

