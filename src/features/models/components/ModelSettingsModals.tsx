import { FormEvent, useEffect, useId, useState } from 'react'
import { Check, Copy, X } from 'lucide-react'
import { InlineSelect } from '../../../shared/InlineSelect'
import type { ProviderAuthStatus, OAuthStatusInfo } from '../../../shared/model-api'
import { copyTextToClipboard } from '../../../shared/clipboard'
import { useModalFocusTrap } from '../../../shared/useModalFocusTrap'

export function OAuthLoginModal({
  status,
  providerId,
  onClose,
  onSubmitCode,
}: {
  status: OAuthStatusInfo | null
  providerId: string
  onClose: () => void
  onSubmitCode: (code: string) => Promise<boolean>
}) {
  const titleId = useId()
  const dialogRef = useModalFocusTrap<HTMLDivElement>({ open: true, onEscape: onClose })
  const [code, setCode] = useState('')
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const providerLabel = providerId === 'anthropic' ? 'Claude Pro/Max' : 'ChatGPT Plus/Pro'
  useEffect(() => {
    if (status?.status !== 'completed') return
    const timer = setTimeout(onClose, 700)
    return () => clearTimeout(timer)
  }, [onClose, status?.status])

  const copyUrl = async () => {
    if (!status?.url) return
    const didCopy = await copyTextToClipboard(status.url)
    setCopied(didCopy)
    setCopyError(!didCopy)
    window.setTimeout(() => {
      setCopied(false)
      setCopyError(false)
    }, 2000)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!code.trim()) return
    setSubmitting(true)
    const ok = await onSubmitCode(code.trim())
    setSubmitting(false)
    if (ok) onClose()
  }

  return (
    <div
      className="settings-modal-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div ref={dialogRef} className="model-editor oauth-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <h2 id={titleId}>{providerLabel} 官方订阅授权</h2>
        <p>{status?.instructions || `TaskWeaver 将打开 ${providerId === 'anthropic' ? 'Anthropic' : 'OpenAI Codex'} 官方登录页面，并将凭据保存在本机凭据库中。`}</p>

        <div className="oauth-status-box">
          <div className="oauth-status-spinner" />
          <div className="oauth-status-text">
            <strong>{status?.status === 'error' ? '授权未完成' : status?.status === 'completed' ? '授权完成' : status?.status === 'prompt' ? status.prompt?.message : '正在等待官方授权完成…'}</strong>
            <span>
              {status?.error
                || (status?.status === 'completed'
                  ? '授权已安全保存在本机，可在模型列表中使用 Codex 模型。'
                  : '登录成功后授权信息会安全保存在本机；若浏览器未自动打开，请使用下方链接。')}
            </span>
          </div>
        </div>

        {status?.url && (
          <div className="oauth-fallback-section">
            <label className="oauth-hint-label">若浏览器未自动打开，可手动复制此授权链接并在浏览器中访问：</label>
            <div className="oauth-url-row">
              <input type="text" readOnly value={status.url} className="oauth-url-input" />
              <button type="button" className="settings-secondary-button" onClick={copyUrl}>
                {copied ? <Check size={14} /> : copyError ? <X size={14} /> : <Copy size={14} />}
                {copied ? '已复制' : copyError ? '复制失败' : '复制链接'}
              </button>
            </div>
          </div>
        )}

        {status?.status === 'prompt' && status.prompt?.kind === 'select' && status.prompt.options ? (
          <form onSubmit={submit} className="oauth-manual-form">
            <div className="oauth-manual-field" role="group" aria-label={status.prompt.message}>
              <span>{status.prompt.message}</span>
              <InlineSelect
                className="oauth-prompt-select"
                value={code}
                onChange={setCode}
                ariaLabel={status.prompt.message}
                placeholder="请选择…"
                searchable={status.prompt.options.length > 8}
                options={status.prompt.options.map((option) => ({
                  value: option.id,
                  label: option.label,
                  description: option.description,
                }))}
              />
            </div>
            <div className="model-editor-actions">
              <button type="button" className="settings-secondary-button" onClick={onClose}>取消</button>
              <button className="settings-primary-button" disabled={!code.trim() || submitting}>{submitting ? '正在提交…' : '继续'}</button>
            </div>
          </form>
        ) : null}
        {(status?.status === 'prompt' && status.prompt?.kind !== 'select') || status?.url || status?.status === 'device_code' ? (
        <form onSubmit={submit} className="oauth-manual-form">
          <label>
            {status?.status === 'prompt' ? status.prompt?.message : '若浏览器未自动回调，可粘贴浏览器最终重定向链接或授权码：'}
            <input
              type={status?.prompt?.kind === 'secret' ? 'password' : 'text'}
              placeholder={status?.prompt?.placeholder || '粘贴授权内容'}
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
          <div className="model-editor-actions">
            <button type="button" className="settings-secondary-button" onClick={onClose}>
              取消
            </button>
            <button className="settings-primary-button" disabled={!code.trim() || submitting}>
              {submitting ? '正在提交…' : status?.status === 'prompt' ? '继续' : '提交授权链接/码'}
            </button>
          </div>
        </form>
        ) : null}
      </div>
    </div>
  )
}
export function ProviderKeyModal({
  provider,
  onClose,
  onSave,
}: {
  provider: ProviderAuthStatus
  onClose: () => void
  onSave: (apiKey: string) => Promise<{ ok: boolean; error?: string }>
}) {
  const titleId = useId()
  const dialogRef = useModalFocusTrap<HTMLFormElement>({ open: true, onEscape: onClose })
  const [apiKey, setApiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!apiKey.trim()) return
    setSaving(true)
    setSaveError(null)
    const result = await onSave(apiKey.trim())
    setSaving(false)
    if (result.ok) onClose()
    else setSaveError(result.error ?? '保存失败')
  }

  return (
    <div
      className="settings-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <form ref={dialogRef} className="model-editor" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <h2 id={titleId}>配置 {provider.name} API 密钥</h2>
        <p>凭据仅保存在 TaskWeaver 的应用数据中。</p>
        <label>
          API 密钥
          <input
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            autoComplete="new-password"
            required
          />
        </label>
        {saveError && <div className="settings-inline-error" role="alert">{saveError}</div>}
        <div className="model-editor-actions">
          <button type="button" className="settings-secondary-button" onClick={onClose}>
            取消
          </button>
          <button type="submit" className="settings-primary-button" disabled={!apiKey.trim() || saving}>
            保存
          </button>
        </div>
      </form>
    </div>
  )
}
