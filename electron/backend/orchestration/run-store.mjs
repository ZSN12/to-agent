import fs from 'node:fs/promises'
import path from 'node:path'

export class RunStore {
  constructor({ agentDataPath }) {
    this.basePath = path.join(agentDataPath, 'orchestration')
  }

  async saveRun(conversationId, runId, runState) {
    try {
      const dir = path.join(this.basePath, conversationId, runId)
      await fs.mkdir(dir, { recursive: true })
      const file = path.join(dir, 'run.json')
      const temp = path.join(dir, `run-${Date.now()}-${Math.random().toString(36).slice(2)}.json.tmp`)
      await fs.writeFile(temp, JSON.stringify(runState, null, 2), 'utf-8')
      await fs.rename(temp, file)
    } catch (error) {
      console.error(`Failed to save run state for ${conversationId}/${runId}:`, error)
    }
  }

  async loadRun(conversationId, runId) {
    try {
      const file = path.join(this.basePath, conversationId, runId, 'run.json')
      const data = await fs.readFile(file, 'utf-8')
      return JSON.parse(data)
    } catch {
      return null
    }
  }

  async recoverIncompleteRuns() {
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
            if (['running', 'awaiting_approval'].includes(runState.status)) {
              runState.status = 'interrupted'
              changed = true
            }
            if (Array.isArray(runState.tasks)) {
              runState.tasks = runState.tasks.map(t => {
                if (['queued', 'running'].includes(t.status)) {
                  changed = true
                  return { ...t, status: 'interrupted', statusLabel: '已中断' }
                }
                return t
              })
            }
            if (changed) {
              await this.saveRun(conv.name, run.name, runState)
            }
          } catch {
            // ignore
          }
        }
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error('Failed to recover incomplete runs:', error)
      }
    }
  }
}
