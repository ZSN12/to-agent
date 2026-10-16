import { lazy, Suspense, useEffect, useState } from 'react'
import {
  Activity,
  ArrowLeft,
  Cpu,
  Database,
  GitBranch,
  Keyboard,
  MessageSquare,
  Search,
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
import './settings-layout.css'

const ModelSettingsPanel = lazy(() => import('../models/ModelSettingsPanel').then((module) => ({ default: module.ModelSettingsPanel })))
const RoutingPortfolioSettingsPanel = lazy(() => import('../models/RoutingPortfolioSettingsPanel').then((module) => ({ default: module.RoutingPortfolioSettingsPanel })))
const McpSettingsPanel = lazy(() => import('../mcp/McpSettingsPanel').then((module) => ({ default: module.McpSettingsPanel })))
const PermissionSettingsPanel = lazy(() => import('../permissions/PermissionSettingsPanel').then((module) => ({ default: module.PermissionSettingsPanel })))
const AppearanceSettingsPanel = lazy(() => import('../appearance/AppearanceSettingsPanel').then((module) => ({ default: module.AppearanceSettingsPanel })))
const SkillSettingsPanel = lazy(() => import('../skills/SkillSettingsPanel').then((module) => ({ default: module.SkillSettingsPanel })))
const SemanticSearchSettings = lazy(() => import('./SemanticSearchSettings').then((module) => ({ default: module.SemanticSearchSettings })))

export type SettingsSection = 'appearance' | 'chat' | 'models' | 'skills' | 'routing' | 'mcp' | 'permissions' | 'shortcuts' | 'usage' | 'semantic-search'

const SETTINGS_GROUPS: Array<{ title: string; items: Array<{ section: SettingsSection; label: string; icon: typeof Sun }> }> = [
  { title: '偏好', items: [
    { section: 'appearance', label: '外观', icon: Sun },
    { section: 'chat', label: '对话', icon: MessageSquare },
    { section: 'shortcuts', label: '键盘快捷键', icon: Keyboard },
  ] },
  { title: '模型', items: [
    { section: 'models', label: '模型', icon: Database },
    { section: 'routing', label: '路由与扩展', icon: GitBranch },
    { section: 'usage', label: '模型用量', icon: Activity },
  ] },
  { title: '工具与服务', items: [
    { section: 'skills', label: 'Skill', icon: Sparkles },
    { section: 'mcp', label: 'MCP 服务', icon: Cpu },
    { section: 'semantic-search', label: '语义搜索', icon: Search },
  ] },
  { title: '安全', items: [
    { section: 'permissions', label: '安全与权限', icon: ShieldCheck },
  ] },
]

export function SettingsPage({
  section,
  onSectionChange,
  onClose,
  modelCatalog,
  shortcuts,
  onUpdateShortcuts,
  permissionMode,
  onPermissionModeChange,
  onPreferMultiAgentChange,
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
  onPreferMultiAgentChange?: (enabled: boolean) => void
  conversationId?: string | null
}) {
  const [toastMessage, setToastMessage] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const toast = (message: string) => { setToastMessage(message); window.setTimeout(() => setToastMessage(''), 2600) }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (document.activeElement?.matches('.settings-nav-search input') && searchQuery) {
          setSearchQuery('')
          return
        }
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, searchQuery])

  const normalizedQuery = searchQuery.trim().toLocaleLowerCase()
  const visibleGroups = SETTINGS_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !normalizedQuery
      || group.title.toLocaleLowerCase().includes(normalizedQuery)
      || item.label.toLocaleLowerCase().includes(normalizedQuery)),
  })).filter((group) => group.items.length > 0)

  return <div className="settings-screen" data-testid="settings-page">
    <aside className="settings-nav">
      <div className="settings-drag-space" />
      <button type="button" className="settings-back-btn" onClick={onClose} title="返回应用 (Esc)">
        <ArrowLeft size={15} />
        <span>返回应用</span>
      </button>
      <div className="settings-nav-section-title">设置分类</div>
      <div className="settings-nav-search">
        <Search size={15} aria-hidden="true" />
        <input
          type="search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="搜索设置"
          aria-label="搜索设置"
          aria-controls="settings-nav-results"
        />
        {searchQuery && <button type="button" className="settings-nav-search-clear" aria-label="清除设置搜索" onClick={() => setSearchQuery('')}><X size={14} /></button>}
      </div>
      <div className="settings-nav-list" id="settings-nav-results">
        {visibleGroups.length ? visibleGroups.map((group) => (
          <section className="settings-nav-group" key={group.title} aria-label={group.title}>
            <span className="settings-nav-group-title">{group.title}</span>
            <nav aria-label={`${group.title}设置`}>
              {group.items.map((item) => {
                const Icon = item.icon
                return <button
                  key={item.section}
                  type="button"
                  className={`settings-nav-item ${section === item.section ? 'active' : ''}`}
                  aria-current={section === item.section ? 'page' : undefined}
                  aria-controls="settings-content"
                  onClick={() => onSectionChange(item.section)}
                >
                  <Icon size={16} aria-hidden="true" />
                  <span>{item.label}</span>
                </button>
              })}
            </nav>
          </section>
        )) : <p className="settings-nav-empty" role="status">没有匹配的设置项。试试“模型”或“安全”。</p>}
      </div>
      <div className="settings-nav-footer"><span>TaskWeaver · v0.1.0</span></div>
    </aside>
    <main className="settings-main" aria-label="设置内容" data-testid="settings-content">
      <div className="settings-content" id="settings-content" key={section}>
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
            catalogStale={modelCatalog.catalogStale}
            capabilityTierStatus={modelCatalog.catalog?.capabilityTierStatus}
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
                  toast('模型目录已刷新，但本机运行时尚未返回任何提供方。请稍候再试或重启应用。')
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
            onPreferMultiAgentChange={onPreferMultiAgentChange}
            onToast={toast}
            conversationId={conversationId}
          />
        ) : section === 'shortcuts' ? (
          <ShortcutsSettings shortcuts={shortcuts} onUpdateShortcuts={onUpdateShortcuts} onToast={toast} />
        ) : section === 'semantic-search' ? (
          <SemanticSearchSettings />
        ) : (
          <UsageSettings />
        )}
        </Suspense>
      </div>
    </main>
    {toastMessage && <div className="settings-toast" role="status" aria-live="polite">{toastMessage}</div>}
  </div>
}
