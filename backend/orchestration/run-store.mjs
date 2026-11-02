import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { QueuedWriter } from './aggregation-utils.mjs'
import { createTaskHandoff } from './task-handoff.mjs'

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
    this.writer = new QueuedWriter()
  }

  async saveRun(conversationId, runId, runState) {
    assertRunPathSegment(conversationId, '会话 ID')
    assertRunPathSegment(runId, 'runId')
    const snapshot = JSON.parse(JSON.stringify(runState))
    const queueKey = `${conversationId}/${runId}`
    return this.writer.enqueueForKey(`run:${queueKey}`, () => this.persistRunSnapshot(conversationId, runId, snapshot))
  }

  async persistRunSnapshot(conversationId, runId, runState) {
    const dir = path.join(this.basePath, conversationId, runId)
    const file = path.join(dir, 'run.json')
    const temp = path.join(dir, `run-${crypto.randomUUID()}.json.tmp`)
    try {
      await fs.mkdir(dir, { recursive: true, mode: 0o700 })
      const persisted = {
        ...runState,
        createdAt: runState.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      await fs.writeFile(temp, `${JSON.stringify(persisted, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
      await fs.rename(temp, file)
      for (const task of Array.isArray(persisted.tasks) ? persisted.tasks : []) {
        const hasSuccessfulResult = task?.status === 'done'
          || task?.status === 'completed'
          || task?.statusLabel === '已完成'
        if (hasSuccessfulResult) {
          // run.json is the durable result once a node has passed its completion gate.
          // Keep external handoff files only while a node may still need resuming.
          try {
            await this.deleteTaskHandoff(conversationId, runId, task.id)
          } catch (cleanupError) {
            console.error('Failed to remove consumed DAG task handoff:', cleanupError?.code ?? cleanupError?.name ?? 'unknown')
          }
        } else {
          await this.saveTaskHandoff(conversationId, runId, createTaskHandoff(persisted, task), { preserveToolProgress: true })
        }
      }
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

  async saveTaskHandoff(conversationId, runId, handoff, { preserveToolProgress = false } = {}) {
    assertRunPathSegment(conversationId, '会话 ID')
    assertRunPathSegment(runId, 'runId')
    const taskId = assertRunPathSegment(handoff?.node?.id, '子任务 ID')
    const snapshot = JSON.parse(JSON.stringify(handoff))
    const queueKey = `${conversationId}/${runId}/${taskId}`
    return this.writer.enqueueForKey(`handoff:${queueKey}`, async () => {
      if (preserveToolProgress) {
        const file = path.join(this.basePath, conversationId, runId, 'handoffs', `${taskId}.json`)
        let previous
        try {
          previous = JSON.parse(await fs.readFile(file, 'utf8'))
        } catch (error) {
          if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error
        }
        if (previous?.schema === snapshot.schema
          && previous?.conversationId === conversationId
          && previous?.currentRunId === runId
          && previous?.node?.id === taskId
          && Array.isArray(previous.progress?.recentToolCalls)
          && previous.progress.recentToolCalls.length > 0) {
          snapshot.progress.recentToolCalls = previous.progress.recentToolCalls
        }
      }
      return this.persistTaskHandoff(conversationId, runId, taskId, snapshot)
    })
  }

  async persistTaskHandoff(conversationId, runId, taskId, handoff) {
    const dir = path.join(this.basePath, conversationId, runId, 'handoffs')
    const file = path.join(dir, `${taskId}.json`)
    const temp = path.join(dir, `${taskId}-${crypto.randomUUID()}.json.tmp`)
    await fs.mkdir(dir, { recursive: true, mode: 0o700 })
    try {
      await fs.writeFile(temp, `${JSON.stringify(handoff, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
      await fs.rename(temp, file)
      return true
    } catch (error) {
      await fs.rm(temp, { force: true }).catch(() => {})
      throw error
    }
  }

  async deleteTaskHandoff(conversationId, runId, taskId) {
    assertRunPathSegment(conversationId, '会话 ID')
    assertRunPathSegment(runId, 'runId')
    assertRunPathSegment(taskId, '子任务 ID')
    const queueKey = `${conversationId}/${runId}/${taskId}`
    return this.writer.enqueueForKey(`handoff:${queueKey}`, async () => {
      const dir = path.join(this.basePath, conversationId, runId, 'handoffs')
      const file = path.join(dir, `${taskId}.json`)
      try {
        await fs.unlink(file)
      } catch (error) {
        if (error.code !== 'ENOENT') throw error
      }
      try {
        await fs.rmdir(dir)
      } catch (error) {
        if (!['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes(error.code)) throw error
      }
      return true
    })
  }

  async deleteTaskHandoffs(conversationId, runId, taskIds = null) {
    assertRunPathSegment(conversationId, '会话 ID')
    assertRunPathSegment(runId, 'runId')
    let ids = taskIds
    if (!Array.isArray(ids)) {
      const dir = path.join(this.basePath, conversationId, runId, 'handoffs')
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true })
        ids = entries
          .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
          .map((entry) => entry.name.slice(0, -'.json'.length))
      } catch (error) {
        if (error.code === 'ENOENT') return []
        throw error
      }
    }
    const safeIds = [...new Set(ids.map((id) => assertRunPathSegment(id, '子任务 ID')))]
    await Promise.all(safeIds.map((id) => this.deleteTaskHandoff(conversationId, runId, id)))
    return safeIds
  }

  async loadTaskHandoffs(conversationId, runId, sourceRun) {
    assertRunPathSegment(conversationId, '会话 ID')
    assertRunPathSegment(runId, 'runId')
    const tasks = Array.isArray(sourceRun?.tasks) ? sourceRun.tasks : []
    const entries = await Promise.all(tasks.map(async (task) => {
      const taskId = assertRunPathSegment(task?.id, '子任务 ID')
      const file = path.join(this.basePath, conversationId, runId, 'handoffs', `${taskId}.json`)
      try {
        const handoff = JSON.parse(await fs.readFile(file, 'utf8'))
        if (handoff?.schema === 'taskweaver-dag-node-handoff'
          && handoff?.node?.id === taskId
          && handoff?.conversationId === conversationId
          && handoff?.currentRunId === runId) {
          return [taskId, handoff]
        }
      } catch {
        // Older runs do not have handoff files; rebuild a bounded checkpoint from run.json.
      }
      return [taskId, createTaskHandoff(sourceRun, task)]
    }))
    return Object.fromEntries(entries)
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
