import { useCallback, useEffect, useState } from 'react'
import { ExternalLink, Plug, RefreshCw, ShieldCheck } from 'lucide-react'
import type { OpenCodexSetupStatus } from '../../shared/model-api'

export function getComposerContinuationPresentation(status: OpenCodexSetupStatus | null) {
  if (status?.proxyUp && status.composerContinuationOk === true) {
    return {
      className: 'ok',
      label: `Composer 工具续写：版本已满足（代理 ${status.proxyVersion ?? '版本未知'}）`,
    }
  }
  if (status?.proxyUp && status.composerContinuationOk === false) {
    return {
      className: 'warn',
      color: 'var(--accent-red)',
      label: `Composer 工具续写：代理版本过旧（${status.proxyVersion ?? '版本未知'}，需要 ≥ ${status.composerContinuationMinVersion ?? '2.79.0'}）`,
    }
  }
  return {
    className: 'warn',
    label: status?.proxyVersion
      ? `Composer 工具续写：版本未验证（代理 ${status.proxyVersion}）`
      : 'Composer 工具续写：等待代理启动后验证',
  }
}

export function OpenCodexSetupCard({
  bridgeReady,
  onClearGlobalError,
}: {
  bridgeReady: boolean
  onClearGlobalError?: () => void
}) {
  const [status, setStatus] = useState<OpenCodexSetupStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [hint, setHint] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const api = window.taskweaver?.models
    if (!api?.openCodexGetSetupStatus) return
    const res = await api.openCodexGetSetupStatus()
    if (res?.ok && res.data) {
      setStatus(res.data)
      if (res.data.proxyUp && res.data.cursorLoggedIn) onClearGlobalError?.()
    }
  }, [onClearGlobalError])

  useEffect(() => {
    if (!bridgeReady) return
    void refresh()
  }, [bridgeReady, refresh])

  const run = async (action: 'ensure' | 'login' | 'dashboard') => {
    const api = window.taskweaver?.models
    if (!api) return
    setBusy(true)
    setHint(null)
    try {
      if (action === 'ensure' && api.openCodexEnsure) {
        const res = await api.openCodexEnsure()
        if (res?.ok && res.data) setStatus(res.data)
        setHint(
          res?.ok && res.data.composerContinuationOk
            ? 'OpenCodex 代理已就绪（composer-2.5 工具续写版本已满足）。'
            : '已尝试重启/升级 OpenCodex；若仍提示代理过旧，请查看下方说明。',
        )
      }
      if (action === 'login' && api.openCodexLoginCursor) {
        const res = await api.openCodexLoginCursor()
        setHint(res?.ok ? (res.data as { message?: string })?.message ?? '已在浏览器打开登录。' : res?.error ?? '登录启动失败')
      }
      if (action === 'dashboard' && api.openCodexOpenDashboard) {
        await api.openCodexOpenDashboard()
      }
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  if (!bridgeReady) return null

  const proxyLabel = status?.proxyUp ? '代理已就绪' : '代理未连接'
  const cursorLabel = status?.cursorLoggedIn ? 'Cursor 已登录' : 'Cursor 未登录'
  const composerReadiness = getComposerContinuationPresentation(status)

  return (
    <div className="opencodex-setup-card" role="region" aria-label="OpenCodex 一键配置">
      <div className="opencodex-setup-head">
        <Plug size={18} aria-hidden="true" />
        <div>
          <strong>OpenCodex（Composer / Cursor 通道）</strong>
          <p className="opencodex-setup-sub">
            无需终端：应用会调用内置 ocx 启动代理并在浏览器完成 Cursor 登录；完成后点「扫描本地模型」即可。
            {status?.bundled ? ' 当前使用 TaskWeaver 自带的 ocx。' : ''}
          </p>
        </div>
      </div>
      <div className="opencodex-setup-status">
        <span className={status?.proxyUp ? 'ok' : 'warn'}>{proxyLabel}</span>
        <span className={status?.cursorLoggedIn ? 'ok' : 'warn'}>{cursorLabel}</span>
        <span
          className={composerReadiness.className}
          style={composerReadiness.color ? { color: composerReadiness.color } : undefined}
          aria-label="Composer 工具续写版本状态"
        >
          {composerReadiness.label}
        </span>
        {status?.proxyVersion && <span className="muted">代理 {status.proxyVersion}</span>}
        {status?.cliVersion && status.cliVersion !== status.proxyVersion && (
          <span className="muted">CLI {status.cliVersion}</span>
        )}
        {status?.baseUrl && <span className="muted">{status.baseUrl}</span>}
      </div>
      {status?.proxyUp && status.composerContinuationOk === false && (
        <p className="opencodex-setup-hint" role="status">
          本机 OpenCodex 代理过旧（当前 {status.proxyVersion ?? '未知'}，需要 ≥ {status.composerContinuationMinVersion ?? '2.79.0'}）。
          composer-2.5 会误走 resumeAction，表现为工具调用后一直 Deep diving 或空回复。
          若 launchd 服务占用 10100 端口，内置 ocx 无法接管——请点「启动 OpenCodex」自动升级全局服务并重启。
          {status.upgradeError ? ` 上次尝试：${status.upgradeError}` : ''}
        </p>
      )}
      {hint && <p className="opencodex-setup-hint" role="status">{hint}</p>}
      <div className="opencodex-setup-actions">
        <button type="button" className="settings-secondary-button" disabled={busy} onClick={() => void run('ensure')}>
          <RefreshCw size={14} /> 启动 OpenCodex
        </button>
        <button type="button" className="settings-secondary-button" disabled={busy} onClick={() => void run('login')}>
          <ShieldCheck size={14} /> 浏览器登录 Cursor
        </button>
        <button type="button" className="settings-secondary-button" disabled={busy} onClick={() => void run('dashboard')}>
          <ExternalLink size={14} /> 打开控制台
        </button>
      </div>
    </div>
  )
}
