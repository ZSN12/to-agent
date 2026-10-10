import { assertAllChannelsRegistered, ipcHandle } from './ipc-utils.mjs'
import { INVOKE_CHANNELS } from '../ipc/channels.mjs'
import { composeBackendServices } from './compose-services.mjs'
import { wireBackendIpc } from './ipc/wire-backend-ipc.mjs'
import startupTrace from '../startup-trace.cjs'

const { traceStartup } = startupTrace

/**
 * 注册全部主进程 IPC（compose 服务 → wire 各领域 handler）。
 */
export async function registerIpc({ ipcMain, app, dialog, BrowserWindow, safeStorage, net }) {
  let resolveReady
  const ready = new Promise((resolve) => { resolveReady = resolve })
  ipcHandle(ipcMain, 'backend:ready', () => ready)
  traceStartup('ipc:registration-start')

  try {
    traceStartup('backend:compose-start')
    const ctx = await composeBackendServices({ app, dialog, BrowserWindow, safeStorage, net })
    traceStartup('backend:compose-end')
    const services = wireBackendIpc({ ipcMain, app, dialog, BrowserWindow, ctx })

    if (process.env.TASKWEAVER_STRICT_IPC === '1') {
      assertAllChannelsRegistered(INVOKE_CHANNELS)
    }

    resolveReady({ ready: true })
    traceStartup('ipc:registration-end')
    return services
  } catch (error) {
    resolveReady({ ready: false, error: error instanceof Error ? error.message : String(error) })
    traceStartup('ipc:registration-failed')
    throw error
  }
}
