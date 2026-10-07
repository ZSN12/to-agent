import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

/** 是否已安装并已登录 GitHub CLI（不抛错）。 */
export async function probeGitHubCliAuth() {
  try {
    await execFileAsync('gh', ['auth', 'status'], { timeout: 8000, env: process.env })
    const { stdout } = await execFileAsync('gh', ['auth', 'token'], { timeout: 8000, env: process.env })
    const token = String(stdout ?? '').trim()
    return token ? { ok: true, token } : { ok: false, reason: 'gh 未返回 token' }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/ENOENT|not found/i.test(message)) return { ok: false, reason: '未安装 gh' }
    return { ok: false, reason: 'gh 未登录或 token 不可用' }
  }
}

export function readGitHubTokenFromEnv() {
  const token = String(process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN ?? '').trim()
  return token || null
}
