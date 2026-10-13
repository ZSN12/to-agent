/**
 * 简化的 Skill 加载器，用于 TaskWeaver 文件系统 Skill 发现
 * 基于 DSH skill-filesystem 的简化实现
 */

import fs from 'fs/promises'
import path from 'path'
import { parse as parseYaml } from 'yaml'

/**
 * 从指定路径加载技能列表
 * @param {Object} options
 * @param {string} options.cwd - 当前工作目录
 * @param {string} options.agentDir - Agent 数据目录
 * @param {string[]} options.skillPaths - 技能搜索路径列表
 * @param {boolean} options.includeDefaults - 是否包含默认技能
 * @returns {Promise<{skills: Array}>}
 */
export async function loadSkills({ cwd, agentDir, skillPaths, includeDefaults = false }) {
  const skills = []
  const seen = new Set()

  for (const rootPath of skillPaths) {
    try {
      const entries = await fs.readdir(rootPath, { withFileTypes: true })

      for (const entry of entries) {
        const skillPath = path.join(rootPath, entry.name)

        // 目录形式的 Skill (包含 SKILL.md)
        if (entry.isDirectory()) {
          const skillFile = path.join(skillPath, 'SKILL.md')
          try {
            await fs.access(skillFile)
            const skill = await loadSkillFromFile(skillFile, entry.name, rootPath)
            if (skill && !seen.has(skill.name)) {
              skills.push(skill)
              seen.add(skill.name)
            }
          } catch {
            // 目录中没有 SKILL.md，跳过
          }
        }
        // 单文件形式的 Skill (.md)
        else if (entry.isFile() && entry.name.endsWith('.md')) {
          const skillName = entry.name.replace(/\.md$/, '')
          const skill = await loadSkillFromFile(skillPath, skillName, rootPath)
          if (skill && !seen.has(skill.name)) {
            skills.push(skill)
            seen.add(skill.name)
          }
        }
      }
    } catch (error) {
      // 路径不存在或无法读取，跳过
      console.warn(`无法读取 Skill 目录: ${rootPath}`, error.message)
    }
  }

  return { skills }
}

/**
 * 从文件加载单个技能
 * @param {string} filePath - 技能文件路径
 * @param {string} skillName - 技能名称
 * @param {string} baseDir - 基础目录
 * @returns {Promise<Object|null>}
 */
async function loadSkillFromFile(filePath, skillName, baseDir) {
  try {
    const content = await fs.readFile(filePath, 'utf8')
    const frontmatter = extractFrontmatter(content)

    // 验证技能名称格式 (kebab-case)
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(skillName)) {
      console.warn(`Skill 名称格式不正确: ${skillName}`)
      return null
    }

    return {
      name: frontmatter.name || skillName,
      description: frontmatter.description || frontmatter.summary || '',
      path: filePath,
      baseDir,
      source: 'filesystem',
      multiAgent: false,
      // 可选的元数据
      triggers: frontmatter.triggers || [],
      requires: frontmatter.requires || [],
    }
  } catch (error) {
    console.warn(`无法加载 Skill: ${filePath}`, error.message)
    return null
  }
}

/**
 * 从 Markdown 内容提取 YAML frontmatter
 * @param {string} content - Markdown 内容
 * @returns {Object} 解析后的 frontmatter 对象
 */
function extractFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return {}

  try {
    return parseYaml(match[1]) || {}
  } catch (error) {
    console.warn('无法解析 Skill frontmatter:', error.message)
    return {}
  }
}

/**
 * 判断是否为多 Agent Skill
 * @param {string} name - Skill 名称
 * @returns {boolean}
 */
export function isMultiAgentSkill(name) {
  // 多 Agent Skill 通常包含特定关键词
  const multiAgentKeywords = ['workflow', 'team', 'multi', 'parallel', 'orchestrat']
  return multiAgentKeywords.some(keyword => name.includes(keyword))
}