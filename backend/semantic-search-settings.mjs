import { dshValue } from './model/shared.mjs'

const CREDENTIAL_REFS = Object.freeze({
  jina: 'JINA_API_KEY',
  openai: 'OPENAI_API_KEY',
})
const SETTINGS_NAMESPACE = 'tool-fs-semantic-search'

function selectedProvider(value) {
  return value === 'openai' ? 'openai' : 'jina'
}

export function createSemanticSearchSettingsService({ getDirectory }) {
  async function describeSettings(directory) {
    const response = dshValue(await directory.api.settings.describe({}), '读取语义搜索设置')
    const namespace = response.namespaces?.find(item => item.ns === SETTINGS_NAMESPACE)
    if (!namespace) throw new Error('语义搜索设置尚未加载，请稍候再试')
    if (response.writable !== true || namespace.applies !== 'live') {
      throw new Error('语义搜索设置当前不可写')
    }
    return { response, namespace }
  }

  async function get() {
    const directory = await getDirectory()
    const [credentialResponse, settingsResponse] = await Promise.all([
      directory.api.credentials.describe({ refs: Object.values(CREDENTIAL_REFS) }),
      directory.api.settings.describe({}),
    ])
    const credentialData = dshValue(credentialResponse, '读取语义搜索凭据状态')
    const settingsData = dshValue(settingsResponse, '读取语义搜索设置')
    const namespace = settingsData.namespaces?.find(item => item.ns === SETTINGS_NAMESPACE)
    const embeddingProvider = selectedProvider(namespace?.value?.embeddingProvider)
    const credentials = Object.fromEntries(Object.entries(CREDENTIAL_REFS).map(([provider, ref]) => {
      const info = credentialData.credentials?.[ref]
      return [provider, { configured: info?.configured === true, writable: info?.writable !== false, source: info?.source ?? null }]
    }))
    return {
      embeddingProvider,
      credentials,
      enabled: credentials[embeddingProvider].configured,
      settingsAvailable: Boolean(namespace),
      settingsWritable: Boolean(settingsData.writable && namespace?.applies === 'live'),
    }
  }

  async function save({ embeddingProvider, apiKey, clearApiKey = false } = {}) {
    if (embeddingProvider !== 'jina' && embeddingProvider !== 'openai') {
      throw new Error('语义搜索服务只能选择 Jina 或 OpenAI')
    }
    if (apiKey !== undefined && clearApiKey) throw new Error('不能同时设置和清除语义搜索密钥')
    const directory = await getDirectory()
    const { namespace } = await describeSettings(directory)
    const ref = CREDENTIAL_REFS[embeddingProvider]

    if (apiKey !== undefined) {
      const normalizedKey = String(apiKey).trim()
      if (!normalizedKey) throw new Error('API 密钥不能为空')
      const credentialResponse = dshValue(await directory.api.credentials.describe({ refs: [ref] }), '检查语义搜索凭据权限')
      if (credentialResponse.credentials?.[ref]?.writable === false) {
        throw new Error('当前密钥来自只读来源，无法从设置页覆盖')
      }
      dshValue(await directory.api.credentials.set({ ref, value: normalizedKey }), '保存语义搜索凭据')
    } else if (clearApiKey) {
      const credentialResponse = dshValue(await directory.api.credentials.describe({ refs: [ref] }), '检查语义搜索凭据权限')
      if (credentialResponse.credentials?.[ref]?.writable === false) {
        throw new Error('当前密钥来自只读来源，无法从设置页移除')
      }
      dshValue(await directory.api.credentials.unset({ ref }), '移除语义搜索凭据')
    }

    dshValue(await directory.api.settings.update({
      ns: namespace.ns,
      patch: { embeddingProvider },
      expectedRevision: namespace.revision,
    }), '保存语义搜索服务选择')
    return get()
  }

  return { get, save }
}
