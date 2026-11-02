import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

export const WORKBUDDY_AI_BUNDLE_IDENTIFIER = 'com.workbuddy.workbuddy-ai'
export const WORKBUDDY_BUNDLE_IDENTIFIER = 'com.tencent.workbuddy.mac'

const WORKBUDDY_APPS = Object.freeze([
  { name: 'WorkBuddy AI', bundleName: 'WorkBuddy AI.app', bundleIdentifier: WORKBUDDY_AI_BUNDLE_IDENTIFIER },
  { name: 'WorkBuddy', bundleName: 'WorkBuddy.app', bundleIdentifier: WORKBUDDY_BUNDLE_IDENTIFIER },
])

export function isWorkBuddyAiInstallation(app) {
  return app?.bundleIdentifier === WORKBUDDY_AI_BUNDLE_IDENTIFIER
}

export function isWorkBuddyInstallation(app) {
  return app?.bundleIdentifier === WORKBUDDY_BUNDLE_IDENTIFIER
}

/**
 * Detect both WorkBuddy desktop apps without launching them or reading their
 * application data. WorkBuddy and WorkBuddy AI have different bundle IDs and
 * data roots; callers must select the intended app explicitly.
 * Bundle names cover the system and per-user install locations used on macOS.
 */
export async function detectWorkBuddyInstallations({
  platform = process.platform,
  home = os.homedir(),
  appRoots = ['/Applications', path.join(home, 'Applications')],
} = {}) {
  if (platform !== 'darwin') return []

  const found = []
  const seen = new Set()
  for (const root of appRoots) {
    for (const app of WORKBUDDY_APPS) {
      const bundlePath = path.resolve(root, app.bundleName)
      if (seen.has(bundlePath)) continue
      seen.add(bundlePath)
      try {
        const [bundle, info] = await Promise.all([
          fs.stat(bundlePath),
          fs.stat(path.join(bundlePath, 'Contents', 'Info.plist')),
        ])
        if (bundle.isDirectory() && info.isFile()) {
          found.push({
            name: app.name,
            bundleIdentifier: app.bundleIdentifier,
            bundlePath,
          })
        }
      } catch {
        // Missing app bundles are an ordinary discovery result.
      }
    }
  }
  return found
}
