import { assertAllChannelsRegistered } from './ipc-utils.mjs'
import { INVOKE_CHANNELS } from '../ipc/channels.mjs'
import { composeBackendServices } from './compose-services.mjs'
import { wireBackendIpc } from './ipc/wire-backend-ipc.mjs'

/**
 * 注册全部主进程 IPC（compose 服务 → wire 各领域 handler）。
 */
export async function registerIpc({ ipcMain, app, dialog, BrowserWindow, safeStorage, net }) {
  const ctx = await composeBackendServices({ app, dialog, BrowserWindow, safeStorage, net })
  const services = wireBackendIpc({ ipcMain, app, dialog, BrowserWindow, ctx })

  if (process.env.TASKWEAVER_STRICT_IPC === '1') {
    assertAllChannelsRegistered(INVOKE_CHANNELS)
  }

  return services
}
