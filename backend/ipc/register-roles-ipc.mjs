import { ipcHandle } from '../ipc-utils.mjs'

/** @param {{ ipcMain: import('electron').IpcMain, roleProfileStore: ReturnType<import('../role-profile-store.mjs').createRoleProfileStore>, profileStore: ReturnType<import('../profile-store.mjs').createProfileStore> }} ctx */
export function registerRolesIpc({ ipcMain, roleProfileStore, profileStore }) {
  ipcHandle(ipcMain, 'roles:list', () => roleProfileStore.list())
  ipcHandle(ipcMain, 'roles:upsert', async (_event, patch) => {
    const added = new Set(await profileStore.listAddedModelKeys())
    if (!added.has(patch?.modelKey)) throw new Error('角色绑定的模型尚未添加到 TaskWeaver')
    return roleProfileStore.upsert(patch)
  })
  ipcHandle(ipcMain, 'roles:remove', async (_event, id) => ({ removed: await roleProfileStore.remove(id) }))
}
