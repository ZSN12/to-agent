import { useCallback, useEffect, useState } from 'react'
import { LogIn, RefreshCw } from 'lucide-react'
import type { LocalAgentBridgeStatus, LocalAgentDiscovery } from '../../shared/model-api'

type LocalAgentLoginResult = { ok: boolean; message?: string; error?: string }

function agentStatusLabel(agent: LocalAgentDiscovery) {
  if (agent.loginRequired) return '需登录'
  if (agent.discovered && agent.modelCount > 0) return `已发现 ${agent.modelCount} 个模型`
  if (agent.loggedIn) return '已登录 · 待扫描'
  return '未配置'
}

function agentStatusClass(agent: LocalAgentDiscovery) {
  if (agent.loginRequired) return 'warn'
  if (agent.discovered && agent.modelCount > 0) return 'ok'
  return 'idle'
}

function loginKindForAgent(agent: LocalAgentDiscovery): 'cursor' | 'google-antigravity' | null {
  if (agent.agentId === 'cursor-composer') return 'cursor'
  if (agent.agentId === 'google-antigravity') return 'google-antigravity'
  return null
}

export function LocalAgentStatusStrip({
  status,
  loading,
  onRefresh,
  onLogin,
  legacyOpenCodex,
  onMigrateLegacy,
  migrateLoading,
}: {
  status: LocalAgentBridgeStatus | null
  loading?: boolean
  onRefresh: () => void
  onLogin: (kind: 'cursor' | 'google-antigravity') => Promise<LocalAgentLoginResult>
  legacyOpenCodex?: boolean
  onMigrateLegacy?: () => Promise<void>
  migrateLoading?: boolean
}) {
  const agents = status?.localAgents ?? []
  const [loginBusy, setLoginBusy] = useState(false)
  const [loginFeedback, setLoginFeedback] = useState<{ agentId: string; tone: 'success' | 'error'; message: string } | null>(null)
  if (!agents.length && !legacyOpenCodex) return null

  const handleLogin = async (agent: LocalAgentDiscovery, kind: 'cursor' | 'google-antigravity') => {
    setLoginBusy(true)
    setLoginFeedback({ agentId: agent.agentId, tone: 'success', message: '正在启动登录并打开默认浏览器…' })
    try {
      const result = await onLogin(kind)
      if (!result.ok) throw new Error(result.error || '登录流程未能启动。')
      setLoginFeedback({
        agentId: agent.agentId,
        tone: 'success',
        message: result.message || '授权页已打开。完成登录后点击“刷新状态”。',
      })
    } catch (error) {
      setLoginFeedback({
        agentId: agent.agentId,
        tone: 'error',
        message: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setLoginBusy(false)
    }
  }

  return (
    <div className="local-agent-status-strip" role="region" aria-label="本地官方 Agent 状态">
      <div className="local-agent-status-head">
        <strong>本地官方 Agent</strong>
        <button
          type="button"
          className="settings-secondary-button local-agent-status-refresh"
          onClick={() => void onRefresh()}
          disabled={loading}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          刷新状态
        </button>
      </div>
      <ul className="local-agent-status-list">
        {agents.map((agent) => {
          const loginKind = loginKindForAgent(agent)
          return (
            <li key={agent.agentId} className="local-agent-status-row">
              <span className="local-agent-status-name">{agent.label}</span>
              <span className={`local-agent-status-pill ${agentStatusClass(agent)}`}>
                {agentStatusLabel(agent)}
              </span>
              {loginKind && agent.loginRequired && (
                <button
                  type="button"
                  className="settings-secondary-button local-agent-login-btn"
                  disabled={loginBusy}
                  onClick={() => void handleLogin(agent, loginKind)}
                >
                  {loginBusy ? <RefreshCw size={14} className="animate-spin" /> : <LogIn size={14} />}
                  {loginBusy ? '正在打开…' : '登录'}
                </button>
              )}
            </li>
          )
        })}
      </ul>
      {loginFeedback && (
        <p
          className={`local-agent-login-feedback ${loginFeedback.tone}`}
          role={loginFeedback.tone === 'error' ? 'alert' : 'status'}
          aria-live="polite"
        >
          {agents.find((agent) => agent.agentId === loginFeedback.agentId)?.label}：{loginFeedback.message}
        </p>
      )}
      {legacyOpenCodex && onMigrateLegacy && (
        <div className="local-agent-legacy-banner">
          <span>检测到遗留的 OpenCodex（10100）模型路由，建议迁移到内置桥。</span>
          <button
            type="button"
            className="settings-secondary-button"
            disabled={migrateLoading}
            onClick={() => void onMigrateLegacy()}
          >
            {migrateLoading ? '迁移中…' : '迁移到 bridge-composer'}
          </button>
        </div>
      )}
    </div>
  )
}

export function useLocalAgentBridgeStatus() {
  const [status, setStatus] = useState<LocalAgentBridgeStatus | null>(null)
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    const client = window.taskweaver?.models
    if (!client?.bridgeGetStatus) return
    setLoading(true)
    try {
      const res = await client.bridgeGetStatus()
      if (res?.ok && res.data) setStatus(res.data as LocalAgentBridgeStatus)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const login = useCallback(
    async (kind: 'cursor' | 'google-antigravity') => {
      const client = window.taskweaver?.models
      if (!client?.bridgeLogin) return { ok: false, error: '当前环境不支持本地官方 Agent 登录，请使用桌面端。' }
      const result = await client.bridgeLogin(kind)
      if (!result?.ok) return { ok: false, error: result?.error ?? '登录请求未能发送。' }
      if (!result.data?.ok) return { ok: false, error: '本地登录流程没有成功启动。' }
      try {
        await refresh()
      } catch {
        // Login has already started; a status refresh failure should not be
        // reported as a login launch failure.
      }
      return { ok: true, message: result.data.message }
    },
    [refresh],
  )

  return { status, loading, refresh, login }
}
