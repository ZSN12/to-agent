/**
 * GitHub.com OAuth App used for Copilot 托管 MCP（Bearer）。
 * 在 GitHub Developer Settings 创建 OAuth App，回调 URL 填 `http://127.0.0.1/callback`（或 `http://localhost/callback`）。
 * 构建/运行时可覆盖：TASKWEAVER_GITHUB_OAUTH_CLIENT_ID、TASKWEAVER_GITHUB_OAUTH_CLIENT_SECRET。
 */
/** 可选：在发行包中注入，与 Codex OAuth 相同模式（PKCE 为主，secret 非机密）。 */
const BUNDLED_CLIENT_ID = String(process.env.TASKWEAVER_GITHUB_OAUTH_CLIENT_ID_BUNDLE ?? '').trim()
const BUNDLED_CLIENT_SECRET = String(process.env.TASKWEAVER_GITHUB_OAUTH_CLIENT_SECRET_BUNDLE ?? '').trim()

export function resolveGitHubMcpOAuthCredentials() {
  const clientId = String(
    process.env.TASKWEAVER_GITHUB_OAUTH_CLIENT_ID || BUNDLED_CLIENT_ID || '',
  ).trim()
  const clientSecret = String(
    process.env.TASKWEAVER_GITHUB_OAUTH_CLIENT_SECRET || BUNDLED_CLIENT_SECRET || '',
  ).trim()
  return { clientId, clientSecret }
}

export function isGitHubMcpOAuthConfigured() {
  return Boolean(resolveGitHubMcpOAuthCredentials().clientId)
}

/** UI：主按钮是否应可点（OAuth 或 gh/环境变量 任一可用）。 */
export function canStartGitHubBrowserLogin() {
  return true
}

export function assertGitHubMcpOAuthConfigured() {
  if (!isGitHubMcpOAuthConfigured()) {
    throw new Error(
      '未配置 GitHub OAuth 应用。请设置环境变量 TASKWEAVER_GITHUB_OAUTH_CLIENT_ID'
      + '（及 TOKEN 兑换所需的 TASKWEAVER_GITHUB_OAUTH_CLIENT_SECRET），'
      + '详见 docs/GITHUB_MCP_OAUTH.md。',
    )
  }
}

/** 与 github-mcp-server 默认工具集兼容的常见 scope 集合。 */
export const GITHUB_MCP_OAUTH_SCOPES = [
  'read:org',
  'read:user',
  'repo',
  'gist',
  'workflow',
  'read:project',
].join(',')
