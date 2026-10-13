import fs from 'node:fs'
import { spawn } from 'node:child_process'
import path from 'node:path'

const MAX_RESPONSE_BYTES = 1024 * 1024
const REQUEST_TIMEOUT_MS = 10_000

export function resolveKeychainHelperPath({
  platformName = process.platform,
  env = process.env,
  resourcesPath = env.TASKWEAVER_RESOURCES_PATH,
  repoRoot,
} = {}) {
  if (platformName !== 'darwin') return null
  if (env.TASKWEAVER_KEYCHAIN_HELPER) return path.resolve(env.TASKWEAVER_KEYCHAIN_HELPER)

  if (resourcesPath) {
    return path.resolve(resourcesPath, '..', 'Helpers', 'TaskWeaverKeychain')
  }

  if (!repoRoot) return null
  const arch = process.arch === 'arm64' ? 'arm64' : 'x86_64'
  const packageBuild = path.join(repoRoot, 'apps', 'macos', 'TaskWeaverShell', '.build')
  const candidates = [
    path.join(packageBuild, `${arch}-apple-macosx`, 'release', 'TaskWeaverKeychain'),
    path.join(packageBuild, `${arch}-apple-macosx`, 'debug', 'TaskWeaverKeychain'),
    path.join(packageBuild, 'release', 'TaskWeaverKeychain'),
    path.join(packageBuild, 'debug', 'TaskWeaverKeychain'),
  ]
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0]
}

/**
 * macOS Keychain adapter. The helper receives secrets only over stdin; neither
 * the account nor secret value is placed in argv or included in error text.
 */
export function createKeychainSecrets({
  helperPath,
  platformName = process.platform,
  spawnProcess = spawn,
  existsSync = fs.existsSync,
  timeoutMs = REQUEST_TIMEOUT_MS,
} = {}) {
  async function invoke(action, fields = {}) {
    if (platformName !== 'darwin') throw new Error('macOS Keychain is unavailable on this platform.')
    if (!helperPath || !existsSync(helperPath)) {
      throw new Error('TaskWeaver Keychain helper is not installed. For local development run '
        + '`swift build --package-path apps/macos/TaskWeaverShell --product TaskWeaverKeychain` '
        + 'or start the app with `pnpm run dev:mac`.')
    }

    const request = { action, ...fields }
    return new Promise((resolve, reject) => {
      let child
      try {
        child = spawnProcess(helperPath, [], { stdio: ['pipe', 'pipe', 'ignore'] })
      } catch {
        reject(new Error('Unable to start TaskWeaver Keychain helper.'))
        return
      }

      let stdout = ''
      let responseBytes = 0
      let settled = false
      const finish = (error, value) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        if (error) reject(error)
        else resolve(value)
      }

      const timer = setTimeout(() => {
        child.kill()
        setTimeout(() => {
          if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
        }, 1000).unref?.()
        finish(new Error('TaskWeaver Keychain request timed out.'))
      }, timeoutMs)
      timer.unref?.()

      child.stdout.setEncoding('utf8')
      child.stdout.on('data', (chunk) => {
        responseBytes += Buffer.byteLength(chunk, 'utf8')
        if (responseBytes > MAX_RESPONSE_BYTES) {
          child.kill()
          finish(new Error('TaskWeaver Keychain response was too large.'))
          return
        }
        stdout += chunk
      })
      child.on('error', () => finish(new Error('Unable to start TaskWeaver Keychain helper.')))
      child.on('close', (code) => {
        if (settled) return
        if (code !== 0) {
          finish(new Error('TaskWeaver Keychain operation failed.'))
          return
        }
        try {
          const response = JSON.parse(stdout)
          if (response?.ok !== true) throw new Error('Keychain operation failed.')
          finish(null, response.value)
        } catch {
          finish(new Error('TaskWeaver Keychain returned an invalid response.'))
        }
      })

      child.stdin.on('error', () => finish(new Error('Unable to send request to TaskWeaver Keychain helper.')))
      child.stdin.end(JSON.stringify(request))
    })
  }

  return {
    async get(key) {
      validateAccount(key)
      const value = await invoke('get', { account: key })
      return typeof value === 'string' ? value : null
    },
    async set(key, value) {
      validateAccount(key)
      if (typeof value !== 'string') throw new TypeError('Keychain secret must be a string.')
      await invoke('set', { account: key, value })
    },
    async delete(key) {
      validateAccount(key)
      await invoke('delete', { account: key })
    },
    async list(prefix = '') {
      if (typeof prefix !== 'string') throw new TypeError('Keychain prefix must be a string.')
      const value = await invoke('list', { prefix })
      if (!Array.isArray(value) || value.some((key) => typeof key !== 'string')) {
        throw new Error('TaskWeaver Keychain returned an invalid account list.')
      }
      return value
    },
  }
}

function validateAccount(account) {
  if (typeof account !== 'string' || account.length === 0 || account.length > 512 || /[\u0000-\u001f\u007f]/.test(account)) {
    throw new TypeError('Invalid Keychain account name.')
  }
}
