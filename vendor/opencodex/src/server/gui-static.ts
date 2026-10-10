/**
 * TaskWeaver desktop does not ship the OpenCodex web GUI bundle. The proxy CLI still
 * imports this module; stubs keep `ocx start` and packaging smoke tests working without
 * bundling gui/dist into the Electron app.
 */

export function findGuiDist(): string | null {
  return null
}

export function serveGuiFile(
  _pathname: string,
  _search?: string,
  _session?: unknown,
  _role?: string,
): Response | null {
  return null
}

export function serveSessionBootstrap(
  _pathname: string,
  _session?: unknown,
): Response | null {
  return null
}
