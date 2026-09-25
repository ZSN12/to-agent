import fs from 'node:fs/promises'
import path from 'node:path'

const DEFAULT_STATE = {
  profiles: {},
  addedModelKeys: [],
  activeModelKey: null,
  thinkingLevel: 'high',
  busyEnterMode: 'steer',
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
      return {
        profiles: parsed.profiles ?? {},
        addedModelKeys: Array.isArray(parsed.addedModelKeys) ? parsed.addedModelKeys : [],
        activeModelKey: parsed.activeModelKey ?? null,
        thinkingLevel: parsed.thinkingLevel ?? 'high',
        busyEnterMode: parsed.busyEnterMode === 'followUp' ? 'followUp' : 'steer',
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
        state.profiles[modelKey] = { tier: 'balanced', capabilitySummary: '', enabledForAllocation: true, notes: '' }
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
          patch.enabledForAllocation ?? prev.enabledForAllocation ?? true,
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
      if (modelKey && !state.addedModelKeys.includes(modelKey)) throw new Error('请先将模型添加到 TaskWeaver')
      state.activeModelKey = modelKey
      await writeState(state)
      return modelKey
    },
    async getThinkingLevel(modelKey) {
      const state = await readState()
      const key = modelKey || state.activeModelKey
      if (key && state.profiles[key]?.thinkingLevel) {
        return state.profiles[key].thinkingLevel
      }
      return state.thinkingLevel || 'high'
    },
    async setThinkingLevel(level) {
      const state = await readState()
      const normalized = level || 'high'
      state.thinkingLevel = normalized
      const key = state.activeModelKey
      if (key) {
        const prev = state.profiles[key] ?? {}
        state.profiles[key] = {
          tier: prev.tier ?? 'balanced',
          capabilitySummary: prev.capabilitySummary ?? '',
          enabledForAllocation: prev.enabledForAllocation ?? true,
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
      await writeState(state)
      return state.busyEnterMode
    },
  }
}
