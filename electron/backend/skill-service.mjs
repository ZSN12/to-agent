import path from 'node:path'
import fs from 'node:fs/promises'
import { loadSkills } from '../agent/agent-runtime.mjs'

/**
 * TaskWeaver's Skill catalog. Skills are discovered from the app's own data
 * directory and the trusted workspace only; we never reach into another
 * coding agent's home directory.
 */
export function createSkillService({ agentDataPath, builtInSkillsPath, getWorkspacePath, getWorkspaceTrusted = () => false }) {
  function loadCatalog() {
    const cwd = getWorkspacePath()
    const projectSkillsPath = cwd ? path.join(cwd, '.taskweaver', 'skills') : null
    const paths = [builtInSkillsPath, path.join(agentDataPath, 'skills')].filter(Boolean)
    if (projectSkillsPath && getWorkspaceTrusted()) paths.push(projectSkillsPath)

    const result = loadSkills({ cwd: cwd ?? agentDataPath, agentDir: agentDataPath, skillPaths: paths, includeDefaults: false })
    return result.skills.map((skill) => ({
      name: skill.name,
      description: skill.description,
      path: skill.filePath,
      baseDir: skill.baseDir,
      source: skill.filePath.startsWith(agentDataPath) || skill.filePath.startsWith(builtInSkillsPath) ? 'app' : 'workspace',
      multiAgent: /multi[-\s]?agent|agent[-\s]?teams?|多智能体/i.test(skill.name),
    }))
  }

  return {
    list() {
      return loadCatalog()
    },
    async resolve(name) {
      if (!name) return null
      const skill = loadCatalog().find((item) => item.name === name)
      if (!skill) throw new Error(`找不到可用的 Skill：${name}`)
      const source = await fs.readFile(skill.path, 'utf8')
      const instructions = source.replace(/^---\r?\n[\s\S]*?\r?\n---\s*(?:\r?\n|$)/, '').trim()
      if (!instructions) throw new Error(`Skill「${name}」没有可执行的指令内容`)
      return { ...skill, instructions }
    },
  }
}
