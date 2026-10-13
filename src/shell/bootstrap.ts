import { createShellTaskweaverBridge, setShellApiBase, setShellApiToken } from './taskweaver-shell-bridge.generated'

declare global {
  interface Window {
    taskweaver?: import('../shared/ipc-bridge.generated').TaskweaverBridge
  }
}

function readShellApiBase(): string | null {
  const params = new URLSearchParams(window.location.search)
  const fromQuery = params.get('shellApi')
  if (fromQuery) return fromQuery
  const meta = document.querySelector('meta[name="taskweaver-shell-api"]')
  const fromMeta = meta?.getAttribute('content')
  if (fromMeta) return fromMeta
  return null
}

function readShellApiToken(): string | null {
  const fragment = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash
  const params = new URLSearchParams(fragment)
  const fromFragment = params.get('shellToken')
  if (fromFragment) return fromFragment
  const query = new URLSearchParams(window.location.search)
  const fromQuery = query.get('shellToken')
  if (fromQuery) return fromQuery
  const meta = document.querySelector('meta[name="taskweaver-shell-token"]')
  const fromMeta = meta?.getAttribute('content')
  return fromMeta || null
}

/** Install HTTP bridge when UI runs inside a native shell (no Electron preload). */
export function installNativeShellBridge() {
  if (window.taskweaver) return
  const apiBase = readShellApiBase()
  if (!apiBase) return
  setShellApiBase(apiBase)
  const apiToken = readShellApiToken()
  if (apiToken) setShellApiToken(apiToken)
  window.taskweaver = createShellTaskweaverBridge()
}
