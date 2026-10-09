import { useCallback, useEffect, useState } from 'react'
import { ExternalLink, GitPullRequest, RefreshCw, Puzzle } from 'lucide-react'

export interface PullRequestRow {
  number: number
  title: string
  state: string
  url: string
  branch?: string | null
  updatedAt?: string
  draft?: boolean
  author?: string | null
}

export function PullRequestsPanel({
  workspacePath,
  onBack,
  onOpenIntegrations,
  onReviewWithAgent,
}: {
  workspacePath: string | null
  onBack: () => void
  onOpenIntegrations?: () => void
  onReviewWithAgent?: (prompt: string) => void
}) {
  const [loading, setLoading] = useState(false)
  const [owner, setOwner] = useState<string | null>(null)
  const [repo, setRepo] = useState<string | null>(null)
  const [source, setSource] = useState<string | null>(null)
  const [rows, setRows] = useState<PullRequestRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [hint, setHint] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const bridge = window.taskweaver?.github
    if (!bridge?.listPullRequests) {
      setError('PR 后端不可用（请使用桌面版 TaskWeaver）')
      return
    }
    setLoading(true)
    setError(null)
    setHint(null)
    const res = await bridge.listPullRequests(workspacePath)
    setLoading(false)
    if (!res?.ok) {
      setError(res?.error ?? '加载失败')
      return
    }
    const data = res.data
    if (!data?.ok) {
      setOwner(data?.owner ?? null)
      setRepo(data?.repo ?? null)
      setRows([])
      if (data?.reason === 'no-workspace') setError('请先绑定 Git 工作区')
      else if (data?.reason === 'not-git') setError('当前工作区不是 Git 仓库')
      else if (data?.reason === 'no-origin') setError('未配置 origin 远程')
      else if (data?.reason === 'not-github') setError('origin 不是 GitHub 仓库')
      else if (data?.reason === 'auth-required') {
        setError('需要 GitHub 凭据')
        setHint(data.hint ?? null)
      } else setError(data?.error ?? data?.reason ?? '未知错误')
      return
    }
    setOwner(data.owner)
    setRepo(data.repo)
    setSource(data.source ?? null)
    setRows(data.pullRequests ?? [])
  }, [workspacePath])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return (
    <div className="codex-marketplace-page pull-requests-panel">
      <header className="pull-requests-header">
        <button type="button" className="ghost-button" onClick={onBack}>返回对话</button>
        <h1><GitPullRequest size={22} aria-hidden /> Pull Requests</h1>
        <p>
          读取当前工作区 <code>origin</code> 对应 GitHub 仓库的开放 PR（优先 <code>gh</code> CLI，否则 GitHub API + 集成页 Token）。
        </p>
        <div className="pull-requests-toolbar">
          <button type="button" className="settings-secondary-button" disabled={loading} onClick={() => { void refresh() }}>
            <RefreshCw size={14} /> 刷新
          </button>
          {onOpenIntegrations && (
            <button type="button" className="settings-secondary-button" onClick={onOpenIntegrations}>
              <Puzzle size={14} /> 配置 GitHub 集成
            </button>
          )}
        </div>
        {owner && repo && (
          <p className="pull-requests-repo">
            {owner}/{repo}
            {source && <span className="pull-requests-source"> · {source}</span>}
          </p>
        )}
      </header>

      {loading && <p className="pull-requests-meta">加载中…</p>}
      {error && (
        <div className="pull-requests-error" role="alert">
          <p>{error}</p>
          {hint && <p className="pull-requests-hint">{hint}</p>}
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <p className="pull-requests-meta">没有开放的 Pull Request</p>
      )}

      <ul className="pull-requests-list">
        {rows.map((pr) => (
          <li key={pr.number} className="pull-requests-row">
            <div className="pull-requests-row-main">
              <span className="pull-requests-number">#{pr.number}</span>
              <strong>{pr.title}</strong>
              {pr.draft && <span className="skill-command-tag">草稿</span>}
              <span className="pull-requests-meta">
                {pr.author ? `@${pr.author}` : ''}
                {pr.branch ? ` · ${pr.branch}` : ''}
                {pr.updatedAt ? ` · ${new Date(pr.updatedAt).toLocaleString('zh-CN')}` : ''}
              </span>
            </div>
            <div className="pull-requests-row-actions">
              {onReviewWithAgent && (
                <button
                  type="button"
                  className="settings-secondary-button"
                  onClick={() => onReviewWithAgent(
                    `只读审查 GitHub PR #${pr.number}（${owner}/${repo}）：${pr.title}。`
                    + `先用 gh 或网页 ${pr.url} 获取 diff 要点，给出风险与测试建议，不要直接改仓库。`,
                  )}
                >
                  Agent 审查
                </button>
              )}
              <a
                className="settings-secondary-button"
                href={pr.url}
                rel="noreferrer"
                onClick={(e) => {
                  e.preventDefault()
                  if (pr.url) window.open(pr.url)
                }}
              >
                <ExternalLink size={14} /> 打开
              </a>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
