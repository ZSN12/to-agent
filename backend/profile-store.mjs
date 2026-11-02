import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { AUTO_ROUTE_MODEL_KEY } from './routing-constants.mjs'
import { normalizeModelTaskRoles } from './model-task-roles.mjs'

const DEFAULT_STATE = {
  profiles: {},
  addedModelKeys: [],
  activeModelKey: null,
  thinkingLevel: null,
  taskRoleRoutingEnabled: false,
}

/**
 * TaskWeaver owns the added-model selection and per-model routing metadata.
 */
export function createProfileStore(userDataPath) {
  const filePath = path.join(userDataPath, 'taskweaver-model-profiles.json')
  let mutationQueue = Promise.resolve()

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
        taskRoleRoutingEnabled: parsed.taskRoleRoutingEnabled === true,
      }
    } catch (error) {
      if (error && typeof error === 'object' && error.code === 'ENOENT') {
        return { ...DEFAULT_STATE, profiles: {}, addedModelKeys: [] }
      }
      throw error
    }
  }

  async function writeState(state) {
    const directory = path.dirname(filePath)
    const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`
    await fs.mkdir(directory, { recursive: true })
    try {
      await fs.writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, {
        encoding: 'utf8',
        flag: 'wx',
        mode: 0o600,
      })
      await fs.rename(temporaryPath, filePath)
    } catch (error) {
      await fs.rm(temporaryPath, { force: true }).catch(() => {})
      throw error
    }
  }

  function serializeMutation(operation) {
    const pending = mutationQueue.then(operation)
    mutationQueue = pending.then(() => undefined, () => undefined)
    return pending
  }

  function mutateState(update) {
    return serializeMutation(async () => {
      const state = await readState()
      const { result, changed = true } = await update(state)
      if (changed) await writeState(state)
      return result
    })
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
      return mutateState((state) => {
        if (!state.addedModelKeys.includes(modelKey)) state.addedModelKeys.push(modelKey)
        if (!state.profiles[modelKey]) {
          state.profiles[modelKey] = { tier: 'balanced', capabilitySummary: '', enabledForAllocation: false, notes: '' }
        }
        return { result: state.addedModelKeys }
      })
    },
    async removeModel(modelKey) {
      return mutateState((state) => {
        state.addedModelKeys = state.addedModelKeys.filter((key) => key !== modelKey)
        if (state.activeModelKey === modelKey) state.activeModelKey = state.addedModelKeys[0] ?? null
        return { result: state.addedModelKeys }
      })
    },
    async upsertProfile(modelKey, patch) {
      return mutateState((state) => {
        if (modelKey && !state.addedModelKeys.includes(modelKey)) throw new Error('请先将模型添加到 TaskWeaver')
        const prev = state.profiles[modelKey] ?? {}
        const hasCapabilityTierOverride = Object.hasOwn(patch ?? {}, 'capabilityTierOverride')
        const hasTaskRoles = Object.hasOwn(patch ?? {}, 'taskRoles')
        const taskRoles = hasTaskRoles
          ? normalizeModelTaskRoles(patch.taskRoles)
          : prev.taskRoles
        const capabilityTierOverride = hasCapabilityTierOverride
          ? patch.capabilityTierOverride
          : prev.capabilityTierOverride
        if (capabilityTierOverride != null
          && capabilityTierOverride !== 'strong'
          && capabilityTierOverride !== 'medium'
          && capabilityTierOverride !== 'weak') {
          throw new Error('能力档位覆盖必须是 strong、medium、weak 或自动')
        }
        state.profiles[modelKey] = {
          tier: patch.tier ?? prev.tier ?? 'balanced',
          capabilitySummary: patch.capabilitySummary ?? prev.capabilitySummary ?? '',
          enabledForAllocation: Array.isArray(taskRoles)
            ? taskRoles.length > 0
            : patch.enabledForAllocation ?? prev.enabledForAllocation ?? false,
          notes: patch.notes ?? prev.notes ?? '',
          ...(taskRoles === undefined ? {} : { taskRoles }),
          ...(capabilityTierOverride == null ? {} : { capabilityTierOverride }),
          ...(patch.thinkingLevel !== undefined || prev.thinkingLevel
            ? { thinkingLevel: patch.thinkingLevel ?? prev.thinkingLevel }
            : {}),
        }
        if (taskRoles?.length) state.taskRoleRoutingEnabled = true
        return { result: state.profiles[modelKey] }
      })
    },
    async isTaskRoleRoutingEnabled() {
      const state = await readState()
      return state.taskRoleRoutingEnabled === true
    },
    async removeProfile(modelKey) {
      return mutateState((state) => {
        delete state.profiles[modelKey]
        if (state.activeModelKey === modelKey) state.activeModelKey = null
        return { result: undefined }
      })
    },
    async getActiveModelKey() {
      const state = await readState()
      return state.activeModelKey
    },
    async setActiveModelKey(modelKey) {
      return mutateState((state) => {
        if (modelKey === AUTO_ROUTE_MODEL_KEY) {
          throw new Error('主对话请从已添加的模型中选择；子任务模型在「路由作品集」中配置')
        }
        if (modelKey && !state.addedModelKeys.includes(modelKey)) {
          throw new Error('请先将模型添加到 TaskWeaver')
        }
        state.activeModelKey = modelKey
        return { result: modelKey }
      })
    },
    /**
     * 将磁盘上仍保存的旧版「智能路由」占位 activeModelKey 清空（不自动推断替代模型）。
     * @returns {Promise<boolean>} 是否发生了迁移写入
     */
    async migrateLegacyAutoRouteActiveKey() {
      return serializeMutation(async () => {
        let rawState
        try {
          const raw = await fs.readFile(filePath, 'utf8')
          rawState = JSON.parse(raw)
        } catch (error) {
          if (error && typeof error === 'object' && error.code === 'ENOENT') return false
          throw error
        }
        if (rawState.activeModelKey !== AUTO_ROUTE_MODEL_KEY) return false
        await writeState({
          profiles: rawState.profiles ?? {},
          addedModelKeys: Array.isArray(rawState.addedModelKeys) ? rawState.addedModelKeys : [],
          activeModelKey: null,
          thinkingLevel: rawState.thinkingLevel ?? null,
          taskRoleRoutingEnabled: rawState.taskRoleRoutingEnabled === true,
        })
        return true
      })
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
      return mutateState((state) => {
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
            ...(prev.capabilityTierOverride ? { capabilityTierOverride: prev.capabilityTierOverride } : {}),
            ...(Array.isArray(prev.taskRoles) ? { taskRoles: prev.taskRoles } : {}),
            thinkingLevel: normalized,
          }
        }
        return { result: normalized }
      })
    },
    /**
     * `opencodex/<modelId>` → `bridge-composer/<modelId>` for added list, profiles, active key.
     * @returns {Promise<{ changed: boolean, migrated: { from: string, to: string }[] }>}
     */
    async migrateOpenCodexRoutesToBridge() {
      return mutateState((state) => {
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
        if (!migrated.length) return { result: { changed: false, migrated: [] }, changed: false }
        state.addedModelKeys = nextAdded
        if (state.activeModelKey && String(state.activeModelKey).startsWith('opencodex/')) {
          const modelId = String(state.activeModelKey).slice('opencodex/'.length)
          if (modelId) state.activeModelKey = `bridge-composer/${modelId}`
        }
        return { result: { changed: true, migrated } }
      })
    },
    /**
     * Repair models imported by older scans under the Cursor route even though
     * their IDs belong to another local agent. Keep their per-model settings and
     * active selection while moving them to the owning provider route.
     */
    async migrateMisroutedLocalAgentModels() {
      return mutateState((state) => {
        const migrated = []
        const nextAdded = []
        const seen = new Set()
        const routeFor = (key) => {
          const antigravity = String(key).match(/^bridge-composer\/google-antigravity\/(.+)$/)
          if (antigravity) return `bridge-antigravity/google-antigravity/${antigravity[1]}`
          const workbuddy = String(key).match(/^bridge-composer\/workbuddy\/(.+)$/)
          if (workbuddy) return `workbuddy/${workbuddy[1]}`
          return key
        }

        for (const key of state.addedModelKeys) {
          const target = routeFor(key)
          if (target !== key) {
            migrated.push({ from: key, to: target })
            state.profiles[target] = {
              ...(state.profiles[key] ?? {}),
              ...(state.profiles[target] ?? {}),
            }
            delete state.profiles[key]
          }
          if (!seen.has(target)) {
            seen.add(target)
            nextAdded.push(target)
          }
        }

        const activeTarget = state.activeModelKey ? routeFor(state.activeModelKey) : state.activeModelKey
        const activeChanged = activeTarget !== state.activeModelKey
        const addedChanged = nextAdded.length !== state.addedModelKeys.length
          || nextAdded.some((key, index) => key !== state.addedModelKeys[index])
        if (!migrated.length && !activeChanged && !addedChanged) {
          return { result: { changed: false, migrated: [] }, changed: false }
        }
        state.addedModelKeys = nextAdded
        if (activeChanged) state.activeModelKey = activeTarget
        return { result: { changed: true, migrated } }
      })
    },
  }
}
