import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import {
  createKeychainSecrets,
  resolveKeychainHelperPath,
} from '../backend/platform/keychain-secrets.mjs'

const values = new Map()
const requests = []
const invocations = []

function fakeSpawn(command, args, options) {
  invocations.push({ command, args, options })
  const child = new EventEmitter()
  child.stdin = new PassThrough()
  child.stdout = new PassThrough()
  child.killed = false
  child.kill = () => {
    child.killed = true
    child.emit('close', 1)
    return true
  }
  child.stdout.on('end', () => child.emit('close', 0))
  const chunks = []
  child.stdin.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
  child.stdin.on('finish', () => {
    const request = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    requests.push(request)
    let value = null
    if (request.action === 'set') values.set(request.account, request.value)
    if (request.action === 'get') value = values.get(request.account) ?? null
    if (request.action === 'delete') values.delete(request.account)
    if (request.action === 'list') value = [...values.keys()].filter((key) => !request.prefix || key.startsWith(request.prefix))
    queueMicrotask(() => child.stdout.end(JSON.stringify({ ok: true, value })))
  })
  return child
}

const secrets = createKeychainSecrets({
  helperPath: '/fake/TaskWeaverKeychain',
  platformName: 'darwin',
  spawnProcess: fakeSpawn,
  existsSync: () => true,
})

const token = 'ghp-test-token-that-must-not-enter-argv'
await secrets.set('mcp:github:GITHUB_PERSONAL_ACCESS_TOKEN', token)
assert.equal(await secrets.get('mcp:github:GITHUB_PERSONAL_ACCESS_TOKEN'), token)
assert.deepEqual(await secrets.list('mcp:'), ['mcp:github:GITHUB_PERSONAL_ACCESS_TOKEN'])
await secrets.delete('mcp:github:GITHUB_PERSONAL_ACCESS_TOKEN')
assert.equal(await secrets.get('mcp:github:GITHUB_PERSONAL_ACCESS_TOKEN'), null)

assert.equal(invocations.length, 5)
for (const invocation of invocations) {
  assert.equal(invocation.command, '/fake/TaskWeaverKeychain')
  assert.deepEqual(invocation.args, [], 'secret and account must not be passed as process arguments')
  assert.deepEqual(invocation.options.stdio, ['pipe', 'pipe', 'ignore'])
}
assert.equal(JSON.stringify(invocations).includes(token), false)
assert.equal(requests.find((request) => request.action === 'set').value, token, 'secret is transmitted to the helper over stdin')

await assert.rejects(() => secrets.get(''), /Invalid Keychain account/)
await assert.rejects(() => createKeychainSecrets({ platformName: 'linux', helperPath: '/fake/helper' }).get('x'), /unavailable/)
await assert.rejects(() => createKeychainSecrets({ platformName: 'darwin', helperPath: '/missing/helper' }).get('x'), /not installed/)

assert.equal(resolveKeychainHelperPath({
  platformName: 'darwin',
  resourcesPath: '/Applications/TaskWeaver.app/Contents/Resources',
}), '/Applications/TaskWeaver.app/Contents/Helpers/TaskWeaverKeychain')
assert.equal(resolveKeychainHelperPath({ platformName: 'linux', repoRoot: '/repo' }), null)

console.log('keychain-secrets checks passed')
