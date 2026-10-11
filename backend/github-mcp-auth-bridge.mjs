import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

/** 仅检查 gh 登录态，不读取 token；调用方应在用户确认后再读令牌。 */
export async function hasGitHubCliAuth() {
  try {
    await execFileAsync('gh', ['auth', 'status'], { timeout: 8000, env: process.env })
    return true
  } catch {
    return false
  }
}

/** Read a CLI token only after explicit user confirmation. */
export async function readGitHubCliToken() {
  try {
    const { stdout } = await execFileAsync('gh', ['auth', 'token'], { timeout: 8000, env: process.env })
    const token = String(stdout ?? '').trim()
    return token ? { ok: true, token } : { ok: false, reason: 'gh 未返回 token' }
  } catch {
    return { ok: false, reason: 'gh 未登录或 token 不可用' }
  }
}

/** 是否存在备用环境变量凭据，不返回实际令牌值。 */
export function hasGitHubTokenInEnv(env = process.env) {
  return Boolean(String(env.GH_TOKEN ?? env.GITHUB_TOKEN ?? '').trim())
}

/** Read an environment token only after explicit user confirmation. */
export function readGitHubTokenFromEnv(env = process.env) {
  const token = String(env.GH_TOKEN ?? env.GITHUB_TOKEN ?? '').trim()
  return token || null
}

/** Backwards-compatible probe for callers that already have authorization. */
export async function probeGitHubCliAuth() {
  if (!await hasGitHubCliAuth()) return { ok: false, reason: 'gh 未登录或 token 不可用' }
  return readGitHubCliToken()
}
