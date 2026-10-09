import fs from 'node:fs/promises'
import path from 'node:path'
import { AUTO_ROUTE_MODEL_KEY } from './routing-constants.mjs'

const DEFAULT_STATE = {
  profiles: {},
  addedModelKeys: [],
  activeModelKey: null,
  thinkingLevel: null,
  busyEnterMode: 'followUp',
  busyEnterModeVersion: 1,
}

/**
 * TaskWeaver owns the added-model selection and per-model routing metadata.
 */
export function createProfileStore(userDataPath) {
  const filePath = path.join(userDataPath, 'taskweaver-model-profiles.json')

  async function readState() {
    try {
      const raw = await fs.readFile(filePath, 'utf8')
      const parsed = JSON.parse(raw)
      let activeModelKey = parsed.activeModelKey ?? null
      if (activeModelKey === AUTO_ROUTE_MODEL_KEY) activeModelKey = null
      return {
        profiles: parsed.profiles ?? {},
        addedModelKeys: Array.isArray(parsed.addedModelKeys) ? parsed.addedModelKeys : [],
        activeModelKey,
        thinkingLevel: parsed.thinkingLevel ?? null,
        // Older builds could persist `steer` as the implicit fallback when the
        // preference was absent. Migrate those profiles to DSH's queue default;
        // an explicit choice made by the current settings UI is versioned.
        busyEnterMode: parsed.busyEnterModeVersion === 1 && parsed.busyEnterMode === 'steer'
          ? 'steer'
          : 'followUp',
        busyEnterModeVersion: 1,
      }
    } catch (error) {
      if (error && typeof error === 'object' && error.code === 'ENOENT') {
        return { ...DEFAULT_STATE }
      }
      throw error
    }
  }

  async function writeState(state) {
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
  }

  return {
    filePath,
    async getProfile(modelKey) {
      const state = await readState()
      return state.profiles[modelKey] ?? null
    },
    async listProfiles() {
      const state = await readState()
      return state.profiles
    },
    async listAddedModelKeys() {
      const state = await readState()
      return state.addedModelKeys
    },
    async addModel(modelKey) {
      const state = await readState()
      if (!state.addedModelKeys.includes(modelKey)) state.addedModelKeys.push(modelKey)
      if (!state.profiles[modelKey]) {
        state.profiles[modelKey] = { tier: 'balanced', capabilitySummary: '', enabledForAllocation: false, notes: '' }
      }
      await writeState(state)
      return state.addedModelKeys
    },
    async removeModel(modelKey) {
      const state = await readState()
      state.addedModelKeys = state.addedModelKeys.filter((key) => key !== modelKey)
      if (state.activeModelKey === modelKey) state.activeModelKey = state.addedModelKeys[0] ?? null
      await writeState(state)
      return state.addedModelKeys
    },
    async upsertProfile(modelKey, patch) {
      const state = await readState()
      if (modelKey && !state.addedModelKeys.includes(modelKey)) throw new Error('请先将模型添加到 TaskWeaver')
      const prev = state.profiles[modelKey] ?? {}
      state.profiles[modelKey] = {
        tier: patch.tier ?? prev.tier ?? 'balanced',
        capabilitySummary: patch.capabilitySummary ?? prev.capabilitySummary ?? '',
        enabledForAllocation:
          patch.enabledForAllocation ?? prev.enabledForAllocation ?? false,
        notes: patch.notes ?? prev.notes ?? '',
        ...(patch.thinkingLevel !== undefined || prev.thinkingLevel
          ? { thinkingLevel: patch.thinkingLevel ?? prev.thinkingLevel }
          : {}),
      }
      await writeState(state)
      return state.profiles[modelKey]
    },
    async removeProfile(modelKey) {
      const state = await readState()
      delete state.profiles[modelKey]
      if (state.activeModelKey === modelKey) state.activeModelKey = null
      await writeState(state)
    },
    async getActiveModelKey() {
      const state = await readState()
      return state.activeModelKey
    },
    async setActiveModelKey(modelKey) {
      const state = await readState()
      if (modelKey === AUTO_ROUTE_MODEL_KEY) {
        throw new Error('主对话请从已添加的模型中选择；子任务模型在「路由作品集」中配置')
      }
      if (modelKey && !state.addedModelKeys.includes(modelKey)) {
        throw new Error('请先将模型添加到 TaskWeaver')
      }
      state.activeModelKey = modelKey
      await writeState(state)
      return modelKey
    },
    /**
     * 将磁盘上仍保存的旧版「智能路由」占位 activeModelKey 清空（不自动推断替代模型）。
     * @returns {Promise<boolean>} 是否发生了迁移写入
     */
    async migrateLegacyAutoRouteActiveKey() {
      let rawState
      try {
        const raw = await fs.readFile(filePath, 'utf8')
        rawState = JSON.parse(raw)
      } catch (error) {
        if (error && typeof error === 'object' && error.code === 'ENOENT') return false
        throw error
      }
      if (rawState.activeModelKey !== AUTO_ROUTE_MODEL_KEY) return false
      rawState.activeModelKey = null
      await writeState({
        profiles: rawState.profiles ?? {},
        addedModelKeys: Array.isArray(rawState.addedModelKeys) ? rawState.addedModelKeys : [],
        activeModelKey: null,
        thinkingLevel: rawState.thinkingLevel ?? null,
        busyEnterMode: rawState.busyEnterModeVersion === 1 && rawState.busyEnterMode === 'steer'
          ? 'steer'
          : 'followUp',
        busyEnterModeVersion: 1,
      })
      return true
    },
    async getThinkingLevel(modelKey) {
      const state = await readState()
      const key = modelKey || state.activeModelKey
      if (key && state.profiles[key]?.thinkingLevel) {
        return state.profiles[key].thinkingLevel
      }
      return state.thinkingLevel ?? null
    },
    async setThinkingLevel(level) {
      const state = await readState()
      const normalized = level || null
      state.thinkingLevel = normalized
      const key = state.activeModelKey
      if (key) {
        const prev = state.profiles[key] ?? {}
        state.profiles[key] = {
          tier: prev.tier ?? 'balanced',
          capabilitySummary: prev.capabilitySummary ?? '',
          enabledForAllocation: prev.enabledForAllocation ?? false,
          notes: prev.notes ?? '',
          thinkingLevel: normalized,
        }
      }
      await writeState(state)
      return normalized
    },
    async getBusyEnterMode() {
      const state = await readState()
      return state.busyEnterMode === 'followUp' ? 'followUp' : 'steer'
    },
    async setBusyEnterMode(mode) {
      const state = await readState()
      state.busyEnterMode = mode === 'followUp' ? 'followUp' : 'steer'
      state.busyEnterModeVersion = 1
      await writeState(state)
      return state.busyEnterMode
    },
    /**
     * `opencodex/<modelId>` → `bridge-composer/<modelId>` for added list, profiles, active key.
     * @returns {Promise<{ changed: boolean, migrated: { from: string, to: string }[] }>}
     */
    async migrateOpenCodexRoutesToBridge() {
      const state = await readState()
      const migrated = []
      const nextAdded = []
      const seen = new Set()
      for (const key of state.addedModelKeys) {
        let target = key
        if (String(key).startsWith('opencodex/')) {
          const modelId = String(key).slice('opencodex/'.length)
          if (modelId) {
            target = `bridge-composer/${modelId}`
            migrated.push({ from: key, to: target })
            if (state.profiles[key]) {
              state.profiles[target] = {
                ...(state.profiles[target] ?? {}),
                ...state.profiles[key],
              }
              delete state.profiles[key]
            }
          }
        }
        if (!seen.has(target)) {
          seen.add(target)
          nextAdded.push(target)
        }
      }
      if (!migrated.length) return { changed: false, migrated: [] }
      state.addedModelKeys = nextAdded
      if (state.activeModelKey && String(state.activeModelKey).startsWith('opencodex/')) {
        const modelId = String(state.activeModelKey).slice('opencodex/'.length)
        if (modelId) state.activeModelKey = `bridge-composer/${modelId}`
      }
      await writeState(state)
      return { changed: true, migrated }
    },
  }
}
