import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ensureZHomeDirectory } from '../electron/agent/z-host/migrate-z-home.mjs'
import { resolveZHome, resolveDshHome } from '../electron/backend/dsh-pi-ai-credentials.mjs'

async function runTests() {
  const tmpBase = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'tw-z-home-test-'))

  try {
    // 1. Scenario A: Brand new installation (neither exists)
    const testA = path.join(tmpBase, 'case-a')
    await fs.promises.mkdir(testA, { recursive: true })
    const resA = ensureZHomeDirectory(testA)
    assert.equal(resA.migrated, false)
    assert.ok(fs.existsSync(resA.zHome), 'z directory should exist')
    assert.ok(fs.existsSync(resA.dshHome), 'dsh directory should exist')
    // Write in z, verify visible in dsh
    await fs.promises.writeFile(path.join(resA.zHome, 'probe.txt'), 'hello from z', 'utf8')
    assert.equal(
      await fs.promises.readFile(path.join(resA.dshHome, 'probe.txt'), 'utf8'),
      'hello from z',
      'files written to z must be readable from dsh via symlink'
    )

    // 2. Scenario B: Legacy installation (only dsh exists)
    const testB = path.join(tmpBase, 'case-b')
    const legacyDsh = path.join(testB, 'dsh')
    await fs.promises.mkdir(legacyDsh, { recursive: true })
    await fs.promises.writeFile(path.join(legacyDsh, 'legacy-session.txt'), 'session-123', 'utf8')
    const resB = ensureZHomeDirectory(testB)
    assert.equal(resB.migrated, true, 'migrated should be true when linking z -> legacy dsh')
    assert.ok(fs.existsSync(resB.zHome), 'z directory must exist as link')
    assert.equal(
      await fs.promises.readFile(path.join(resB.zHome, 'legacy-session.txt'), 'utf8'),
      'session-123',
      'legacy session must be visible through zHome'
    )

    // 3. Scenario C: Only z exists
    const testC = path.join(tmpBase, 'case-c')
    const freshZ = path.join(testC, 'z')
    await fs.promises.mkdir(freshZ, { recursive: true })
    await fs.promises.writeFile(path.join(freshZ, 'fresh-session.txt'), 'fresh-456', 'utf8')
    const resC = ensureZHomeDirectory(testC)
    assert.equal(resC.migrated, false)
    assert.ok(fs.existsSync(resC.dshHome), 'dsh alias must be created')
    assert.equal(
      await fs.promises.readFile(path.join(resC.dshHome, 'fresh-session.txt'), 'utf8'),
      'fresh-456'
    )

    // 4. resolveZHome and resolveDshHome resolution
    const resolvedZ = resolveZHome(testB)
    assert.ok(resolvedZ.endsWith('z') || resolvedZ.endsWith('dsh'))
    const resolvedDsh = resolveDshHome(testB)
    assert.equal(resolvedZ, resolvedDsh)

    console.log('✓ Z_HOME 目录迁移与软链双向兼容测试全部通过')
  } finally {
    await fs.promises.rm(tmpBase, { recursive: true, force: true }).catch(() => {})
  }
}

runTests()
