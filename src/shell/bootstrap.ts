import { createShellTaskweaverBridge, setShellApiBase } from './taskweaver-shell-bridge.generated'

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

/** Install HTTP bridge when UI runs inside a native shell (no Electron preload). */
export function installNativeShellBridge() {
  if (window.taskweaver) return
  const apiBase = readShellApiBase()
  if (!apiBase) return
  setShellApiBase(apiBase)
  window.taskweaver = createShellTaskweaverBridge()
}
