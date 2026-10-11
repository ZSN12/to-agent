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
  await hostManager.start()
  await ensureModelsJsonSyncedToDshHost({
    hostManager,
    userDataPath,
    credentialStore,
  })
  await modelService.refreshCatalog()
  if (enrichModels) return enrichModels()
  return null
}
