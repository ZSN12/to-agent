import path from 'node:path'
import { pathToFileURL } from 'node:url'

/**
 * Load DSH's own contract-validating client from the in-repository runtime.
 * TaskWeaver only supplies the physical base URL; RPC envelopes, validation,
 * stream decoding and cancellation remain owned by DSH.
 */
export async function createDshApiClient({ runtimeRoot, baseUrl }) {
  if (typeof runtimeRoot !== 'string' || !runtimeRoot) throw new Error('DSH runtime 路径无效')
  const normalizedBase = new URL(baseUrl)
  if (normalizedBase.protocol !== 'http:' || normalizedBase.hostname !== '127.0.0.1') {
    throw new Error('DSH Host 必须绑定到本机回环地址')
  }

  const rel = 'lib/types/client/web-api-client.js'
  const candidates = [
    path.join(runtimeRoot, 'node_modules/@deepseek-ai/dsh-client-connection', rel),
    path.join(runtimeRoot, 'packages/client/connection', rel),
    path.join(runtimeRoot, 'taskweaver-dsh-client', rel),
  ]
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
    throw new Error(`无法加载 DSH API 客户端；请先构建仓库内 dsh-source。${lastError instanceof Error ? ` ${lastError.message}` : ''}`)
  }

  return new (class TaskWeaverDshApiClient extends WebApiClient {
    resolveBase() {
      return normalizedBase.origin
    }
  })()
}
