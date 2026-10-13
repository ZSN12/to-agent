import assert from 'node:assert/strict'
import { registerMcpIpc } from '../backend/ipc/register-mcp-ipc.mjs'
import { createShellPlatform } from '../backend/platform/shell-platform.mjs'

const authorizationUrl = 'https://github.com/login/oauth/authorize?client_id=test&state=test'
const openedUrls = []
const platform = createShellPlatform({
  platformName: 'darwin',
  openExternal: async (url) => openedUrls.push(url),
  showMessageBox: async (options) => ({ response: options.defaultId === 1 ? 0 : 1 }),
})

await platform.shell.openExternal(authorizationUrl)
assert.deepEqual(openedUrls, [authorizationUrl])
await assert.rejects(() => platform.shell.openExternal('file:///etc/passwd'), /HTTP\(S\)/)

const handlers = new Map()
let reloadCount = 0
const sentEvents = []
const mcp = {
  getDshRuntimeBinding: async () => ({}),
  listServers: async () => [],
  saveServer: async () => ({}),
  removeServer: async () => ({}),
  setEnabled: async () => ({}),
  testConnection: async () => ({ status: 'connected', toolCount: 3 }),
  configureGitHub: async () => ({}),
  getGitHubOAuthAvailability: () => ({ configured: true, canLogin: true }),
  async loginGitHubWithOAuth({ onStatus, openExternal, confirmLocalCredential }) {
    onStatus({ status: 'auth_url', url: authorizationUrl })
    await openExternal(authorizationUrl)
    const confirmed = await confirmLocalCredential({ source: 'gh-cli' })
    return confirmed ? { server: { id: 'github' } } : { cancelled: true, source: 'gh-cli' }
  },
  cancelGitHubOAuth: () => true,
  disconnect: async () => ({}),
  installFromCatalog: async () => ({}),
}

registerMcpIpc({
  ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
  dialog: platform.dialog,
  BrowserWindow: { fromWebContents: () => null },
  shell: platform.shell,
  mcp,
  assertMcpHostRestartSafe: () => {},
  reloadMcpRuntime: async () => { reloadCount++ },
  withMcpHostRestartLock: async (operation) => operation(),
})

const event = {
  senderFrame: { url: 'taskweaver://app/index.html' },
  sender: { send: (channel, payload) => sentEvents.push({ channel, payload }) },
}
const connected = await handlers.get('mcp:startGitHubOAuth')(event)
assert.deepEqual(connected, {
  ok: true,
  data: {
    server: { id: 'github' },
    cancelled: false,
    connection: { status: 'connected', toolCount: 3 },
  },
})
assert.equal(reloadCount, 1)
assert.equal(sentEvents[0]?.channel, 'mcp:githubOAuthStatus')
assert.equal(openedUrls.length, 2)

const source = await (await import('node:fs/promises')).readFile(
  new URL('../backend/ipc/register-mcp-ipc.mjs', import.meta.url),
  'utf8',
)
assert.doesNotMatch(source, /await import\(['"]electron['"]\)/)

console.log('github-mcp-ipc checks passed')
