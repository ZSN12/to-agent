import React, { useState, useMemo, useEffect } from 'react'
import {
  Search,
  RefreshCw,
  Settings,
  ChevronDown,
  Plus,
  Check,
  Globe,
  Database,
  Terminal,
  Folder,
  Brain,
  Share2,
  Mail,
  HardDrive,
  Layers,
  Sparkles,
  Code,
  Sliders,
  Trash2,
} from 'lucide-react'
import type { McpMarketplaceEntry, McpServerStatus } from '../../shared/app-api'

interface PluginsMarketplaceViewProps {
  onOpenSettings?: () => void
  onNewChat?: () => void
  skills?: Array<{ name: string; description: string; path?: string }>
}

export function PluginsMarketplaceView({
  onOpenSettings,
  onNewChat,
  skills = [],
}: PluginsMarketplaceViewProps) {
  const [activeTab, setActiveTab] = useState<'plugins' | 'skills'>('plugins')
  const [filterTab, setFilterTab] = useState<'public' | 'personal'>('public')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [installedIds, setInstalledIds] = useState<Set<string>>(new Set())
  const [installingId, setInstallingId] = useState<string | null>(null)
  const [catalogEntries, setCatalogEntries] = useState<McpMarketplaceEntry[]>([])
  const [githubStatus, setGithubStatus] = useState<McpServerStatus | null>(null)
  const [githubModalOpen, setGithubModalOpen] = useState(false)
  const [githubToken, setGithubToken] = useState('')
  const [githubBusy, setGithubBusy] = useState(false)

  // 网页搜索 (Web Search) 插件状态
  const [webSearchConfig, setWebSearchConfig] = useState<{
    enabled: boolean
    hasKey?: boolean
    endpoint?: string
    maxResults: number
  }>({ enabled: false, maxResults: 5 })
  const [showWebSearchModal, setShowWebSearchModal] = useState(false)
  const [wsApiKey, setWsApiKey] = useState('')
  const [wsEndpoint, setWsEndpoint] = useState('')
  const [wsMaxResults, setWsMaxResults] = useState(5)
  const [wsEnabled, setWsEnabled] = useState(false)
  const [wsClearKey, setWsClearKey] = useState(false)
  const [wsTesting, setWsTesting] = useState(false)
  const [wsTestQuery, setWsTestQuery] = useState('react 19 release date')
  const [wsTestResult, setWsTestResult] = useState<{ ok: boolean; text?: string; error?: string } | null>(null)

  // 自定义 MCP 添加弹窗
  const [showCustomModal, setShowCustomModal] = useState(false)
  const [customId, setCustomId] = useState('')
  const [customCommand, setCustomCommand] = useState('npx')
  const [customArgs, setCustomArgs] = useState('')
  const [customEnv, setCustomEnv] = useState('')
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  const notify = (text: string, type: 'success' | 'error' = 'success') => {
    setStatusMessage({ text, type })
    window.setTimeout(() => setStatusMessage(null), 3500)
  }

  const loadData = async () => {
    setLoading(true)
    try {
      const [mcpListRes, marketRes, wsRes] = await Promise.all([
        window.taskweaver?.mcp?.list?.(),
        window.taskweaver?.mcp?.marketplace?.(),
        window.taskweaver?.webSearch?.getConfig?.(),
      ])
      if (mcpListRes?.ok && Array.isArray(mcpListRes.data)) {
        setInstalledIds(new Set(mcpListRes.data.map((s: { id: string }) => s.id)))
        setGithubStatus(mcpListRes.data.find((server) => server.id === 'github') ?? null)
      } else if (mcpListRes && !mcpListRes.ok) {
        notify(`加载本地 MCP 列表失败: ${mcpListRes.error}`, 'error')
      }
      if (marketRes?.ok && Array.isArray(marketRes.data?.entries)) {
        setCatalogEntries(marketRes.data.entries)
      } else if (marketRes && !marketRes.ok) {
        notify(`加载 MCP 市场模版失败: ${marketRes.error}`, 'error')
      }
      if (wsRes?.ok && wsRes.data) {
        setWebSearchConfig(wsRes.data)
        setWsEnabled(Boolean(wsRes.data.enabled))
        setWsEndpoint(wsRes.data.endpoint || '')
        setWsMaxResults(wsRes.data.maxResults || 5)
        setWsApiKey('')
        setWsClearKey(false)
      }
    } catch (err) {
      notify(`加载数据异常: ${err instanceof Error ? err.message : String(err)}`, 'error')
    } finally {
      setLoading(false)
    }
  }

  const openWebSearchModal = () => {
    setWsEnabled(Boolean(webSearchConfig.enabled))
    setWsEndpoint(webSearchConfig.endpoint || '')
    setWsMaxResults(webSearchConfig.maxResults || 5)
    setWsApiKey('')
    setWsClearKey(false)
    setWsTestResult(null)
    setShowWebSearchModal(true)
  }

  const handleSaveWebSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    try {
      const patch = {
        enabled: wsEnabled,
        apiKey: wsClearKey ? '' : wsApiKey.trim(),
        clearKey: wsClearKey,
        endpoint: wsEndpoint.trim(),
        maxResults: Math.min(20, Math.max(1, Number(wsMaxResults) || 5)),
      }
      const res = await window.taskweaver?.webSearch?.setConfig?.(patch)
      if (res && res.ok) {
        setWebSearchConfig(res.data)
        setShowWebSearchModal(false)
        notify(
          `网页搜索设置已保存（${res.data.enabled ? '已启用' : '已关闭'}，最多 ${res.data.maxResults} 次）`,
          'success'
        )
      } else {
        const errMsg = res && !res.ok ? res.error : '未知错误'
        notify(`保存网页搜索设置失败: ${errMsg}`, 'error')
      }
    } catch (err) {
      notify(`保存失败: ${err instanceof Error ? err.message : String(err)}`, 'error')
    }
  }

  const handleToggleWebSearchQuick = async (e: React.MouseEvent) => {
    e.stopPropagation()
    const nextEnabled = !webSearchConfig.enabled
    try {
      const res = await window.taskweaver?.webSearch?.setConfig?.({ enabled: nextEnabled })
      if (res && res.ok) {
        setWebSearchConfig(res.data)
        notify(`网页搜索已${nextEnabled ? '开启' : '关闭'}`, 'success')
      }
    } catch (err) {
      notify(`切换失败: ${err instanceof Error ? err.message : String(err)}`, 'error')
    }
  }

  const handleTestWebSearch = async () => {
    if (!wsTestQuery.trim()) return
    setWsTesting(true)
    setWsTestResult(null)
    try {
      // 先临时保存当前的搜索配置，再执行测试
      await window.taskweaver?.webSearch?.setConfig?.({
        apiKey: wsClearKey ? '' : wsApiKey.trim(),
        clearKey: wsClearKey,
        endpoint: wsEndpoint.trim(),
        maxResults: Math.min(20, Math.max(1, Number(wsMaxResults) || 5)),
      })
      const testFn = window.taskweaver?.webSearch?.testSearch
      const res = await testFn?.(wsTestQuery.trim())
      if (res && res.ok) {
        setWsTestResult(res.data)
      } else {
        const errMsg = res && !res.ok ? res.error : '测试执行异常'
        setWsTestResult({ ok: false, error: errMsg })
      }
    } catch (err) {
      setWsTestResult({ ok: false, error: err instanceof Error ? err.message : String(err) })
    } finally {
      setWsTesting(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  const handleInstall = async (entry: McpMarketplaceEntry) => {
    if (entry.id === 'github') {
      setGithubToken('')
      setGithubModalOpen(true)
      return
    }
    setInstallingId(entry.id)
    try {
      const installFn = window.taskweaver?.mcp?.installMarketplace || window.taskweaver?.mcp?.installCatalog
      const res = await installFn?.(entry.id)
      if (res?.ok) {
        setInstalledIds((prev) => new Set([...prev, entry.id]))
        notify(`已添加 MCP「${entry.title}」配置，将在对话中按需建立连接`, 'success')
      } else {
        notify(`添加 MCP「${entry.title}」失败: ${res?.error || '未知错误'}`, 'error')
      }
    } catch (err) {
      notify(`添加 MCP「${entry.title}」异常: ${err instanceof Error ? err.message : String(err)}`, 'error')
    } finally {
      setInstallingId(null)
    }
  }

  const handleSaveGitHub = async (event: React.FormEvent) => {
    event.preventDefault()
    setGithubBusy(true)
    try {
      const saved = await window.taskweaver?.mcp?.configureGitHub?.(githubToken)
      if (!saved?.ok) throw new Error(saved?.error || '保存 GitHub 配置失败')
      setInstalledIds((current) => new Set([...current, 'github']))
      setGithubStatus(saved.data)

      const tested = await window.taskweaver?.mcp?.testConnection?.('github')
      if (!tested?.ok) throw new Error(tested?.error || 'GitHub 连接测试失败')
      setGithubStatus(tested.data)
      if (tested.data.status !== 'connected') {
        throw new Error(tested.data.error || 'GitHub MCP 未能建立连接')
      }

      setGithubModalOpen(false)
      setGithubToken('')
      notify(`GitHub 已连接，可用工具 ${tested.data.toolCount} 个`, 'success')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      notify(message, 'error')
      const listed = await window.taskweaver?.mcp?.list?.()
      if (listed?.ok) {
        const github = listed.data.find((server) => server.id === 'github')
        if (github) {
          setInstalledIds((current) => new Set([...current, 'github']))
          setGithubStatus(github)
        }
      }
    } finally {
      setGithubBusy(false)
    }
  }

  const handleTestGitHub = async () => {
    if (!githubStatus?.enabled) {
      notify('请先启用 GitHub 集成，再测试连接。', 'error')
      return
    }
    setGithubBusy(true)
    try {
      const result = await window.taskweaver?.mcp?.testConnection?.('github')
      if (!result?.ok) throw new Error(result?.error || 'GitHub 连接测试失败')
      setGithubStatus(result.data)
      if (result.data.status !== 'connected') throw new Error(result.data.error || 'GitHub 连接失败')
      notify(`GitHub 连接正常，可用工具 ${result.data.toolCount} 个`, 'success')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setGithubStatus((current) => current ? { ...current, status: 'error', error: message } : current)
      notify(message, 'error')
    } finally {
      setGithubBusy(false)
    }
  }

  const handleToggleGitHub = async () => {
    if (!githubStatus) return
    setGithubBusy(true)
    try {
      const nextEnabled = !githubStatus.enabled
      const result = await window.taskweaver?.mcp?.setEnabled?.('github', nextEnabled)
      if (!result?.ok) throw new Error(result?.error || `无法${nextEnabled ? '启用' : '停用'} GitHub`)
      setGithubStatus(result.data)
      notify(nextEnabled ? 'GitHub 已启用；连接后即可在对话中调用。' : 'GitHub 已停用；配置和 Token 已保留。', 'success')
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), 'error')
    } finally {
      setGithubBusy(false)
    }
  }

  const handleDisconnectGitHub = async () => {
    setGithubBusy(true)
    try {
      const result = await window.taskweaver?.mcp?.remove?.('github')
      if (!result?.ok) throw new Error(result?.error || '断开 GitHub 失败')
      setInstalledIds((current) => {
        const next = new Set(current)
        next.delete('github')
        return next
      })
      setGithubStatus(null)
      setGithubToken('')
      setGithubModalOpen(false)
      notify('GitHub 已断开，已删除本地凭据', 'success')
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), 'error')
    } finally {
      setGithubBusy(false)
    }
  }

  const handleAddCustom = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!customId.trim() || !customCommand.trim()) return
    try {
      const parsedArgs = customArgs.trim() ? customArgs.trim().split(/\s+/) : []
      const envObj: Record<string, string> = {}
      if (customEnv.trim()) {
        customEnv.split('\n').forEach((line) => {
          const eq = line.indexOf('=')
          if (eq > 0) {
            envObj[line.slice(0, eq).trim()] = line.slice(eq + 1).trim()
          }
        })
      }
      const res = await window.taskweaver?.mcp?.save?.({
        id: customId.trim(),
        command: customCommand.trim(),
        args: parsedArgs,
        env: envObj,
        enabled: true,
      })
      if (res?.ok) {
        setShowCustomModal(false)
        setCustomId('')
        setCustomArgs('')
        setCustomEnv('')
        void loadData()
        notify(`已保存自定义 MCP「${customId.trim()}」配置`, 'success')
      } else {
        notify(`添加自定义 MCP 失败: ${res?.error || '未知错误'}`, 'error')
      }
    } catch (err) {
      notify(`添加自定义 MCP 异常: ${err instanceof Error ? err.message : String(err)}`, 'error')
    }
  }

  // 顶部的品牌彩色小图标快捷筛选列表 (仅保留真实有效包)
  const quickBadges = [
    { label: 'GitHub', icon: Code, bg: '#24292e', color: '#fff', query: 'github' },
  ]

  const matchesWebSearch = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    const matchesQuery =
      !q ||
      ['网页搜索', 'web', 'search', '联网', '搜索', 'api', 'tavily', 'brave', 'serper'].some(
        (k) => k.includes(q) || q.includes(k)
      )
    const matchesTag = !selectedTag || selectedTag === 'search'
    return matchesQuery && matchesTag
  }, [searchQuery, selectedTag])

  const showWebSearchCard =
    matchesWebSearch && (filterTab === 'public' || (filterTab === 'personal' && webSearchConfig.enabled))

  const filteredPlugins = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return catalogEntries.filter((item) => {
      if (item.id !== 'github') return false
      if (filterTab === 'personal' && !installedIds.has(item.id)) return false
      if (selectedTag && !`${item.id} ${item.title} ${item.description}`.toLowerCase().includes(selectedTag)) {
        return false
      }
      if (!q) return true
      return (
        item.title.toLowerCase().includes(q) ||
        item.id.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q)
      )
    })
  }, [catalogEntries, filterTab, searchQuery, selectedTag, installedIds])

  const filteredSkills = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return skills.filter((item) => {
      if (!q) return true
      return (
        item.name.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        (item.path && item.path.toLowerCase().includes(q))
      )
    })
  }, [skills, searchQuery])

  // 图标渲染辅助
  const renderPluginIcon = (entry: McpMarketplaceEntry) => {
    const iconMap: Record<string, any> = {
      gmail: Mail,
      github: Code,
      drive: HardDrive,
      remote: Terminal,
      supabase: Database,
      postgres: Database,
      search: Search,
      browser: Globe,
      folder: Folder,
      globe: Globe,
      brain: Brain,
    }
    const IconComp = iconMap[entry.iconKey || ''] || Layers
    const bgColor = entry.color || 'var(--accent-surface)'

    return (
      <div
        className="codex-plugin-icon"
        style={{
          background: bgColor,
          color: entry.color ? '#fff' : 'var(--accent)',
        }}
      >
        <IconComp size={20} />
      </div>
    )
  }

  return (
    <div className="codex-marketplace-page">
      {statusMessage && (
        <div
          style={{
            padding: '8px 16px',
            background: statusMessage.type === 'error' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
            color: statusMessage.type === 'error' ? '#ef4444' : '#10b981',
            borderRadius: '8px',
            fontSize: '13px',
            marginBottom: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>{statusMessage.text}</span>
          <button
            type="button"
            onClick={() => setStatusMessage(null)}
            style={{ background: 'transparent', border: 0, color: 'inherit', cursor: 'pointer', padding: '0 4px' }}
          >
            ✕
          </button>
        </div>
      )}
      {/* 顶部二级导航 Header */}
      <header className="codex-marketplace-header">
        <div className="codex-marketplace-tabs">
          <button
            type="button"
            className={`codex-top-tab ${activeTab === 'plugins' ? 'active' : ''}`}
            onClick={() => setActiveTab('plugins')}
          >
            集成
          </button>
          <button
            type="button"
            className={`codex-top-tab ${activeTab === 'skills' ? 'active' : ''}`}
            onClick={() => setActiveTab('skills')}
          >
            技能
          </button>
        </div>

        <div className="codex-marketplace-header-actions">
          <button
            type="button"
            className="codex-icon-btn"
            title="刷新插件与技能"
            onClick={loadData}
            disabled={loading}
          >
            <RefreshCw size={15} className={loading ? 'spin-icon' : ''} />
          </button>
          <button
            type="button"
            className="codex-icon-btn"
            title="MCP 与环境配置"
            onClick={onOpenSettings}
          >
            <Settings size={15} />
          </button>
          <div className="codex-add-dropdown-wrap">
            <button
              type="button"
              className="codex-add-btn"
              onClick={() => setAddMenuOpen((prev) => !prev)}
            >
              <span>添加</span>
              <ChevronDown size={14} />
            </button>
            {addMenuOpen && (
              <div className="codex-dropdown-menu">
                <button
                  type="button"
                  onClick={() => {
                    setAddMenuOpen(false)
                    openWebSearchModal()
                  }}
                >
                  <Search size={14} />
                  <span>配置网页搜索</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAddMenuOpen(false)
                    setShowCustomModal(true)
                  }}
                >
                  <Sliders size={14} />
                  <span>自定义 MCP</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAddMenuOpen(false)
                    if (onOpenSettings) onOpenSettings()
                  }}
                >
                  <Globe size={14} />
                  <span>服务站点配置</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* 主体可滚动区 */}
      <div className="codex-marketplace-content">
        <div className="codex-marketplace-hero">
          <h1>{activeTab === 'plugins' ? '集成' : '技能'}</h1>
          <p>
            {activeTab === 'plugins'
              ? '连接 GitHub 仓库、Issue 与 Pull Request；其他集成将在后续加入。'
              : '自动化 Agent 任务与可复用执行能力库'}
          </p>
        </div>

        {/* 居中大搜索框 */}
        <div className="codex-search-bar-wrap">
          <div className="codex-search-bar">
            <Search size={16} className="search-icon" />
            <input
              type="search"
              placeholder={activeTab === 'plugins' ? '搜索集成…' : '搜索技能…'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {activeTab === 'plugins' ? (
          <>
            {/* 快速品牌图标滑轨 */}
            <div className="codex-quick-icons-row">
              {quickBadges.map((badge) => {
                const IconComponent = badge.icon
                const isActive = selectedTag === badge.query
                return (
                  <button
                    key={badge.label}
                    type="button"
                    className={`codex-quick-icon-btn ${isActive ? 'active' : ''}`}
                    title={badge.label}
                    onClick={() => setSelectedTag((prev) => (prev === badge.query ? null : badge.query))}
                  >
                    <div
                      className="quick-icon-inner"
                      style={{ background: badge.bg, color: badge.color }}
                    >
                      <IconComponent size={18} />
                    </div>
                  </button>
                )
              })}
            </div>

            {/* 公开 / 个人 分类 Tab */}
            <div className="codex-sub-filter-row">
              <button
                type="button"
                className={`codex-sub-filter-btn ${filterTab === 'public' ? 'active' : ''}`}
                onClick={() => setFilterTab('public')}
              >
                可用
              </button>
              <button
                type="button"
                className={`codex-sub-filter-btn ${filterTab === 'personal' ? 'active' : ''}`}
                onClick={() => setFilterTab('personal')}
              >
                已配置 ({(installedIds.has('github') ? 1 : 0) + (webSearchConfig.enabled ? 1 : 0)})
              </button>
            </div>

            {/* 插件网格列表 */}
            <section className="codex-plugins-section">
              <div className="section-title-row">
                <h2>{filterTab === 'public' ? '可用集成' : '已配置集成'}</h2>
                <span className="count-hint">
                  {filteredPlugins.length + (showWebSearchCard ? 1 : 0)} 项
                </span>
              </div>

              {!showWebSearchCard && filteredPlugins.length === 0 ? (
                <div className="codex-empty-card">
                  <p>没有匹配的插件</p>
                  {selectedTag && (
                    <button
                      type="button"
                      className="reset-tag-btn"
                      onClick={() => setSelectedTag(null)}
                    >
                      清除快捷筛选
                    </button>
                  )}
                </div>
              ) : (
                <div className="codex-plugin-grid">
                  {/* 原生内置：网页搜索插件卡片 */}
                  {showWebSearchCard && (
                    <div
                      className="codex-plugin-card codex-plugin-card-featured"
                      onClick={openWebSearchModal}
                      style={{ cursor: 'pointer' }}
                    >
                      <div className="card-left">
                        <div
                          className="codex-plugin-icon dsh-search-icon-box"
                          style={{
                            background: '#161922',
                            border: '1px solid rgba(14, 165, 233, 0.3)',
                            color: '#38bdf8',
                          }}
                        >
                          <Search size={20} />
                        </div>
                        <div className="card-text">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <h3 style={{ margin: 0 }}>网页搜索</h3>
                            <span
                              style={{
                                fontSize: '10px',
                                padding: '1px 5px',
                                borderRadius: '4px',
                                background: 'rgba(56, 189, 248, 0.15)',
                                color: '#38bdf8',
                                fontWeight: 600,
                              }}
                            >
                              内置服务
                            </span>
                          </div>
                          <p title="设置 TaskWeaver 的搜索提供方。在对话与子任务中自动检索最新技术文档与报错信息。">
                            设置 TaskWeaver 的搜索提供方。支持自定义接口地址、API Key 与最大搜索次数。
                          </p>
                        </div>
                      </div>

                      <div
                        className="card-right"
                        style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          className="codex-icon-btn"
                          title="配置网页搜索"
                          onClick={openWebSearchModal}
                          style={{ width: '28px', height: '28px' }}
                        >
                          <Sliders size={14} />
                        </button>
                        <button
                          type="button"
                          className={
                            webSearchConfig.enabled ? 'installed-tag' : 'install-action-btn'
                          }
                          title={
                            webSearchConfig.enabled
                              ? '已启用（点击关闭）'
                              : '未启用（点击开启）'
                          }
                          onClick={handleToggleWebSearchQuick}
                        >
                          {webSearchConfig.enabled ? <Check size={14} /> : <Plus size={16} />}
                        </button>
                      </div>
                    </div>
                  )}

                  {filteredPlugins.map((entry) => {
                    const isInstalled = installedIds.has(entry.id)
                    const isBusy = installingId === entry.id || githubBusy
                    const isConnected = entry.id === 'github' && githubStatus?.status === 'connected'
                    const githubEnabled = githubStatus?.enabled === true
                    return (
                      <div className="codex-plugin-card" key={entry.id}>
                        <div className="card-left">
                          {renderPluginIcon(entry)}
                          <div className="card-text">
                            <h3>{entry.title}</h3>
                            <p title={entry.description}>{entry.description}</p>
                          </div>
                        </div>

                        <div className="card-right" onClick={(event) => event.stopPropagation()}>
                          {isInstalled ? (
                            <>
                              <span
                                className="installed-tag"
                                title={!githubEnabled ? 'GitHub 已停用' : isConnected ? 'GitHub 已连接' : `GitHub ${githubStatus?.status === 'error' ? '连接失败' : '已启用，尚未连接'}`}
                                style={{ width: 'auto', minWidth: 26, padding: '0 8px', fontSize: 11, background: githubEnabled ? undefined : 'rgba(148, 163, 184, 0.14)', color: githubEnabled ? undefined : 'var(--text-secondary)' }}
                              >
                                {!githubEnabled ? '已停用' : isConnected ? <Check size={14} /> : githubStatus?.status === 'error' ? '!' : '未连接'}
                              </span>
                              <button
                                type="button"
                                className={githubEnabled ? 'settings-secondary-button' : 'settings-primary-button'}
                                title={githubEnabled ? '停用 GitHub；保留配置和 Token' : '启用 GitHub'}
                                onClick={() => void handleToggleGitHub()}
                                disabled={isBusy}
                              >
                                {githubEnabled ? '停用' : '启用'}
                              </button>
                              <button type="button" className="codex-icon-btn" title="测试 GitHub 连接" onClick={handleTestGitHub} disabled={isBusy || !githubEnabled}>
                                {isBusy ? <RefreshCw size={14} className="spin-icon" /> : <RefreshCw size={14} />}
                              </button>
                              <button type="button" className="codex-icon-btn" title="管理 GitHub 凭据" onClick={() => { setGithubToken(''); setGithubModalOpen(true) }} disabled={isBusy}>
                                <Sliders size={14} />
                              </button>
                              <button type="button" className="codex-icon-btn" title="移除 GitHub 集成并删除本地凭据" onClick={() => void handleDisconnectGitHub()} disabled={isBusy}>
                                <Trash2 size={14} />
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              className="install-action-btn"
                              title="连接 GitHub"
                              onClick={() => handleInstall(entry)}
                              disabled={isBusy}
                            >
                              {isBusy ? (
                                <RefreshCw size={14} className="spin-icon" />
                              ) : (
                                <Plus size={16} />
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          </>
        ) : (
          /* 技能 Tab 列表 */
          <section className="codex-plugins-section">
            <div className="section-title-row">
              <h2>当前可用技能</h2>
              <span className="count-hint">{filteredSkills.length} 项</span>
            </div>

            {filteredSkills.length === 0 ? (
              <div className="codex-empty-card">
                <p>暂无技能，在项目根目录创建技能文件即可自动加载。</p>
              </div>
            ) : (
              <div className="codex-plugin-grid">
                {filteredSkills.map((skill) => (
                  <div className="codex-plugin-card" key={skill.name}>
                    <div className="card-left">
                      <div className="codex-plugin-icon skill-icon">
                        <Sparkles size={20} />
                      </div>
                      <div className="card-text">
                        <h3>{skill.name}</h3>
                        <p title={skill.description}>{skill.description}</p>
                      </div>
                    </div>
                    <div className="card-right">
                      <span className="skill-badge-active">已激活</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>

      {/* 网页搜索 (Web Search) 独立配置模态框 (1:1 参考 DSH 视觉设计) */}
      {showWebSearchModal && (
        <div
          className="settings-modal-backdrop"
          role="presentation"
          onClick={() => setShowWebSearchModal(false)}
        >
          <div
            className="dsh-websearch-modal"
            role="dialog"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 顶部图标与标题 */}
            <div className="dsh-ws-header">
              <div className="dsh-ws-icon-box">
                <Search size={22} className="dsh-ws-icon" />
              </div>
              <div className="dsh-ws-title-group">
                <h2>网页搜索</h2>
                <p>设置 TaskWeaver 的搜索提供方。</p>
              </div>
              <div className="dsh-ws-switch-wrap">
                <label className="dsh-ws-toggle-label">
                  <input
                    type="checkbox"
                    checked={wsEnabled}
                    onChange={(e) => setWsEnabled(e.target.checked)}
                  />
                  <span className="dsh-ws-toggle-slider" />
                </label>
                <span className="dsh-ws-toggle-text">{wsEnabled ? '已启用' : '已停用'}</span>
              </div>
            </div>

            <form onSubmit={handleSaveWebSearch} className="dsh-ws-form">
              {/* API Key */}
              <div className="dsh-ws-field">
                <div className="dsh-ws-field-header">
                  <label className="dsh-ws-field-title">API Key</label>
                  {webSearchConfig.hasKey && !wsClearKey ? (
                    <span className="dsh-ws-badge-configured">
                      <span className="dsh-ws-badge-dot" />
                      已配置密钥。
                    </span>
                  ) : (
                    <span className="dsh-ws-badge-empty">未配置密钥</span>
                  )}
                </div>
                <input
                  type="password"
                  className="dsh-ws-input"
                  placeholder={
                    webSearchConfig.hasKey && !wsClearKey
                      ? '••••••••••••••••••••••••'
                      : '请输入搜索 API Key（若有）'
                  }
                  value={wsApiKey}
                  onChange={(e) => {
                    setWsApiKey(e.target.value)
                    setWsClearKey(false)
                  }}
                  autoComplete="off"
                />
                <div className="dsh-ws-field-footer">
                  <span className="dsh-ws-hint">
                    不写入设置文件。留空表示保持当前密钥。
                  </span>
                  {webSearchConfig.hasKey && !wsClearKey && (
                    <button
                      type="button"
                      className="dsh-ws-clear-btn"
                      onClick={() => {
                        setWsClearKey(true)
                        setWsApiKey('')
                      }}
                    >
                      清除当前密钥
                    </button>
                  )}
                  {wsClearKey && (
                    <span style={{ fontSize: '11px', color: '#f59e0b' }}>
                      保存后将清空已存密钥
                    </span>
                  )}
                </div>
              </div>

              {/* 接口地址 */}
              <div className="dsh-ws-field">
                <div className="dsh-ws-field-header">
                  <label className="dsh-ws-field-title">接口地址</label>
                </div>
                <input
                  type="text"
                  className="dsh-ws-input"
                  placeholder="留空则使用提供方默认地址"
                  value={wsEndpoint}
                  onChange={(e) => setWsEndpoint(e.target.value)}
                />
                <div className="dsh-ws-field-footer">
                  <span className="dsh-ws-hint">
                    留空则使用提供方默认地址。支持 Tavily / Brave / Serper / SearXNG 及自定义搜索 API。
                  </span>
                </div>
              </div>

              {/* 单次请求最多搜索次数 */}
              <div className="dsh-ws-field">
                <div className="dsh-ws-field-header">
                  <label className="dsh-ws-field-title">单次请求最多搜索次数</label>
                </div>
                <input
                  type="number"
                  min={1}
                  max={20}
                  className="dsh-ws-input"
                  value={wsMaxResults}
                  onChange={(e) => setWsMaxResults(Number(e.target.value))}
                />
                <div className="dsh-ws-field-footer">
                  <span className="dsh-ws-hint">
                    一次请求在必须作答前最多可以搜索多少次。
                  </span>
                </div>
              </div>

              {/* 连通性测试区块 */}
              <div className="dsh-ws-test-section">
                <div className="dsh-ws-test-row">
                  <input
                    type="text"
                    className="dsh-ws-input dsh-ws-test-input"
                    value={wsTestQuery}
                    onChange={(e) => setWsTestQuery(e.target.value)}
                    placeholder="输入测试关键词，如 react 19 release"
                  />
                  <button
                    type="button"
                    className="dsh-ws-test-btn"
                    disabled={wsTesting || !wsTestQuery.trim()}
                    onClick={handleTestWebSearch}
                  >
                    {wsTesting ? <RefreshCw size={14} className="spin-icon" /> : '测试连接'}
                  </button>
                </div>
                {wsTestResult && (
                  <div
                    className={`dsh-ws-test-result ${wsTestResult.ok ? 'success' : 'error'}`}
                  >
                    {wsTestResult.ok ? (
                      <div className="dsh-ws-result-content">
                        <strong>✓ 检索成功</strong>
                        <pre>{wsTestResult.text}</pre>
                      </div>
                    ) : (
                      <div className="dsh-ws-result-content">
                        <strong>✕ 检索失败</strong>
                        <span>{wsTestResult.error}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 保存与取消按钮 */}
              <div className="dsh-ws-actions">
                <button
                  type="submit"
                  className="dsh-ws-save-btn"
                >
                  保存
                </button>
                <button
                  type="button"
                  className="dsh-ws-cancel-btn"
                  onClick={() => setShowWebSearchModal(false)}
                >
                  取消
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {githubModalOpen && (
        <div className="settings-modal-backdrop" role="presentation" onClick={() => !githubBusy && setGithubModalOpen(false)}>
          <div className="codex-modal-card" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <h2>连接 GitHub</h2>
            <p>通过 GitHub 官方托管 MCP 连接。Token 只保存在本机系统安全存储中，不会写入项目文件。</p>
            <form onSubmit={handleSaveGitHub}>
              <label>
                Personal Access Token
                <input
                  type="password"
                  value={githubToken}
                  onChange={(event) => setGithubToken(event.target.value)}
                  placeholder={installedIds.has('github') ? '已保存；留空以继续使用现有 Token' : '粘贴 GitHub Token'}
                  autoComplete="new-password"
                  spellCheck={false}
                />
              </label>
              <p style={{ margin: '8px 0 0', color: 'var(--text-secondary)', fontSize: '12px', lineHeight: 1.5 }}>
                建议使用细粒度 Token，只选择需要访问的仓库和权限。TaskWeaver 连接测试成功后才会显示“已连接”；写入类工具仍受应用权限确认控制。
              </p>
              {githubStatus?.status === 'error' && githubStatus.error && (
                <p role="alert" style={{ color: 'var(--danger, #ef4444)', fontSize: '12px' }}>{githubStatus.error}</p>
              )}
              <div className="codex-modal-actions">
                {installedIds.has('github') && (
                  <button type="button" className="settings-secondary-button" onClick={() => void handleDisconnectGitHub()} disabled={githubBusy}>
                    断开并删除
                  </button>
                )}
                <button type="button" className="settings-secondary-button" onClick={() => setGithubModalOpen(false)} disabled={githubBusy}>
                  取消
                </button>
                <button type="submit" className="settings-primary-button" disabled={githubBusy || (!githubToken.trim() && !installedIds.has('github'))}>
                  {githubBusy ? <><RefreshCw size={14} className="spin-icon" /> 正在测试…</> : '保存并测试连接'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 自定义 MCP 弹窗 */}
      {showCustomModal && (
        <div
          className="settings-modal-backdrop"
          role="presentation"
          onClick={() => setShowCustomModal(false)}
        >
          <div
            className="codex-modal-card"
            role="dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <h2>添加自定义 MCP 插件</h2>
            <p>连接任意标准 Stdio 协议的 Model Context Protocol 服务器。</p>
            <form onSubmit={handleAddCustom}>
              <label>
                插件标识 (ID)
                <input
                  type="text"
                  placeholder="如 my-database-mcp"
                  value={customId}
                  onChange={(e) => setCustomId(e.target.value)}
                  required
                />
              </label>
              <label>
                执行命令
                <input
                  type="text"
                  placeholder="如 npx 或 python"
                  value={customCommand}
                  onChange={(e) => setCustomCommand(e.target.value)}
                  required
                />
              </label>
              <label>
                命令参数 (空格分隔)
                <input
                  type="text"
                  placeholder="如 -y @modelcontextprotocol/server-postgres"
                  value={customArgs}
                  onChange={(e) => setCustomArgs(e.target.value)}
                />
              </label>
              <label>
                环境变量 (每行 KEY=VALUE)
                <textarea
                  rows={3}
                  placeholder="API_KEY=xxx&#10;PORT=5432"
                  value={customEnv}
                  onChange={(e) => setCustomEnv(e.target.value)}
                />
              </label>
              <div className="codex-modal-actions">
                <button
                  type="button"
                  className="settings-secondary-button"
                  onClick={() => setShowCustomModal(false)}
                >
                  取消
                </button>
                <button type="submit" className="settings-primary-button">
                  添加并连接
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
