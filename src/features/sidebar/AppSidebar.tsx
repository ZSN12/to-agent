import {
  Archive,
  ArchiveRestore,
  Bell,
  ChevronDown,
  ChevronRight,
  Clock,
  Compass,
  Folder,
  GitPullRequest,
  MoreHorizontal,
  HelpCircle,
  PanelLeft,
  Pin,
  PinOff,
  Pencil,
  Plus,
  Puzzle,
  Search,
  Settings,
  SquarePen,
  Trash2,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { ThreadRunningIndicator } from '../chat/ThreadRunningIndicator'
import type { ThreadSummary } from '../../shared/app-api'
import { threadUpdatedLabel, workspaceLabel } from '../../shared/ui-utils'

export function AppSidebar({
  collapsed,
  workspacePath: _workspacePath,
  threads,
  currentThreadId,
  onOpenSettings,
  onNewChat,
  onPickWorkspace,
  onSwitchThread,
  onRenameThread,
  onTogglePinThread,
  onToggleArchiveThread,
  onDeleteThread,
  onSearchThreads,
  runningConversationIds = [],
  completedConversationIds = [],
  activeMainView = 'chat',
  onSelectMainView,
  onToggleCollapsed,
}: {
  collapsed: boolean
  workspacePath: string | null
  threads: ThreadSummary[]
  currentThreadId: string | null
  runningConversationIds?: string[]
  completedConversationIds?: string[]
  activeMainView?: string
  onSelectMainView?: (view: 'chat' | 'plugins' | 'pull-requests' | 'schedules' | 'explore') => void
  onOpenSettings: () => void
  onNewChat: () => void
  onPickWorkspace: () => void
  onSwitchThread: (threadId: string) => void
  onRenameThread: (threadId: string, title: string) => void
  onTogglePinThread: (threadId: string) => void
  onToggleArchiveThread: (threadId: string) => void
  onDeleteThread: (threadId: string) => void
  onSearchThreads?: (query: string) => Promise<ThreadSummary[]>
  onToggleCollapsed?: () => void
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [remoteSearchResults, setRemoteSearchResults] = useState<ThreadSummary[] | null>(null)
  const [projectsCollapsed, setProjectsCollapsed] = useState(false)
  const [pinnedCollapsed, setPinnedCollapsed] = useState(false)
  const [archivedCollapsed, setArchivedCollapsed] = useState(true)
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(() => {
    try {
      const stored = window.localStorage.getItem('taskweaver.sidebar.collapsed-projects')
      const parsed: unknown = stored ? JSON.parse(stored) : []
      return new Set(Array.isArray(parsed) ? parsed.filter((key): key is string => typeof key === 'string') : [])
    } catch {
      return new Set()
    }
  })

  // 活跃会话与已归档会话分离
  const activeThreads = useMemo(() => {
    return threads.filter((thread) => !thread.archived)
  }, [threads])

  const archivedThreads = useMemo(() => {
    return threads.filter((thread) => Boolean(thread.archived)).sort((a, b) => b.updatedAt - a.updatedAt)
  }, [threads])

  const runningConversationSet = useMemo(
    () => new Set(runningConversationIds),
    [runningConversationIds],
  )
  const completedConversationSet = useMemo(
    () => new Set(completedConversationIds),
    [completedConversationIds],
  )
  const threadBackgroundStatus = (thread: ThreadSummary): 'running' | 'done' | null => {
    if (runningConversationSet.has(thread.conversationId)) return 'running'
    if (completedConversationSet.has(thread.conversationId)) return 'done'
    return null
  }

  useEffect(() => {
    const q = searchQuery.trim()
    if (!q || !onSearchThreads) {
      setRemoteSearchResults(null)
      return
    }
    const timer = window.setTimeout(() => {
      void onSearchThreads(q).then((rows) => setRemoteSearchResults(rows))
    }, 280)
    return () => window.clearTimeout(timer)
  }, [searchQuery, onSearchThreads])

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return []
    if (remoteSearchResults) return remoteSearchResults
    return threads.filter((thread) => {
      const matchTitle = thread.title.toLowerCase().includes(q)
      const matchPath = (thread.workspacePath ?? '').toLowerCase().includes(q)
      return matchTitle || matchPath
    }).sort((a, b) => b.updatedAt - a.updatedAt)
  }, [threads, searchQuery, remoteSearchResults])

  // 置顶对话列表（仅活跃）
  const pinnedThreads = useMemo(() => {
    return activeThreads.filter((thread) => Boolean(thread.pinned)).sort((a, b) => b.updatedAt - a.updatedAt)
  }, [activeThreads])

  // 没有选择项目的独立对话：平铺在“最近”区域（仅活跃）
  const recentThreads = useMemo(() => {
    return activeThreads
      .filter((thread) => !thread.workspacePath)
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }, [activeThreads])

  // 属于工作区的对话：收纳在“项目”分组中（仅活跃）
  const projectGroups = useMemo(() => {
    const grouped = new Map<string, ThreadSummary[]>()
    for (const thread of activeThreads) {
      if (!thread.workspacePath) continue
      grouped.set(thread.workspacePath, [...(grouped.get(thread.workspacePath) ?? []), thread])
    }
    const groups = [...grouped.entries()].map(([path, projectThreads]) => ({
      path,
      name: workspaceLabel(path),
      threads: projectThreads.sort((a, b) => b.updatedAt - a.updatedAt),
      current: projectThreads.some((thread) => thread.id === currentThreadId),
    }))
    const duplicateNames = new Map<string, number>()
    for (const group of groups) duplicateNames.set(group.name, (duplicateNames.get(group.name) ?? 0) + 1)
    return groups.map((group) => {
      if ((duplicateNames.get(group.name) ?? 0) < 2) return group
      const parts = group.path.split(/[/\\]/).filter(Boolean)
      return { ...group, name: parts.length > 1 ? `${parts.at(-1)} · ${parts.at(-2)}` : group.name }
    }).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
  }, [activeThreads, currentThreadId])

  useEffect(() => {
    try {
      window.localStorage.setItem('taskweaver.sidebar.collapsed-projects', JSON.stringify([...collapsedProjects]))
    } catch {
      // Sidebar state is a convenience; storage may be unavailable in restricted profiles.
    }
  }, [collapsedProjects])

  const beginRename = (thread: ThreadSummary) => {
    setEditingId(thread.id)
    setEditingTitle(thread.title)
  }

  const finishRename = () => {
    if (editingId && editingTitle.trim()) onRenameThread(editingId, editingTitle.trim())
    setEditingId(null)
  }

  return (
    <aside className={`app-sidebar ${collapsed ? 'collapsed' : ''}`} aria-label="应用导航">
      <div className="sidebar-drag-space" />
      
      {/* 顶部品牌与全局搜索；折叠时只保留展开按钮，避免列表文字竖排溢出 */}
      <div className="sidebar-brand-row">
        {collapsed ? (
          <button
            type="button"
            className="sidebar-expand-btn"
            title="展开侧边栏"
            aria-label="展开侧边栏"
            onClick={onToggleCollapsed}
          >
            <PanelLeft size={18} />
          </button>
        ) : (
          <>
            <button className="sidebar-brand" title="TaskWeaver">
              <span className="sidebar-label brand-text">TaskWeaver</span>
              <ChevronDown className="sidebar-label brand-arrow" size={14} />
            </button>
            <div className="sidebar-quick-actions">
              <button
                title={searchOpen ? '收起搜索' : '搜索会话'}
                aria-label="搜索会话"
                className={searchOpen || searchQuery ? 'active' : ''}
                onClick={() => {
                  setSearchOpen((prev) => !prev)
                  if (searchOpen) setSearchQuery('')
                }}
              >
                <Search size={16} />
              </button>
              <button title="通知" aria-label="通知"><Bell size={16} /></button>
            </div>
          </>
        )}
      </div>

      {/* 实时搜索框 */}
      {searchOpen && !collapsed && (
        <div className="sidebar-search-row">
          <div className="sidebar-search-box">
            <Search size={13} className="search-box-icon" />
            <input
              type="text"
              className="sidebar-search-input"
              placeholder="搜索会话、路径..."
              value={searchQuery}
              autoFocus
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setSearchQuery('')
                  setSearchOpen(false)
                }
              }}
            />
            {searchQuery && (
              <button
                type="button"
                className="search-clear-btn"
                title="清空"
                onClick={() => setSearchQuery('')}
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>
      )}

      <nav className="sidebar-scroll">
        {/* Codex 风格常驻导航组 (新对话、PR、定时任务、插件、探索) */}
        <div className="sidebar-codex-nav">
          <button
            type="button"
            className={`sidebar-codex-nav-item ${activeMainView === 'chat' && !currentThreadId ? 'active' : ''}`}
            title="新对话"
            onClick={() => {
              onNewChat()
              onSelectMainView?.('chat')
            }}
          >
            <SquarePen size={16} className="nav-icon" />
            <span className="sidebar-label">新对话</span>
          </button>
          <button
            type="button"
            className={`sidebar-codex-nav-item ${activeMainView === 'pull-requests' ? 'active' : ''}`}
            title="Pull Request"
            onClick={() => onSelectMainView?.('pull-requests')}
          >
            <GitPullRequest size={16} className="nav-icon" />
            <span className="sidebar-label">Pull Request</span>
          </button>
          <button
            type="button"
            className={`sidebar-codex-nav-item ${activeMainView === 'schedules' ? 'active' : ''}`}
            title="定时任务"
            onClick={() => onSelectMainView?.('schedules')}
          >
            <Clock size={16} className="nav-icon" />
            <span className="sidebar-label">定时任务</span>
          </button>
          <button
            type="button"
            className={`sidebar-codex-nav-item ${activeMainView === 'plugins' ? 'active' : ''}`}
            title="插件市场"
            onClick={() => onSelectMainView?.('plugins')}
          >
            <Puzzle size={16} className="nav-icon" />
            <span className="sidebar-label">插件</span>
          </button>
          <button
            type="button"
            className={`sidebar-codex-nav-item ${activeMainView === 'explore' ? 'active' : ''}`}
            title="探索"
            onClick={() => onSelectMainView?.('explore')}
          >
            <Compass size={16} className="nav-icon" />
            <span className="sidebar-label">探索</span>
          </button>
        </div>

        {/* 折叠轨只保留图标导航；会话列表/分类标题全部隐藏 */}
        {!collapsed && (searchQuery.trim() ? (
          <div className="sidebar-search-results">
            <div className="sidebar-category-header">
              <span className="sidebar-category-title-static">搜索结果 ({searchResults.length})</span>
            </div>
            {searchResults.length === 0 ? (
              <div className="sidebar-folder-empty">未匹配到相关会话</div>
            ) : (
              searchResults.map((thread) => (
                <div
                  className={`thread-row ${thread.id === currentThreadId ? 'active' : ''}`}
                  key={`search-${thread.id}`}
                >
                  <button
                    type="button"
                    className="thread-main"
                    title={`${thread.title}${thread.workspacePath ? ` · ${workspaceLabel(thread.workspacePath)}` : ''}`}
                    onClick={() => {
                      onSwitchThread(thread.id)
                      setSearchOpen(false)
                      setSearchQuery('')
                    }}
                  >
                    <span className="sidebar-label thread-copy">
                      <strong>{thread.title}</strong>
                      {thread.workspacePath && (
                        <small className="thread-badge">{workspaceLabel(thread.workspacePath)}</small>
                      )}
                      {thread.archived && (
                        <small className="thread-badge archived-badge">已归档</small>
                      )}
                      <span className="thread-time">{threadUpdatedLabel(thread.updatedAt)}</span>
                    </span>
                  </button>
                  <span className="thread-actions">
                    <button
                      type="button"
                      aria-label={thread.archived ? '取消归档' : '归档对话'}
                      title={thread.archived ? '取消归档' : '归档对话'}
                      onClick={() => onToggleArchiveThread(thread.id)}
                    >
                      {thread.archived ? <ArchiveRestore size={12} /> : <Archive size={12} />}
                    </button>
                    <button
                      type="button"
                      aria-label={`删除 ${thread.title}`}
                      title="删除对话"
                      onClick={() => onDeleteThread(thread.id)}
                    >
                      <Trash2 size={12} />
                    </button>
                  </span>
                </div>
              ))
            )}
          </div>
        ) : (
          <>
            {/* 置顶分类 */}
            <div className="sidebar-category-header">
              <button
                type="button"
                className="sidebar-category-title-btn"
                onClick={() => setPinnedCollapsed((prev) => !prev)}
              >
                <span>置顶</span>
                {pinnedThreads.length > 0 && <small className="sidebar-category-count">{pinnedThreads.length}</small>}
                <ChevronRight className={`category-chevron ${pinnedCollapsed ? '' : 'expanded'}`} size={13} />
              </button>
              <button
                type="button"
                className="sidebar-category-more"
                title={pinnedThreads.length > 0 ? (pinnedCollapsed ? '展开置顶' : '折叠置顶') : '暂无置顶'}
                onClick={() => setPinnedCollapsed((prev) => !prev)}
              >
                <MoreHorizontal size={14} />
              </button>
            </div>

            {!pinnedCollapsed && (
              <div className="sidebar-pinned-list">
                {pinnedThreads.length === 0 ? (
                  <div className="sidebar-folder-empty">点击对话右侧图钉可置顶到此处</div>
                ) : (
                  pinnedThreads.map((thread) => (
                    <div
                      className={`thread-row pinned-row ${thread.id === currentThreadId ? 'active' : ''}`}
                      key={`pinned-${thread.id}`}
                    >
                      {editingId === thread.id ? (
                        <input
                          className="thread-rename-input sidebar-label"
                          value={editingTitle}
                          autoFocus
                          maxLength={80}
                          aria-label="重命名对话"
                          onChange={(event) => setEditingTitle(event.target.value)}
                          onBlur={finishRename}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') finishRename()
                            if (event.key === 'Escape') setEditingId(null)
                          }}
                        />
                      ) : (
                        <button
                          type="button"
                          className="thread-main"
                          title={`${thread.title}${thread.workspacePath ? ` · ${workspaceLabel(thread.workspacePath)}` : ''}`}
                          onClick={() => onSwitchThread(thread.id)}
                        >
                          <span className="sidebar-label thread-copy">
                            <strong>{thread.title}</strong>
                            {thread.workspacePath && (
                              <small className="thread-badge">{workspaceLabel(thread.workspacePath)}</small>
                            )}
                            <span className="thread-time">{threadUpdatedLabel(thread.updatedAt)}</span>
                          </span>
                        </button>
                      )}
                      {editingId !== thread.id && (
                        <span className="thread-actions">
                          <button
                            type="button"
                            aria-label="取消置顶"
                            title="取消置顶"
                            className="active-pin"
                            onClick={() => onTogglePinThread(thread.id)}
                          >
                            <PinOff size={12} />
                          </button>
                          <button
                            type="button"
                            aria-label={`归档 ${thread.title}`}
                            title="归档对话"
                            onClick={() => onToggleArchiveThread(thread.id)}
                          >
                            <Archive size={12} />
                          </button>
                          <button
                            type="button"
                            aria-label={`重命名 ${thread.title}`}
                            title="重命名"
                            onClick={() => beginRename(thread)}
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            type="button"
                            aria-label={`删除 ${thread.title}`}
                            title="删除对话"
                            onClick={() => onDeleteThread(thread.id)}
                          >
                            <Trash2 size={12} />
                          </button>
                        </span>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}

            {/* 项目分类 */}
            <div className="sidebar-category-header">
              <button
                type="button"
                className="sidebar-category-title-btn"
                onClick={() => setProjectsCollapsed((prev) => !prev)}
              >
                <span>项目</span>
                <ChevronRight className={`category-chevron ${projectsCollapsed ? '' : 'expanded'}`} size={13} />
              </button>
              <button
                type="button"
                className="sidebar-category-more"
                title="打开本地项目"
                onClick={onPickWorkspace}
              >
                <Plus size={14} />
              </button>
            </div>

            {!projectsCollapsed && (
              <div className="sidebar-project-tree">
                {projectGroups.length === 0 ? (
                  <div className="sidebar-folder-empty">点击 + 关联项目工作区</div>
                ) : (
                  projectGroups.map((project) => {
                    const projectCollapsed = collapsedProjects.has(project.path)
                    return (
                      <div className={`project-group ${project.current ? 'current' : ''}`} key={project.path}>
                        <button
                          type="button"
                          className="project-group-head"
                          title={project.path}
                          onClick={() =>
                            setCollapsedProjects((current) => {
                              const next = new Set(current)
                              if (next.has(project.path)) next.delete(project.path)
                              else next.add(project.path)
                              return next
                            })
                          }
                        >
                          <Folder size={15} />
                          <span className="sidebar-label">{project.name}</span>
                          {!collapsed && (
                            <>
                              <small>{project.threads.length}</small>
                              <ChevronRight className={`folder-arrow ${projectCollapsed ? '' : 'expanded'}`} size={13} />
                            </>
                          )}
                        </button>
                        {!collapsed && !projectCollapsed && (
                          <div className="thread-list">
                            {project.threads.map((thread) => (
                              <div
                                className={`thread-row ${thread.id === currentThreadId ? 'active' : ''}`}
                                key={thread.id}
                              >
                                {editingId === thread.id ? (
                                  <input
                                    className="thread-rename-input sidebar-label"
                                    value={editingTitle}
                                    autoFocus
                                    maxLength={80}
                                    aria-label="重命名对话"
                                    onChange={(event) => setEditingTitle(event.target.value)}
                                    onBlur={finishRename}
                                    onKeyDown={(event) => {
                                      if (event.key === 'Enter') finishRename()
                                      if (event.key === 'Escape') setEditingId(null)
                                    }}
                                  />
                                ) : (
                                  <button
                                    type="button"
                                    className="thread-main"
                                    title={thread.title}
                                    onClick={() => onSwitchThread(thread.id)}
                                  >
                                    <span className="sidebar-label thread-copy">
                                      <strong>{thread.title}</strong>
                                      <ThreadRunningIndicator status={threadBackgroundStatus(thread)} />
                                      <span className="thread-time">{threadUpdatedLabel(thread.updatedAt)}</span>
                                    </span>
                                  </button>
                                )}
                                {editingId !== thread.id && (
                                  <span className="thread-actions">
                                    <button
                                      type="button"
                                      className={thread.pinned ? 'active-pin' : ''}
                                      aria-label={thread.pinned ? '取消置顶' : '置顶对话'}
                                      title={thread.pinned ? '取消置顶' : '置顶对话'}
                                      onClick={() => onTogglePinThread(thread.id)}
                                    >
                                      {thread.pinned ? <PinOff size={12} /> : <Pin size={12} />}
                                    </button>
                                    <button
                                      type="button"
                                      aria-label={`归档 ${thread.title}`}
                                      title="归档对话"
                                      onClick={() => onToggleArchiveThread(thread.id)}
                                    >
                                      <Archive size={12} />
                                    </button>
                                    <button
                                      type="button"
                                      aria-label={`重命名 ${thread.title}`}
                                      title="重命名"
                                      onClick={() => beginRename(thread)}
                                    >
                                      <Pencil size={12} />
                                    </button>
                                    <button
                                      type="button"
                                      aria-label={`删除 ${thread.title}`}
                                      title="删除对话"
                                      onClick={() => onDeleteThread(thread.id)}
                                    >
                                      <Trash2 size={12} />
                                    </button>
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            )}

            {/* 最近对话：平铺展示没有关联工作区的独立会话 */}
            <section className="sidebar-recent-section">
              <div className="sidebar-recent-heading">最近</div>
              <div className="sidebar-recent-flat-list">
                {recentThreads.length === 0 ? (
                  <div className="sidebar-flat-empty">暂无独立对话</div>
                ) : (
                  recentThreads.map((thread) => (
                    <div
                      className={`sidebar-recent-item ${thread.id === currentThreadId ? 'active' : ''}`}
                      key={thread.id}
                    >
                      {editingId === thread.id ? (
                        <input
                          className="sidebar-recent-rename-input"
                          value={editingTitle}
                          autoFocus
                          maxLength={80}
                          aria-label="重命名对话"
                          onChange={(event) => setEditingTitle(event.target.value)}
                          onBlur={finishRename}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') finishRename()
                            if (event.key === 'Escape') setEditingId(null)
                          }}
                        />
                      ) : (
                        <button
                          type="button"
                          className="sidebar-recent-link"
                          title={thread.title}
                          onClick={() => onSwitchThread(thread.id)}
                        >
                          <span className="sidebar-recent-text">
                            {thread.title}
                            <ThreadRunningIndicator status={threadBackgroundStatus(thread)} />
                          </span>
                          <span className="thread-time">{threadUpdatedLabel(thread.updatedAt)}</span>
                        </button>
                      )}
                      {editingId !== thread.id && (
                        <span className="sidebar-recent-actions">
                          <button
                            type="button"
                            className={thread.pinned ? 'active-pin' : ''}
                            aria-label={thread.pinned ? '取消置顶' : '置顶对话'}
                            title={thread.pinned ? '取消置顶' : '置顶对话'}
                            onClick={() => onTogglePinThread(thread.id)}
                          >
                            {thread.pinned ? <PinOff size={12} /> : <Pin size={12} />}
                          </button>
                          <button
                            type="button"
                            aria-label={`归档 ${thread.title}`}
                            title="归档对话"
                            onClick={() => onToggleArchiveThread(thread.id)}
                          >
                            <Archive size={12} />
                          </button>
                          <button
                            type="button"
                            aria-label={`重命名 ${thread.title}`}
                            title="重命名"
                            onClick={() => beginRename(thread)}
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            type="button"
                            aria-label={`删除 ${thread.title}`}
                            title="删除对话"
                            onClick={() => onDeleteThread(thread.id)}
                          >
                            <Trash2 size={12} />
                          </button>
                        </span>
                      )}
                    </div>
                  ))
                )}
              </div>
            </section>

            {/* 已归档分类 */}
            <div className="sidebar-category-header">
              <button
                type="button"
                className="sidebar-category-title-btn"
                onClick={() => setArchivedCollapsed((prev) => !prev)}
              >
                <span>已归档</span>
                {archivedThreads.length > 0 && <small className="sidebar-category-count">{archivedThreads.length}</small>}
                <ChevronRight className={`category-chevron ${archivedCollapsed ? '' : 'expanded'}`} size={13} />
              </button>
            </div>

            {!archivedCollapsed && (
              <div className="sidebar-archived-list">
                {archivedThreads.length === 0 ? (
                  <div className="sidebar-folder-empty">暂无归档会话</div>
                ) : (
                  archivedThreads.map((thread) => (
                    <div
                      className={`thread-row ${thread.id === currentThreadId ? 'active' : ''}`}
                      key={`archived-${thread.id}`}
                    >
                      <button
                        type="button"
                        className="thread-main"
                        title={`${thread.title}${thread.workspacePath ? ` · ${workspaceLabel(thread.workspacePath)}` : ''}`}
                        onClick={() => onSwitchThread(thread.id)}
                      >
                        <span className="sidebar-label thread-copy">
                          <strong style={{ opacity: 0.8 }}>{thread.title}</strong>
                          {thread.workspacePath && (
                            <small className="thread-badge">{workspaceLabel(thread.workspacePath)}</small>
                          )}
                        </span>
                      </button>
                      <span className="thread-actions">
                        <button
                          type="button"
                          aria-label={`取消归档 ${thread.title}`}
                          title="取消归档（恢复至活跃）"
                          onClick={() => onToggleArchiveThread(thread.id)}
                        >
                          <ArchiveRestore size={12} />
                        </button>
                        <button
                          type="button"
                          aria-label={`删除 ${thread.title}`}
                          title="删除对话"
                          onClick={() => onDeleteThread(thread.id)}
                        >
                          <Trash2 size={12} />
                        </button>
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}
          </>
        ))}
      </nav>

      {/* 底部账户与设置栏 */}
      <div className="sidebar-account">
        <div className="account-identity">
          <span className="account-avatar">SH</span>
          <span className="sidebar-label account-name">张少楠</span>
        </div>
        <div className="account-quick-tools">
          <button className="account-tool-btn" title="帮助" aria-label="帮助">
            <HelpCircle size={17} />
          </button>
          <button className="account-tool-btn" title="设置" aria-label="打开设置" onClick={onOpenSettings}>
            <Settings size={17} />
          </button>
        </div>
      </div>
    </aside>
  )
}
