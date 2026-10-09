import { lazy, Suspense, useEffect, useState } from 'react'
import {
  Activity,
  ArrowLeft,
  Cpu,
  Database,
  GitBranch,
  Keyboard,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  Sun,
  X,
} from 'lucide-react'
import type { PermissionMode } from '../../shared/app-api'
import type { ShortcutItem } from '../../shared/shortcuts'
import { useModelCatalog } from '../models/useModelCatalog'
import { ChatBehaviorSettingsPanel } from '../chat/ChatBehaviorSettingsPanel'
import { ShortcutsSettings } from './ShortcutsSettings'
import { UsageSettings } from '../usage/UsageSettings'

const ModelSettingsPanel = lazy(() => import('../models/ModelSettingsPanel').then((module) => ({ default: module.ModelSettingsPanel })))
const RoutingPortfolioSettingsPanel = lazy(() => import('../models/RoutingPortfolioSettingsPanel').then((module) => ({ default: module.RoutingPortfolioSettingsPanel })))
const McpSettingsPanel = lazy(() => import('../mcp/McpSettingsPanel').then((module) => ({ default: module.McpSettingsPanel })))
const PermissionSettingsPanel = lazy(() => import('../permissions/PermissionSettingsPanel').then((module) => ({ default: module.PermissionSettingsPanel })))
const AppearanceSettingsPanel = lazy(() => import('../appearance/AppearanceSettingsPanel').then((module) => ({ default: module.AppearanceSettingsPanel })))
const SkillSettingsPanel = lazy(() => import('../skills/SkillSettingsPanel').then((module) => ({ default: module.SkillSettingsPanel })))

export type SettingsSection = 'appearance' | 'chat' | 'models' | 'skills' | 'routing' | 'mcp' | 'permissions' | 'shortcuts' | 'usage'

export function SettingsPage({
  section,
  onSectionChange,
  onClose,
  modelCatalog,
  shortcuts,
  onUpdateShortcuts,
  permissionMode,
  onPermissionModeChange,
  conversationId = null,
}: {
  section: SettingsSection
  onSectionChange: (section: SettingsSection) => void
  onClose: () => void
  modelCatalog: ReturnType<typeof useModelCatalog>
  shortcuts: ShortcutItem[]
  onUpdateShortcuts: (next: ShortcutItem[]) => void
  permissionMode?: PermissionMode
  onPermissionModeChange?: (mode: PermissionMode) => void
  conversationId?: string | null
}) {
  const [toastMessage, setToastMessage] = useState('')
  const toast = (message: string) => { setToastMessage(message); window.setTimeout(() => setToastMessage(''), 2600) }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return <div className="settings-screen" data-testid="settings-page">
    <aside className="settings-nav">
      <div className="settings-drag-space" />
      <button type="button" className="settings-back-btn" onClick={onClose} title="返回应用 (Esc)">
        <ArrowLeft size={15} />
        <span>返回应用</span>
      </button>
      <div className="settings-nav-section-title">设置分类</div>
      <nav aria-label="设置导航">
        <button className={`settings-nav-item ${section === 'appearance' ? 'active' : ''}`} onClick={() => onSectionChange('appearance')}><Sun size={16} /><span>外观</span></button>
        <button className={`settings-nav-item ${section === 'chat' ? 'active' : ''}`} onClick={() => onSectionChange('chat')}><MessageSquare size={16} /><span>对话</span></button>
        <button className={`settings-nav-item ${section === 'models' ? 'active' : ''}`} onClick={() => onSectionChange('models')}><Database size={16} /><span>模型</span></button>
        <button className={`settings-nav-item ${section === 'skills' ? 'active' : ''}`} onClick={() => onSectionChange('skills')}><Sparkles size={16} /><span>Skill</span></button>
        <button className={`settings-nav-item ${section === 'routing' ? 'active' : ''}`} onClick={() => onSectionChange('routing')}><GitBranch size={16} /><span>路由作品集</span></button>
        <button className={`settings-nav-item ${section === 'mcp' ? 'active' : ''}`} onClick={() => onSectionChange('mcp')}><Cpu size={16} /><span>MCP 服务</span></button>
        <button className={`settings-nav-item ${section === 'permissions' ? 'active' : ''}`} onClick={() => onSectionChange('permissions')}><ShieldCheck size={16} /><span>安全与权限</span></button>
        <button className={`settings-nav-item ${section === 'shortcuts' ? 'active' : ''}`} onClick={() => onSectionChange('shortcuts')}><Keyboard size={16} /><span>键盘快捷键</span></button>
        <button className={`settings-nav-item ${section === 'usage' ? 'active' : ''}`} onClick={() => onSectionChange('usage')}><Activity size={16} /><span>模型用量</span></button>
      </nav>
      <div className="settings-nav-footer"><span>TaskWeaver · v0.1.0</span></div>
    </aside>
    <main className="settings-main" aria-label="设置内容" data-testid="settings-content">
      <header className="settings-topbar">
        <div className="settings-topbar-drag" />
        <button className="settings-close-btn" onClick={onClose} aria-label="关闭设置" title="返回对话 (Esc)">
          <X size={16} />
        </button>
      </header>
      <div className="settings-content" key={section}>
        <Suspense fallback={<div className="settings-loading" role="status">正在加载设置…</div>}>
        {section === 'appearance' ? (
          <AppearanceSettingsPanel onToast={toast} />
        ) : section === 'chat' ? (
          <ChatBehaviorSettingsPanel onToast={toast} />
        ) : section === 'models' ? (
          <ModelSettingsPanel
            auth={modelCatalog.auth}
            models={modelCatalog.catalog?.models ?? []}
            candidateModels={modelCatalog.catalog?.candidateModels ?? []}
            loading={modelCatalog.loading}
            bridgeReady={modelCatalog.bridgeReady}
            error={modelCatalog.error}
            oauthStatus={modelCatalog.oauthStatus}
            updateStatus={modelCatalog.updateStatus}
            onCheckForUpdates={modelCatalog.checkForModelUpdates}
            onRollbackRegistry={modelCatalog.rollbackModelRegistry}
            onRefresh={() => {
              void modelCatalog.refresh().then((result) => {
                if (!result?.ok || result.error) {
                  toast(result?.error ?? '刷新模型目录失败')
                  return
                }
                if (result.providerCount === 0) {
                  toast('模型目录已刷新，但 Z Runtime 未返回任何提供方。请稍候再试或重启应用（Z Host 可能仍在启动）。')
                  return
                }
                toast('模型目录已同步。')
              })
            }}
            onSetProviderApiKey={modelCatalog.setProviderApiKey}
            onStartOAuthLogin={modelCatalog.startOAuthLogin}
            onCancelOAuthLogin={modelCatalog.cancelOAuthLogin}
            onSubmitOAuthCode={modelCatalog.submitOAuthCode}
            onLogoutOAuth={modelCatalog.logoutOAuth}
            onUpsertProfile={modelCatalog.upsertProfile}
            onAddModel={modelCatalog.addModel}
            onAddModels={modelCatalog.addModels}
            onScanLocalOpenCodex={modelCatalog.scanLocalOpenCodex}
            onRemoveModel={modelCatalog.removeModel}
            onRemoveProviderCredentials={modelCatalog.removeProviderCredentials}
            onClearCatalogError={modelCatalog.clearError}
            onToast={toast}
          />
        ) : section === 'skills' ? (
          <SkillSettingsPanel />
        ) : section === 'routing' ? (
          <RoutingPortfolioSettingsPanel onToast={toast} conversationId={conversationId} />
        ) : section === 'mcp' ? (
          <McpSettingsPanel onToast={toast} />
        ) : section === 'permissions' ? (
          <PermissionSettingsPanel
            currentMode={permissionMode}
            onModeChange={onPermissionModeChange}
            onToast={toast}
            conversationId={conversationId}
          />
        ) : section === 'shortcuts' ? (
          <ShortcutsSettings shortcuts={shortcuts} onUpdateShortcuts={onUpdateShortcuts} onToast={toast} />
        ) : (
          <UsageSettings />
        )}
        </Suspense>
      </div>
    </main>
    {toastMessage && <div className="settings-toast" role="status" aria-live="polite">{toastMessage}</div>}
  </div>
}
