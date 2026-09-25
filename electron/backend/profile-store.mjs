import fs from 'node:fs/promises'
import path from 'node:path'

const DEFAULT_STATE = {
  profiles: {},
  addedModelKeys: [],
  activeModelKey: null,
  thinkingLevel: 'high',
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
    async getThinkingLevel() {
      const state = await readState()
      return state.thinkingLevel || 'high'
    },
    async setThinkingLevel(level) {
      const state = await readState()
      state.thinkingLevel = level || 'high'
      await writeState(state)
      return state.thinkingLevel
    },
  }
}
