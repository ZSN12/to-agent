import { isCursorFamilyModelKey } from '../cursor-model-route.mjs'
import { isDeprecatedOpenCodexChatRoute } from '../cursor-tool-guidance.mjs'
import {
  dshPermissionPresetForMode,
  normalizePermissionMode,
} from '../dsh-permission-map.mjs'
import { sessionModelMatches } from '../dsh-session-model.mjs'
import { SUBSCRIPTION_BRIDGE_PROVIDERS } from './constants.mjs'
import { rpcValue } from './prelude.mjs'

export function createDshModelConfigHelpers({ sessions, persistSessions, profileStore, modelService }) {
  function composerPresetMigrationRequiredError(cause) {
    return Object.assign(new Error(
      '这个 Composer 会话仍绑定旧的 code 工具预设。Z Host 为保护已有对话历史，会锁定已经运行过的会话预设，不能安全地原地切换。'
      + '请新建一个对话再使用 Composer；旧对话和历史已保留，可继续用原模型打开。',
      { cause },
    ), { code: 'COMPOSER_PRESET_MIGRATION_REQUIRED' })
  }

  async function alignLegacyComposerPreset(api, conversationId, entry, resolvedPreset, modelKey) {
    const key = String(modelKey ?? '')
    const composerBridgeRoute = key.startsWith('bridge-composer/') || isCursorFamilyModelKey(key)
    if (!composerBridgeRoute || entry?.agentPreset !== 'code' || resolvedPreset !== 'standard') {
      return entry
    }
    if (typeof api.agentPresets?.select !== 'function') {
      throw composerPresetMigrationRequiredError(new Error('当前 Host 未提供空会话预设切换接口'))
    }
    try {
      const selected = rpcValue(await api.agentPresets.select({
        sessionId: entry.sessionId,
        agentPreset: resolvedPreset,
      }), '切换 Composer 会话预设')
      // Host accepts this only for a blank session; its own event log remains
      // authoritative, while the local map is updated only after that commit.
      entry.agentPreset = selected?.agentPreset || resolvedPreset
      sessions.set(conversationId, entry)
      await persistSessions()
      return entry
    } catch (error) {
      if (error?.code === 'agent-preset-locked') {
        throw composerPresetMigrationRequiredError(error)
      }
      throw error
    }
  }
  async function ensureSessionModelSelection(api, sessionKey, entry, config, explicitReasoningEffort) {
    const sessionId = entry.sessionId
    const directory = rpcValue(await api.sessions.models({ sessionId }), '读取 Z 会话模型')
    const current = directory?.current ?? null
    if (sessionModelMatches(current, config, explicitReasoningEffort, entry.lastAppliedModelSelection)) return current
    const payload = {
      sessionId,
      provider: config.provider,
      model: config.id,
      ...(explicitReasoningEffort ? { reasoningEffort: explicitReasoningEffort } : {}),
    }
    const selected = rpcValue(await api.sessions.selectModel(payload), '选择 Z 模型')
    entry.lastAppliedModelSelection = {
      provider: config.provider,
      model: config.id,
      ...(explicitReasoningEffort ? { reasoningEffort: explicitReasoningEffort } : {}),
    }
    sessions.set(sessionKey, entry)
    await persistSessions()
    return selected?.selected ?? selected
  }

  async function selectedReasoningEffort(config, modelKey) {
    // A global Composer preference must not be sent to routes that explicitly
    // declare no reasoning support; some OpenAI-compatible gateways reject
    // the request before generation when an effort is present.
    if (config?.reasoning === false) return null
    const requested = await profileStore?.getThinkingLevel?.(modelKey) ?? null
    if (!requested) return null
    const supported = config?.supportedThinkingLevels
    if (Array.isArray(supported) && !supported.includes(requested)) {
      return supported.includes(config.defaultThinkingLevel) ? config.defaultThinkingLevel : null
    }
    return requested
  }

  async function ensurePermissionModeApplied(api, sessionKey, entry, mode) {
    const normalizedMode = normalizePermissionMode(mode)
    if (entry.lastAppliedPermissionMode === normalizedMode) return
    const preset = dshPermissionPresetForMode(normalizedMode)
    const response = rpcValue(await api.sessions.prompt({
      sessionId: entry.sessionId,
      mode: 'queue',
      content: [{ type: 'text', text: `/permission ${preset}` }],
      clientTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }), '应用 Z 权限模式')
    if (response.command?.kind !== 'success') {
      throw new Error('Z Host 未确认应用权限模式；为避免以错误权限执行，本次消息已阻止。请检查权限设置后重试。')
    }
    const history = rpcValue(await api.sessions.history({
      sessionId: entry.sessionId,
      maxMessages: 1,
    }), '核对 Z 权限投影')
    if (history?.projections?.values?.permissions?.currentValue !== preset) {
      throw new Error('Z Host 权限投影未确认目标权限；为避免以错误权限执行，本次消息已阻止。')
    }
    entry.lastAppliedPermissionMode = normalizedMode
    sessions.set(sessionKey, entry)
    await persistSessions()
  }

  async function configureModel(api, modelKey) {
    const config = await modelService.getDshModelConfig(modelKey)
    const providerList = rpcValue(await api.llm.providers({}), '读取 Z 提供方目录')
    const route = providerList.providers?.find((item) => item.provider === config.provider)
    if (!route?.active) throw new Error(`Z Runtime 当前没有启用模型提供方 ${config.provider}；请先检查 TaskWeaver 模型设置。`)
    const auth = await modelService.listProvidersAuth()
    // Built-in bridges resolve their official subscription OAuth inside the
    // transport. They intentionally have no DSH API-key credential; relay and
    // custom providers still use the normal API-key authorization check.
    const usesBridgeSubscriptionOAuth = SUBSCRIPTION_BRIDGE_PROVIDERS.has(config.provider)
    if (!usesBridgeSubscriptionOAuth && !auth.some((item) => item.id === config.provider && item.configured)) {
      throw new Error(`模型提供方 ${config.provider} 尚未完成 API Key 或官方订阅授权。请先在模型设置中连接账号。`)
    }
    if (config.provider === 'opencodex' || isDeprecatedOpenCodexChatRoute(modelKey)) {
      throw new Error(
        '模型路由 opencodex/* 已废弃。请在「模型与来源」改用 bridge-composer/*（内置桥），或执行迁移到 bridge-composer。',
      )
    }
    return config
  }

  return {
    alignLegacyComposerPreset,
    ensureSessionModelSelection,
    selectedReasoningEffort,
    ensurePermissionModeApplied,
    configureModel,
  }
}
