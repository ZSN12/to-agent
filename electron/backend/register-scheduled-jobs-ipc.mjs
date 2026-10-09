import fs from 'node:fs/promises'
import path from 'node:path'
import { ipcHandle } from './ipc-utils.mjs'
import {
  installJobLaunchAgent,
  isJobLaunchAgentInstalled,
  removeJobLaunchAgent,
} from './launchd-scheduler.mjs'

async function canonicalWorkspacePath(requestedWorkspace) {
  if (typeof requestedWorkspace !== 'string' || !requestedWorkspace.trim()) {
    throw new Error('定时任务需要先选择工作区')
  }
  const workspacePath = await fs.realpath(path.resolve(requestedWorkspace))
  const workspaceStat = await fs.stat(workspacePath)
  if (!workspaceStat.isDirectory() || workspacePath === path.parse(workspacePath).root) {
    throw new Error('定时任务工作区必须是已存在的非根目录')
  }
  return workspacePath
}

export function registerScheduledJobsIpc({
  ipcMain,
  store,
  runner,
  userDataPath,
  getWorkspacePath = () => null,
  platform = process.platform,
}) {
  ipcHandle(ipcMain, 'jobs:list', () => store.list())
  ipcHandle(ipcMain, 'jobs:upsert', async (_event, job) => {
    const requestedWorkspace = typeof job?.workspacePath === 'string' && job.workspacePath.trim()
      ? job.workspacePath
      : await Promise.resolve(getWorkspacePath())
    const workspacePath = await canonicalWorkspacePath(requestedWorkspace)
    return store.upsert({ ...(job ?? {}), workspacePath })
  })
  ipcHandle(ipcMain, 'jobs:remove', async (_event, jobId) => {
    await removeJobLaunchAgent(jobId)
    return { removed: await store.remove(jobId) }
  })
  ipcHandle(ipcMain, 'jobs:runNow', async (_event, jobId) => {
    await runner.runNow(jobId)
    return { ok: true }
  })
  ipcHandle(ipcMain, 'jobs:installLaunchAgent', async (_event, jobId) => {
    const jobs = await store.list()
    let job = jobs.find((row) => row.id === jobId)
    if (!job) throw new Error('找不到定时任务')
    if (!job.workspacePath) {
      const workspacePath = await canonicalWorkspacePath(await Promise.resolve(getWorkspacePath()))
      job = await store.upsert({ ...job, workspacePath })
    }
    if (job.multiAgent) throw new Error('关闭应用后的 LaunchAgent 暂不支持 DAG 编排；请保持 TaskWeaver 运行，或关闭该任务的多 Agent 选项')
    return installJobLaunchAgent(job, userDataPath)
  })
  ipcHandle(ipcMain, 'jobs:removeLaunchAgent', async (_event, jobId) => removeJobLaunchAgent(jobId))
  ipcHandle(ipcMain, 'jobs:launchAgentInstalled', async (_event, jobId) => ({
    installed: await isJobLaunchAgentInstalled(jobId),
    platform,
  }))
}
