import { pruneLegacyOpenCodexProvider } from './prune-legacy-opencodex-provider.mjs'

/**
 * Move user selections from legacy `opencodex/*` keys to `bridge-composer/*`.
 */
export async function migrateLegacyOpenCodexRoutes({
  profileStore,
  modelService,
  userDataPath,
  hostManager,
  credentialStore,
  ensureModelsJsonSyncedToDshHost,
}) {
  const { changed, migrated } = await profileStore.migrateOpenCodexRoutesToBridge()
  if (!changed || !migrated.length) {
    const prune = userDataPath && hostManager
      ? await pruneLegacyOpenCodexProvider({
        userDataPath,
        profileStore,
        hostManager,
        credentialStore,
        ensureModelsJsonSyncedToDshHost,
      })
      : { pruned: false, reason: 'missing-context' }
    return { changed: false, migrated: [], hostRegistered: [], hostSkipped: [], prune }
  }

  const hostRegistered = []
  const hostSkipped = []
  let catalog = await modelService.listCatalog()
  const routable = new Set([
    ...(catalog?.models ?? []).map((row) => row.key),
    ...(catalog?.candidateModels ?? []).map((row) => row.key),
  ])

  for (const { to } of migrated) {
    if (!routable.has(to)) {
      hostSkipped.push({ modelKey: to, reason: 'not-in-catalog' })
      continue
    }
    try {
      await modelService.addModel(to)
      hostRegistered.push(to)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (/已添加|already/i.test(message)) {
        hostRegistered.push(to)
        continue
      }
      hostSkipped.push({ modelKey: to, reason: message })
    }
  }

  await modelService.refreshCatalog()
  const prune = userDataPath && hostManager
    ? await pruneLegacyOpenCodexProvider({
      userDataPath,
      profileStore,
      hostManager,
      credentialStore,
      ensureModelsJsonSyncedToDshHost,
    })
    : { pruned: false, reason: 'missing-context' }
  return { changed: true, migrated, hostRegistered, hostSkipped, prune }
}
