import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  EMBEDDED_WEB_PROFILE_BUNDLES,
  migrateLegacyProfileManifests,
  migrateRuntimeHome,
  resolveTaskWeaverRuntimeHome,
  removeLegacyRuntimeHome,
  removeStaleRetiredRuntimeHomes,
} from '../desktop/agent/z-host/migrate-z-home.mjs'
import { resolveRuntimeHome as resolveElectronRuntimeHome } from '../desktop/backend/dsh-pi-ai-credentials.mjs'

async function runTests() {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-runtime-home-'))
  const home = path.join(tempRoot, 'os-home')
  await fs.mkdir(home)
  try {
    assert.equal(
      resolveTaskWeaverRuntimeHome({ env: {}, home }),
      path.join(home, '.taskweaver', 'runtime'),
      'the new default should be ~/.taskweaver/runtime',
    )
    assert.equal(
      resolveTaskWeaverRuntimeHome({ env: { TASKWEAVER_HOME: '~/custom-runtime' }, home }),
      path.join(home, 'custom-runtime'),
      'the canonical home override should expand a tilde path',
    )
    assert.equal(
      resolveTaskWeaverRuntimeHome({ env: { TASKWEAVER_HOME: '~\\custom\\runtime' }, home }),
      path.join(home, 'custom', 'runtime'),
      'Windows-style tilde paths should normalize on the current platform',
    )

    const previousCanonicalHome = process.env.TASKWEAVER_HOME
    const previousZHome = process.env.Z_HOME
    const previousDshHome = process.env.DSH_HOME
    try {
      process.env.TASKWEAVER_HOME = path.join(tempRoot, 'canonical-credentials-home')
      process.env.Z_HOME = path.join(tempRoot, 'legacy-z-credentials-home')
      process.env.DSH_HOME = path.join(tempRoot, 'legacy-dsh-credentials-home')
      assert.equal(resolveElectronRuntimeHome(), path.join(tempRoot, 'canonical-credentials-home'))
      delete process.env.TASKWEAVER_HOME
      assert.equal(resolveElectronRuntimeHome(), path.join(tempRoot, 'legacy-z-credentials-home'))
    } finally {
      if (previousCanonicalHome === undefined) delete process.env.TASKWEAVER_HOME
      else process.env.TASKWEAVER_HOME = previousCanonicalHome
      if (previousZHome === undefined) delete process.env.Z_HOME
      else process.env.Z_HOME = previousZHome
      if (previousDshHome === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = previousDshHome
    }

    // First launch with an old explicit Z_HOME copies all user data and keeps
    // the old tree intact for one release as a rollback source.
    const oldZHome = path.join(tempRoot, 'old-z-home')
    await fs.mkdir(path.join(oldZHome, 'sessions'), { recursive: true })
    await fs.writeFile(path.join(oldZHome, 'sessions', 'history.jsonl'), '{"type":"session"}\n')
    await fs.writeFile(path.join(oldZHome, '.credentials.yaml'), 'version: 1\n', { mode: 0o600 })
    await fs.symlink('sessions/history.jsonl', path.join(oldZHome, 'latest-session'))
    const newHome = path.join(home, '.taskweaver', 'runtime')
    const warnings = []
    const originalWarn = console.warn
    console.warn = (message) => warnings.push(String(message))
    let first
    try {
      first = await migrateRuntimeHome({ env: { Z_HOME: oldZHome }, home })
    } finally {
      console.warn = originalWarn
    }
    assert.equal(first.migrated, true)
    assert.equal(first.runtimeHomePath, newHome)
    assert.equal(first.source, oldZHome)
    assert.equal(await fs.readFile(path.join(newHome, 'sessions', 'history.jsonl'), 'utf8'), '{"type":"session"}\n')
    assert.equal(await fs.readFile(path.join(newHome, '.credentials.yaml'), 'utf8'), 'version: 1\n')
    assert.equal((await fs.lstat(path.join(newHome, 'latest-session'))).isSymbolicLink(), true)
    assert.equal(await fs.readlink(path.join(newHome, 'latest-session')), 'sessions/history.jsonl')
    assert.equal(await fs.readFile(path.join(oldZHome, 'sessions', 'history.jsonl'), 'utf8'), '{"type":"session"}\n')
    assert.ok(warnings.some((message) => message.includes('Z_HOME') && message.includes('TASKWEAVER_HOME')))

    // A legacy home whose root is a symlink still becomes an independent
    // directory; links within the copied tree remain intact.
    const linkedLegacyTarget = path.join(tempRoot, 'linked-legacy-target')
    const linkedLegacyHome = path.join(tempRoot, 'linked-legacy-home')
    await fs.mkdir(linkedLegacyTarget)
    await fs.writeFile(path.join(linkedLegacyTarget, 'state.json'), '{"kept":true}\n')
    await fs.symlink(linkedLegacyTarget, linkedLegacyHome, process.platform === 'win32' ? 'junction' : 'dir')
    const linkedMigration = await migrateRuntimeHome({
      env: { TASKWEAVER_HOME: path.join(tempRoot, 'linked-migration-target'), Z_HOME: linkedLegacyHome },
      home,
    })
    assert.equal(linkedMigration.migrated, true)
    assert.equal((await fs.lstat(linkedMigration.runtimeHomePath)).isDirectory(), true)
    assert.equal((await fs.lstat(linkedMigration.runtimeHomePath)).isSymbolicLink(), false)
    assert.equal(await fs.readFile(path.join(linkedMigration.runtimeHomePath, 'state.json'), 'utf8'), '{"kept":true}\n')
    assert.equal(await fs.readFile(path.join(linkedLegacyTarget, 'state.json'), 'utf8'), '{"kept":true}\n')

    // Repeat startup is a no-op. New canonical data wins over later legacy data.
    await fs.writeFile(path.join(newHome, 'keep.txt'), 'new')
    const second = await migrateRuntimeHome({ env: { Z_HOME: oldZHome }, home })
    assert.equal(second.migrated, false)
    assert.equal(second.reason, 'destination-exists')
    assert.equal(await fs.readFile(path.join(newHome, 'keep.txt'), 'utf8'), 'new')

    // DSH_HOME remains a read-only source alias, and Electron's old userData
    // layouts are also recognized when no environment override exists.
    const legacyDsh = path.join(tempRoot, 'old-dsh-home')
    await fs.mkdir(legacyDsh)
    await fs.writeFile(path.join(legacyDsh, 'marker'), 'from-dsh')
    const dshResult = await migrateRuntimeHome({
      env: { TASKWEAVER_HOME: path.join(tempRoot, 'canonical-dsh-target'), DSH_HOME: legacyDsh },
      home,
    })
    assert.equal(dshResult.source, legacyDsh)
    assert.equal(await fs.readFile(path.join(dshResult.runtimeHomePath, 'marker'), 'utf8'), 'from-dsh')
    assert.equal(await fs.readFile(path.join(legacyDsh, 'marker'), 'utf8'), 'from-dsh')

    const userData = path.join(tempRoot, 'electron-user-data')
    await fs.mkdir(path.join(userData, 'z'), { recursive: true })
    await fs.writeFile(path.join(userData, 'z', 'from-electron-user-data'), 'preserved')
    const userDataResult = await migrateRuntimeHome({
      env: { TASKWEAVER_HOME: path.join(tempRoot, 'electron-migration-target') },
      home,
      userDataPath: userData,
    })
    assert.equal(userDataResult.sourceKind, 'legacy-electron:z')
    assert.equal(await fs.readFile(path.join(userDataResult.runtimeHomePath, 'from-electron-user-data'), 'utf8'), 'preserved')

    // A pre-existing canonical target is never overwritten by the old tree.
    const conflictTarget = path.join(tempRoot, 'conflict-target')
    const conflictSource = path.join(tempRoot, 'conflict-source')
    await fs.mkdir(conflictTarget)
    await fs.writeFile(path.join(conflictTarget, 'winner'), 'canonical')
    await fs.mkdir(conflictSource)
    await fs.writeFile(path.join(conflictSource, 'loser'), 'legacy')
    const conflict = await migrateRuntimeHome({
      env: { TASKWEAVER_HOME: conflictTarget, Z_HOME: conflictSource },
      home,
    })
    assert.equal(conflict.migrated, false)
    assert.equal(await fs.readFile(path.join(conflictTarget, 'winner'), 'utf8'), 'canonical')
    await assert.rejects(fs.access(path.join(conflictTarget, 'loser')), { code: 'ENOENT' })

    // Profile migration canonicalizes metadata, dependency scope, and bundle
    // names. A second pass must not rewrite the manifest again.
    const profile = path.join(tempRoot, 'profile-target', 'profiles', 'legacy')
    await fs.mkdir(profile, { recursive: true })
    const manifestPath = path.join(profile, 'package.json')
    await fs.writeFile(manifestPath, `${JSON.stringify({
      name: 'dsh-profile-legacy',
      dependencies: { '@z/dsh-legacy-plugin': 'workspace:^', '@deepseek-ai/old-plugin': 'npm:@deepseek-ai/old-plugin@1.2.3' },
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@z/dsh-taskweaver'] } },
    }, null, 2)}\n`)
    const migratedProfiles = await migrateLegacyProfileManifests(path.dirname(path.dirname(profile)))
    assert.equal(migratedProfiles.changed, true)
    const migratedManifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
    assert.equal(migratedManifest.name, 'taskweaver-profile-legacy')
    assert.deepEqual(migratedManifest.dependencies, {
      '@taskweaver/dsh-legacy-plugin': 'workspace:^',
      '@taskweaver/old-plugin': 'npm:@taskweaver/old-plugin@1.2.3',
    })
    assert.deepEqual(migratedManifest.taskweaver.profile.bundles, ['@taskweaver/dsh-base', '@taskweaver/dsh-taskweaver'])
    assert.equal('dsh' in migratedManifest, false)
    const afterFirstPass = await fs.readFile(manifestPath, 'utf8')
    const secondProfilePass = await migrateLegacyProfileManifests(path.dirname(path.dirname(profile)))
    assert.equal(secondProfilePass.changed, false)
    assert.equal(await fs.readFile(manifestPath, 'utf8'), afterFirstPass)

    const noLegacy = await migrateRuntimeHome({ env: { TASKWEAVER_HOME: path.join(tempRoot, 'empty-target') }, home })
    assert.equal(noLegacy.migrated, false)
    assert.equal(noLegacy.reason, 'no-legacy-home')
    assert.equal((await fs.stat(noLegacy.runtimeHomePath)).isDirectory(), true)

    const legacySource = path.join(tempRoot, 'to-remove')
    await fs.mkdir(legacySource)
    await fs.writeFile(path.join(legacySource, 'marker.txt'), 'old')
    const removed = await removeLegacyRuntimeHome(legacySource)
    assert.equal(removed.removed, true)
    await assert.rejects(fs.access(legacySource), { code: 'ENOENT' })

    const staleParent = path.join(tempRoot, 'stale-parent')
    await fs.mkdir(staleParent)
    const staleDir = path.join(staleParent, `z${'.taskweaver-retired'}`)
    await fs.mkdir(staleDir)
    const staleCleanup = await removeStaleRetiredRuntimeHomes({ home: staleParent })
    assert.equal(staleCleanup.removed.length, 1)
    await assert.rejects(fs.access(staleDir), { code: 'ENOENT' })

    const webProfile = path.join(tempRoot, 'embedded-web', 'profiles', 'web')
    await fs.mkdir(webProfile, { recursive: true })
    const webManifest = path.join(webProfile, 'package.json')
    await fs.writeFile(webManifest, `${JSON.stringify({
      name: 'taskweaver-profile-web',
      dependencies: { 'dsh-model-usage': 'link:/tmp/missing' },
      taskweaver: {
        profile: {
          bundles: ['@taskweaver/dsh-base', '@taskweaver/dsh-web-app', 'dsh-model-usage'],
        },
      },
    }, null, 2)}\n`)
    const embeddedPass = await migrateLegacyProfileManifests(path.dirname(path.dirname(webProfile)), { embedded: true })
    assert.equal(embeddedPass.changed, true)
    const embeddedManifest = JSON.parse(await fs.readFile(webManifest, 'utf8'))
    assert.deepEqual(embeddedManifest.taskweaver.profile.bundles, [...EMBEDDED_WEB_PROFILE_BUNDLES])
    assert.equal(embeddedManifest.dependencies, undefined)

    console.log('✓ TaskWeaver runtime home migration preserves, verifies, and migrates legacy data')
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true })
  }
}

runTests().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
