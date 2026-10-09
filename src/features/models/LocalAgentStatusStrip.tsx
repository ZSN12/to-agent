import { useCallback, useEffect, useState } from 'react'
import { LogIn, RefreshCw } from 'lucide-react'
import type { LocalAgentBridgeStatus, LocalAgentDiscovery } from '../../shared/model-api'

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
  onLogin: (kind: 'cursor' | 'google-antigravity') => Promise<void>
  legacyOpenCodex?: boolean
  onMigrateLegacy?: () => Promise<void>
  migrateLoading?: boolean
}) {
  const agents = status?.localAgents ?? []
  if (!agents.length && !legacyOpenCodex) return null

  return (
    <div className="local-agent-status-strip" role="region" aria-label="本地官方 Agent 状态">
      <div className="local-agent-status-head">
        <strong>本地官方 Agent</strong>
        <span className="local-agent-status-hint">扫描后模型经内置桥接入 Z Host，无需本机 10100 代理</span>
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
                  onClick={() => void onLogin(loginKind)}
                >
                  <LogIn size={14} />
                  登录
                </button>
              )}
            </li>
          )
        })}
      </ul>
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
      if (!client?.bridgeLogin) return
      await client.bridgeLogin(kind)
      await refresh()
    },
    [refresh],
  )

  return { status, loading, refresh, login }
}
