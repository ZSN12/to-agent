import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { createJsonStore } from './json-store.mjs'

const MAX_ROLE_PROFILES = 32
const MAX_ROLE_NAME_CHARS = 48
const MAX_ROLE_DESCRIPTION_CHARS = 400
const MAX_ROLE_PERSONA_CHARS = 12_000
const MAX_MODEL_KEY_CHARS = 240

function boundedText(value, label, maxLength, { required = false } = {}) {
  if (typeof value !== 'string') throw new Error(`${label}必须是文本`)
  const text = value.trim()
  if (required && !text) throw new Error(`${label}不能为空`)
  if (text.length > maxLength) throw new Error(`${label}不能超过 ${maxLength} 个字符`)
  if (text.includes('\0')) throw new Error(`${label}不能包含空字符`)
  return text
}

function roleName(value) {
  const name = boundedText(value, '角色名称', MAX_ROLE_NAME_CHARS, { required: true })
  if (/[\u0000-\u001f\u007f]/u.test(name)) throw new Error('角色名称不能包含控制字符')
  return name
}

const ROLE_STYLE_PRESETS = new Set(['custom', 'precise', 'concise', 'playful'])
export const ROLE_DUTIES = new Set(['planner', 'implementer', 'reviewer', 'researcher', 'specialist', 'generalist'])

export function inferRoleDuty({ name = '', description = '', persona = '' } = {}) {
  const normName = name.toLowerCase()
  if (/审查|漏洞|批评|安全|审阅|缺陷|检查员|reviewer|critic|security|audit/i.test(normName)) return 'reviewer'
  if (/架构|规划|蓝图|planner|architect/i.test(normName)) return 'planner'
  if (/开发|编码|工程师|全栈|后端|前端|coder|developer|engineer|builder/i.test(normName)) return 'implementer'
  if (/研究|核查|调研|分析师|researcher|analyst/i.test(normName)) return 'researcher'

  const text = `${name} ${description} ${persona}`.toLowerCase()
  if (/审查|漏洞|批评|安全|审阅|缺陷|检查员|reviewer|critic|security|audit/i.test(text)) {
    return 'reviewer'
  }
  if (/规划系统|系统架构|架构设计|设计方案|系统设计|总体设计|顶层设计|拆解目标|方案规划|蓝图|planner|architect|roadmap/i.test(text)) {
    return 'planner'
  }
  if (/实施|编码|实现|编写|写代码|修bug|修复|开发|工程师|全栈|coder|developer|engineer|builder/i.test(text)) {
    return 'implementer'
  }
  if (/研究|检索|核实|调研|事实|分析师|researcher|analyst|fact/i.test(text)) {
    return 'researcher'
  }
  if (/前端|后端|算法|数据库|ops|devops|专长|specialist/i.test(text)) {
    return 'specialist'
  }
  return 'generalist'
}

function roleStylePreset(value) {
  return ROLE_STYLE_PRESETS.has(value) ? value : 'custom'
}

function roleDuty(value, fallbackContext) {
  return typeof value === 'string' && ROLE_DUTIES.has(value)
    ? value
    : inferRoleDuty(fallbackContext)
}

function normalizeRoleProfile(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  if (typeof value.id !== 'string' || !/^role-[0-9a-f-]{36}$/i.test(value.id)) return null
  if (typeof value.modelKey !== 'string' || !value.modelKey.trim()) return null
  if (typeof value.name !== 'string' || !value.name.trim()) return null
  if (typeof value.persona !== 'string' || !value.persona.trim()) return null
  try {
    const name = roleName(value.name)
    const description = boundedText(value.description ?? '', '角色简介', MAX_ROLE_DESCRIPTION_CHARS)
    const persona = boundedText(value.persona, '角色设定', MAX_ROLE_PERSONA_CHARS, { required: true })
    return {
      id: value.id,
      name,
      description,
      modelKey: boundedText(value.modelKey, '角色模型', MAX_MODEL_KEY_CHARS, { required: true }),
      persona,
      stylePreset: roleStylePreset(value.stylePreset),
      duty: roleDuty(value.duty, { name, description, persona }),
      createdAt: Number.isSafeInteger(value.createdAt) ? value.createdAt : Date.now(),
      updatedAt: Number.isSafeInteger(value.updatedAt) ? value.updatedAt : Date.now(),
    }
  } catch {
    return null
  }
}

/** User-owned role definitions. Secrets and Host tool permissions are not part of this store. */
export function createRoleProfileStore(userDataPath) {
  const store = createJsonStore(path.join(userDataPath, 'taskweaver-role-profiles.json'), () => ({ version: 1, profiles: [] }))

  async function readProfiles() {
    const raw = await store.read()
    return Array.isArray(raw?.profiles)
      ? raw.profiles.map(normalizeRoleProfile).filter(Boolean)
      : []
  }

  return {
    async list() {
      return (await readProfiles()).sort((a, b) => a.createdAt - b.createdAt)
    },

    async get(id) {
      return (await readProfiles()).find((profile) => profile.id === id) ?? null
    },

    async upsert(patch) {
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('角色资料无效')
      const name = roleName(patch.name)
      const description = boundedText(patch.description ?? '', '角色简介', MAX_ROLE_DESCRIPTION_CHARS)
      const modelKey = boundedText(patch.modelKey, '角色模型', MAX_MODEL_KEY_CHARS, { required: true })
      const persona = boundedText(patch.persona, '角色设定', MAX_ROLE_PERSONA_CHARS, { required: true })
      if (patch.id !== undefined && (typeof patch.id !== 'string' || !/^role-[0-9a-f-]{36}$/i.test(patch.id))) {
        throw new Error('角色标识无效')
      }

      let saved
      await store.update((previous) => {
        const profiles = Array.isArray(previous?.profiles)
          ? previous.profiles.map(normalizeRoleProfile).filter(Boolean)
          : []
        const index = patch.id ? profiles.findIndex((profile) => profile.id === patch.id) : -1
        if (patch.id && index < 0) throw new Error('找不到要修改的角色')
        if (index < 0 && profiles.length >= MAX_ROLE_PROFILES) {
          throw new Error(`最多创建 ${MAX_ROLE_PROFILES} 个角色`)
        }

        const existing = index < 0 ? null : profiles[index]
        saved = {
          id: existing?.id ?? `role-${randomUUID()}`,
          name,
          description,
          modelKey,
          persona,
          stylePreset: roleStylePreset(patch.stylePreset),
          duty: roleDuty(patch.duty, { name, description, persona }),
          createdAt: existing?.createdAt ?? Date.now(),
          updatedAt: Date.now(),
        }
        if (index < 0) profiles.push(saved)
        else profiles[index] = saved
        return { version: 1, profiles }
      })
      return saved
    },

    async remove(id) {
      if (typeof id !== 'string' || !id) throw new Error('角色标识无效')
      let removed = false
      await store.update((previous) => {
        const profiles = Array.isArray(previous?.profiles)
          ? previous.profiles.map(normalizeRoleProfile).filter(Boolean)
          : []
        const next = profiles.filter((profile) => profile.id !== id)
        removed = next.length !== profiles.length
        return { version: 1, profiles: next }
      })
      return removed
    },
  }
}
