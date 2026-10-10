import { existsSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

/** Load the built TaskWeaver Cursor adapter package without a runtime TypeScript loader. */
let bridgePromise

function stagedProviderBridgeEntry() {
  const runtime = process.env.TASKWEAVER_RUNTIME?.trim()
  if (!runtime) return null
  const root = path.resolve(runtime)
  const libDirs = [
    path.join(root, 'runtime-packages', 'node_modules', '@taskweaver', 'provider-bridge', 'lib'),
    path.join(root, 'runtime-packages', '@taskweaver', 'provider-bridge', 'lib'),
    path.join(root, 'electron-vendor', 'provider-bridge', 'lib'),
  ]
  for (const libDir of libDirs) {
    for (const name of ['index.mjs', 'index.js']) {
      const entry = path.join(libDir, name)
      if (existsSync(entry)) return entry
    }
  }
  return null
}

async function importProviderBridge() {
  try {
    return await import('@taskweaver/provider-bridge')
  } catch (primaryError) {
    const staged = stagedProviderBridgeEntry()
    if (staged) {
      return import(pathToFileURL(staged).href)
    }
    throw primaryError
  }
}

export async function loadProviderBridge() {
  if (!bridgePromise) {
    bridgePromise = importProviderBridge().catch((cause) => {
      bridgePromise = undefined
      const error = new Error(
        'Cursor bridge package is unavailable. Build @taskweaver/provider-bridge before starting the Host.',
        { cause },
      )
      error.code = 'BRIDGE_CURSOR_ADAPTER_UNAVAILABLE'
      throw error
    })
  }
  return bridgePromise
}

export async function loadCreateCursorAdapter() {
  const api = await loadProviderBridge()
  if (typeof api.createCursorAdapter !== 'function') {
    const error = new Error('TaskWeaver provider bridge package has no createCursorAdapter export.')
    error.code = 'BRIDGE_CURSOR_ADAPTER_UNAVAILABLE'
    throw error
  }
  return api.createCursorAdapter
}

export async function createCursorTranslatorBudget() {
  const api = await loadProviderBridge()
  if (typeof api.createTranslatorBudget !== 'function') {
    const error = new Error('TaskWeaver provider bridge package has no createTranslatorBudget export.')
    error.code = 'BRIDGE_CURSOR_ADAPTER_UNAVAILABLE'
    throw error
  }
  return api.createTranslatorBudget()
}
