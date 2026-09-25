import fs from 'node:fs/promises'
import path from 'node:path'

function emptyMemory(conversationId, workspacePath, userGoal) {
  return {
    conversation_id: conversationId,
    workspace_path: workspacePath ?? null,
    user_goal: userGoal ?? '',
    rolling_summary: '',
    dependency_outputs: {},
    facts: [],
    evidence_bundles: [],
    updated_at: new Date().toISOString(),
  }
}

export function createMemoryStore({ agentDataPath }) {
  const baseDir = path.join(agentDataPath, 'memory')

  function filePath(conversationId) {
    return path.join(baseDir, `${conversationId}.json`)
  }

  async function load(conversationId) {
    try {
      const raw = await fs.readFile(filePath(conversationId), 'utf8')
      return JSON.parse(raw)
    } catch {
      return null
    }
  }

  async function save(conversationId, memory) {
    await fs.mkdir(baseDir, { recursive: true })
    const next = { ...memory, updated_at: new Date().toISOString() }
    await fs.writeFile(filePath(conversationId), `${JSON.stringify(next, null, 2)}\n`, 'utf8')
    return next
  }

  async function init(conversationId, workspacePath, userGoal) {
    const existing = await load(conversationId)
    if (existing) {
      const merged = {
        ...existing,
        user_goal: userGoal || existing.user_goal,
        workspace_path: workspacePath ?? existing.workspace_path,
      }
      return save(conversationId, merged)
    }
    return save(conversationId, emptyMemory(conversationId, workspacePath, userGoal))
  }

  async function recordTaskResult(conversationId, task, result) {
    const memory = (await load(conversationId)) ?? emptyMemory(conversationId, null, '')
    const snippet = (result?.text || '').trim().slice(0, 4000)
    memory.dependency_outputs[task.id] = {
      text: snippet,
      title: task.title,
      taskType: task.taskType,
      status: task.statusLabel ?? task.status,
    }
    const line = `${task.id}（${task.title}）：${snippet.slice(0, 280)}`
    memory.rolling_summary = memory.rolling_summary
      ? `${memory.rolling_summary}\n${line}`.trim().slice(-6000)
      : line
    return save(conversationId, memory)
  }

  return { load, save, init, recordTaskResult }
}

/** Build L0–L2 blocks for sub-task prompts (see 设计方案 §5.6). */
export function buildMemoryPromptSections(memory, task, dependencyResults = {}) {
  const sections = []
  if (memory?.user_goal) {
    sections.push(`【项目目标 L0】\n${memory.user_goal}`)
  }
  if (memory?.rolling_summary) {
    sections.push(`【进展摘要 L1】\n${memory.rolling_summary}`)
  }
  const depIds = task?.dependsOn?.length ? task.dependsOn : Object.keys(dependencyResults)
  const depBlocks = []
  for (const id of depIds) {
    const fromMemory = memory?.dependency_outputs?.[id]
    const fromRun = dependencyResults[id]
    const text = fromMemory?.text || fromRun?.text
    if (text) depBlocks.push(`[${id}]\n${text}`)
  }
  if (depBlocks.length) {
    sections.push(`【依赖任务输出 L2】\n${depBlocks.join('\n\n')}`)
  } else {
    sections.push('【依赖任务输出 L2】\n无前置子任务结果。')
  }
  return sections.join('\n\n')
}
