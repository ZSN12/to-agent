import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { startShellHttpServer } from '../backend/shell/http-server.mjs'

const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'taskweaver-shell-ui-'))
const uiRoot = path.join(tempRoot, 'dist')
const outsideFile = path.join(tempRoot, 'secret.txt')
await mkdir(path.join(uiRoot, 'assets'), { recursive: true })
await writeFile(path.join(uiRoot, 'index.html'), '<main>TaskWeaver UI</main>')
await writeFile(path.join(uiRoot, 'assets', 'main.js'), 'window.taskweaverLoaded = true')
await writeFile(outsideFile, 'private')
await symlink(outsideFile, path.join(uiRoot, 'escape.txt'))

const { server, baseUrl } = await startShellHttpServer({ host: '127.0.0.1', port: 0, uiRoot })

try {
  const home = await fetch(`${baseUrl}/?shellApi=${encodeURIComponent(baseUrl)}`)
  assert.equal(home.status, 200)
  assert.match(home.headers.get('content-type') ?? '', /^text\/html/)
  assert.equal(await home.text(), '<main>TaskWeaver UI</main>')

  const asset = await fetch(`${baseUrl}/assets/main.js`)
  assert.equal(asset.status, 200)
  assert.match(asset.headers.get('content-type') ?? '', /^text\/javascript/)
  assert.equal(await asset.text(), 'window.taskweaverLoaded = true')

  const spaRoute = await fetch(`${baseUrl}/settings/models`)
  assert.equal(spaRoute.status, 200)
  assert.equal(await spaRoute.text(), '<main>TaskWeaver UI</main>')

  const missingAsset = await fetch(`${baseUrl}/assets/missing.js`)
  assert.equal(missingAsset.status, 404)

  const symlinkEscape = await fetch(`${baseUrl}/escape.txt`)
  assert.equal(symlinkEscape.status, 404)
  assert.doesNotMatch(await symlinkEscape.text(), /private/)

  const traversal = await requestRawPath(baseUrl, '/..%2fsecret.txt')
  assert.equal(traversal.status, 404)

  const health = await fetch(`${baseUrl}/shell/v1/health`)
  assert.deepEqual(await health.json(), { ok: true })

  const unknownApi = await fetch(`${baseUrl}/shell/v1/unknown`)
  assert.equal(unknownApi.status, 404)
  assert.doesNotMatch(await unknownApi.text(), /TaskWeaver UI/)

  console.log('test-shell-ui-static-serving: ok')
} finally {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  await rm(tempRoot, { recursive: true, force: true })
}

function requestRawPath(baseUrl, requestPath) {
  const url = new URL(baseUrl)
  return new Promise((resolve, reject) => {
    const request = http.get({ hostname: url.hostname, port: url.port, path: requestPath }, (response) => {
      const chunks = []
      response.on('data', (chunk) => chunks.push(chunk))
      response.on('end', () => resolve({ status: response.statusCode, body: Buffer.concat(chunks).toString('utf8') }))
    })
    request.on('error', reject)
  })
}
