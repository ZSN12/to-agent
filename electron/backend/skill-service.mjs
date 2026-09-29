import path from 'node:path'
import fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { loadSkills } from './skill-loader.mjs'

function skillsCatalogSessionId(cwd) {
  // DSH session IDs are durable and a session cannot be reattached under a
  // different working directory. Scope the catalog session to the workspace
  // so switching projects never leaks a stale project Skill registry.
  const digest = createHash('sha256').update(path.resolve(cwd)).digest('hex').slice(0, 20)
  return `tw-skills-catalog-${digest}`
}

function rpcValue(response, operation) {
  const result = response?.result ?? response
  if (result?.ok === false) {
    const error = result.error ?? {}
    throw new Error(error.message || `${operation} failed`)
  }
  return result?.value ?? result
}

function isMultiAgentSkill(name) {
  return /multi[-\s]?agent|agent[-\s]?teams?|多智能体/i.test(name)
}

function mapFilesystemSkill(skill, { agentDataPath, builtInSkillsPath }) {
  const skillPath = skill.path ?? skill.filePath ?? ''
  return {
    name: skill.name,
    description: skill.description,
    path: skillPath,
    baseDir: skill.baseDir,
    source: skillPath.startsWith(agentDataPath) || skillPath.startsWith(builtInSkillsPath) ? 'app' : 'workspace',
    multiAgent: isMultiAgentSkill(skill.name),
  }
}

/**
 * TaskWeaver Skill catalog: DSH `api.skills.list` is authoritative for discovery;
 * instruction bodies still load from TaskWeaver filesystem paths when present.
 */
export function createSkillService({
  agentDataPath,
  builtInSkillsPath,
  getWorkspacePath,
  getWorkspaceTrusted = () => false,
  hostManager = null,
}) {
  async function loadFilesystemCatalog() {
    const cwd = getWorkspacePath()
    const projectSkillsPath = cwd ? path.join(cwd, '.taskweaver', 'skills') : null
    const paths = [builtInSkillsPath, path.join(agentDataPath, 'skills')].filter(Boolean)
    if (projectSkillsPath && getWorkspaceTrusted()) paths.push(projectSkillsPath)

    const result = await loadSkills({ cwd: cwd ?? agentDataPath, agentDir: agentDataPath, skillPaths: paths, includeDefaults: false })
    return result.skills.map((skill) => mapFilesystemSkill(skill, { agentDataPath, builtInSkillsPath }))
  }

  function mergeCatalogs(dshSkills, filesystemSkills) {
    const byName = new Map(filesystemSkills.map((skill) => [skill.name, skill]))
    const merged = []
    const seen = new Set()
    for (const entry of dshSkills ?? []) {
      if (!entry?.name || seen.has(entry.name)) continue
      seen.add(entry.name)
      const fsSkill = byName.get(entry.name)
      merged.push({
        name: entry.name,
        description:
          entry.description?.trim()
          || entry.whenToUse?.trim()
          || fsSkill?.description
          || '',
        path: fsSkill?.path ?? '',
        baseDir: fsSkill?.baseDir,
        source: fsSkill?.source ?? 'dsh',
        sourceLabel: fsSkill ? undefined : 'DSH',
        multiAgent: isMultiAgentSkill(entry.name),
      })
    }
    for (const fsSkill of filesystemSkills) {
      if (seen.has(fsSkill.name)) continue
      merged.push(fsSkill)
    }
    return merged
  }

  async function listFromDsh() {
    if (!hostManager) return null
    const { api } = await hostManager.start()
    const cwd = getWorkspacePath() || agentDataPath
    const sessionId = skillsCatalogSessionId(cwd)
    rpcValue(await api.sessions.create({ sessionId, cwd }), '创建 DSH Skill 目录会话')
    const value = rpcValue(await api.skills.list({ sessionId }), '读取 DSH Skill 列表')
    return value?.skills ?? []
  }

  return {
    async list() {
      const filesystemSkills = await loadFilesystemCatalog()
      try {
        const dshSkills = await listFromDsh()
        if (dshSkills) return mergeCatalogs(dshSkills, filesystemSkills)
      } catch {
        // DSH Host 未就绪时回退到 TaskWeaver 本地发现。
      }
      return filesystemSkills
    },
    async resolve(name) {
      if (!name) return null
      const skill = (await this.list()).find((item) => item.name === name)
      if (!skill) throw new Error(`找不到可用的 Skill：${name}`)
      if (!skill.path) {
        // DSH's `skill.list` intentionally exposes no filesystem path or body.
        // Its supported user invocation is a first-line `/<name>` gesture in
        // the DSH user message; let the chat adapter carry this explicit marker
        // rather than pretending TaskWeaver loaded instructions it cannot read.
        if (skill.source !== 'dsh' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(skill.name)) {
          throw new Error(`Skill「${name}」当前没有可读取的指令文件，不能在 TaskWeaver 中执行。`)
        }
        return { ...skill, instructions: '', nativeInvocation: `/${skill.name}`, instructionSource: 'dsh-native' }
      }
      const source = await fs.readFile(skill.path, 'utf8')
      const instructions = source.replace(/^---\r?\n[\s\S]*?\r?\n---\s*(?:\r?\n|$)/, '').trim()
      if (!instructions) throw new Error(`Skill「${name}」没有可执行的指令内容`)
      return { ...skill, instructions }
    },
  }
}
