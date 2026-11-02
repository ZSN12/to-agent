import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Globe, KeyRound, RefreshCw, Save, X } from 'lucide-react'
import type { LocalAgentBridgeStatus, LocalAgentDiscovery } from '../../shared/model-api'

type LocalAgentLoginResult = { ok: boolean; message?: string; error?: string }

function agentStatusLabel(agent: LocalAgentDiscovery, antigravityOAuthConfigured: boolean) {
  if (agent.agentId === 'google-antigravity' && !antigravityOAuthConfigured) return '需配置 OAuth 客户端'
  if (!agent.loggedIn && loginKindForAgent(agent)) return '需授权 TaskWeaver'
  if (agent.loginRequired) return '需登录'
  if (agent.discovered && agent.modelCount > 0) return `已发现 ${agent.modelCount} 个模型`
  if (agent.loggedIn) return '已登录 · 待扫描'
  return '未配置'
}

function agentStatusClass(agent: LocalAgentDiscovery, antigravityOAuthConfigured: boolean) {
  if (agent.agentId === 'google-antigravity' && !antigravityOAuthConfigured) return 'warn'
  if (agent.loginRequired || (!agent.loggedIn && loginKindForAgent(agent))) return 'warn'
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
  onSaveAntigravityOAuthCredentials,
  legacyOpenCodex,
  onMigrateLegacy,
  migrateLoading,
}: {
  status: LocalAgentBridgeStatus | null
  loading?: boolean
  onRefresh: () => void
  onLogin: (kind: 'cursor' | 'google-antigravity') => Promise<LocalAgentLoginResult>
  onSaveAntigravityOAuthCredentials: (input: { clientId: string; clientSecret: string }) => Promise<void>
  legacyOpenCodex?: boolean
  onMigrateLegacy?: () => Promise<void>
  migrateLoading?: boolean
}) {
  const agents = status?.localAgents ?? []
  const [loginBusy, setLoginBusy] = useState(false)
  const [oauthFormOpen, setOAuthFormOpen] = useState(false)
  const [oauthClientId, setOAuthClientId] = useState('')
  const [oauthClientSecret, setOAuthClientSecret] = useState('')
  const [oauthSaving, setOAuthSaving] = useState(false)
  const [loginFeedback, setLoginFeedback] = useState<{ agentId: string; tone: 'success' | 'error'; message: string } | null>(null)
  const [awaitingLoginAgentId, setAwaitingLoginAgentId] = useState<string | null>(null)

  useEffect(() => {
    if (!awaitingLoginAgentId) return

    let active = true
    let attempts = 0
    const poll = async () => {
      if (!active) return
      attempts += 1
      try {
        await onRefresh()
      } catch {
        // Keep checking; a transient status request failure should not interrupt OAuth.
      }
      if (active && attempts >= 60) {
        setAwaitingLoginAgentId(null)
        setLoginFeedback((current) => current?.agentId === awaitingLoginAgentId
          ? {
              ...current,
              tone: 'error',
              message: '暂时没有检测到 TaskWeaver 授权。请确认浏览器登录完成后，再点“刷新状态”重试。',
            }
          : current)
      }
    }

    void poll()
    const timer = window.setInterval(() => void poll(), 2_000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [awaitingLoginAgentId, onRefresh])

  useEffect(() => {
    if (!awaitingLoginAgentId) return
    const agent = agents.find((item) => item.agentId === awaitingLoginAgentId)
    if (!agent?.loggedIn) return

    setAwaitingLoginAgentId(null)
    setLoginFeedback({
      agentId: awaitingLoginAgentId,
      tone: 'success',
      message: 'TaskWeaver 已检测到授权，登录状态已更新。',
    })
  }, [agents, awaitingLoginAgentId])

  if (!agents.length && !legacyOpenCodex) return null

  const handleLogin = async (agent: LocalAgentDiscovery, kind: 'cursor' | 'google-antigravity') => {
    setLoginBusy(true)
    setLoginFeedback({ agentId: agent.agentId, tone: 'success', message: '正在启动登录并打开默认浏览器…' })
    try {
      const result = await onLogin(kind)
      if (!result.ok) throw new Error(result.error || '登录流程未能启动。')
      setAwaitingLoginAgentId(agent.agentId)
      setLoginFeedback({
        agentId: agent.agentId,
        tone: 'success',
        message: result.message || '授权页已打开，登录完成后会自动更新状态。',
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

  const handleSaveOAuthCredentials = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setOAuthSaving(true)
    setLoginFeedback(null)
    try {
      await onSaveAntigravityOAuthCredentials({
        clientId: oauthClientId,
        clientSecret: oauthClientSecret,
      })
      setOAuthClientId('')
      setOAuthClientSecret('')
      setOAuthFormOpen(false)
      setLoginFeedback({
        agentId: 'google-antigravity',
        tone: 'success',
        message: 'OAuth 凭据已保存到本机 Keychain，现在可以点击“授权”。',
      })
    } catch (error) {
      setLoginFeedback({
        agentId: 'google-antigravity',
        tone: 'error',
        message: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setOAuthSaving(false)
    }
  }

  const closeOAuthForm = () => {
    setOAuthFormOpen(false)
    setOAuthClientId('')
    setOAuthClientSecret('')
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
          const antigravityOAuthConfigured = status?.antigravityOAuthConfigured === true
          const needsAntigravityOAuth = agent.agentId === 'google-antigravity' && !antigravityOAuthConfigured
          return (
            <li key={agent.agentId} className="local-agent-status-row">
              <span className="local-agent-status-name">{agent.label}</span>
              <span className={`local-agent-status-pill ${agentStatusClass(agent, antigravityOAuthConfigured)}`}>
                {agentStatusLabel(agent, antigravityOAuthConfigured)}
              </span>
              {agent.agentId === 'google-antigravity' && (
                <button
                  type="button"
                  className="settings-secondary-button local-agent-login-btn"
                  disabled={oauthSaving}
                  title="配置 Google Antigravity OAuth 客户端凭据"
                  onClick={() => {
                    if (oauthFormOpen) closeOAuthForm()
                    else {
                      setLoginFeedback(null)
                      setOAuthFormOpen(true)
                    }
                  }}
                >
                  <KeyRound size={14} />
                  {status?.antigravityOAuthCustomConfigured ? '自定义凭据' : '配置'}
                </button>
              )}
              {loginKind && !agent.loggedIn && (
                <button
                  type="button"
                  className="settings-primary-button local-agent-login-btn highlight"
                  disabled={loginBusy || needsAntigravityOAuth}
                  title="直接调起系统默认浏览器打开网页完成授权登录"
                  onClick={() => void handleLogin(agent, loginKind)}
                >
                  {loginBusy ? <RefreshCw size={14} className="animate-spin" /> : <Globe size={14} />}
                  {loginBusy ? '正在打开浏览器…' : needsAntigravityOAuth ? '先配置 OAuth' : '网页登录'}
                </button>
              )}
            </li>
          )
        })}
      </ul>
      {oauthFormOpen && (
        <form className="local-agent-oauth-form" onSubmit={(event) => void handleSaveOAuthCredentials(event)}>
          <div className="local-agent-oauth-form-head">
            <strong>Google Antigravity OAuth</strong>
            <button
              type="button"
              className="settings-icon-button"
              aria-label="关闭 OAuth 配置"
              onClick={closeOAuthForm}
              disabled={oauthSaving}
            >
              <X size={15} />
            </button>
          </div>
          <div className="local-agent-oauth-banner">
            <div className="local-agent-oauth-banner-text">
              <strong>首次使用需要配置 OAuth 客户端</strong>
              <p>请填写自己的 Google Cloud OAuth 客户端凭据。凭据只保存在本机 macOS Keychain。</p>
            </div>
          </div>
          <p>
            请在 Google Cloud Console 创建 OAuth 2.0 Web 应用客户端，并添加回调地址 <code>http://127.0.0.1:51121/callback</code>。
          </p>
          <label>
            Client ID
            <input
              type="text"
              value={oauthClientId}
              onChange={(event) => setOAuthClientId(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              placeholder="Google OAuth Client ID"
            />
          </label>
          <label>
            Client Secret
            <input
              type="password"
              value={oauthClientSecret}
              onChange={(event) => setOAuthClientSecret(event.target.value)}
              autoComplete="new-password"
              placeholder="Google OAuth Client Secret"
            />
          </label>
          <div className="local-agent-oauth-form-actions">
            <button type="submit" className="settings-secondary-button" disabled={oauthSaving}>
              {oauthSaving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
              {oauthSaving ? '保存中…' : '保存自定义凭据'}
            </button>
          </div>
        </form>
      )}
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

  const saveAntigravityOAuthCredentials = useCallback(async (input: { clientId: string; clientSecret: string }) => {
    const client = window.taskweaver?.models
    if (!client?.bridgeSaveAntigravityOAuthCredentials) {
      throw new Error('当前环境不支持保存 Antigravity OAuth 凭据，请使用桌面端。')
    }
    const result = await client.bridgeSaveAntigravityOAuthCredentials(input)
    if (!result?.ok) throw new Error(result?.error ?? 'OAuth 凭据保存失败。')
    setStatus((current) => ({
      ...(current ?? {}),
      antigravityOAuthConfigured: true,
      antigravityOAuthIsDefault: false,
      antigravityOAuthCustomConfigured: true,
    }))
  }, [])

  return { status, loading, refresh, login, saveAntigravityOAuthCredentials }
}
