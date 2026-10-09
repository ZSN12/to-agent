import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { resolveRuntimeNodePath } from '../agent/z-host/resolve-runtime.mjs'

function createInMemoryRegistry(entries, fallback = undefined) {
  const listeners = new Set()
  return {
    entries: () => entries,
    fallbackEntry: () => fallback,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    _notify() {
      for (const listener of listeners) listener()
    },
  }
}

/**
 * Build ConversationRuntime for SessionManager (TaskWeaver fork definitions).
 * @param {string} runtimeRoot
 */
export async function createTaskWeaverConversationRuntime(runtimeRoot) {
  const resourcesPath = path.resolve(runtimeRoot, '..')
  const repoRoot = path.resolve(resourcesPath, '..')
  const registryCandidates = [
    path.join(runtimeRoot, 'electron-vendor', 'dsh-chat-registry.mjs'),
    path.join(resourcesPath, 'app.asar', 'electron', 'vendor', 'dsh-chat-registry.mjs'),
    path.join(repoRoot, 'electron', 'vendor', 'dsh-chat-registry.mjs'),
  ]
  let bundled
  const loadErrors = []
  for (const candidate of registryCandidates) {
    try {
      await fs.promises.access(candidate, fs.constants.R_OK)
    } catch {
      continue
    }
    try {
      bundled = await import(pathToFileURL(candidate).href)
      break
    } catch (error) {
      loadErrors.push(`${candidate}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  if (bundled?.TASKWEAVER_CHAT_EVENT_DEFINITIONS) {
    const events = createInMemoryRegistry(
      [...bundled.TASKWEAVER_CHAT_EVENT_DEFINITIONS],
      bundled.TASKWEAVER_CHAT_FALLBACK,
    )
    const views = createInMemoryRegistry([...(bundled.TASKWEAVER_CHAT_VIEW_DEFINITIONS ?? [])])
    return { events, views }
  }

  if (loadErrors.length > 0) {
    throw new Error(`DSH 对话投影 registry 存在但无法加载：${loadErrors.join('；')}`)
  }

  console.warn(
    '[TaskWeaver] dsh-chat-registry 未构建，对话投影为空。请运行: node scripts/build-dsh-chat-registry.mjs',
  )
  return {
    events: createInMemoryRegistry([]),
    views: createInMemoryRegistry([]),
  }
}

export function fakeSessionRemotes() {
  return {
    commands: {
      list: () => Promise.resolve({ ok: true, value: [] }),
      execute: () => Promise.resolve({ ok: true, value: undefined }),
    },
  }
}

function runtimePackageBases(runtimeRoot) {
  const packages = resolveRuntimeNodePath(runtimeRoot)
  const scopes = ['@z/dsh-client-runtime', '@deepseek-ai/dsh-client-runtime']
  const bases = []
  const stagedMain = path.join(runtimeRoot, 'electron-vendor', 'dsh-client-runtime-lib')
  if (fs.existsSync(stagedMain)) bases.push(stagedMain)
  if (packages) {
    for (const scope of scopes) bases.push(path.join(packages, scope))
  }
  const monorepoRuntime = path.join(runtimeRoot, 'packages/client/runtime')
  if (fs.existsSync(monorepoRuntime)) bases.push(monorepoRuntime)
  const siblingZRuntime = path.join(runtimeRoot, '..', 'z-runtime', 'packages/client/runtime')
  if (fs.existsSync(siblingZRuntime)) bases.push(siblingZRuntime)
  return { packages, bases }
}

/**
 * @param {string} runtimeRoot
 */
export async function loadSessionManagerClass(runtimeRoot) {
  const { packages, bases } = runtimePackageBases(runtimeRoot)
  // Deployed @z/dsh-client-runtime only ships browser `lib/client.js` (needs `window`).
  // Main process must load the tsc output tree under lib/types/…/manager.js.
  const relPaths = ['lib/types/client/sessions/manager.js']
  const prevNodePath = process.env.NODE_PATH
  if (packages) process.env.NODE_PATH = packages
  let lastError
  try {
    for (const base of bases) {
      for (const rel of relPaths) {
        const file = path.join(base, rel)
        if (!fs.existsSync(file)) continue
        try {
          const mod = await import(pathToFileURL(file).href)
          if (typeof mod.SessionManager === 'function') return mod.SessionManager
        } catch (error) {
          lastError = error
        }
      }
    }
  } finally {
    if (packages) process.env.NODE_PATH = prevNodePath
    else if (prevNodePath === undefined) delete process.env.NODE_PATH
    else process.env.NODE_PATH = prevNodePath
  }
  const hint = lastError instanceof Error ? lastError.message : String(lastError ?? 'unknown')
  throw new Error(`无法加载 SessionManager（请先构建 Z runtime / runtime-packages）。${hint}`)
}
