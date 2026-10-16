import fs from 'node:fs/promises'
import path from 'node:path'

function assertRunPathSegment(value, label) {
  if (typeof value !== 'string'
    || value.length < 1
    || value.length > 200
    || value === '.'
    || value === '..'
    || /[/\\\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(`运行记录 ${label} 无效`)
  }
  return value
}

export class RunStore {
  constructor({ agentDataPath }) {
    this.basePath = path.join(agentDataPath, 'orchestration')
  }

  async saveRun(conversationId, runId, runState) {
    assertRunPathSegment(conversationId, '会话 ID')
    assertRunPathSegment(runId, 'runId')
    const dir = path.join(this.basePath, conversationId, runId)
    const file = path.join(dir, 'run.json')
    const temp = path.join(dir, `run-${Date.now()}-${Math.random().toString(36).slice(2)}.json.tmp`)
    try {
      await fs.mkdir(dir, { recursive: true })
      const persisted = {
        ...runState,
        createdAt: runState.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      await fs.writeFile(temp, JSON.stringify(persisted, null, 2), 'utf-8')
      await fs.rename(temp, file)
      return true
    } catch (error) {
      await fs.rm(temp, { force: true }).catch(() => {})
      const persistenceError = new Error(
        '无法保存 DAG 运行记录；已停止运行以避免报告不可恢复的状态。请检查应用数据目录的空间和写入权限。',
        { cause: error },
      )
      persistenceError.name = 'RunStoreWriteError'
      persistenceError.code = 'ERUN_STORE_WRITE_FAILED'
      throw persistenceError
    }
  }

  async loadRun(conversationId, runId) {
    try {
      assertRunPathSegment(conversationId, '会话 ID')
      assertRunPathSegment(runId, 'runId')
      const file = path.join(this.basePath, conversationId, runId, 'run.json')
      const data = await fs.readFile(file, 'utf-8')
      return JSON.parse(data)
    } catch {
      return null
    }
  }

  async listConversationIds() {
    try {
      const entries = await fs.readdir(this.basePath, { withFileTypes: true })
      return entries.filter((entry) => entry.isDirectory() && !entry.name.startsWith('.')).map((entry) => entry.name)
    } catch (error) {
      if (error.code === 'ENOENT') return []
      throw error
    }
  }

  async listRuns(conversationId) {
    const conversationPath = path.join(this.basePath, conversationId)
    let entries
    try {
      entries = await fs.readdir(conversationPath, { withFileTypes: true })
    } catch (error) {
      if (error.code === 'ENOENT') return []
      throw error
    }
    const runs = []
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue
      const run = await this.loadRun(conversationId, entry.name)
      if (run) runs.push(run)
    }
    return runs.sort((left, right) => String(right.createdAt ?? '').localeCompare(String(left.createdAt ?? '')))
  }

  async recoverIncompleteRuns() {
    let recoveredCount = 0
    try {
      const convs = await fs.readdir(this.basePath, { withFileTypes: true })
      for (const conv of convs) {
        if (!conv.isDirectory() || conv.name.startsWith('.')) continue
        const convPath = path.join(this.basePath, conv.name)
        let runs
        try {
          runs = await fs.readdir(convPath, { withFileTypes: true })
        } catch {
          continue
        }
        for (const run of runs) {
          if (!run.isDirectory() || run.name.startsWith('.')) continue
          const runFile = path.join(convPath, run.name, 'run.json')
          try {
            const data = await fs.readFile(runFile, 'utf-8')
            const runState = JSON.parse(data)
            let changed = false
            const interruptedRun = ['planning', 'running', 'awaiting_approval', 'paused', 'finalizing', 'interrupted'].includes(runState.status)
            if (interruptedRun && runState.status !== 'interrupted') {
              runState.status = 'interrupted'
              changed = true
            }
            if (Array.isArray(runState.tasks)) {
              runState.tasks = runState.tasks.map(t => {
                if (interruptedRun && ['queued', 'running'].includes(t.status)) {
                  changed = true
                  return { ...t, status: 'interrupted', statusLabel: '已中断', runStatus: 'interrupted' }
                }
                if (interruptedRun && ['awaiting_approval', 'running', 'paused', 'finalizing'].includes(t.runStatus)) {
                  changed = true
                  return { ...t, runStatus: t.status === 'done' ? 'completed' : 'interrupted' }
                }
                return t
              })
            }
            if (changed) {
              await this.saveRun(conv.name, run.name, runState)
              recoveredCount += 1
            }
          } catch (error) {
            if (error?.code === 'ERUN_STORE_WRITE_FAILED') {
              console.error(`Failed to persist recovered DAG run ${conv.name}/${run.name}:`, error.message)
            }
            // Ignore unreadable or malformed older run files; write failures are reported.
          }
        }
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error('Failed to recover incomplete runs:', error)
      }
    }
    return recoveredCount
  }
}
