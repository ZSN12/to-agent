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
  const url = new URL(window.location.href)
  const fragmentParams = new URLSearchParams(url.hash.slice(1))
  const token = fragmentParams.get('shellToken')
  const queryParams = new URLSearchParams(url.search)
  const hadFragmentToken = fragmentParams.has('shellToken')
  const hadQueryToken = queryParams.has('shellToken')

  fragmentParams.delete('shellToken')
  queryParams.delete('shellToken')
  if (hadFragmentToken || hadQueryToken) {
    url.hash = fragmentParams.size > 0 ? fragmentParams.toString() : ''
    url.search = queryParams.size > 0 ? queryParams.toString() : ''
    window.history.replaceState(
      window.history.state,
      '',
      `${url.pathname}${url.search}${url.hash}`,
    )
  }
  return token || null
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
