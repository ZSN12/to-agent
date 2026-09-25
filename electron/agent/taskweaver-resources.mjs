import fs from 'node:fs'
import path from 'node:path'
import { DefaultResourceLoader, SettingsManager } from './agent-runtime.mjs'

function listProjectExtensionFiles(extensionsDir) {
  if (!extensionsDir || !fs.existsSync(extensionsDir)) return []
  const entries = []
  for (const name of fs.readdirSync(extensionsDir)) {
    if (name.startsWith('.')) continue
    const fullPath = path.join(extensionsDir, name)
    let stat
    try {
      stat = fs.statSync(fullPath)
    } catch {
      continue
    }
    if (stat.isFile() && (name.endsWith('.ts') || name.endsWith('.js'))) {
      entries.push(fullPath)
      continue
    }
    if (stat.isDirectory()) {
      const indexTs = path.join(fullPath, 'index.ts')
      const indexJs = path.join(fullPath, 'index.js')
      if (fs.existsSync(indexTs)) entries.push(indexTs)
      else if (fs.existsSync(indexJs)) entries.push(indexJs)
    }
  }
  return entries.sort()
}

import { buildCodingAgentPrompt } from '../backend/coding-agent-prompt.mjs'

export const TASKWEAVER_AUTONOMOUS_PROTOCOL = buildCodingAgentPrompt()

/** Create TaskWeaver-owned, workspace-aware Skills and extension resources. */
export function createTaskWeaverResourceLoader({ cwd, agentDir, builtInSkillsPath, builtInExtensionsPath, projectTrusted = false }) {
  const settingsManager = SettingsManager.create(cwd, agentDir, { projectTrusted: projectTrusted === true })
  const trustedWorkspace = projectTrusted === true
  const additionalSkillPaths = [builtInSkillsPath, path.join(agentDir, 'skills')].filter(Boolean)
  const additionalExtensionPaths = [builtInExtensionsPath].filter(Boolean)

  if (trustedWorkspace) {
    additionalSkillPaths.push(path.join(cwd, '.taskweaver', 'skills'))
    const projectExtensions = listProjectExtensionFiles(path.join(cwd, '.taskweaver', 'extensions'))
    additionalExtensionPaths.push(...projectExtensions)
  }

  const resourceLoader = new DefaultResourceLoader({
    cwd,
    agentDir,
    settingsManager,
    additionalSkillPaths,
    additionalExtensionPaths,
  })

  const originalAppend = typeof resourceLoader.getAppendSystemPrompt === 'function'
    ? resourceLoader.getAppendSystemPrompt.bind(resourceLoader)
    : () => []

  resourceLoader.getAppendSystemPrompt = () => {
    const list = [...originalAppend()]
    list.push(buildCodingAgentPrompt({ workspacePath: cwd }))
    return list
  }

  return { resourceLoader, settingsManager }
}
