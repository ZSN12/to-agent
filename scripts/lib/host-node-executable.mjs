import { resolveHostNodeExecutable } from '../../backend/agent/z-host/resolve-host-executable.mjs'

let cachedExecutable

/** Node binary for Z Host smoke tests and build-time boot checks (dev: PATH or TASKWEAVER_HOST_NODE). */
export function scriptHostNodeExecutable() {
  if (!cachedExecutable) {
    cachedExecutable = resolveHostNodeExecutable({
      isPackaged: false,
      env: process.env,
    }).executable
  }
  return cachedExecutable
}
