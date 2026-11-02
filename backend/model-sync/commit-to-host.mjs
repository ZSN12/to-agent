import { writeExportSnapshot } from './snapshot.mjs'

/**
 * Persist export snapshot + sync models.json into Z Host + refresh catalog.
 */
export async function commitToHost({
  userDataPath,
  credentialStore,
  hostManager,
  modelService,
  ensureModelsJsonSyncedToDshHost,
  exportDoc,
  enrichModels,
}) {
  await writeExportSnapshot(userDataPath, exportDoc)
  if (hostManager?.start) {
    await hostManager.start()
  }
  if (typeof ensureModelsJsonSyncedToDshHost === 'function') {
    await ensureModelsJsonSyncedToDshHost({
      hostManager,
      userDataPath,
      credentialStore,
    })
  }
  if (typeof modelService?.refreshCatalog === 'function') {
    await modelService.refreshCatalog()
  }
  if (enrichModels) return enrichModels()
  return null
}
