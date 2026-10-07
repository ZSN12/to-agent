import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  Activity,
  Bell,
  Bot,
  Boxes,
  Check,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Clock,
  Command,
  Compass,
  Copy,
  Folder,
  FolderOpen,
  Database,
  GitPullRequest,
  GitFork,
  GitBranch,
  GitCommit,
  HelpCircle,
  Keyboard,
  ListOrdered,
  Mic,
  MessageSquare,
  MoreHorizontal,
  PanelLeft,
  PanelRight,
  PanelBottom,
  Package,
  Plus,
  Puzzle,
  Pin,
  PinOff,
  Settings,
  Search,
  ShieldAlert,
  Sparkles,
  Minimize2,
  Square,
  SquarePen,
  Pencil,
  Trash2,
  FileText,
  FileCode,
  RotateCcw,
  RefreshCw,
  Terminal,
  Target,
  ListTodo,
  Code2,
  CornerDownLeft,
  FastForward,
  Coins,
  Cpu,
  ShieldCheck,
  Sun,
  X,
} from 'lucide-react'
import { FormEvent, Fragment, Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useAppBackend } from './features/app/useAppBackend'
import { skillDescriptionBlurb } from './features/skills/skillDescription'
import { SKILL_CATALOG_EVENT, useEnabledSkills } from './features/skills/useEnabledSkills'
import { WorktreeMergeActions } from './features/worktree/WorktreeMergeActions'
import { useModelCatalog } from './features/models/useModelCatalog'
import { AssistantTurnBody } from './features/chat/AssistantTurnBody'
import { QueueDock } from './features/chat/QueueDock'
import { PendingSteeringBubble } from './features/chat/PendingSteeringBubble'
import { ApprovalPanel } from './features/chat/ApprovalPanel'
import { UserQuestionPanel } from './features/chat/UserQuestionPanel'
import { CompactionRow } from './features/chat/CompactionRow'
import { RetryBanner } from './features/chat/RetryBanner'
import { ComposerStatsDock } from './features/chat/ComposerStatsDock'
import { ChatBehaviorSettingsPanel } from './features/chat/ChatBehaviorSettingsPanel'
import { SubagentSessionTree } from './features/orchestration/SubagentSessionTree'
import { ThreadRunningIndicator } from './features/chat/ThreadRunningIndicator'
import { DshToolCallList } from './features/chat/DshToolCallList'
import { ChangedFilesSummary } from './features/chat/ChangedFilesSummary'
import { MessageTurnUsageChip } from './features/chat/MessageTurnUsageChip'
import { HostTodoProjection } from './features/chat/HostTodoProjection'
import { ContextInjectionRow } from './features/chat/ContextInjectionRow'
import { isDshContextMessage } from './features/dsh-runtime/dshTranscriptMessages'
import type { DshProjectedToolCall, HostTodoItem } from './shared/app-api'
import { DetailsPanel } from './features/chat/DetailsPanel'
import type { BusyEnterMode, LiveContextUsage, PermissionPromptPayload, SessionStatsSnapshot, UserQuestionAnswer, UserQuestionPromptPayload } from './shared/app-api'
import { skillOptionSourceLabel } from './shared/app-api'
import type { FileDiffData, ModelUsageStats, PermissionMode, PromptQueueSnapshot, SkillOption, ThreadSummary, ToolTraceItem, WorkMode, WorkspaceEntry, WorkspaceReference } from './shared/app-api'
import type { ChatMessage, ModelOption, TaskNode, TaskStatus, ThinkingLevel } from './types'
import {
  formatDshRunDuration,
  sessionUsageHasData,
  summarizeSessionUsage,
} from './features/chat/session-usage'
import {
  DEFAULT_SHORTCUTS,
  loadShortcuts,
  saveShortcuts,
  parseEventToKeys,
  matchesKeys,
  type ShortcutItem,
} from './shared/shortcuts'
import {
  getStoredThemeMode,
  getStoredAccentColor,
  applyTheme,
} from './shared/theme'

const ModelSettingsPanel = lazy(() => import('./features/models/ModelSettingsPanel').then((module) => ({ default: module.ModelSettingsPanel })))
const RoutingPortfolioSettingsPanel = lazy(() => import('./features/models/RoutingPortfolioSettingsPanel').then((module) => ({ default: module.RoutingPortfolioSettingsPanel })))
const McpSettingsPanel = lazy(() => import('./features/mcp/McpSettingsPanel').then((module) => ({ default: module.McpSettingsPanel })))
const PluginsMarketplaceView = lazy(() => import('./features/plugins/PluginsMarketplaceView').then((module) => ({ default: module.PluginsMarketplaceView })))
const PermissionSettingsPanel = lazy(() => import('./features/permissions/PermissionSettingsPanel').then((module) => ({ default: module.PermissionSettingsPanel })))
const AppearanceSettingsPanel = lazy(() => import('./features/appearance/AppearanceSettingsPanel').then((module) => ({ default: module.AppearanceSettingsPanel })))
const OutputLogPanel = lazy(() => import('./features/logs/OutputLogPanel').then((module) => ({ default: module.OutputLogPanel })))
const GitCheckpointPanel = lazy(() => import('./features/git/GitCheckpointPanel').then((module) => ({ default: module.GitCheckpointPanel })))
const SkillSettingsPanel = lazy(() => import('./features/skills/SkillSettingsPanel').then((module) => ({ default: module.SkillSettingsPanel })))
const TerminalDrawer = lazy(() => import('./features/terminal/TerminalDrawer').then((module) => ({ default: module.TerminalDrawer })))

type PanelView = 'dag' | 'task' | 'logs' | 'git' | 'details' | null
type SettingsSection = 'appearance' | 'chat' | 'models' | 'skills' | 'routing' | 'mcp' | 'permissions' | 'shortcuts' | 'usage'
const SIDEBAR_THREAD_LIMIT = 5

function useAutosizeTextarea(value: string, minHeight: number, maxHeight: number) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const textarea = ref.current
    if (!textarea) return
    textarea.style.height = '0px'
    const nextHeight = Math.min(Math.max(textarea.scrollHeight, minHeight), maxHeight)
    textarea.style.height = `${nextHeight}px`
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden'
  }, [value, minHeight, maxHeight])

  return ref
}

const statusMeta: Record<TaskStatus, { label: string; className: string }> = {
  done: { label: '已完成', className: 'done' },
  running: { label: '执行中', className: 'running' },
  queued: { label: '排队中', className: 'queued' },
  review: { label: '审查中', className: 'review' },
}

function workspaceLabel(path: string | null) {
  if (!path) return '未设置工作区'
  const parts = path.split(/[/\\]/).filter(Boolean)
  return parts[parts.length - 1] ?? path
}

function threadUpdatedLabel(updatedAt: number) {
  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - updatedAt) / 60_000))
  if (elapsedMinutes < 1) return '刚刚'
  if (elapsedMinutes < 60) return `${elapsedMinutes} 分钟前`
  const elapsedHours = Math.floor(elapsedMinutes / 60)
  if (elapsedHours < 24) return `${elapsedHours} 小时前`
  const elapsedDays = Math.floor(elapsedHours / 24)
  return elapsedDays < 30 ? `${elapsedDays} 天前` : new Date(updatedAt).toLocaleDateString('zh-CN')
}

function AppSidebar({
  collapsed,
  workspacePath,
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

function ShortcutsSettings({
  shortcuts,
  onUpdateShortcuts,
  onToast,
}: {
  shortcuts: ShortcutItem[]
  onUpdateShortcuts: (next: ShortcutItem[]) => void
  onToast: (message: string) => void
}) {
  const [search, setSearch] = useState('')
  const [recordingId, setRecordingId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return shortcuts
    return shortcuts.filter((s) =>
      s.title.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.keys.join('').toLowerCase().includes(q)
    )
  }, [shortcuts, search])

  // 监听物理按键录制
  useEffect(() => {
    if (!recordingId) return

    const handleRecordKeyDown = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()

      // 按 Esc 键取消录制
      if (e.key === 'Escape') {
        setRecordingId(null)
        onToast('已取消按键录制')
        return
      }

      // 如果单独按下 Shift/Control/Alt/Meta 修饰键，等待后续组合键
      if (['Meta', 'Control', 'Alt', 'Shift'].includes(e.key)) {
        return
      }

      const capturedKeys = parseEventToKeys(e)
      if (capturedKeys && capturedKeys.length > 0) {
        const target = shortcuts.find((s) => s.id === recordingId)
        const next = shortcuts.map((s) =>
          s.id === recordingId ? { ...s, keys: capturedKeys } : s
        )
        onUpdateShortcuts(next)
        setRecordingId(null)
        onToast(`「${target?.title ?? '功能'}」已设置为 ${capturedKeys.join(' ')}`)
      }
    }

    // 在捕获阶段最高优先级拦截按键
    window.addEventListener('keydown', handleRecordKeyDown, true)
    return () => {
      window.removeEventListener('keydown', handleRecordKeyDown, true)
    }
  }, [recordingId, shortcuts, onUpdateShortcuts, onToast])

  // 全部重置为默认值
  const handleResetAll = () => {
    const next = DEFAULT_SHORTCUTS.map((item) => ({ ...item, keys: [...item.defaultKeys] }))
    onUpdateShortcuts(next)
    setRecordingId(null)
    onToast('已全部恢复为默认快捷键')
  }

  // 清空该项快捷键（点击垃圾桶，里面的按键没了）
  const handleClear = (id: string) => {
    const target = shortcuts.find((s) => s.id === id)
    const next = shortcuts.map((s) => (s.id === id ? { ...s, keys: [] } : s))
    onUpdateShortcuts(next)
    if (recordingId === id) setRecordingId(null)
    onToast(`已清除「${target?.title ?? '快捷键'}」`)
  }

  // 恢复某项默认值
  const handleResetOne = (id: string) => {
    const def = DEFAULT_SHORTCUTS.find((s) => s.id === id)
    if (!def) return
    const next = shortcuts.map((s) => (s.id === id ? { ...def, keys: [...def.defaultKeys] } : s))
    onUpdateShortcuts(next)
    if (recordingId === id) setRecordingId(null)
    onToast(`已恢复「${def.title}」默认按键`)
  }

  return (
    <section className="settings-page-content shortcuts-settings-page">
      <div className="shortcuts-page-header">
        <h1>键盘快捷键</h1>
        <button type="button" className="shortcuts-reset-all-btn" onClick={handleResetAll}>
          全部重置为默认值
        </button>
      </div>

      <div className="shortcuts-search-wrap">
        <Search size={15} className="shortcuts-search-icon" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索快捷键"
          className="shortcuts-search-input"
        />
        <Command size={14} className="shortcuts-search-badge" />
      </div>

      <div className="shortcuts-card">
        {filtered.length === 0 ? (
          <div className="shortcuts-empty">没有找到匹配的快捷键</div>
        ) : (
          filtered.map((item) => {
            const isRecording = recordingId === item.id
            const hasKeys = item.keys && item.keys.length > 0
            const isDefault =
              hasKeys &&
              item.keys.length === item.defaultKeys.length &&
              item.keys.every((k, i) => k === item.defaultKeys[i])

            return (
              <div className={`shortcut-row ${isRecording ? 'is-recording' : ''}`} key={item.id}>
                <div className="shortcut-info">
                  <strong className="shortcut-title">{item.title}</strong>
                  <p className="shortcut-desc">{item.description}</p>
                </div>
                <div className="shortcut-actions">
                  {isRecording ? (
                    <div
                      className="shortcut-recording-box"
                      onClick={() => setRecordingId(null)}
                      title="点击或按 Esc 取消录制"
                    >
                      <span className="recording-dot" />
                      <span>请按下键盘按键…</span>
                      <span className="recording-esc-hint">Esc 取消</span>
                    </div>
                  ) : hasKeys ? (
                    <button
                      type="button"
                      className="shortcut-keys-btn"
                      onClick={() => setRecordingId(item.id)}
                      title="点击直接录制新快捷键"
                    >
                      <div className="shortcut-keys">
                        {item.keys.map((k, idx) => (
                          <kbd key={idx}>{k}</kbd>
                        ))}
                      </div>
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="shortcut-empty-btn"
                      onClick={() => setRecordingId(item.id)}
                      title="点击录制快捷键"
                    >
                      <span>+ 点击录制快捷键</span>
                    </button>
                  )}

                  {!isRecording && (
                    <>
                      <button
                        type="button"
                        className="shortcut-icon-btn edit"
                        title="录制新快捷键"
                        onClick={() => setRecordingId(item.id)}
                        aria-label={`修改 ${item.title} 快捷键`}
                      >
                        <Pencil size={13} />
                      </button>

                      {hasKeys ? (
                        <button
                          type="button"
                          className="shortcut-icon-btn delete"
                          title="删除清空当前按键"
                          onClick={() => handleClear(item.id)}
                          aria-label={`删除 ${item.title} 快捷键`}
                        >
                          <Trash2 size={13} />
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="shortcut-icon-btn reset"
                          title="恢复出厂默认按键"
                          onClick={() => handleResetOne(item.id)}
                          aria-label={`恢复 ${item.title} 默认快捷键`}
                        >
                          <RotateCcw size={13} />
                        </button>
                      )}

                      {!isDefault && hasKeys && (
                        <button
                          type="button"
                          className="shortcut-icon-btn reset"
                          title="恢复出厂默认按键"
                          onClick={() => handleResetOne(item.id)}
                          aria-label={`恢复 ${item.title} 默认快捷键`}
                        >
                          <RotateCcw size={13} />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
    </section>
  )
}

/** 将整数缩写为中文习惯 (3.7亿 / 4164.4万) */
function fc(n: number | null | undefined): string {
  if (n == null) return '—'
  if (n >= 1e8) return trim(n / 1e8) + '亿'
  if (n >= 1e4) return trim(n / 1e4) + '万'
  return String(Math.round(n))
}

function trim(x: number): string {
  return (Math.round(x * 10) / 10).toString()
}

function fmtDT(ms: number | null): string {
  if (ms == null) return '—'
  const d = new Date(ms)
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function fdur(ms: number | null | undefined): string {
  if (ms == null) return '—'
  const s = Math.round(ms / 1000)
  if (s < 60) return s + ' 秒'
  const m = Math.floor(s / 60)
  const r = s % 60
  if (m < 60) return m + '分' + (r ? String(r).padStart(2, '0') + '秒' : '')
  const h = Math.floor(m / 60)
  return h + '小时' + (m % 60 ? (m % 60) + '分' : '')
}

function lvl(v: number, max: number): number {
  if (v <= 0) return 0
  const r = v / (max || 1)
  return r > 0.75 ? 4 : r > 0.5 ? 3 : r > 0.25 ? 2 : 1
}

interface DshModelRow {
  provider: string
  model: string
  displayName?: string
  providerDisplayName?: string
  calls: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  reasoningTokens: number
  firstAt: number
  lastAt: number
  peakTokens: number
  maxDur: number
  totalTokens: number
}

interface DshUsageReport {
  allModels: DshModelRow[]
  rows: DshModelRow[]
  totals: {
    calls: number
    inputTokens: number
    outputTokens: number
    cacheReadTokens: number
    cacheWriteTokens: number
    reasoningTokens: number
  }
  daily: Record<string, { tokens: number; calls: number }>
  overview: {
    totalTokens: number
    peakTokens: number
    maxDur: number
    currentStreak: number
    maxStreak: number
  }
  summary: {
    totalTokens: number
    peakTokens: number
    maxDur: number
    currentStreak: number
    maxStreak: number
    requests: number
    costUsd: number
    cacheHitRate: number
    cacheReadTokens: number
    reasoningTokens: number
  }
  debug?: { version: string }
}

function mergeRows(rows: DshModelRow[]): DshModelRow[] {
  const map = new Map<string, DshModelRow>()
  const order: string[] = []
  for (const r of rows) {
    const base = r.provider.split('-')[0] || r.provider
    let model = r.model
    if (base && model.startsWith(base + '/')) model = model.slice(base.length + 1)
    if (model.startsWith('google-antigravity/')) model = model.slice('google-antigravity/'.length)
    if (model.startsWith('workbuddy/')) model = model.slice('workbuddy/'.length)
    if (model.startsWith('cursor/')) model = model.slice('cursor/'.length)
    const key = r.provider + '\u0000' + model
    const existing = map.get(key)
    if (!existing) {
      order.push(key)
      map.set(key, { ...r, model })
    } else {
      existing.calls += r.calls
      existing.inputTokens += r.inputTokens
      existing.outputTokens += r.outputTokens
      existing.cacheReadTokens += r.cacheReadTokens
      existing.cacheWriteTokens += r.cacheWriteTokens
      existing.reasoningTokens += r.reasoningTokens
      existing.totalTokens += r.totalTokens
      existing.firstAt = Math.min(existing.firstAt, r.firstAt)
      existing.lastAt = Math.max(existing.lastAt, r.lastAt)
      existing.peakTokens = Math.max(existing.peakTokens, r.peakTokens)
      existing.maxDur = Math.max(existing.maxDur, r.maxDur)
      if (r.displayName) existing.displayName = r.displayName
      if (r.providerDisplayName) existing.providerDisplayName = r.providerDisplayName
    }
  }
  return order.map((k) => map.get(k)!)
}

interface DshTimeRange {
  start: number | null
  end: number | null
  label: string
  days: number
}

const DSH_DAY = 86_400_000

const DSH_PRESETS: { key: string; label: string; make: (now: number) => DshTimeRange }[] = [
  { key: 'all', label: '全部', make: () => ({ start: null, end: null, label: '全部', days: 365 }) },
  {
    key: 'today',
    label: '当天',
    make: (now) => {
      const d = new Date(now)
      d.setHours(0, 0, 0, 0)
      return { start: d.getTime(), end: null, label: '当天', days: 7 }
    },
  },
  { key: '1d', label: '1d', make: (now) => ({ start: now - DSH_DAY, end: null, label: '近 1 天', days: 7 }) },
  { key: '7d', label: '7d', make: (now) => ({ start: now - 7 * DSH_DAY, end: null, label: '近 7 天', days: 7 }) },
  { key: '14d', label: '14d', make: (now) => ({ start: now - 14 * DSH_DAY, end: null, label: '近 14 天', days: 14 }) },
  { key: '30d', label: '30d', make: (now) => ({ start: now - 30 * DSH_DAY, end: null, label: '近 30 天', days: 30 }) },
  { key: '6m', label: '6 个月', make: (now) => ({ start: now - 182 * DSH_DAY, end: null, label: '近 6 个月', days: 182 }) },
]

function sameRange(a: DshTimeRange, b: DshTimeRange): boolean {
  return a.start === b.start && a.end === b.end
}

function customRange(startMs: number, endMs: number | null): DshTimeRange {
  const days = Math.max(7, Math.round(((endMs ?? Date.now()) - startMs) / DSH_DAY))
  return { start: startMs, end: endMs, label: '自定义', days }
}

function toLocalInput(ms: number): string {
  const d = new Date(ms)
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

function fromLocalInput(s: string): number | null {
  if (!s) return null
  const t = new Date(s).getTime()
  return Number.isFinite(t) ? t : null
}

function DshModelSelect(props: {
  value: string
  rows: ReadonlyArray<DshModelRow>
  onChange: (v: string) => void
}) {
  const { value, rows, onChange } = props
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const selectedRow = rows.find((r) => r.provider + '/' + r.model === value)
  const label =
    value === ''
      ? '全部模型'
      : selectedRow
      ? `${selectedRow.displayName || selectedRow.model}`
      : value.replace('/', ' · ')

  return (
    <div className="dsh-dropdown" ref={rootRef}>
      <button
        type="button"
        className={`dsh-drop-btn ${open ? 'open' : ''}`}
        onClick={() => setOpen(!open)}
      >
        {label}
      </button>
      {open && (
        <div className="dsh-drop-menu">
          <button
            type="button"
            className={`dsh-drop-item ${value === '' ? 'picked' : ''}`}
            onClick={() => { onChange(''); setOpen(false) }}
          >
            <span className="dsh-drop-text">全部模型</span>
            {value === '' && <span className="dsh-drop-check">✓</span>}
          </button>
          {rows.map((r) => {
            const v = r.provider + '/' + r.model
            return (
              <button
                type="button"
                key={v}
                className={`dsh-drop-item ${value === v ? 'picked' : ''}`}
                onClick={() => { onChange(v); setOpen(false) }}
              >
                <span className="dsh-drop-text">{r.displayName || r.model}</span>
                {value === v && <span className="dsh-drop-check">✓</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function DshTimeRangePicker(props: {
  value: DshTimeRange
  onChange: (r: DshTimeRange) => void
}) {
  const { value, onChange } = props
  const [open, setOpen] = useState(false)
  const [customStart, setCustomStart] = useState(() => toLocalInput(value.start ?? Date.now() - DSH_DAY))
  const [customEnd, setCustomEnd] = useState(() => toLocalInput(value.end ?? Date.now()))
  const [followNow, setFollowNow] = useState(value.end == null && value.start != null)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const applyPreset = (p: (typeof DSH_PRESETS)[number]): void => {
    onChange(p.make(Date.now()))
    setOpen(false)
  }
  const applyCustom = (): void => {
    const start = fromLocalInput(customStart)
    if (start == null) return
    const end = followNow ? null : fromLocalInput(customEnd)
    onChange(customRange(start, end))
    setOpen(false)
  }

  return (
    <div className="dsh-dropdown" ref={rootRef}>
      <button
        type="button"
        title="选择时间范围，仅作用于用量明细 (展示该时间段内使用的模型与用量)"
        className={`dsh-drop-btn ${open ? 'open' : ''}`}
        onClick={() => {
          setCustomStart(toLocalInput(value.start ?? Date.now() - DSH_DAY))
          setCustomEnd(toLocalInput(value.end ?? Date.now()))
          setFollowNow(value.end == null && value.start != null)
          setOpen(!open)
        }}
      >
        {value.label}
        <span className="dsh-drop-chevron">▾</span>
      </button>
      {open && (
        <div className="dsh-range-menu">
          <div className="dsh-range-presets">
            {DSH_PRESETS.map((p) => {
              const r = p.make(Date.now())
              const picked = sameRange(value, r)
              return (
                <button
                  type="button"
                  key={p.key}
                  className={`dsh-chip ${picked ? 'dsh-chip-on' : ''}`}
                  onClick={() => applyPreset(p)}
                >
                  {p.label}
                </button>
              )
            })}
          </div>
          <div className="dsh-range-divider" />
          <div className="dsh-range-custom">
            <div className="dsh-range-hint">支持日期与时间</div>
            <label className="dsh-range-field">
              <span>开始时间</span>
              <input
                className="dsh-sel"
                type="datetime-local"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
              />
            </label>
            <label className="dsh-range-field">
              <span>结束时间</span>
              <input
                className="dsh-sel"
                type="datetime-local"
                value={customEnd}
                disabled={followNow}
                onChange={(e) => setCustomEnd(e.target.value)}
              />
            </label>
            <label className="dsh-range-check">
              <input
                type="checkbox"
                checked={followNow}
                onChange={(e) => setFollowNow(e.target.checked)}
              />
              结束时间跟随当前时刻
            </label>
            <div className="dsh-range-actions">
              <button type="button" className="dsh-btn" onClick={() => setOpen(false)}>取消</button>
              <button type="button" className="dsh-btn-primary" onClick={applyCustom}>确定</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function DshStatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="dsh-stat">
      <div className="dsh-stat-val">{value}</div>
      <div className="dsh-stat-label">{label}</div>
    </div>
  )
}

function DshKpi({ l, v, d }: { l: string; v: string; d: string }) {
  return (
    <div className="dsh-kpi">
      <div className="dsh-kpi-l">{l}</div>
      <div className="dsh-kpi-v">{v}</div>
      <div className="dsh-kpi-d">{d}</div>
    </div>
  )
}

function UsageSettings() {
  const [report, setReport] = useState<DshUsageReport | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [model, setModel] = useState('')
  const [range, setRange] = useState<DshTimeRange>(() => DSH_PRESETS.find((p) => p.key === '7d')!.make(Date.now()))
  const [auto, setAuto] = useState(true)
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [heatZoom, setHeatZoom] = useState(182)

  const load = useCallback(async (): Promise<void> => {
    try {
      if (window.taskweaver?.usage?.getReport) {
        const res = await window.taskweaver.usage.getReport({
          model: model || undefined,
          start: range.start,
          end: range.end,
        })
        if (res && res.ok) {
          setReport(res.data as DshUsageReport)
          setErr(null)
          return
        }
      }
      // fallback to stats if getReport not available
      const statsRes = await window.taskweaver?.usage?.getStats?.()
      if (statsRes?.ok) {
        const totals = statsRes.data.totals
        const fallback: DshUsageReport = {
          allModels: statsRes.data.byModel.map((m) => ({
            provider: m.modelKey.split('/')[0] || 'default',
            model: m.modelKey.split('/')[1] || m.modelKey,
            displayName: m.modelName,
            calls: m.callCount,
            inputTokens: m.inputTokens,
            outputTokens: m.outputTokens,
            cacheReadTokens: m.cacheReadTokens,
            cacheWriteTokens: 0,
            reasoningTokens: 0,
            firstAt: Date.now(),
            lastAt: Date.now(),
            peakTokens: m.totalTokens,
            maxDur: 0,
            totalTokens: m.totalTokens,
          })),
          rows: statsRes.data.byModel.map((m) => ({
            provider: m.modelKey.split('/')[0] || 'default',
            model: m.modelKey.split('/')[1] || m.modelKey,
            displayName: m.modelName,
            calls: m.callCount,
            inputTokens: m.inputTokens,
            outputTokens: m.outputTokens,
            cacheReadTokens: m.cacheReadTokens,
            cacheWriteTokens: 0,
            reasoningTokens: 0,
            firstAt: Date.now(),
            lastAt: Date.now(),
            peakTokens: m.totalTokens,
            maxDur: 0,
            totalTokens: m.totalTokens,
          })),
          totals: {
            calls: totals.totalCalls,
            inputTokens: totals.inputTokens,
            outputTokens: totals.outputTokens,
            cacheReadTokens: totals.cacheReadTokens,
            cacheWriteTokens: totals.cacheWriteTokens,
            reasoningTokens: 0,
          },
          daily: {},
          overview: {
            totalTokens: totals.totalTokens,
            peakTokens: totals.totalTokens,
            maxDur: totals.totalDurationMs,
            currentStreak: 1,
            maxStreak: 1,
          },
          summary: {
            totalTokens: totals.totalTokens,
            peakTokens: totals.totalTokens,
            maxDur: totals.totalDurationMs,
            currentStreak: 1,
            maxStreak: 1,
            requests: totals.totalCalls,
            costUsd: totals.costUsd,
            cacheHitRate: totals.inputTokens + totals.cacheReadTokens > 0 ? totals.cacheReadTokens / (totals.inputTokens + totals.cacheReadTokens) : 0,
            cacheReadTokens: totals.cacheReadTokens,
            reasoningTokens: 0,
          },
        }
        setReport(fallback)
        setErr(null)
      }
    } catch (error) {
      setErr(String(error instanceof Error ? error.message : error))
    }
  }, [range, model])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (!auto) return
    const id = setInterval(() => { void load() }, 5000)
    return () => clearInterval(id)
  }, [auto, load])

  const handleClear = async () => {
    if (!window.confirm('确定清空所有模型用量记录吗？清空后将不可恢复。')) return
    try {
      await window.taskweaver?.usage?.clear?.()
      await load()
    } catch {
      // ignore
    }
  }

  if (err) {
    return (
      <div className="dsh-empty">
        <div>⚠️ 加载模型用量失败</div>
        <div className="dsh-err-sub">{err}</div>
      </div>
    )
  }
  if (!report) return <div className="dsh-empty">加载中…</div>

  const sum = report.summary
  const ov = report.overview ?? {
    totalTokens: sum.totalTokens,
    peakTokens: sum.peakTokens,
    maxDur: sum.maxDur,
    currentStreak: sum.currentStreak,
    maxStreak: sum.maxStreak,
  }

  const rows = mergeRows(report.rows).filter((r) => r.totalTokens > 0)
  const selectRows = report.allModels?.length
    ? mergeRows(report.allModels).filter((r) => r.totalTokens > 0)
    : rows
  const daily = report.daily

  // 热力图
  const heatDays = heatZoom
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const weeks = Math.ceil((heatDays + today.getDay()) / 7)
  const start = new Date(today)
  start.setDate(start.getDate() - (weeks * 7 - 1 - today.getDay()))
  const cells: { key: string; t: number; future: boolean; label: string; col: number; row: number }[] = []
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    cells.push({
      key,
      t: daily[key]?.tokens ?? 0,
      future: d.getTime() > today.getTime(),
      label: `${d.getMonth() + 1}月${d.getDate()}日`,
      col: Math.floor(i / 7),
      row: i % 7,
    })
  }
  const maxDay = Math.max(1, ...cells.map((c) => (c.future ? 0 : c.t)))

  // 每个周列只归属一个月份（取周中日期），保证所有月份带宽度之和恰好等于列数。
  const monthBands: { label: string; startCol: number; span: number }[] = []
  for (let col = 0; col < weeks; col++) {
    const d = new Date(start)
    d.setDate(start.getDate() + col * 7 + 3)
    const label = `${d.getMonth() + 1}月`
    const last = monthBands[monthBands.length - 1]
    if (last?.label === label) {
      last.span += 1
    } else {
      monthBands.push({ label, startCol: col, span: 1 })
    }
  }

  const showTip = (text: string) => (e: React.MouseEvent): void => {
    setTip({ text, x: Math.max(12, Math.min(e.clientX, window.innerWidth - 332)), y: Math.max(12, Math.min(e.clientY, window.innerHeight - 52)) })
  }
  const moveTip = (e: React.MouseEvent): void => {
    setTip((t) => (t ? {
      ...t,
      x: Math.max(12, Math.min(e.clientX, window.innerWidth - 332)),
      y: Math.max(12, Math.min(e.clientY, window.innerHeight - 52)),
    } : t))
  }
  const hideTip = (): void => setTip(null)

  // 按 Provider 分组
  const groupMap = new Map<string, { provider: string; providerDisplayName?: string; rows: DshModelRow[]; totalTokens: number; calls: number }>()
  for (const r of rows) {
    let g = groupMap.get(r.provider)
    if (!g) {
      g = { provider: r.provider, providerDisplayName: r.providerDisplayName, rows: [], totalTokens: 0, calls: 0 }
      groupMap.set(r.provider, g)
    }
    g.rows.push(r)
    g.totalTokens += r.totalTokens
    g.calls += r.calls
  }
  const groups = [...groupMap.values()]
  const isCollapsed = (provider: string): boolean => collapsed[provider] === undefined ? true : collapsed[provider]
  const toggle = (provider: string): void =>
    setCollapsed((prev) => {
      const cur = prev[provider] === undefined ? true : prev[provider]
      return { ...prev, [provider]: !cur }
    })

  return (
    <div className="dsh-root">
      {/* 顶部统计栏: 5 个指标横向排列 (全量历史) */}
      <div className="dsh-stats">
        <DshStatCard label="累计 Token 数" value={fc(ov.totalTokens)} />
        <DshStatCard label="峰值 Token 数" value={fc(ov.peakTokens)} />
        <DshStatCard label="最长聊天时长" value={fdur(ov.maxDur)} />
        <DshStatCard label="当前连续天数" value={ov.currentStreak != null ? `${ov.currentStreak} 天` : '—'} />
        <DshStatCard label="最长连续天数" value={ov.maxStreak != null ? `${ov.maxStreak} 天` : '—'} />
      </div>

      {/* Token 活动 */}
      <div className="dsh-panel">
        <div className="dsh-panel-head">
          <h3><span className="dsh-dot-blue" />Token 活动</h3>
          <div className="dsh-tools">
            <select
              className="dsh-sel"
              value={heatZoom}
              onChange={(e) => setHeatZoom(Number(e.target.value))}
              title="热力图时间范围 (不影响用量明细)"
            >
              <option value={182}>近 6 个月</option>
              <option value={365}>近 1 年</option>
            </select>
          </div>
        </div>

        <div className="dsh-heat-wrap">
          <div className="dsh-heat" style={{ '--weeks': weeks } as CSSProperties}>
            {Array.from({ length: 7 }, (_, ri) => (
              <Fragment key={ri}>
                {Array.from({ length: weeks }, (_, c) => {
                  const cell = cells[c * 7 + ri]!
                  const cellLvl = lvl(cell.t, maxDay)
                  return (
                    <div
                      key={cell.key}
                      className={`dsh-cell ${cell.future ? 'dsh-cell-future' : `dsh-cell${cellLvl}`}`}
                      onMouseEnter={showTip(`${cell.label} 使用了 ${fc(cell.t)} 个 Token`)}
                      onMouseMove={moveTip}
                      onMouseLeave={hideTip}
                    />
                  )
                })}
              </Fragment>
            ))}
          </div>
          <div className="dsh-month-bar" style={{ '--weeks': weeks } as CSSProperties}>
            {monthBands.map((b, i) => (
              <div
                key={i}
                className="dsh-month-band"
                style={{ gridColumn: `${b.startCol + 1} / span ${b.span}` }}
              >
                {b.label}
              </div>
            ))}
          </div>
        </div>

        {tip && (
          <div className="dsh-tooltip" style={{ left: tip.x + 12, top: tip.y + 12 }}>
            {tip.text}
          </div>
        )}
      </div>

      {/* 用量明细 */}
      <div className="dsh-panel">
        <div className="dsh-panel-head">
          <h3><span className="dsh-dot-green" />用量明细</h3>
          <div className="dsh-tools">
            <DshTimeRangePicker value={range} onChange={setRange} />
            <DshModelSelect
              value={model}
              rows={selectRows}
              onChange={setModel}
            />
            <button className="dsh-btn" onClick={() => void load()}>⟳ 刷新</button>
            <button className={`dsh-btn ${auto ? 'dsh-btn-on' : ''}`} onClick={() => setAuto(!auto)}>
              {auto ? <span className="dsh-auto"><span className="dsh-pulse" />5s 自动刷新</span> : '自动刷新关闭'}
            </button>
            <button className="dsh-btn" onClick={() => void handleClear()} title="清空全部用量数据">
              清空记录
            </button>
          </div>
        </div>

        {/* 当前时间范围指示器 */}
        <div className="dsh-range-info">
          当前范围:<span className="dsh-range-info-strong">{range.label}</span>
          <span className="dsh-range-info-dim">
            {range.start != null ? fmtDT(range.start) : '全部时间'}
            {range.end != null ? ' ~ ' + fmtDT(range.end) : ''}
          </span>
          <span className="dsh-range-info-dim">
            {report.debug?.version ? '· host ' + report.debug.version : ''}
          </span>
        </div>

        {/* 4 张 KPI 卡 (无图标，简洁文字) */}
        <div className="dsh-kpis">
          <DshKpi l="真实消耗 Tokens" v={fc(sum.totalTokens)} d="输入+输出+缓存" />
          <DshKpi l="总请求数" v={sum.requests != null ? String(sum.requests) : '—'} d="所有模型调用" />
          <DshKpi l="总成本(估算)" v={sum.costUsd != null ? '¥' + Number(sum.costUsd).toFixed(2) : '—'} d="按官方公开价(¥/M)估算" />
          <DshKpi l="缓存命中" v={fc(sum.cacheReadTokens)} d="cache read tokens" />
        </div>

        {/* 缓存命中率 */}
        <div className="dsh-rate-wrap">
          <div className="dsh-rate-row">
            <span className="dsh-rate-l">缓存命中率</span>
            <span className="dsh-rate-v">{sum.cacheHitRate != null ? (sum.cacheHitRate * 100).toFixed(1) + '%' : '—'}</span>
          </div>
          <div className="dsh-rate-bar">
            <div className="dsh-rate-fill" style={{ width: Math.min(100, (sum.cacheHitRate ?? 0) * 100) + '%' }} />
          </div>
        </div>

        {/* 模型列表: 按来源 (provider) 分组，可收缩/展开 */}
        {rows.length === 0 ? (
          <div className="dsh-empty">暂无调用记录</div>
        ) : (
          <div className="dsh-list">
            {groups.map((g) => {
              const open = !isCollapsed(g.provider)
              return (
                <div key={g.provider} className="dsh-group">
                  <button
                    type="button"
                    className="dsh-group-head"
                    onClick={() => toggle(g.provider)}
                    aria-expanded={open}
                  >
                    <span className={`dsh-group-chevron ${open ? 'open' : ''}`}>▸</span>
                    <span className="dsh-group-name">{g.providerDisplayName || g.provider}</span>
                    <span className="dsh-group-meta">
                      {g.rows.length} 个模型 · 共 {fc(g.totalTokens)} · {g.calls} 次调用
                    </span>
                  </button>
                  {open && (
                    <div className="dsh-group-body">
                      {g.rows.map((r) => (
                        <div key={r.provider + '/' + r.model} className="dsh-row">
                          <div className="dsh-nm">
                            <div>{r.displayName || r.model}</div>
                            <div className="dsh-pv">{r.providerDisplayName || r.provider}</div>
                          </div>
                          <div className="dsh-nums">
                            <div className="dsh-num"><b>{fc(r.totalTokens)}</b><span>总 token</span></div>
                            <div className="dsh-num"><b>{r.calls}</b><span>调用</span></div>
                            <div className="dsh-num"><b>{fc(r.inputTokens)}</b><span>输入</span></div>
                            <div className="dsh-num"><b>{fc(r.outputTokens)}</b><span>输出</span></div>
                            <div className="dsh-num"><b>{fc(r.reasoningTokens)}</b><span>推理</span></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function SettingsPage({
  section,
  onSectionChange,
  onClose,
  modelCatalog,
  shortcuts,
  onUpdateShortcuts,
  permissionMode,
  onPermissionModeChange,
}: {
  section: SettingsSection
  onSectionChange: (section: SettingsSection) => void
  onClose: () => void
  modelCatalog: ReturnType<typeof useModelCatalog>
  shortcuts: ShortcutItem[]
  onUpdateShortcuts: (next: ShortcutItem[]) => void
  permissionMode?: PermissionMode
  onPermissionModeChange?: (mode: PermissionMode) => void
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

  return <div className="settings-screen">
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
    <main className="settings-main">
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
            onToast={toast}
          />
        ) : section === 'skills' ? (
          <SkillSettingsPanel />
        ) : section === 'routing' ? (
          <RoutingPortfolioSettingsPanel onToast={toast} />
        ) : section === 'mcp' ? (
          <McpSettingsPanel onToast={toast} />
        ) : section === 'permissions' ? (
          <PermissionSettingsPanel
            currentMode={permissionMode}
            onModeChange={onPermissionModeChange}
            onToast={toast}
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

function formatMessageTime(time: string, timestamp?: number, id?: string): string {
  let ts = timestamp
  if (!ts && id) {
    const match = id.match(/^m-(\d{10,13})-/)
    if (match) {
      const parsed = Number(match[1])
      if (!Number.isNaN(parsed) && parsed > 0) ts = parsed
    }
  }

  if (ts) {
    const msgDate = new Date(ts)
    const now = new Date()
    const isToday =
      msgDate.getFullYear() === now.getFullYear() &&
      msgDate.getMonth() === now.getMonth() &&
      msgDate.getDate() === now.getDate()

    if (isToday) {
      return time || msgDate.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
    }

    const year = msgDate.getFullYear()
    const month = String(msgDate.getMonth() + 1).padStart(2, '0')
    const day = String(msgDate.getDate()).padStart(2, '0')
    const clock = time || msgDate.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })

    return `${year}-${month}-${day} ${clock}`
  }

  return time
}

/** Mirrors DSH ChatView `TurnStatus`: shimmer label + optional tool chip + clock after 15s. */
function DeepDivingIndicator({ startTime, activity }: { startTime?: number; activity?: string | null }) {
  const anchor = startTime ?? Date.now()
  const [elapsedMs, setElapsedMs] = useState(() => Math.max(0, Date.now() - anchor))

  useEffect(() => {
    const tick = () => setElapsedMs(Math.max(0, Date.now() - anchor))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [anchor])

  const showClock = elapsedMs >= 15_000
  const clockLabel = formatDshRunDuration(elapsedMs)

  return (
    <div className="dsh-deep-diving-row" role="status" aria-live="polite">
      <span className="dsh-diving-text">Deep diving...</span>
      {activity && <span className="dsh-diving-sub">{activity}</span>}
      {showClock && <span className="dsh-diving-timer" aria-live="off">{clockLabel}</span>}
    </div>
  )
}

function visibleToolActivity(item: ToolTraceItem, workspacePath?: string | null): string {
  const verbs: Record<string, string> = {
    edit: '正在修改',
    write: '正在写入',
    read: '正在读取',
    grep: '正在搜索',
    find: '正在查找',
    glob: '正在查找',
    bash: '正在运行命令',
    run_code: '正在执行代码',
  }
  const filePath = item.inputSummary || item.fileDiff?.path || ''
  const root = workspacePath?.replace(/\\/g, '/').replace(/\/$/, '')
  const normalized = filePath.replace(/\\/g, '/')
  const displayPath = root && normalized.toLocaleLowerCase().startsWith(`${root}/`.toLocaleLowerCase())
    ? normalized.slice(root.length + 1)
    : normalized
  const verb = verbs[item.toolName] ?? `正在执行 ${item.toolName}`
  return displayPath && ['edit', 'write', 'read'].includes(item.toolName)
    ? `${verb} · ${displayPath}`
    : verb
}

function Message({
  message,
  dshToolRows,
  toolTraceItems,
  workspacePath,
  onFork,
  isStreaming = false,
  streamActivity,
  onShowToolDetails,
  onOpenWorkspacePath,
  fallbackModelKey,
  isFocused = false,
}: {
  message: ChatMessage
  dshToolRows?: readonly DshProjectedToolCall[]
  toolTraceItems?: readonly ToolTraceItem[]
  workspacePath?: string | null
  onFork?: (messageId: string) => void
  isStreaming?: boolean
  streamActivity?: string | null
  onShowToolDetails?: (item: ToolTraceItem) => void
  onOpenWorkspacePath?: (relativePath: string) => void
  fallbackModelKey?: string | null
  isFocused?: boolean
}) {
  const isUser = message.author === 'user'
  const [copied, setCopied] = useState(false)

  const copyMessage = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(message.text)
      } else {
        const textarea = document.createElement('textarea')
        textarea.value = message.text
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.append(textarea)
        textarea.select()
        document.execCommand('copy')
        textarea.remove()
      }
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      setCopied(false)
    }
  }

  const runMs = !isUser ? message.usage?.elapsedMs : undefined
  const runLabel =
    typeof runMs === 'number' && runMs >= 1000 ? `用时 ${formatDshRunDuration(runMs)}` : null
  const billed =
    message.usage
      ? (message.usage.inputTokens ?? 0) + (message.usage.cacheReadTokens ?? 0) + (message.usage.cacheWriteTokens ?? 0)
      : 0
  const hasTurnUsage = !isUser && message.usage && (billed > 0 || message.usage.outputTokens > 0)
  const activeToolTrace = [...(toolTraceItems ?? [])].reverse().find((item) => item.status === 'running')
  const visibleActivity = activeToolTrace
    ? visibleToolActivity(activeToolTrace, workspacePath)
    : streamActivity

  return (
    <article
      id={`msg-${message.id}`}
      className={`message dsh-flow-item ${isUser ? 'user-message' : 'agent-message'}${message.interrupted ? ' interrupted-turn' : ''}${isStreaming ? ' message-streaming' : ''}${isFocused ? ' message-focused' : ''}`}
    >
      <div className="message-content">
        {!isUser && message.compaction && (
          <CompactionRow
            automatic={message.compaction.automatic}
            summary={message.compaction.summary}
            tokensBefore={message.compaction.tokensBefore}
          />
        )}
        {!isUser && isStreaming && (
          <DeepDivingIndicator startTime={message.timestamp} activity={visibleActivity} />
        )}
        {!isUser && !message.compaction && (
          <AssistantTurnBody
            blocks={message.contentBlocks}
            fallbackThinking={message.thinking}
            fallbackText={message.text}
            thinkingDurationMs={message.thinkingDurationMs ?? message.usage?.elapsedMs}
            isStreaming={isStreaming}
          />
        )}
        {!isUser && ((dshToolRows?.length ?? 0) > 0 || (toolTraceItems?.length ?? 0) > 0) && (
          <div className="message-tool-traces">
            <DshToolCallList
              rows={dshToolRows}
              traces={toolTraceItems}
              workspacePath={workspacePath}
              onShowToolDetails={onShowToolDetails}
              onOpenWorkspacePath={onOpenWorkspacePath}
            />
          </div>
        )}
        {!isUser && (
          <ChangedFilesSummary
            traces={toolTraceItems}
            fileChanges={message.fileChanges}
            workspacePath={workspacePath}
            onOpenWorkspacePath={onOpenWorkspacePath}
          />
        )}
        {isUser && message.text && (
          <div className="user-message-stack">
            <div className="message-text user-message-bubble">{message.text}</div>
          </div>
        )}
        {message.interrupted && <div className="message-interrupted-label">已中断</div>}
        {message.callout && <div className="message-callout">{message.callout}</div>}
      </div>
      {!isStreaming && (
        <div className="message-footer">
          <div className="message-footer-toolbar">
            <button
              className="message-action-btn message-copy"
              type="button"
              onClick={() => void copyMessage()}
              aria-label={copied ? '已复制消息' : '复制消息'}
              data-tooltip={copied ? '已复制' : '复制'}
              title={copied ? '已复制' : '复制'}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
            {!isUser && onFork && message.id !== 'streaming-assistant' && (
              <button
                className="message-action-btn message-fork"
                type="button"
                onClick={() => onFork(message.id)}
                aria-label="分支到新聊天"
                data-tooltip="分支到新聊天"
                title="分支到新聊天"
              >
                <GitFork size={14} />
              </button>
            )}
            {!isUser && hasTurnUsage && (
              <MessageTurnUsageChip
                usage={message.usage}
                modelKey={message.modelKey ?? fallbackModelKey}
              />
            )}
            <time className="message-footer-time">
              {formatMessageTime(message.time, message.timestamp, message.id)}
              {runLabel && (
                <>
                  <span className="message-footer-dot" aria-hidden>
                    ·
                  </span>
                  {runLabel}
                </>
              )}
            </time>
          </div>
        </div>
      )}
    </article>
  )
}

function DiffReviewCard({ fileDiff, onReverted, defaultExpanded = false }: { fileDiff: FileDiffData; onReverted?: () => void; defaultExpanded?: boolean }) {
  const [copied, setCopied] = useState(false)
  const [reverting, setReverting] = useState(false)
  const [reverted, setReverted] = useState(false)
  const [expanded, setExpanded] = useState(defaultExpanded)

  useEffect(() => {
    setExpanded(defaultExpanded)
  }, [defaultExpanded])

  const lines = useMemo(() => {
    return (fileDiff.diff || '').split('\n')
  }, [fileDiff.diff])

  const stats = useMemo(() => {
    if (typeof fileDiff.addedLines === 'number' && typeof fileDiff.deletedLines === 'number') {
      return { add: fileDiff.addedLines, del: fileDiff.deletedLines }
    }
    let add = 0
    let del = 0
    for (const l of lines) {
      if (l.startsWith('+') && !l.startsWith('+++')) add++
      else if (l.startsWith('-') && !l.startsWith('---')) del++
    }
    return { add, del }
  }, [lines, fileDiff.addedLines, fileDiff.deletedLines])

  const copyDiff = async () => {
    try {
      await navigator.clipboard.writeText(fileDiff.diff)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // ignore
    }
  }

  const revert = async () => {
    if (reverting || reverted || !window.taskweaver) return
    setReverting(true)
    try {
      const res = await window.taskweaver.workspace.revertDiff({
        path: fileDiff.path,
        reverseEdits: fileDiff.reverseEdits,
      })
      if (res.ok) {
        setReverted(true)
        onReverted?.()
      } else {
        alert(res.error || '还原失败')
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err))
    } finally {
      setReverting(false)
    }
  }

  return (
    <div className="diff-review-card">
      <div className="diff-review-header" onClick={() => setExpanded((v) => !v)}>
        <div className="diff-review-meta">
          <FileCode size={13} className="diff-review-icon" />
          <span className="diff-review-path" title={fileDiff.path}>{fileDiff.path}</span>
          <div className="diff-review-badges">
            {fileDiff.isNewFile && <span className="diff-badge-new">新建</span>}
            {stats.add > 0 && <span className="diff-badge-add">+{stats.add}</span>}
            {stats.del > 0 && <span className="diff-badge-del">-{stats.del}</span>}
          </div>
        </div>

        <div className="diff-review-actions" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="diff-btn"
            onClick={copyDiff}
            title={copied ? '已复制 Diff' : '复制 Diff'}
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            <span>{copied ? '已复制' : '复制'}</span>
          </button>

          {fileDiff.reverseEdits && fileDiff.reverseEdits.length > 0 && (
            <button
              type="button"
              className={`diff-btn revert ${reverted ? 'is-reverted' : ''}`}
              disabled={reverting || reverted}
              onClick={revert}
              title={reverted ? '文件已还原' : '撤销此修改'}
            >
              <RotateCcw size={12} className={reverting ? 'anim-spin' : ''} />
              <span>{reverting ? '还原中…' : reverted ? '已还原' : '一键还原'}</span>
            </button>
          )}

          <ChevronRight size={13} className={`diff-review-arrow ${expanded ? 'rotated' : ''}`} />
        </div>
      </div>

      {expanded && (
        <div className="diff-review-body">
          <div className="diff-review-code">
            {lines.map((line, idx) => {
              let type = 'context'
              if (line.startsWith('+') && !line.startsWith('+++')) type = 'add'
              else if (line.startsWith('-') && !line.startsWith('---')) type = 'del'
              else if (line.startsWith('@@')) type = 'hunk'

              return (
                <div key={idx} className={`diff-code-line ${type}`}>
                  <span className="diff-line-number">{idx + 1}</span>
                  <span className="diff-line-content">{line || ' '}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

const thinkingLevelLabels: Record<ThinkingLevel, { en: string; zh: string; desc: string }> = {
  off: { en: 'Off', zh: '关闭', desc: '不进行思考推理' },
  low: { en: 'Low', zh: '低', desc: '轻度思考，快速响应' },
  medium: { en: 'Medium', zh: '中', desc: '适中推理深度' },
  high: { en: 'High', zh: '高', desc: '深度思考，最强代码与逻辑' },
}

function ModelSelect({
  value,
  options,
  onChange,
  thinkingLevel = 'medium',
  onThinkingLevelChange,
  loading,
}: {
  value: ModelOption | null
  options: ModelOption[]
  onChange: (model: ModelOption) => void
  thinkingLevel?: ThinkingLevel
  onThinkingLevelChange?: (level: ThinkingLevel) => void
  loading?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<'main' | 'models' | 'thinking'>('main')
  const rootRef = useRef<HTMLDivElement>(null)

  const handleClose = () => {
    setOpen(false)
    setView('main')
  }

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) handleClose()
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') handleClose()
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [])

  const supportedLevels = useMemo(() => {
    if (value?.reasoning === false) return []
    if (value?.supportedThinkingLevels && value.supportedThinkingLevels.length > 0) {
      return value.supportedThinkingLevels
    }
    return ['off', 'low', 'medium', 'high'] as ThinkingLevel[]
  }, [value?.reasoning, value?.supportedThinkingLevels])

  useEffect(() => {
    if (!value || value.reasoning === false) return
    const valid = supportedLevels
    if (valid.length > 0 && !valid.includes(thinkingLevel)) {
      const fallback = value.defaultThinkingLevel && valid.includes(value.defaultThinkingLevel)
        ? value.defaultThinkingLevel
        : valid.includes('medium') ? 'medium' : (valid.includes('high') ? 'high' : valid[0])
      onThinkingLevelChange?.(fallback)
    }
  }, [value, supportedLevels, thinkingLevel, onThinkingLevelChange])

  return (
    <div className="model-select" ref={rootRef}>
      <button
        className="model-trigger"
        type="button"
        onClick={() => {
          if (open) {
            handleClose()
          } else {
            setView('main')
            setOpen(true)
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={loading || options.length === 0}
      >
        <span className="model-trigger-name">{value?.name ?? (loading ? '加载模型…' : '无可用模型')}</span>
        {value && <span className="model-trigger-level">{value.reasoning === false ? 'N/A' : thinkingLevelLabels[thinkingLevel]?.en || 'High'}</span>}
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {open && options.length > 0 && (
        <div className="model-menu model-cascading-menu" role="menu" aria-label="模型与推理等级配置">
          {view === 'main' && (
            <div className="model-menu-main">
              <button
                type="button"
                className="model-menu-entry"
                onClick={() => setView('models')}
              >
                <span className="model-menu-entry-label">模型</span>
                <span className="model-menu-entry-value">
                  <span className="truncate">{value?.name ?? '选择模型'}</span>
                  <ChevronRight size={14} />
                </span>
              </button>

              <button
                type="button"
                className="model-menu-entry"
                onClick={() => setView('thinking')}
              >
                <span className="model-menu-entry-label">推理等级</span>
                <span className="model-menu-entry-value">
                  <span>{value?.reasoning === false ? '不支持' : thinkingLevelLabels[thinkingLevel]?.en || 'High'}</span>
                  <ChevronRight size={14} />
                </span>
              </button>
            </div>
          )}

          {view === 'models' && (
            <div className="model-menu-sub">
              <div className="model-sub-header">
                <button
                  type="button"
                  className="model-sub-back-btn"
                  onClick={() => setView('main')}
                  title="返回上一级"
                >
                  <ArrowLeft size={14} />
                  <span>返回</span>
                </button>
                <span className="model-sub-title">选择模型</span>
              </div>
              <div className="model-sub-list">
                {options.map((m) => (
                  <button
                    type="button"
                    key={m.id}
                    className={`model-sub-item ${m.id === value?.id ? 'active' : ''}`}
                    onClick={() => {
                      onChange(m)
                      handleClose()
                    }}
                  >
                    <span className="model-item-name">{m.name}</span>
                    {m.id === value?.id && <Check size={16} className="model-item-check" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {view === 'thinking' && (
            <div className="model-menu-sub">
              <div className="model-sub-header">
                <button
                  type="button"
                  className="model-sub-back-btn"
                  onClick={() => setView('main')}
                  title="返回上一级"
                >
                  <ArrowLeft size={14} />
                  <span>返回</span>
                </button>
                <span className="model-sub-title">推理等级</span>
              </div>
              {value?.reasoning === false ? (
                <div className="model-sub-list">
                  <div className="model-sub-item" aria-disabled="true">
                    <div className="model-thinking-item-left">
                      <span className="model-item-name">该模型不支持可调推理等级</span>
                      <span className="model-item-desc">模型将使用自身默认设置；你的全局偏好会保留</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="model-sub-list">
                  {supportedLevels.map((lvl) => {
                  const meta = thinkingLevelLabels[lvl]
                  const isActive = lvl === thinkingLevel
                  return (
                    <button
                      type="button"
                      key={lvl}
                      className={`model-sub-item ${isActive ? 'active' : ''}`}
                      onClick={() => {
                        onThinkingLevelChange?.(lvl)
                        handleClose()
                      }}
                    >
                      <div className="model-thinking-item-left">
                        <span className="model-item-name">{meta.en}</span>
                        <span className="model-item-desc">{meta.zh} · {meta.desc}</span>
                      </div>
                      {isActive && <Check size={16} className="model-item-check" />}
                    </button>
                  )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function findSkillQuery(text: string, cursor: number) {
  const beforeCursor = text.slice(0, cursor)
  const match = beforeCursor.match(/(?:^|\s)\/([^\s/]*)$/)
  if (!match) return null
  return { start: cursor - match[1].length - 1, query: match[1] }
}

function findContextQuery(text: string, cursor: number) {
  const beforeCursor = text.slice(0, cursor)
  const match = beforeCursor.match(/(?:^|\s)@([^\s@]*)$/)
  if (!match || /^(file|dir):/i.test(match[1])) return null
  return { start: cursor - match[1].length - 1, query: match[1] }
}

const permissionOptions: { mode: PermissionMode; title: string; description: string }[] = [
  { mode: 'readonly', title: '只读', description: 'Host read-only：禁止修改文件；计划审阅或纯理解任务可用。' },
  { mode: 'ask', title: '工作区可写', description: 'Host workspace-write：工作区内可改；越界时请求审批。' },
  { mode: 'full', title: '完全访问', description: 'Host danger-full-access：关闭沙箱；意外审批仍会显示。' },
]

interface SlashCommandItem {
  id: string
  kind: 'mode' | 'action'
  command: string
  title: string
  description: string
  icon: typeof Target
  badge?: string
  mode?: WorkMode
}

const BUILTIN_SLASH_COMMANDS: SlashCommandItem[] = [
  {
    id: 'goal',
    kind: 'mode',
    command: 'goal',
    title: '目标模式',
    description: '设置要持续追求的目标，由规划器拆解 DAG 多智能体推进',
    icon: Target,
    badge: '多智能体',
    mode: 'goal',
  },
  {
    id: 'plan',
    kind: 'action',
    command: 'plan',
    title: '计划模式',
    description: '执行 Host 原生 /plan 命令；状态来自当前会话投影，不代表只读权限',
    icon: ListTodo,
    badge: 'Host',
  },
  {
    id: 'code',
    kind: 'mode',
    command: 'code',
    title: '常规执行',
    description: '常规编码执行模式，单 Agent 极速直达代码修改与测试',
    icon: Code2,
    mode: 'code',
  },
  {
    id: 'compact',
    kind: 'action',
    command: 'compact',
    title: '压缩上下文',
    description: '手动压缩会话历史，提炼核心上下文记忆并释放 Token 空间',
    icon: Minimize2,
    badge: '优化',
  },
]

function PermissionSelect({ value, onChange }: { value: PermissionMode; onChange: (mode: PermissionMode) => void }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const selected = permissionOptions.find((option) => option.mode === value)
    ?? (value === 'on-risk' ? permissionOptions.find((option) => option.mode === 'ask') : undefined)
    ?? permissionOptions[1]
  useEffect(() => {
    if (!open) return
    const dismiss = (event: MouseEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false)
    }
    window.addEventListener('mousedown', dismiss)
    return () => window.removeEventListener('mousedown', dismiss)
  }, [open])

  return <div className="permission-select" ref={rootRef}>
    <button type="button" className="access-button permission-trigger" onClick={() => setOpen((current) => !current)} aria-expanded={open} aria-haspopup="listbox">
      <ShieldAlert size={17} /><span>{selected.title}</span><ChevronDown size={13} />
    </button>
    {open && <div className="permission-menu" role="listbox" aria-label="工具审批模式">
      <div className="permission-menu-heading">工具审批</div>
      {permissionOptions.map((option) => <button key={option.mode} type="button" role="option" aria-selected={option.mode === value} className="permission-option" onClick={() => { onChange(option.mode); setOpen(false) }}>
        <span className="permission-option-copy"><strong>{option.title}</strong><small>{option.description}</small></span>
        {option.mode === value && <Check size={15} />}
      </button>)}
      <p className="permission-notice">审批提示不等于操作系统沙箱；完整访问不会限制 Agent 对本机文件或网络的访问。</p>
    </div>}
  </div>
}

function ConfirmModal({
  title,
  description,
  confirmLabel = '确认',
  cancelLabel = '取消',
  confirmDanger = false,
  onConfirm,
  onCancel,
}: {
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  confirmDanger?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onCancel])

  return (
    <div className="custom-confirm-backdrop" onClick={onCancel} role="dialog" aria-modal="true">
      <div className="custom-confirm-card" onClick={(e) => e.stopPropagation()}>
        <div className="custom-confirm-head">
          <div className={`custom-confirm-icon ${confirmDanger ? 'danger' : ''}`}>
            {confirmDanger ? <Trash2 size={20} /> : <HelpCircle size={20} />}
          </div>
          <div>
            <h3 className="custom-confirm-title">{title}</h3>
            <p className="custom-confirm-desc">{description}</p>
          </div>
        </div>
        <div className="custom-confirm-actions">
          <button type="button" className="custom-confirm-btn cancel" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`custom-confirm-btn ${confirmDanger ? 'danger' : 'confirm'}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

function ProjectSelector({
  currentWorkspace,
  availableProjects,
  onSelectProject,
  onPickWorkspace,
  onDetachWorkspace,
}: {
  currentWorkspace: string | null
  availableProjects: { path: string; name: string }[]
  onSelectProject: (path: string) => void
  onPickWorkspace: () => void
  onDetachWorkspace: () => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const dismiss = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', dismiss)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('mousedown', dismiss)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  const label = workspaceLabel(currentWorkspace)
  const filteredProjects = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return availableProjects
    return availableProjects.filter(
      (p) => p.name.toLowerCase().includes(query) || p.path.toLowerCase().includes(query)
    )
  }, [availableProjects, search])

  return (
    <div className="project-selector-wrapper" ref={menuRef}>
      <button
        type="button"
        className={`project-pill ${!currentWorkspace ? 'no-project' : ''}`}
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Folder size={14} />
        <span>{currentWorkspace ? label : '不在项目中工作'}</span>
        <ChevronDown size={12} className="project-pill-arrow" />
      </button>

      {open && (
        <div className="project-selector-menu" role="dialog" aria-label="切换项目">
          <div className="project-search-row">
            <Search size={14} />
            <input
              type="text"
              placeholder="搜索项目"
              value={search}
              autoFocus
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="project-menu-list">
            {filteredProjects.map((p) => {
              const isSelected = p.path === currentWorkspace
              return (
                <button
                  type="button"
                  key={p.path}
                  className={`project-menu-item ${isSelected ? 'selected' : ''}`}
                  onClick={() => {
                    onSelectProject(p.path)
                    setOpen(false)
                  }}
                >
                  <Folder size={14} />
                  <span className="project-menu-name" title={p.path}>{p.name}</span>
                  {isSelected && <Check size={14} className="project-menu-check" />}
                </button>
              )
            })}
            {filteredProjects.length === 0 && search && (
              <div className="project-menu-empty">未匹配到项目</div>
            )}
          </div>
          <div className="project-menu-divider" />
          <div className="project-menu-actions">
            <button
              type="button"
              className="project-menu-action"
              onClick={() => {
                onPickWorkspace()
                setOpen(false)
              }}
            >
              <Plus size={14} />
              <span>新建或打开项目…</span>
            </button>
            <button
              type="button"
              className={`project-menu-action ${!currentWorkspace ? 'selected' : ''}`}
              onClick={() => {
                if (currentWorkspace) {
                  onDetachWorkspace()
                }
                setOpen(false)
              }}
            >
              <X size={14} />
              <span>不在项目中工作</span>
              {!currentWorkspace && <Check size={14} className="project-menu-check" style={{ marginLeft: 'auto' }} />}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Composer({
  model,
  modelOptions,
  skills,
  skillCatalogLoading = false,
  skillCatalogSize = skills.length,
  onLoadSkills,
  permissionMode,
  modelsLoading,
  sending,
  promptQueue,
  workspacePath,
  availableProjects,
  hasMessages = false,
  messages,
  sessionStats,
  liveContext,
  hostPlanModeActive,
  hostTodos,
  onPermissionModeChange,
  onModelChange,
  onSend,
  onCancel,
  onSteer,
  onFollowUp,
  onSearchContext,
  onCreateDroppedReference,
  onSelectProject,
  onPickWorkspace,
  onDetachWorkspace,
  shortcuts,
  thinkingLevel = 'medium',
  onThinkingLevelChange,
  busyEnterMode = 'followUp',
  onBusyEnterModeChange,
  onQueueMutate,
  currentThreadId,
  permissionPrompt,
  onRespondPermission,
  userQuestionPrompt,
  onAnswerUserQuestion,
}: {
  model: ModelOption | null
  modelOptions: ModelOption[]
  skills: SkillOption[]
  skillCatalogLoading?: boolean
  skillCatalogSize?: number
  onLoadSkills?: () => Promise<void>
  permissionMode: PermissionMode
  modelsLoading?: boolean
  sending?: boolean
  promptQueue?: PromptQueueSnapshot
  workspacePath: string | null
  availableProjects: { path: string; name: string }[]
  hasMessages?: boolean
  messages?: ChatMessage[]
  sessionStats?: SessionStatsSnapshot | null
  liveContext?: LiveContextUsage | null
  hostPlanModeActive?: boolean | null
  hostTodos?: HostTodoItem[] | null
  onPermissionModeChange: (mode: PermissionMode) => void
  onModelChange: (model: ModelOption) => void
  thinkingLevel?: ThinkingLevel
  onThinkingLevelChange?: (level: ThinkingLevel) => void
  onSend: (message: string, skillName: string | null, workMode?: WorkMode) => void
  onCancel: () => void
  onSteer?: (text: string) => void
  onFollowUp?: (text: string) => void
  onSearchContext: (query: string) => Promise<WorkspaceEntry[]>
  onCreateDroppedReference: (file: File) => Promise<WorkspaceReference | null>
  onSelectProject: (path: string) => void
  onPickWorkspace: () => void
  onDetachWorkspace: () => void
  shortcuts?: ShortcutItem[]
  busyEnterMode?: BusyEnterMode
  onBusyEnterModeChange?: (mode: BusyEnterMode) => void
  onQueueMutate?: (payload: { kind: 'steering' | 'followUp'; index: number; action: 'remove' | 'update'; text?: string }) => void
  currentThreadId?: string | null
  permissionPrompt?: PermissionPromptPayload | null
  onRespondPermission?: (
    action: 'allow-once' | 'allow-always' | 'allow-always-session' | 'deny' | 'escalate-once',
    sandboxMode?: 'workspace-write' | 'danger-full-access',
  ) => void
  userQuestionPrompt?: UserQuestionPromptPayload | null
  onAnswerUserQuestion?: (id: string, answer: UserQuestionAnswer) => Promise<boolean>
}) {
  const [value, setValue] = useState('')
  const [workMode, setWorkMode] = useState<WorkMode>('code')
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null)
  const [skillQuery, setSkillQuery] = useState<{ start: number; query: string } | null>(null)
  const [contextQuery, setContextQuery] = useState<{ start: number; query: string } | null>(null)
  const [contextEntries, setContextEntries] = useState<WorkspaceEntry[]>([])
  const [activeSkillIndex, setActiveSkillIndex] = useState(0)
  const [activeContextIndex, setActiveContextIndex] = useState(0)
  const [dragging, setDragging] = useState(false)
  const textareaRef = useAutosizeTextarea(value, 38, 132)
  const slashMenuWasOpenRef = useRef(false)

  useEffect(() => {
    const isOpen = Boolean(skillQuery)
    if (isOpen && !slashMenuWasOpenRef.current && skillCatalogSize === 0) {
      void onLoadSkills?.()
    }
    slashMenuWasOpenRef.current = isOpen
  }, [onLoadSkills, skillCatalogSize, Boolean(skillQuery)])

  const draftsMapRef = useRef<Map<string, string>>(new Map())
  const prevThreadIdRef = useRef<string | null>(currentThreadId ?? null)

  useEffect(() => {
    const prevId = prevThreadIdRef.current
    const nextId = currentThreadId ?? null
    if (prevId !== nextId) {
      if (prevId) {
        draftsMapRef.current.set(prevId, value)
      }
      setValue(nextId ? (draftsMapRef.current.get(nextId) ?? '') : '')
      setWorkMode('code')
      setSelectedSkill(null)
      setSkillQuery(null)
      setContextQuery(null)
      historyIndexRef.current = -1
      draftRef.current = ''
      prevThreadIdRef.current = nextId
    }
  }, [currentThreadId])

  const userHistory = useMemo(() => {
    return (messages || [])
      .filter((m) => m.author === 'user' && m.text && m.text.trim())
      .map((m) => m.text)
  }, [messages])
  const historyIndexRef = useRef<number>(-1)
  const draftRef = useRef<string>('')

  const followUpShortcut = useMemo(() => {
    const item = shortcuts?.find((s) => s.id === 'follow-up')
    return item ? item.keys : ['⌥', '↩']
  }, [shortcuts])

  const steerShortcut = useMemo(() => {
    const item = shortcuts?.find((s) => s.id === 'steer')
    return item ? item.keys : ['↩']
  }, [shortcuts])
  const sendShortcut = useMemo(() => {
    const item = shortcuts?.find((s) => s.id === 'send')
    return item ? item.keys : ['↩']
  }, [shortcuts])
  const newLineShortcut = useMemo(() => {
    const item = shortcuts?.find((s) => s.id === 'new-line')
    return item ? item.keys : ['⇧', '↩']
  }, [shortcuts])
  const selectedSkillOption = skills.find((skill) => skill.name === selectedSkill)
  useEffect(() => {
    if (selectedSkill && !selectedSkillOption) setSelectedSkill(null)
  }, [selectedSkill, selectedSkillOption])
  const matchingCommands = useMemo(() => {
    const query = skillQuery?.query.toLowerCase() ?? ''
    if (!query) return BUILTIN_SLASH_COMMANDS
    return BUILTIN_SLASH_COMMANDS.filter((cmd) =>
      cmd.command.toLowerCase().includes(query) ||
      cmd.title.toLowerCase().includes(query) ||
      cmd.description.toLowerCase().includes(query)
    )
  }, [skillQuery?.query])

  const matchingSkills = useMemo(() => {
    const query = skillQuery?.query.toLocaleLowerCase() ?? ''
    return skills.filter((skill) => !query || skill.name.toLocaleLowerCase().includes(query) || skill.description.toLocaleLowerCase().includes(query))
  }, [skills, skillQuery?.query])

  const totalSlashCount = matchingCommands.length + matchingSkills.length

  useEffect(() => {
    if (!contextQuery) {
      setContextEntries([])
      return
    }
    let cancelled = false
    const timer = window.setTimeout(() => {
      void onSearchContext(contextQuery.query).then((entries) => {
        if (!cancelled) setContextEntries(entries)
      })
    }, 80)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [contextQuery?.query, onSearchContext])

  const updateCommandQuery = (text: string, cursor: number) => {
    const nextSkill = findSkillQuery(text, cursor)
    const nextContext = nextSkill ? null : findContextQuery(text, cursor)
    setSkillQuery(nextSkill)
    setContextQuery(nextContext)
    setActiveSkillIndex(0)
    setActiveContextIndex(0)
  }

  const chooseCommand = (cmd: SlashCommandItem) => {
    if (!skillQuery) return
    if (cmd.id === 'compact' || cmd.id === 'plan') {
      const commandText = `/${cmd.command}`
      setValue(commandText)
      setSkillQuery(null)
      requestAnimationFrame(() => {
        textareaRef.current?.focus()
        textareaRef.current?.setSelectionRange(commandText.length, commandText.length)
      })
      return
    }
    const nextValue = `${value.slice(0, skillQuery.start)}${value.slice(skillQuery.start + skillQuery.query.length + 1)}`
    const cursor = skillQuery.start
    setValue(nextValue.trimStart())
    if (cmd.mode) {
      setWorkMode(cmd.mode)
    }
    setSkillQuery(null)
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
      textareaRef.current?.setSelectionRange(cursor, cursor)
    })
  }

  const chooseSkill = (skill: SkillOption) => {
    if (!skillQuery) return
    const nextValue = `${value.slice(0, skillQuery.start)}${value.slice(skillQuery.start + skillQuery.query.length + 1)}`
    const cursor = skillQuery.start
    setValue(nextValue)
    setSelectedSkill(skill.name)
    setSkillQuery(null)
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
      textareaRef.current?.setSelectionRange(cursor, cursor)
    })
  }

  const insertReference = (reference: WorkspaceEntry | WorkspaceReference) => {
    const token = 'token' in reference
      ? reference.token
      : `@${reference.kind === 'directory' ? 'dir' : 'file'}:${reference.path.includes(' ') ? `"${reference.path.replaceAll('"', '\\"')}"` : reference.path}`
    const start = contextQuery?.start ?? textareaRef.current?.selectionStart ?? value.length
    const end = contextQuery ? contextQuery.start + contextQuery.query.length + 1 : start
    const spacer = value.slice(end).startsWith(' ') || end === value.length ? '' : ' '
    const nextValue = `${value.slice(0, start)}${token}${spacer}${value.slice(end)}`
    const cursor = start + token.length + spacer.length
    setValue(nextValue)
    setContextQuery(null)
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
      textareaRef.current?.setSelectionRange(cursor, cursor)
    })
  }

  const openContextMenu = () => {
    const textarea = textareaRef.current
    const cursor = textarea?.selectionStart ?? value.length
    const prefix = cursor > 0 && !/\s/.test(value[cursor - 1]) ? ' @' : '@'
    const nextValue = `${value.slice(0, cursor)}${prefix}${value.slice(cursor)}`
    const nextCursor = cursor + prefix.length
    setValue(nextValue)
    updateCommandQuery(nextValue, nextCursor)
    requestAnimationFrame(() => {
      textarea?.focus()
      textarea?.setSelectionRange(nextCursor, nextCursor)
    })
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const raw = value.trim()
    if (!raw) return

    if (currentThreadId) {
      draftsMapRef.current.delete(currentThreadId)
    }
    historyIndexRef.current = -1
    draftRef.current = ''

    if (raw.toLowerCase() === '/compact' || raw.toLowerCase().startsWith('/compact ')) {
      onSend(raw, null, 'code')
      setValue('')
      setSelectedSkill(null)
      setSkillQuery(null)
      setContextQuery(null)
      return
    }

    const planLower = raw.toLowerCase()
    if (planLower === '/plan' || planLower === '/plan off' || planLower.startsWith('/plan ')) {
      onSend(raw, null, 'code')
      setValue('')
      setSelectedSkill(null)
      setSkillQuery(null)
      setContextQuery(null)
      return
    }

    let effectiveMode = workMode
    let message = raw

    if (raw.toLowerCase() === '/goal') {
      setWorkMode('goal')
      setValue('')
      return
    }
    if (raw.toLowerCase() === '/code') {
      setWorkMode('code')
      setValue('')
      return
    }

    if (raw.toLowerCase().startsWith('/goal ')) {
      effectiveMode = 'goal'
      message = raw.slice(6).trim()
      setWorkMode('goal')
    } else if (raw.toLowerCase().startsWith('/code ')) {
      effectiveMode = 'code'
      message = raw.slice(6).trim()
      setWorkMode('code')
    }

    if (sending) {
      if (busyEnterMode === 'followUp') onFollowUp?.(message)
      else onSteer?.(message)
      setValue('')
      return
    }

    onSend(message, selectedSkill, effectiveMode)
    setValue('')
    setSelectedSkill(null)
    setSkillQuery(null)
    setContextQuery(null)
  }

  const commandOpen = Boolean(skillQuery || contextQuery)
  const activeOptionId = skillQuery
    ? (activeSkillIndex < matchingCommands.length ? `slash-cmd-${activeSkillIndex}` : `slash-skill-${activeSkillIndex}`)
    : contextQuery && contextEntries[activeContextIndex]
      ? `context-command-${activeContextIndex}`
      : undefined

  const queue = promptQueue ?? { steering: [], followUp: [] }

  return (
    <div className="composer-shell">
      <HostTodoProjection items={hostTodos ?? null} />
      {permissionPrompt && onRespondPermission && (
        <div className="composer-approval-slot">
          <ApprovalPanel prompt={permissionPrompt} onRespond={onRespondPermission} />
        </div>
      )}
      {userQuestionPrompt && onAnswerUserQuestion && (
        <div className="composer-approval-slot">
          <UserQuestionPanel prompt={userQuestionPrompt} onAnswer={onAnswerUserQuestion} />
        </div>
      )}
      {sending && onQueueMutate && (
        <QueueDock queue={queue} sending={sending} onMutate={(payload) => { void onQueueMutate(payload) }} />
      )}
      {!hasMessages && (
        <ProjectSelector
          currentWorkspace={workspacePath}
          availableProjects={availableProjects}
          onSelectProject={onSelectProject}
          onPickWorkspace={onPickWorkspace}
          onDetachWorkspace={onDetachWorkspace}
        />
      )}
      <form className={`composer ${dragging ? 'is-dragging' : ''}`} onSubmit={submit} onDragEnter={(event) => { event.preventDefault(); setDragging(true) }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false)
      }} onDrop={(event) => {
        event.preventDefault()
        setDragging(false)
        const files = [...event.dataTransfer.files]
        void (async () => {
          for (const file of files.slice(0, 8)) {
            const reference = await onCreateDroppedReference(file)
            if (reference) insertReference(reference)
          }
        })()
      }}>
        <label className="sr-only" htmlFor="main-message">给主控 Agent 发送消息</label>
        <textarea ref={textareaRef} rows={1} id="main-message" value={value} role="combobox" aria-autocomplete="list" aria-expanded={commandOpen} aria-controls={skillQuery ? 'skill-command-options' : contextQuery ? 'context-command-options' : undefined} aria-activedescendant={activeOptionId} onChange={(event) => {
          const nextVal = event.target.value
          setValue(nextVal)
          if (historyIndexRef.current >= 0) {
            historyIndexRef.current = -1
          }
          updateCommandQuery(nextVal, event.target.selectionStart)
        }} onClick={(event) => updateCommandQuery(event.currentTarget.value, event.currentTarget.selectionStart)} onKeyUp={(event) => {
          if (!['ArrowUp', 'ArrowDown', 'Escape', 'Enter'].includes(event.key)) updateCommandQuery(event.currentTarget.value, event.currentTarget.selectionStart)
        }} onBlur={() => { setSkillQuery(null); setContextQuery(null) }} placeholder="发消息或创建任务, / 调用指令, @ 文件或对话" onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return
          if (contextQuery && event.key === 'ArrowDown' && contextEntries.length) {
            event.preventDefault()
            setActiveContextIndex((index) => {
              const next = (index + 1) % contextEntries.length
              requestAnimationFrame(() => {
                const elem = document.getElementById(`context-command-${next}`)
                if (elem) elem.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
              })
              return next
            })
            return
          }
          if (contextQuery && event.key === 'ArrowUp' && contextEntries.length) {
            event.preventDefault()
            setActiveContextIndex((index) => {
              const next = (index - 1 + contextEntries.length) % contextEntries.length
              requestAnimationFrame(() => {
                const elem = document.getElementById(`context-command-${next}`)
                if (elem) elem.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
              })
              return next
            })
            return
          }
          const plainEnter = event.key === 'Enter' && !event.shiftKey && !event.altKey && !event.metaKey && !event.ctrlKey
          if (contextQuery && plainEnter && contextEntries.length) {
            event.preventDefault(); insertReference(contextEntries[activeContextIndex] ?? contextEntries[0]); return
          }
          if (skillQuery && event.key === 'ArrowDown' && totalSlashCount) {
            event.preventDefault()
            setActiveSkillIndex((index) => {
              const next = (index + 1) % totalSlashCount
              requestAnimationFrame(() => {
                const menu = document.getElementById('skill-command-options')
                const elem = document.getElementById(next < matchingCommands.length ? `slash-cmd-${next}` : `slash-skill-${next}`)
                if (menu && elem) elem.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
              })
              return next
            })
            return
          }
          if (skillQuery && event.key === 'ArrowUp' && totalSlashCount) {
            event.preventDefault()
            setActiveSkillIndex((index) => {
              const next = (index - 1 + totalSlashCount) % totalSlashCount
              requestAnimationFrame(() => {
                const menu = document.getElementById('skill-command-options')
                const elem = document.getElementById(next < matchingCommands.length ? `slash-cmd-${next}` : `slash-skill-${next}`)
                if (menu && elem) elem.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
              })
              return next
            })
            return
          }
          if (skillQuery && plainEnter && totalSlashCount) {
            event.preventDefault()
            if (activeSkillIndex < matchingCommands.length) {
              chooseCommand(matchingCommands[activeSkillIndex] ?? matchingCommands[0])
            } else {
              const skillIdx = activeSkillIndex - matchingCommands.length
              chooseSkill(matchingSkills[skillIdx] ?? matchingSkills[0])
            }
            return
          }
          if (commandOpen && event.key === 'Escape') {
            event.preventDefault(); setSkillQuery(null); setContextQuery(null); return
          }
          if (matchesKeys(event, newLineShortcut)) {
            event.preventDefault()
            const textarea = event.currentTarget
            const start = textarea.selectionStart
            const end = textarea.selectionEnd
            const nextValue = `${value.slice(0, start)}\n${value.slice(end)}`
            const nextCursor = start + 1
            setValue(nextValue)
            updateCommandQuery(nextValue, nextCursor)
            requestAnimationFrame(() => {
              textarea.focus()
              textarea.setSelectionRange(nextCursor, nextCursor)
            })
            return
          }
          if (!commandOpen && event.key === 'ArrowUp') {
            const isEmpty = value.trim() === ''
            const isAtStart = textareaRef.current
              ? textareaRef.current.selectionStart === 0 && textareaRef.current.selectionEnd === 0
              : false
            if ((isEmpty || (historyIndexRef.current >= 0 && isAtStart)) && userHistory.length > 0) {
              event.preventDefault()
              if (historyIndexRef.current === -1) {
                draftRef.current = value
              }
              const nextIndex = Math.min(historyIndexRef.current + 1, userHistory.length - 1)
              historyIndexRef.current = nextIndex
              const historicalText = userHistory[userHistory.length - 1 - nextIndex]
              setValue(historicalText)
              requestAnimationFrame(() => {
                if (textareaRef.current) {
                  const len = historicalText.length
                  textareaRef.current.focus()
                  textareaRef.current.setSelectionRange(len, len)
                }
              })
              return
            }
          }
          if (!commandOpen && event.key === 'ArrowDown') {
            if (historyIndexRef.current >= 0) {
              event.preventDefault()
              const nextIndex = historyIndexRef.current - 1
              historyIndexRef.current = nextIndex
              const targetText = nextIndex < 0 ? (draftRef.current || '') : userHistory[userHistory.length - 1 - nextIndex]
              setValue(targetText)
              requestAnimationFrame(() => {
                if (textareaRef.current) {
                  const len = targetText.length
                  textareaRef.current.focus()
                  textareaRef.current.setSelectionRange(len, len)
                }
              })
              return
            }
          }
          if (matchesKeys(event, followUpShortcut)) {
            event.preventDefault()
            const text = value.trim()
            if (!text) return
            if (sending && onFollowUp) {
              onFollowUp(text)
              setValue('')
            } else {
              event.currentTarget.form?.requestSubmit()
            }
            return
          }
          // 默认「纠偏」与「发送」都显示 Enter：此时由忙时 Enter 偏好
          // 决定排队还是纠偏；若用户给纠偏分配了独立组合键，则直接纠偏。
          const steerHasOwnShortcut = steerShortcut.length > 0 &&
            (steerShortcut.length !== sendShortcut.length || steerShortcut.some((key, index) => key !== sendShortcut[index]))
          if (steerHasOwnShortcut && matchesKeys(event, steerShortcut)) {
            event.preventDefault()
            const text = value.trim()
            if (!text) return
            if (sending && onSteer) {
              onSteer(text)
              setValue('')
            } else {
              event.currentTarget.form?.requestSubmit()
            }
            return
          }
          if (matchesKeys(event, sendShortcut)) {
            event.preventDefault()
            if (sending) {
              const text = value.trim()
              if (!text) return
              if (busyEnterMode === 'followUp') onFollowUp?.(text)
              else onSteer?.(text)
              setValue('')
            } else {
              event.currentTarget.form?.requestSubmit()
            }
          }
        }} />
        {skillQuery && <div className="skill-command-menu" id="skill-command-options" role="listbox" aria-label="斜杠命令与技能">
          {matchingCommands.length > 0 && (
            <>
              <div className="skill-command-heading"><span>模式与指令</span></div>
              {matchingCommands.map((cmd, index) => {
                const isSelected = index === activeSkillIndex
                return (
                  <button
                    type="button"
                    id={`slash-cmd-${index}`}
                    key={cmd.id}
                    className={`skill-command-option ${isSelected ? 'selected' : ''}`}
                    role="option"
                    aria-selected={isSelected}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => chooseCommand(cmd)}
                  >
                    <cmd.icon className="skill-command-icon" size={16} aria-hidden="true" />
                    <span className="skill-command-name">{cmd.title}</span>
                    <span className="skill-command-description" title={cmd.description}>{cmd.description}</span>
                    {cmd.badge && <span className="skill-command-tag">{cmd.badge}</span>}
                    <span className="skill-command-source">/{cmd.command}</span>
                  </button>
                )
              })}
            </>
          )}
          {matchingSkills.length > 0 && (
            <>
              <div className="skill-command-heading"><span>技能</span>{skillQuery.query && <small>{matchingSkills.length} 项匹配</small>}</div>
              {matchingSkills.map((skill, index) => {
                const itemIndex = matchingCommands.length + index
                const isSelected = itemIndex === activeSkillIndex
                return (
                  <button
                    type="button"
                    id={`slash-skill-${itemIndex}`}
                    key={skill.name}
                    className={`skill-command-option skill-command-option--skill ${isSelected ? 'selected' : ''}`}
                    role="option"
                    aria-selected={isSelected}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => chooseSkill(skill)}
                  >
                    <Package className="skill-command-icon" size={16} aria-hidden="true" />
                    <span className="skill-command-name">/{skill.name}</span>
                    {skill.multiAgent && <span className="skill-command-tag">多智能体</span>}
                    <span className="skill-command-source">{skillOptionSourceLabel(skill)}</span>
                    <span className="skill-command-description" title={skill.description}>
                      {skillDescriptionBlurb(skill.description, 120)}
                    </span>
                  </button>
                )
              })}
            </>
          )}
          {skillCatalogLoading && skillCatalogSize === 0 && (
            <>
              <div className="skill-command-heading"><span>技能</span><small>正在加载…</small></div>
              <p className="skill-menu-empty">正在读取当前工作区可用的 Skill。</p>
            </>
          )}
          {!skillCatalogLoading && matchingCommands.length === 0 && matchingSkills.length === 0 && (
            <p className="skill-menu-empty">没有匹配的指令或技能；按 Esc 保留并继续输入普通文本。</p>
          )}
        </div>}
        {contextQuery && <div className="skill-command-menu context-command-menu" id="context-command-options" role="listbox" aria-label="工作区上下文">
          <div className="skill-command-heading"><span>工作区上下文</span><small>{contextEntries.length ? `${contextEntries.length} 项` : '未找到匹配项'}</small></div>
          {contextEntries.map((entry, index) => <button type="button" id={`context-command-${index}`} key={`${entry.kind}:${entry.path}`} className="skill-command-option context-command-option" role="option" aria-selected={index === activeContextIndex} onMouseDown={(event) => event.preventDefault()} onClick={() => insertReference(entry)}>
            {entry.kind === 'directory' ? <Folder className="skill-command-icon" size={16} aria-hidden="true" /> : <FileText className="skill-command-icon" size={16} aria-hidden="true" />}
            <span className="context-command-path" title={entry.path}>{entry.path}</span>
            <span className="skill-command-source">{entry.kind === 'directory' ? '文件夹' : '文件'}</span>
          </button>)}
          {contextEntries.length === 0 && <p className="skill-menu-empty">输入文件名或路径搜索；只显示当前工作区内容。</p>}
        </div>}
        {dragging && <div className="composer-drop-overlay"><FolderOpen size={20} /><span>松开以引用工作区文件</span></div>}
        <div className="composer-footer">
          <div className="composer-left">
            <button type="button" className="composer-icon" aria-label="添加文件或上下文" title="添加文件或上下文" onClick={openContextMenu}><Plus size={23} /></button>
            <PermissionSelect value={permissionMode} onChange={onPermissionModeChange} />
            {hostPlanModeActive === true && (
              <button
                type="button"
                className="selected-skill-chip mode-chip plan"
                disabled={sending}
                onClick={() => onSend('/plan off', null, 'code')}
                title="Host 当前会话投影显示 Plan mode。它不代表文件只读权限。点击发送 Host 原生 /plan off。"
              >
                <ListTodo size={13} />
                <span>Plan mode · Host</span>
                <X size={13} />
              </button>
            )}
            {workMode === 'goal' && (
              <button
                type="button"
                className="selected-skill-chip mode-chip goal"
                onClick={() => setWorkMode('code')}
                title="当前为目标模式（多智能体）。点击恢复常规执行。"
              >
                <Target size={13} />
                <span>目标模式 (多智能体)</span>
                <X size={13} />
              </button>
            )}
            {selectedSkillOption && <button type="button" className="selected-skill-chip" onClick={() => setSelectedSkill(null)} title="移除本次 Skill"><Sparkles size={13} /><span>{selectedSkillOption.name}{selectedSkillOption.multiAgent ? ' · 多 Agent' : ''}</span><X size={13} /></button>}
          </div>
          <div className="composer-right">
            <ModelSelect
              value={model}
              options={modelOptions}
              loading={modelsLoading}
              onChange={onModelChange}
              thinkingLevel={thinkingLevel}
              onThinkingLevelChange={onThinkingLevelChange}
            />
            <button type="button" className="composer-icon mic-button" aria-label="语音输入" title="语音输入"><Mic size={18} /></button>
            {sending
              ? <button type="button" className="send-button stop" aria-label="停止生成" title="停止生成" onClick={onCancel}><Square size={17} fill="currentColor" /></button>
              : <button className="send-button" aria-label="发送消息" disabled={!value.trim() || !model}><ArrowUp size={23} /></button>}
          </div>
        </div>
      </form>
      <ConversationUsageFooter
        messages={messages ?? []}
        sessionStats={sessionStats}
        liveContext={liveContext}
        modelContextWindow={model?.contextWindow}
      />
    </div>
  )
}

function ConversationUsageFooter({
  messages,
  sessionStats,
  liveContext,
  modelContextWindow,
}: {
  messages: ChatMessage[]
  sessionStats?: SessionStatsSnapshot | null
  liveContext?: LiveContextUsage | null
  modelContextWindow?: number
}) {
  const sessionUsage = useMemo(() => summarizeSessionUsage(messages), [messages])
  if (sessionStats) {
    return <ComposerStatsDock stats={sessionStats} messages={messages} liveContext={liveContext} modelContextWindow={modelContextWindow} />
  }
  if (!sessionUsageHasData(sessionUsage) && !liveContext) return null
  return (
    <ComposerStatsDock
      stats={{
        userMessages: sessionUsage.rounds,
        assistantMessages: sessionUsage.rounds,
        toolCalls: 0,
        toolResults: 0,
        tokens: {
          input: sessionUsage.inputTokens,
          output: sessionUsage.outputTokens,
          cacheRead: sessionUsage.cacheReadTokens,
          cacheWrite: sessionUsage.cacheWriteTokens,
          total: sessionUsage.inputTokens + sessionUsage.outputTokens + sessionUsage.cacheReadTokens,
        },
        cost: 0,
      }}
      messages={messages}
      liveContext={liveContext}
      modelContextWindow={modelContextWindow}
    />
  )
}

function MainConversation({
  currentThreadId,
  messages,
  model,
  modelOptions,
  skills,
  skillCatalogLoading,
  skillCatalogSize,
  onLoadSkills,
  permissionMode,
  modelsLoading,
  sending,
  streamText,
  streamStartedAt,
  streamActivity,
  streamThinking,
  streamBlocks,
  retryBanner,
  toolTraces,
  dshToolRows,
  promptQueue,
  busyEnterMode,
  onQueueMutate,
  onBusyEnterModeChange,
  liveContext,
  sessionStats,
  hostPlanModeActive,
  hostTodos,
  backendError,
  threadTitle,
  taskCount,
  panelOpen,
  workspacePath,
  availableProjects,
  onSelectProject,
  onPickWorkspace,
  onDetachWorkspace,
  onModelChange,
  thinkingLevel,
  onThinkingLevelChange,
  onPermissionModeChange,
  onSend,
  onCancel,
  onSteer,
  onFollowUp,
  onSearchContext,
  onCreateDroppedReference,
  onTogglePanel,
  activePanel,
  onSelectPanel,
  onToggleNav,
  onFork,
  onShowToolDetails,
  onOpenWorkspacePath,
  shortcuts,
  terminalOpen,
  onToggleTerminal,
  onCloseTerminal,
  interruptedTurn,
  onDismissInterrupted,
  permissionPrompt,
  onRespondPermission,
  userQuestionPrompt,
  onAnswerUserQuestion,
}: {
  currentThreadId?: string | null
  messages: ChatMessage[]
  model: ModelOption | null
  modelOptions: ModelOption[]
  skills: SkillOption[]
  skillCatalogLoading?: boolean
  skillCatalogSize?: number
  onLoadSkills?: () => Promise<void>
  permissionMode: PermissionMode
  modelsLoading?: boolean
  sending?: boolean
  streamText?: string | null
  streamStartedAt?: number | null
  streamActivity?: string | null
  streamThinking?: { text: string; durationMs?: number } | null
  streamBlocks?: import('./types').AssistantContentBlock[]
  retryBanner?: {
    attempt: number
    maxAttempts?: number
    delayMs?: number
    message?: string
  } | null
  toolTraces: ToolTraceItem[]
  dshToolRows?: readonly DshProjectedToolCall[]
  promptQueue?: PromptQueueSnapshot
  busyEnterMode?: BusyEnterMode
  onQueueMutate?: (payload: { kind: 'steering' | 'followUp'; index: number; action: 'remove' | 'update'; text?: string }) => void
  onBusyEnterModeChange?: (mode: BusyEnterMode) => void
  liveContext?: LiveContextUsage | null
  sessionStats?: SessionStatsSnapshot | null
  hostPlanModeActive?: boolean | null
  hostTodos?: HostTodoItem[] | null
  backendError?: string | null
  threadTitle: string
  taskCount: number
  panelOpen: boolean
  activePanel?: PanelView
  onSelectPanel?: (panel: PanelView) => void
  workspacePath: string | null
  availableProjects: { path: string; name: string }[]
  onSelectProject: (path: string) => void
  onPickWorkspace: () => void
  onDetachWorkspace: () => void
  onModelChange: (model: ModelOption) => void
  thinkingLevel?: ThinkingLevel
  onThinkingLevelChange?: (level: ThinkingLevel) => void
  onPermissionModeChange: (mode: PermissionMode) => void
  onSend: (message: string, skillName: string | null, workMode?: WorkMode) => void
  onCancel: () => void
  onSteer?: (text: string) => void
  onFollowUp?: (text: string) => void
  onSearchContext: (query: string) => Promise<WorkspaceEntry[]>
  onCreateDroppedReference: (file: File) => Promise<WorkspaceReference | null>
  onTogglePanel: () => void
  onToggleNav: () => void
  onFork?: (messageId: string) => void
  onShowToolDetails?: (item: ToolTraceItem) => void
  onOpenWorkspacePath?: (relativePath: string) => void
  shortcuts?: ShortcutItem[]
  terminalOpen?: boolean
  onToggleTerminal?: () => void
  onCloseTerminal?: () => void
  interruptedTurn?: { id: string; text: string } | null
  onDismissInterrupted?: () => void
  permissionPrompt?: PermissionPromptPayload | null
  onRespondPermission?: (
    action: 'allow-once' | 'allow-always' | 'allow-always-session' | 'deny' | 'escalate-once',
    sandboxMode?: 'workspace-write' | 'danger-full-access',
  ) => void
  userQuestionPrompt?: UserQuestionPromptPayload | null
  onAnswerUserQuestion?: (id: string, answer: UserQuestionAnswer) => Promise<boolean>
}) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const scrollPositionsRef = useRef<Map<string, { top: number; atBottom: boolean }>>(new Map())
  const isAtBottomRef = useRef(true)
  const scrollFollowRafRef = useRef<number | null>(null)
  const [showScrollBottomBtn, setShowScrollBottomBtn] = useState(false)
  const [turnMenuOpen, setTurnMenuOpen] = useState(false)
  const [focusedMessageIndex, setFocusedMessageIndex] = useState<number>(-1)

  const lastAgentMessageId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].author !== 'user' && !isDshContextMessage(messages[i])) return messages[i].id
    }
    return null
  }, [messages])

  const streamFollowKey = useMemo(() => {
    const traceTail = toolTraces.length ? toolTraces[toolTraces.length - 1]?.id ?? '' : ''
    return `${messages.length}:${lastAgentMessageId ?? ''}:${streamText?.length ?? 0}:${sending ? 1 : 0}:${traceTail}`
  }, [messages.length, lastAgentMessageId, streamText, sending, toolTraces])

  const userTurns = useMemo(() => {
    return messages
      .filter((m) => m.author === 'user')
      .map((m, idx) => ({
        turnNumber: idx + 1,
        id: m.id,
        preview: m.text.trim().replace(/\s+/g, ' ').slice(0, 30) + (m.text.trim().length > 30 ? '…' : ''),
        time: m.time,
      }))
  }, [messages])

  const handleScroll = () => {
    const el = scrollContainerRef.current
    if (!el) return
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    const atBottom = distFromBottom <= 80
    isAtBottomRef.current = atBottom
    setShowScrollBottomBtn(!atBottom)
    if (currentThreadId) {
      scrollPositionsRef.current.set(currentThreadId, {
        top: el.scrollTop,
        atBottom,
      })
    }
  }

  // 跨会话切换：精准还原上一次离开时的滚动位置（停在 A 处的依然回到 A）
  useEffect(() => {
    const el = scrollContainerRef.current
    if (!el || !currentThreadId) return
    const saved = scrollPositionsRef.current.get(currentThreadId)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (saved && !saved.atBottom) {
          el.scrollTop = saved.top
          isAtBottomRef.current = false
          setShowScrollBottomBtn(true)
        } else {
          el.scrollTop = el.scrollHeight
          isAtBottomRef.current = true
          setShowScrollBottomBtn(false)
        }
      })
    })
  }, [currentThreadId])

  // 流式生成：仅在贴底时跟随；合并到每帧一次，避免每个 stream 事件都触发布局。
  useEffect(() => {
    if (!isAtBottomRef.current) return
    if (scrollFollowRafRef.current !== null) cancelAnimationFrame(scrollFollowRafRef.current)
    scrollFollowRafRef.current = requestAnimationFrame(() => {
      scrollFollowRafRef.current = null
      const el = scrollContainerRef.current
      if (el) el.scrollTop = el.scrollHeight
    })
    return () => {
      if (scrollFollowRafRef.current !== null) cancelAnimationFrame(scrollFollowRafRef.current)
    }
  }, [streamFollowKey])

  const scrollToLatest = () => {
    const el = scrollContainerRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    isAtBottomRef.current = true
    setShowScrollBottomBtn(false)
    if (currentThreadId) {
      scrollPositionsRef.current.set(currentThreadId, {
        top: el.scrollHeight,
        atBottom: true,
      })
    }
  }

  useEffect(() => {
    const jumpShortcut = shortcuts?.find((item) => item.id === 'jump-bottom')?.keys ?? ['⌥', '↓']
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || !matchesKeys(event, jumpShortcut)) return
      const target = event.target instanceof HTMLElement ? event.target : null
      if (target?.closest('[role="dialog"], [role="listbox"], [role="menu"]') || document.querySelector('[aria-modal="true"]')) return
      event.preventDefault()
      event.stopPropagation()
      scrollToLatest()
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [shortcuts, currentThreadId])

  useEffect(() => {
    const handleMessageNavigation = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return
      const target = event.target instanceof HTMLElement ? event.target : null
      if (target?.closest('textarea, input, [role="dialog"], [role="listbox"], [role="menu"], [contenteditable="true"]') || document.querySelector('[aria-modal="true"]')) return

      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault()
        event.stopPropagation()

        setFocusedMessageIndex((currentIndex) => {
          const messageCount = messages.length
          if (messageCount === 0) return -1

          let nextIndex: number
          if (currentIndex === -1) {
            nextIndex = event.key === 'ArrowUp' ? messageCount - 1 : 0
          } else {
            nextIndex = event.key === 'ArrowUp'
              ? Math.max(0, currentIndex - 1)
              : Math.min(messageCount - 1, currentIndex + 1)
          }

          const messageId = messages[nextIndex]?.id
          if (messageId) {
            requestAnimationFrame(() => {
              const element = document.getElementById(`msg-${messageId}`)
              if (element) {
                element.scrollIntoView({ block: 'center', behavior: 'smooth' })
                isAtBottomRef.current = false
                setShowScrollBottomBtn(nextIndex < messageCount - 1)
              }
            })
          }

          return nextIndex
        })
      }
    }

    window.addEventListener('keydown', handleMessageNavigation, true)
    return () => window.removeEventListener('keydown', handleMessageNavigation, true)
  }, [messages])

  useEffect(() => {
    setFocusedMessageIndex(-1)
  }, [currentThreadId])

  const scrollToTurn = (turnId: string) => {
    setTurnMenuOpen(false)
    const el = document.getElementById(`msg-${turnId}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      isAtBottomRef.current = false
      setShowScrollBottomBtn(true)
    }
  }

  return (
    <main className="conversation" aria-label="主控 Agent 对话">
      <header className="conversation-header">
        <div className="conversation-title">
          <button className="header-icon nav-toggle" onClick={onToggleNav} title="显示/隐藏导航栏" aria-label="显示或隐藏导航栏"><PanelLeft size={19} /></button>
          {workspacePath ? <Folder size={19} /> : <MessageSquare size={19} />}
          <strong>{threadTitle}</strong>
        </div>
        <div className="conversation-actions">
          {userTurns.length >= 2 && (
            <div className="turn-navigator-wrapper">
              <button
                type="button"
                className={`header-icon turn-nav-btn ${turnMenuOpen ? 'active' : ''}`}
                onClick={() => setTurnMenuOpen((prev) => !prev)}
                title="对话大纲 · 快速定位问答轮次"
                aria-expanded={turnMenuOpen}
              >
                <ListOrdered size={16} />
                <span>{userTurns.length} 轮问答</span>
              </button>
              {turnMenuOpen && (
                <div className="turn-menu-dropdown">
                  <div className="turn-menu-head">
                    <span>对话大纲 · 问答轮次</span>
                    <button type="button" onClick={() => setTurnMenuOpen(false)} aria-label="关闭大纲">
                      <X size={13} />
                    </button>
                  </div>
                  <div className="turn-menu-list">
                    {userTurns.map((turn) => (
                      <button
                        key={turn.id}
                        type="button"
                        className="turn-menu-item"
                        onClick={() => scrollToTurn(turn.id)}
                      >
                        <span className="turn-badge">第 {turn.turnNumber} 轮</span>
                        <span className="turn-text">{turn.preview}</span>
                        <time>{turn.time}</time>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <button
            className={`header-icon sidebar-toggle ${activePanel === 'logs' ? 'active' : ''}`}
            onClick={() => onSelectPanel?.(activePanel === 'logs' ? null : 'logs')}
            aria-label="Trajectory：工具执行轨迹"
            title="Trajectory · 工具执行轨迹（时间序）"
          >
            <Terminal size={17} />
            {toolTraces.length > 0 && <span style={{ fontSize: 10 }}>{toolTraces.length}</span>}
          </button>
          {workspacePath && (
            <button
              className={`header-icon sidebar-toggle ${activePanel === 'git' ? 'active' : ''}`}
              onClick={() => onSelectPanel?.(activePanel === 'git' ? null : 'git')}
              aria-label="显示或隐藏 Git 快照与版本"
              title="显示或隐藏 Git 快照与版本面板"
            >
              <GitBranch size={17} />
            </button>
          )}
          <button
            className={`header-icon sidebar-toggle ${terminalOpen ? 'active' : ''}`}
            onClick={onToggleTerminal}
            aria-label={terminalOpen ? '隐藏终端抽屉' : '显示终端抽屉'}
            aria-pressed={terminalOpen}
            title="显示或隐藏交互式终端 · ⌃`"
          >
            <PanelBottom size={18} />
          </button>
          {taskCount > 0 && (
            <button
              className={`header-icon sidebar-toggle ${activePanel === 'dag' || activePanel === 'task' ? 'active' : ''}`}
              onClick={() => onSelectPanel?.(activePanel === 'dag' ? null : 'dag')}
              aria-label={panelOpen ? '隐藏任务侧边栏' : '显示任务侧边栏'}
              aria-pressed={panelOpen}
              title="显示或隐藏任务 DAG · ⌘B"
            >
              <PanelRight size={19} /><span>{taskCount}</span>
            </button>
          )}
        </div>
      </header>
      {backendError && <div className="conversation-error" role="alert">{backendError}</div>}
      {interruptedTurn && (
        <div className="conversation-error interrupted-turn-banner" role="status">
          <span>上一条消息可能未收到回复（中断或失败）。</span>
          <button type="button" className="settings-secondary-button" onClick={() => onSend(interruptedTurn.text, null)}>
            重新发送
          </button>
          <button type="button" className="settings-secondary-button" onClick={() => onDismissInterrupted?.()}>
            忽略
          </button>
        </div>
      )}
      <div className="conversation-scroll" ref={scrollContainerRef} onScroll={handleScroll}>
        <div className="transcript" data-dsh-chat>
          {messages.length === 0 && !sending && (
            <div className="conversation-empty">
              <div className="empty-brand-icon"><Sparkles size={24} aria-hidden="true" /></div>
              <strong>{workspacePath ? `我们应该在${workspaceLabel(workspacePath)}中做些什么？` : '我们今天要做些什么？'}</strong>
              <span>普通请求由单 Agent 直接执行 · 需要并行协作时可主动启用多智能体模式</span>
              <div className="empty-hints-grid">
                <div className="empty-hint-card">
                  <code>单 Agent 直达</code>
                  <p>常规需求保持单 Agent 极速交互，零多余协调开销</p>
                </div>
                <div className="empty-hint-card">
                  <code>/ 技能命令</code>
                  <p>输入 / 选择多智能体 Skill，或在模式菜单中主动切换到目标模式</p>
                </div>
                <div className="empty-hint-card">
                  <code>@ 文件上下文</code>
                  <p>输入 @ 快速索引并精准注入工作区代码上下文</p>
                </div>
              </div>
            </div>
          )}
          {messages.map((message, index) => {
            if (isDshContextMessage(message)) {
              return (
                <ContextInjectionRow
                  key={message.id}
                  plugin={message.dshContext.plugin}
                  form={message.dshContext.form}
                  text={message.text}
                  timestamp={message.timestamp}
                />
              )
            }
            const isLatestAgent = !sending && message.id === lastAgentMessageId
            const canForkHere =
              Boolean(onFork)
              && !sending
              && message.id === lastAgentMessageId
              && message.author !== 'user'
              && (promptQueue?.steering?.length ?? 0) === 0
            const isFocused = index === focusedMessageIndex
            return (
              <Message
                key={message.id}
                message={message}
                dshToolRows={isLatestAgent ? dshToolRows : undefined}
                toolTraceItems={isLatestAgent ? toolTraces : undefined}
                workspacePath={workspacePath}
                onFork={canForkHere ? onFork : undefined}
                onShowToolDetails={onShowToolDetails}
                onOpenWorkspacePath={onOpenWorkspacePath}
                fallbackModelKey={model?.id ?? model?.name}
                isFocused={isFocused}
              />
            )
          })}
          {sending && (promptQueue?.steering ?? []).map((text, index) => (
            <PendingSteeringBubble key={`pending-steer-${index}-${text.slice(0, 16)}`} text={text} />
          ))}
          {retryBanner && (
            <RetryBanner
              attempt={retryBanner.attempt}
              maxAttempts={retryBanner.maxAttempts}
              delayMs={retryBanner.delayMs}
              message={retryBanner.message}
            />
          )}
          {sending && (
            <Message
              message={{
                id: 'streaming-assistant',
                author: 'orchestrator',
                name: 'TaskWeaver',
                time: '生成中',
                timestamp: streamStartedAt ?? undefined,
                text: streamBlocks?.length ? '' : (streamText || ''),
                thinking: streamBlocks?.length ? undefined : streamThinking?.text,
                thinkingDurationMs: streamThinking?.durationMs,
                contentBlocks: streamBlocks?.length ? streamBlocks : undefined,
              }}
              dshToolRows={dshToolRows}
              toolTraceItems={toolTraces}
              workspacePath={workspacePath}
              isStreaming={true}
              streamActivity={streamActivity}
              onShowToolDetails={onShowToolDetails}
              onOpenWorkspacePath={onOpenWorkspacePath}
            />
          )}
        </div>
      </div>
      {showScrollBottomBtn && (
        <button
          type="button"
          className="scroll-to-bottom-pill"
          onClick={scrollToLatest}
          title="定位到最新答案 (快捷键: ⌥↓)"
          aria-label="回到底部最新答案"
        >
          <ArrowDown size={14} className={sending ? 'pulse-icon' : ''} />
          <span>{sending ? 'TaskWeaver 正在输出 · 定位到底部' : '定位到最新答案'}</span>
        </button>
      )}
        <Composer
          shortcuts={shortcuts}
          messages={messages}
          model={model}
          modelOptions={modelOptions}
          skills={skills}
          skillCatalogLoading={skillCatalogLoading}
          skillCatalogSize={skillCatalogSize}
          onLoadSkills={onLoadSkills}
          permissionMode={permissionMode}
          modelsLoading={modelsLoading}
          sending={sending}
          promptQueue={promptQueue}
          workspacePath={workspacePath}
          availableProjects={availableProjects}
          hasMessages={messages.length > 0}
          sessionStats={sessionStats}
          liveContext={liveContext}
          hostPlanModeActive={hostPlanModeActive}
          hostTodos={hostTodos}
          onPermissionModeChange={onPermissionModeChange}
          onModelChange={onModelChange}
          thinkingLevel={thinkingLevel}
          onThinkingLevelChange={onThinkingLevelChange}
          onSend={onSend}
          onCancel={onCancel}
          onSteer={onSteer}
          onFollowUp={onFollowUp}
          onSearchContext={onSearchContext}
          onCreateDroppedReference={onCreateDroppedReference}
          onSelectProject={onSelectProject}
          onPickWorkspace={onPickWorkspace}
          onDetachWorkspace={onDetachWorkspace}
          busyEnterMode={busyEnterMode}
          onBusyEnterModeChange={onBusyEnterModeChange}
          onQueueMutate={onQueueMutate}
          currentThreadId={currentThreadId}
          permissionPrompt={permissionPrompt}
          onRespondPermission={onRespondPermission}
          userQuestionPrompt={userQuestionPrompt}
          onAnswerUserQuestion={onAnswerUserQuestion}
        />
      {terminalOpen && onCloseTerminal && (
        <Suspense fallback={null}>
        <TerminalDrawer
          isOpen={terminalOpen}
          workspacePath={workspacePath}
          onClose={onCloseTerminal}
        />
        </Suspense>
      )}
    </main>
  )
}

function StatusChip({ status }: { status: TaskStatus }) {
  const meta = statusMeta[status]
  return <span className={`status-chip ${meta.className}`}><i />{meta.label}</span>
}

function TaskCard({ task, onClick }: { task: TaskNode; onClick: () => void }) {
  return (
    <button className={`task-card ${task.status}`} onClick={onClick} style={{ left: `${task.x}%`, top: `${task.y}%` }} aria-label={`打开 ${task.id} ${task.title} 的对话`}>
      <div className="task-card-head"><span className="task-id">{task.id}</span><strong>{task.title}</strong></div>
      <div className="task-card-status"><StatusChip status={task.status} /></div>
      <div className="task-card-meta"><Bot size={14} /><span>{task.role}</span><span className={`tier ${task.tier}`}>{task.tier === 'low' ? '轻量' : task.tier === 'high' ? '高能力' : task.tier === 'balanced' ? '均衡' : '程序执行'}</span></div>
      <p>{task.description}</p>
      <div className="task-card-foot">
        <span>{task.dependsOn?.length ? `依赖 ${task.dependsOn.join('、')}` : '无前置依赖'}</span>
        {task.toolProfile && <span className="task-tool-profile">{task.toolProfile}</span>}
        {task.worktreeIsolated && <span className="task-tool-profile">worktree</span>}
        <span>{task.model}</span>
      </div>
    </button>
  )
}

function PanelHeader({ title, subtitle, onClose, back }: { title: string; subtitle?: string; onClose: () => void; back?: () => void }) {
  return (
    <div className="panel-header">
      <div className="panel-heading">
        {back && <button className="panel-icon" onClick={back} aria-label="返回任务 DAG"><ArrowLeft size={19} /></button>}
        <div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
      </div>
      <button className="panel-icon" onClick={onClose} aria-label="关闭侧栏"><X size={20} /></button>
    </div>
  )
}

function DagPanel({ tasks, onTask, onClose }: { tasks: TaskNode[]; onTask: (task: TaskNode) => void; onClose: () => void }) {
  return (
    <aside className="side-panel dag-panel" aria-label="任务 DAG">
      <PanelHeader
        title="任务 DAG"
        subtitle={tasks.length > 0 ? `${tasks.length} 个子任务` : '多智能体编排启用后显示'}
        onClose={onClose}
      />
      {tasks.length === 0 ? (
        <div className="dag-empty-state">
          <Bot size={22} aria-hidden="true" />
          <strong>暂无编排任务</strong>
          <span>普通请求继续由单 Agent 处理；明确要求多 Agent 或复杂任务适合拆解时，这里会展示实际执行的任务图。</span>
        </div>
      ) : (
        <div className="dag-scroll">
          <SubagentSessionTree tasks={tasks} />
          <div className="dag-canvas">
            <svg className="dag-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              {tasks.flatMap((task) => (task.dependsOn ?? []).flatMap((dependencyId) => {
                const dependency = tasks.find((candidate) => candidate.id === dependencyId)
                if (!dependency) return []
                const startX = dependency.x + 14.5
                const startY = dependency.y + 23
                const endX = task.x + 14.5
                const endY = task.y
                return <path key={`${dependency.id}-${task.id}`} d={`M ${startX} ${startY} C ${startX} ${(startY + endY) / 2}, ${endX} ${(startY + endY) / 2}, ${endX} ${endY}`} />
              }))}
            </svg>
            {tasks.map((task) => <TaskCard key={task.id} task={task} onClick={() => onTask(task)} />)}
          </div>
        </div>
      )}
    </aside>
  )
}

function TaskConversation({ task, onBack, onClose, onSend }: { task: TaskNode; onBack: () => void; onClose: () => void; onSend: (message: string) => void }) {
  const [value, setValue] = useState('')
  const [activeTab, setActiveTab] = useState<'execution' | 'route'>('execution')
  const textareaRef = useAutosizeTextarea(value, 34, 96)
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const message = value.trim()
    if (!message) return
    onSend(message)
    setValue('')
  }

  return (
    <aside className="side-panel task-panel" aria-label={`${task.title} 子任务对话`}>
      <PanelHeader title={`${task.id} · ${task.title}`} subtitle={`${task.role} · ${task.model}`} onClose={onClose} back={onBack} />
      <div className="task-summary">
        <StatusChip status={task.status} />
        <div className="task-summary-row"><span>任务目标</span><p>{task.description}</p></div>
        {task.executionEvidenceSummary && (
          <div className="task-execution-evidence" role="note">
            <strong>Host 实际工具记录</strong>
            <p>{task.executionEvidenceSummary.label}</p>
            <small>只说明观测到的调用，不代表回答内容已被证明正确。</small>
          </div>
        )}
        <div className="task-summary-tags">{task.reasons.map((reason) => <span key={reason}>{reason}</span>)}</div>
        {task.worktreeIsolated && (task.status === 'done' || task.status === 'review') && (
          <div className="task-worktree-panel">
            <p className="model-editor-note" style={{ margin: '8px 0 4px', fontSize: 12 }}>
              本子任务在独立 worktree 中执行，改动未自动合并到主工作区。
            </p>
            <WorktreeMergeActions taskId={task.id} />
          </div>
        )}
      </div>
      <div className="task-tabs">
        <button className={activeTab === 'execution' ? 'active' : ''} onClick={() => setActiveTab('execution')}>执行对话</button>
        <button className={activeTab === 'route' ? 'active' : ''} onClick={() => setActiveTab('route')}>路由详情</button>
      </div>
      {activeTab === 'execution' ? <>
        <div className="task-thread">
          {task.messages.map((message) => <Message key={message.id} message={message} />)}
        </div>
        <form className="task-composer" onSubmit={submit}>
          <textarea ref={textareaRef} rows={1} value={value} onChange={(event) => setValue(event.target.value)} placeholder="给当前 Agent 补充指令…" aria-label="给当前 Agent 补充指令" />
          <div><span>仅发送给当前子任务</span><button aria-label="发送给当前 Agent" disabled={!value.trim()}><ArrowUp size={18} /></button></div>
        </form>
      </> : <div className="task-route-details">
        <div><span>任务类型</span><strong>{{ research: '调研', implementation: '实现', test: '测试', review: '审查' }[task.taskType ?? 'implementation']}</strong></div>
        <div><span>分配模型</span><strong>{task.model}</strong></div>
        <div><span>底层标识</span><code style={{ fontSize: 11, color: 'var(--text-hint)' }}>{task.modelKey || '—'}</code></div>
        <div><span>路由依据</span><strong>{task.routeReason || '按任务能力和模型可用性分配'}</strong></div>
        <div><span>前置任务</span><strong>{task.dependsOn?.length ? task.dependsOn.join('、') : '无'}</strong></div>
      </div>}
    </aside>
  )
}

export default function App() {
  const [panel, setPanel] = useState<PanelView>(null)
  const [navCollapsed, setNavCollapsed] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('models')
  const [mainView, setMainView] = useState<'chat' | 'plugins' | 'pull-requests' | 'schedules' | 'explore'>('chat')
  const [shortcuts, setShortcuts] = useState<ShortcutItem[]>(() => loadShortcuts())
  const modelCatalog = useModelCatalog()
  const appBackend = useAppBackend()
  const [skillCatalogOverride, setSkillCatalogOverride] = useState<SkillOption[] | null>(null)
  useEffect(() => {
    // Workspace-scoped cache is already applied by useAppBackend. Do not let an
    // old empty cache permanently mask the live catalog after DSH discovery settles.
    setSkillCatalogOverride(null)
  }, [appBackend.workspacePath])
  useEffect(() => {
    const handleCatalogLoaded = (event: Event) => {
      const catalog = (event as CustomEvent<SkillOption[]>).detail
      if (Array.isArray(catalog)) setSkillCatalogOverride(catalog)
    }
    window.addEventListener(SKILL_CATALOG_EVENT, handleCatalogLoaded)
    return () => window.removeEventListener(SKILL_CATALOG_EVENT, handleCatalogLoaded)
  }, [])
  const composerSkills = skillCatalogOverride ?? appBackend.skills
  const appSkillNames = useMemo(() => composerSkills.map((skill) => skill.name), [composerSkills])
  const { enabledNames: enabledSkillNames } = useEnabledSkills(appSkillNames)
  const enabledSkills = useMemo(
    () => composerSkills.filter((skill) => enabledSkillNames.has(skill.name)),
    [composerSkills, enabledSkillNames],
  )
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [model, setModel] = useState<ModelOption | null>(null)
  const [deleteTargetThread, setDeleteTargetThread] = useState<ThreadSummary | null>(null)
  const [detailsTool, setDetailsTool] = useState<ToolTraceItem | null>(null)
  const [terminalOpen, setTerminalOpen] = useState(false)
  const toggleTerminal = useCallback(() => setTerminalOpen((prev) => !prev), [])
  const closeTerminal = useCallback(() => setTerminalOpen(false), [])
  const priorTaskCount = useRef(0)
  const primaryModelMigrationNotified = useRef(false)
  const [dismissedInterruptId, setDismissedInterruptId] = useState<string | null>(null)

  useEffect(() => {
    if (
      !modelCatalog.catalog?.primaryModelReselectRequired
      || primaryModelMigrationNotified.current
    ) {
      return
    }
    primaryModelMigrationNotified.current = true
    window.alert(
      '主对话模型需要重新选择：旧版 Composer「智能路由」已移除。请在底部模型下拉中选定一个已添加的模型；多智能体子任务的模型仍在「设置 → 路由作品集」中分配。',
    )
  }, [modelCatalog.catalog?.primaryModelReselectRequired])

  useEffect(() => {
    const currentMode = getStoredThemeMode()
    const currentAccent = getStoredAccentColor()
    applyTheme(currentMode, currentAccent)

    if (window.matchMedia) {
      const media = window.matchMedia('(prefers-color-scheme: dark)')
      const listener = () => {
        if (getStoredThemeMode() === 'system') {
          applyTheme('system', getStoredAccentColor())
        }
      }
      media.addEventListener('change', listener)
      return () => media.removeEventListener('change', listener)
    }
  }, [])

  const openWorkspacePathForDetails = useCallback(async (relativePath: string) => {
    const bridge = window.taskweaver
    if (!bridge?.workspace?.openPath) {
      return { ok: false, error: '请在 Electron 桌面端打开文件' }
    }
    const res = await bridge.workspace.openPath(relativePath)
    if (!res.ok) return { ok: false, error: res.error }
    return { ok: res.data.ok, error: res.data.error }
  }, [])

  const openWorkspacePath = useCallback((relativePath: string) => {
    void openWorkspacePathForDetails(relativePath).then((out) => {
      if (!out.ok && out.error) window.alert(out.error)
    })
  }, [openWorkspacePathForDetails])

  const showToolDetails = useCallback((item: ToolTraceItem) => {
    setDetailsTool(item)
    setPanel('details')
  }, [])

  const handleUpdateShortcuts = (next: ShortcutItem[]) => {
    setShortcuts(next)
    saveShortcuts(next)
  }

  const tasks = appBackend.tasks
  const messages = appBackend.messages

  const interruptedTurn = useMemo(() => {
    if (appBackend.sending) return null

    // 找到最后一个非 steer/followUp 的 user 消息
    let lastUserRequest: ChatMessage | null = null
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      if (msg.author === 'user' && !msg.behavior) {
        lastUserRequest = msg
        break
      }
    }

    if (!lastUserRequest) return null
    if (lastUserRequest.id === dismissedInterruptId) return null

    // 检查该消息后是否有 assistant 回复
    const requestIndex = messages.findIndex(m => m.id === lastUserRequest.id)
    const hasResponse = messages.slice(requestIndex + 1).some(m =>
      (m.author === 'orchestrator' || m.author === 'agent') && !isDshContextMessage(m)
    )

    if (hasResponse) return null

    return { id: lastUserRequest.id, text: lastUserRequest.text }
  }, [messages, appBackend.sending, dismissedInterruptId])

  useEffect(() => {
    setDismissedInterruptId(null)
    setSelectedTaskId(null)
  }, [appBackend.currentThreadId])

  const selectedTask = useMemo(
    () => (selectedTaskId ? tasks.find((task) => task.id === selectedTaskId) ?? null : null),
    [tasks, selectedTaskId],
  )

  const composerModelOptions = modelCatalog.composerOptions

  useEffect(() => {
    if (priorTaskCount.current === 0 && tasks.length > 0) setPanel('dag')
    priorTaskCount.current = tasks.length
  }, [tasks.length])

  // 当会话切换、或会话绑定的模型/思考等级发生变化时，恢复该会话专属绑定的模型
  useEffect(() => {
    if (modelCatalog.composerOptions.length === 0) return
    const threadModelKey = appBackend.state?.modelKey
    const targetModelKey = threadModelKey || modelCatalog.catalog?.activeModelKey || null
    const matched = modelCatalog.resolveActiveOption(
      modelCatalog.availableModels,
      targetModelKey,
    ) ?? modelCatalog.composerOptions[0]

    setModel(matched)

    const threadThinkingLevel = appBackend.state?.thinkingLevel
    if (threadThinkingLevel && threadThinkingLevel !== modelCatalog.activeThinkingLevel) {
      void modelCatalog.setThinkingLevel(threadThinkingLevel)
    }
  }, [
    appBackend.currentThreadId,
    appBackend.state?.modelKey,
    appBackend.state?.thinkingLevel,
    modelCatalog.availableModels,
    modelCatalog.composerOptions,
    modelCatalog.resolveActiveOption,
  ])

  const handleModelChange = (next: ModelOption) => {
    setModel(next)
    void appBackend.setCurrentThreadModel(next.id)
    if (modelCatalog.bridgeReady) void modelCatalog.setActiveModel(next.id)
  }

  const handleThinkingLevelChange = (next: ThinkingLevel) => {
    if (appBackend.state?.modelKey) {
      void appBackend.setCurrentThreadModel(appBackend.state.modelKey, next)
    }
    if (modelCatalog.bridgeReady) void modelCatalog.setThinkingLevel(next)
  }

  const handlePermissionModeChange = (mode: PermissionMode) => {
    void appBackend.setPermissionMode(mode)
  }

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return
      if (document.querySelector('[role="dialog"], [aria-modal="true"]')) return
      if ((event.ctrlKey || (event.metaKey && event.altKey)) && (event.key === '`' || event.key === '~')) {
        event.preventDefault()
        setTerminalOpen((prev) => !prev)
        return
      }

      const shortcutKeys = (id: string, fallback: string[]) => shortcuts.find((item) => item.id === id)?.keys ?? fallback
      if (matchesKeys(event, shortcutKeys('new-chat', ['⌘', 'N']))) {
        event.preventDefault()
        void appBackend.clearConversation({ workspacePath: appBackend.workspacePath })
        setPanel(null)
        setMainView('chat')
        return
      }
      if (matchesKeys(event, shortcutKeys('toggle-dag', ['⌘', 'B']))) {
        event.preventDefault()
        setPanel((current) => current ? null : 'dag')
        return
      }
      if (!matchesKeys(event, shortcutKeys('cancel-esc', ['Esc']))) return

      // 让命令菜单、原生下拉和弹窗先处理 Escape；避免一次按键同时
      // 关闭弹窗并取消背后的 Agent 任务。
      const target = event.target instanceof HTMLElement ? event.target : null
      if (target?.closest('[role="listbox"], [role="menu"], select')) return
      if (settingsOpen) {
        event.preventDefault()
        setSettingsOpen(false)
        return
      }
      if (terminalOpen) {
        event.preventDefault()
        setTerminalOpen(false)
        return
      }
      if (panel) {
        event.preventDefault()
        setPanel(null)
        return
      }
      if (appBackend.sending) {
        event.preventDefault()
        void appBackend.cancelMessage()
      }
    }
    document.addEventListener('keydown', shortcut)
    return () => document.removeEventListener('keydown', shortcut)
  }, [shortcuts, appBackend.clearConversation, appBackend.workspacePath, appBackend.sending, appBackend.cancelMessage, settingsOpen, terminalOpen, panel])

  const availableProjects = useMemo(() => {
    const map = new Map<string, string>()
    if (appBackend.workspacePath) {
      map.set(appBackend.workspacePath, workspaceLabel(appBackend.workspacePath))
    }
    for (const thread of appBackend.threads) {
      if (thread.workspacePath) {
        map.set(thread.workspacePath, workspaceLabel(thread.workspacePath))
      }
    }
    return [...map.entries()].map(([path, name]) => ({ path, name })).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
  }, [appBackend.threads, appBackend.workspacePath])

  const handleSelectProject = (projectPath: string) => {
    if (appBackend.workspacePath === projectPath) return
    void appBackend.setWorkspace(projectPath).then(() => {
      setPanel(null)
    })
  }

  const handlePickWorkspace = () => {
    void appBackend.pickWorkspace().then((changed) => {
      if (changed) setPanel(null)
    })
  }

  const handleDetachWorkspace = () => {
    if (!appBackend.workspacePath) return
    void appBackend.setWorkspace(null).then(() => {
      setPanel(null)
    })
  }

  const handleForkThread = (messageId: string) => {
    void appBackend.forkThread(messageId).then((success) => {
      if (success) setPanel(null)
    })
  }

  const sendMainMessage = (text: string, skillName: string | null, workMode?: WorkMode) => {
    void appBackend.sendMessage(text, model?.id, skillName ?? undefined, undefined, workMode)
  }

  const sendTaskMessage = (text: string) => {
    if (selectedTask) void appBackend.sendTaskMessage(selectedTask.id, text)
  }

  const openTask = (task: TaskNode) => {
    setSelectedTaskId(task.id)
    setPanel('task')
  }

  if (settingsOpen) {
    return (
      <SettingsPage
        section={settingsSection}
        onSectionChange={setSettingsSection}
        onClose={() => setSettingsOpen(false)}
        modelCatalog={modelCatalog}
        shortcuts={shortcuts}
        onUpdateShortcuts={handleUpdateShortcuts}
        permissionMode={appBackend.state?.permissionMode}
        onPermissionModeChange={appBackend.setPermissionMode}
      />
    )
  }

  return (
    <div className={`app-shell ${navCollapsed ? 'nav-collapsed' : ''}`}>
      {appBackend.orchestrationChoice && (
        <div className="orchestration-choice-overlay" role="dialog" aria-modal="true" aria-labelledby="orchestration-choice-title">
          <div className="orchestration-choice-card">
            <h2 id="orchestration-choice-title">是否启用多 Agent？</h2>
            <p>{appBackend.orchestrationChoice.reason}</p>
            <div className="orchestration-choice-actions">
              <button type="button" className="ghost" onClick={() => { void appBackend.confirmOrchestration('single-agent') }}>
                单 Agent 继续
              </button>
              <button type="button" className="primary" onClick={() => { void appBackend.confirmOrchestration('multi-agent') }}>
                启用多 Agent 编排
              </button>
              <button type="button" className="ghost subtle" onClick={appBackend.dismissOrchestrationChoice} aria-label="取消">
                <X size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="window-drag-region" aria-hidden="true" />
      <AppSidebar
        collapsed={navCollapsed}
        onToggleCollapsed={() => setNavCollapsed((prev) => !prev)}
        workspacePath={appBackend.workspacePath}
        threads={appBackend.threads}
        currentThreadId={appBackend.currentThreadId}
        runningConversationIds={appBackend.runningConversationIds}
        completedConversationIds={appBackend.completedConversationIds}
        activeMainView={mainView}
        onSelectMainView={(v) => {
          setMainView(v)
          setPanel(null)
        }}
        onOpenSettings={() => setSettingsOpen(true)}
        onNewChat={() => {
          void appBackend.clearConversation({ workspacePath: appBackend.workspacePath })
          setPanel(null)
          setMainView('chat')
        }}
        onPickWorkspace={() => {
          void appBackend.pickWorkspace().then((changed) => { if (changed) setPanel(null) })
          setMainView('chat')
        }}
        onSwitchThread={(threadId) => {
          void appBackend.switchThread(threadId).then((changed) => { if (changed) setPanel(null) })
          setMainView('chat')
        }}
        onRenameThread={(threadId, title) => { void appBackend.renameThread(threadId, title) }}
        onTogglePinThread={(threadId) => { void appBackend.togglePinThread(threadId) }}
        onToggleArchiveThread={(threadId) => { void appBackend.toggleArchiveThread(threadId) }}
        onDeleteThread={(threadId) => {
          const thread = appBackend.threads.find((candidate) => candidate.id === threadId)
          if (thread) {
            setDeleteTargetThread(thread)
          }
        }}
        onSearchThreads={appBackend.searchThreads}
      />
      <div className={`workspace ${panel ? 'with-panel' : ''}`}>
        {mainView === 'plugins' ? (
          <Suspense fallback={<div className="codex-marketplace-page" role="status">正在加载插件…</div>}>
          <PluginsMarketplaceView
            onOpenSettings={() => {
              setSettingsSection('mcp')
              setSettingsOpen(true)
            }}
            onNewChat={() => {
              void appBackend.clearConversation({ workspacePath: appBackend.workspacePath })
              setPanel(null)
              setMainView('chat')
            }}
            skills={appBackend.skills}
          />
          </Suspense>
        ) : mainView === 'pull-requests' ? (
          <div className="codex-marketplace-page" style={{ padding: '40px 24px', alignItems: 'center', justifyContent: 'center' }}>
            <div className="codex-marketplace-hero">
              <GitPullRequest size={48} style={{ color: 'var(--text-secondary)', marginBottom: 16 }} />
              <h1>Pull Requests</h1>
              <p>关联 GitHub / GitLab 仓库以审查、合并与自动化 PR 工作流。</p>
              <button
                type="button"
                className="codex-btn-primary"
                style={{ marginTop: 20 }}
                onClick={() => setMainView('chat')}
              >
                返回对话
              </button>
            </div>
          </div>
        ) : mainView === 'schedules' ? (
          <div className="codex-marketplace-page" style={{ padding: '40px 24px', alignItems: 'center', justifyContent: 'center' }}>
            <div className="codex-marketplace-hero">
              <Clock size={48} style={{ color: 'var(--text-secondary)', marginBottom: 16 }} />
              <h1>定时任务</h1>
              <p>配置自动化后台执行脚本、每日代码巡检与定时报告。</p>
              <button
                type="button"
                className="codex-btn-primary"
                style={{ marginTop: 20 }}
                onClick={() => setMainView('chat')}
              >
                返回对话
              </button>
            </div>
          </div>
        ) : mainView === 'explore' ? (
          <div className="codex-marketplace-page" style={{ padding: '40px 24px', alignItems: 'center', justifyContent: 'center' }}>
            <div className="codex-marketplace-hero">
              <Compass size={48} style={{ color: 'var(--text-secondary)', marginBottom: 16 }} />
              <h1>探索</h1>
              <p>浏览推荐 Agent 工作流、社区技能模版与最佳实践。</p>
              <button
                type="button"
                className="codex-btn-primary"
                style={{ marginTop: 20 }}
                onClick={() => setMainView('chat')}
              >
                返回对话
              </button>
            </div>
          </div>
        ) : (
          <MainConversation
          shortcuts={shortcuts}
          currentThreadId={appBackend.currentThreadId}
          messages={messages}
          model={model}
          modelOptions={composerModelOptions}
          skills={enabledSkills}
          skillCatalogLoading={appBackend.skillsLoading && composerSkills.length === 0}
          skillCatalogSize={composerSkills.length}
          onLoadSkills={appBackend.refreshSkills}
          permissionMode={appBackend.state?.permissionMode ?? 'ask'}
          modelsLoading={modelCatalog.loading}
          sending={appBackend.sending}
          streamText={appBackend.streamText}
          streamStartedAt={appBackend.streamStartedAt}
          streamActivity={appBackend.streamActivity}
          streamThinking={appBackend.streamThinking}
          streamBlocks={appBackend.streamBlocks}
          retryBanner={appBackend.retryBanner}
          toolTraces={appBackend.toolTraces}
          dshToolRows={appBackend.dshToolRows}
          promptQueue={appBackend.promptQueue}
          busyEnterMode={appBackend.busyEnterMode}
          onQueueMutate={(payload) => { void appBackend.mutateQueue(payload) }}
          onBusyEnterModeChange={(mode) => { void appBackend.setBusyEnterMode(mode) }}
          permissionPrompt={appBackend.permissionPrompt}
          onRespondPermission={(action, sandboxMode) => { void appBackend.respondPermissionPrompt(action, sandboxMode) }}
          userQuestionPrompt={appBackend.userQuestionPrompt}
          onAnswerUserQuestion={appBackend.answerUserQuestion}
          liveContext={appBackend.liveContext}
          sessionStats={appBackend.sessionStats}
          hostPlanModeActive={appBackend.hostPlanModeActive}
          hostTodos={appBackend.hostTodos}
          backendError={appBackend.error}
          threadTitle={appBackend.threadTitle}
          taskCount={tasks.length}
          panelOpen={panel !== null}
          workspacePath={appBackend.workspacePath}
          availableProjects={availableProjects}
          onSelectProject={handleSelectProject}
          onPickWorkspace={handlePickWorkspace}
          onDetachWorkspace={handleDetachWorkspace}
          onModelChange={handleModelChange}
          thinkingLevel={modelCatalog.activeThinkingLevel}
          onThinkingLevelChange={handleThinkingLevelChange}
          onPermissionModeChange={handlePermissionModeChange}
          onSend={sendMainMessage}
          onCancel={() => { void appBackend.cancelMessage() }}
          onSteer={(text) => { void appBackend.steerMessage(text) }}
          onFollowUp={(text) => { void appBackend.followUpMessage(text) }}
          onSearchContext={appBackend.searchWorkspaceContext}
          onCreateDroppedReference={appBackend.createDroppedReference}
          onTogglePanel={() => setPanel((current) => current ? null : 'dag')}
          activePanel={panel}
          onSelectPanel={setPanel}
          onToggleNav={() => setNavCollapsed((current) => !current)}
          onFork={handleForkThread}
          onShowToolDetails={showToolDetails}
          onOpenWorkspacePath={openWorkspacePath}
          terminalOpen={terminalOpen}
          onToggleTerminal={toggleTerminal}
          onCloseTerminal={closeTerminal}
          interruptedTurn={interruptedTurn}
          onDismissInterrupted={() => {
            if (interruptedTurn) setDismissedInterruptId(interruptedTurn.id)
          }}
        />
        )}
        {panel === 'dag' && <DagPanel tasks={tasks} onTask={openTask} onClose={() => setPanel(null)} />}
        {panel === 'task' && selectedTask && (
          <TaskConversation task={selectedTask} onBack={() => setPanel('dag')} onClose={() => setPanel(null)} onSend={sendTaskMessage} />
        )}
        {panel === 'logs' && (
          <Suspense fallback={null}>
          <OutputLogPanel
            logs={appBackend.toolTraces}
            onClose={() => setPanel(null)}
            onShowToolDetails={showToolDetails}
            onOpenWorkspacePath={openWorkspacePath}
          />
          </Suspense>
        )}
        {panel === 'details' && detailsTool && (
          <DetailsPanel
            item={detailsTool}
            workspacePath={appBackend.workspacePath}
            onClose={() => {
              setPanel(null)
              setDetailsTool(null)
            }}
            onOpenPath={openWorkspacePathForDetails}
            renderDiff={(fileDiff) => <DiffReviewCard fileDiff={fileDiff} defaultExpanded />}
          />
        )}
        {panel === 'git' && (
          <Suspense fallback={null}>
          <GitCheckpointPanel workspacePath={appBackend.workspacePath} onClose={() => setPanel(null)} />
          </Suspense>
        )}
      </div>

      {deleteTargetThread && (
        <ConfirmModal
          title="删除对话"
          description={`确定要删除“${deleteTargetThread.title}”吗？\n\n【删除范围】此操作仅永久清除应用内的该会话聊天历史，绝不会删除或修改您的本地代码和磁盘文件。`}
          confirmLabel="永久删除记录"
          confirmDanger
          onConfirm={() => {
            const id = deleteTargetThread.id
            setDeleteTargetThread(null)
            void appBackend.deleteThread(id).then((changed) => { if (changed) setPanel(null) })
          }}
          onCancel={() => setDeleteTargetThread(null)}
        />
      )}
    </div>
  )
}
