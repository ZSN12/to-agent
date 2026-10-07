import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { probeGitHubCliAuth, readGitHubTokenFromEnv } from './github-mcp-auth-bridge.mjs'
import { isGitRepository } from './git-service.mjs'

const execFileAsync = promisify(execFile)

async function runGit(args, cwd) {
  try {
    const { stdout } = await execFileAsync('git', args, {
      cwd,
      timeout: 12_000,
      env: { ...process.env, LC_ALL: 'C' },
    })
    return { ok: true, stdout: String(stdout).trim() }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/** @param {string} raw */
export function parseGithubRemote(raw) {
  const url = String(raw ?? '').trim()
  if (!url) return null
  const ssh = /^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/i.exec(url)
  if (ssh) return { owner: ssh[1], repo: ssh[2].replace(/\.git$/i, '') }
  const https = /^https?:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?\/?$/i.exec(url)
  if (https) return { owner: https[1], repo: https[2].replace(/\.git$/i, '') }
  return null
}

async function resolveGithubRepo(workspacePath) {
  if (!workspacePath) return { ok: false, reason: 'no-workspace' }
  if (!(await isGitRepository(workspacePath))) return { ok: false, reason: 'not-git' }
  const remote = await runGit(['remote', 'get-url', 'origin'], workspacePath)
  if (!remote.ok) return { ok: false, reason: 'no-origin' }
  const repo = parseGithubRemote(remote.stdout)
  if (!repo) return { ok: false, reason: 'not-github', remote: remote.stdout }
  return { ok: true, ...repo, remoteUrl: remote.stdout }
}

async function listViaGh(owner, repo) {
  try {
    const { stdout } = await execFileAsync('gh', [
      'pr', 'list',
      '--repo', `${owner}/${repo}`,
      '--limit', '40',
      '--json', 'number,title,state,url,updatedAt,headRefName,isDraft,author',
    ], { timeout: 20_000, env: process.env })
    const rows = JSON.parse(stdout)
    return rows.map((row) => ({
      number: row.number,
      title: row.title,
      state: String(row.state ?? 'OPEN').toLowerCase(),
      url: row.url,
      branch: row.headRefName,
      updatedAt: row.updatedAt,
      draft: row.isDraft === true,
      author: row.author?.login ?? null,
    }))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/ENOENT|not found/i.test(message)) return { error: 'gh-missing', message }
    return { error: 'gh-failed', message }
  }
}

async function resolveToken(getGithubPat) {
  if (typeof getGithubPat === 'function') {
    const fromMcp = await getGithubPat()
    if (fromMcp) return fromMcp
  }
  const gh = await probeGitHubCliAuth()
  if (gh.ok && gh.token) return gh.token
  return readGitHubTokenFromEnv()
}

async function listViaApi(owner, repo, token) {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls?state=open&per_page=30&sort=updated`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`GitHub API ${res.status}: ${text.slice(0, 200)}`)
  }
  const rows = await res.json()
  return rows.map((row) => ({
    number: row.number,
    title: row.title,
    state: String(row.state ?? 'open').toLowerCase(),
    url: row.html_url,
    branch: row.head?.ref ?? null,
    updatedAt: row.updated_at,
    draft: row.draft === true,
    author: row.user?.login ?? null,
  }))
}

/**
 * @param {string | null} workspacePath
 * @param {() => Promise<string | null | undefined>} [getGithubPat]
 */
export async function listGithubPullRequests(workspacePath, getGithubPat) {
  const resolved = await resolveGithubRepo(workspacePath)
  if (!resolved.ok) return resolved

  const ghList = await listViaGh(resolved.owner, resolved.repo)
  if (Array.isArray(ghList)) {
    return {
      ok: true,
      owner: resolved.owner,
      repo: resolved.repo,
      source: 'gh-cli',
      pullRequests: ghList,
    }
  }

  const token = await resolveToken(getGithubPat)
  if (!token) {
    return {
      ok: false,
      reason: 'auth-required',
      owner: resolved.owner,
      repo: resolved.repo,
      hint: '请安装并 gh auth login，或在「集成」中配置 GitHub MCP Token',
      detail: ghList.error,
    }
  }

  try {
    const pullRequests = await listViaApi(resolved.owner, resolved.repo, token)
    return {
      ok: true,
      owner: resolved.owner,
      repo: resolved.repo,
      source: 'github-api',
      pullRequests,
    }
  } catch (error) {
    return {
      ok: false,
      reason: 'api-failed',
      owner: resolved.owner,
      repo: resolved.repo,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
