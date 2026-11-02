import {
  ArrowLeft,
  ArrowRight,
  Crown,
  Folder,
  ListOrdered,
  MoreHorizontal,
  PanelBottom,
  PanelLeft,
  Pencil,
  Plus,
  RotateCcw,
  Settings,
  SlidersHorizontal,
  Sparkles,
  SquarePlus,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { RolePortrait } from '../roles/RolePortrait'
import type { RoleProfile } from '../../shared/app-api'
import { workspaceLabel } from '../../shared/ui-utils'

export interface AppTopBarProps {
  navCollapsed: boolean
  onToggleNav: () => void
  canNavigateBack?: boolean
  canNavigateForward?: boolean
  onNavigateBack?: () => void
  onNavigateForward?: () => void
  workspacePath: string | null
  threadTitle: string
  roleMode?: boolean
  // Bot 协作成员席位与拖放
  roleProfiles?: RoleProfile[]
  selectedRoleIds?: string[]
  onSelectedRoleIdsChange?: (ids: string[]) => void
  roleProgress?: Array<{ roleId: string; roleName?: string; status: 'started' | 'completed' | 'failed' | 'cancelled' }>
  onManageRoles?: () => void
  // 大纲导航
  userTurns?: Array<{ id: string; turnNumber: number; preview: string; time: string }>
  onScrollToTurn?: (id: string) => void
  // 工作台与终端
  terminalOpen: boolean
  onToggleTerminal: () => void
  workbenchOpen: boolean
  workbenchTab: string | null
  onOpenWorkbenchTab: (tab: 'tasks' | 'git' | 'files') => void
  taskCount?: number
  // 更多动作
  onNewChat: () => void
  onOpenSettings: () => void
  onRenameThread?: () => void
  onClearThread?: () => void
}

function cleanTitle(raw: string): string {
  if (!raw) return '新会话'
  return raw
    .replace(/(\*\*Session title:\*\*|\*\*会话标题:\*\*|Session title:|会话标题:)\s*/gi, '')
    .replace(/>\s*\[![\w-]+\]\s*>?/gi, ' · ')
    .replace(/\[![\w-]+\]/gi, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/[*_~`#[\]>]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || '新会话'
}

export function AppTopBar({
  navCollapsed,
  onToggleNav,
  canNavigateBack = false,
  canNavigateForward = false,
  onNavigateBack,
  onNavigateForward,
  workspacePath,
  threadTitle,
  roleMode = false,
  roleProfiles = [],
  selectedRoleIds = [],
  onSelectedRoleIdsChange,
  roleProgress = [],
  onManageRoles,
  userTurns = [],
  onScrollToTurn,
  terminalOpen: _terminalOpen,
  onToggleTerminal,
  workbenchOpen,
  workbenchTab: _workbenchTab,
  onOpenWorkbenchTab,
  taskCount = 0,
  onNewChat,
  onOpenSettings,
  onRenameThread,
  onClearThread,
}: AppTopBarProps) {
  const [turnMenuOpen, setTurnMenuOpen] = useState(false)
  const [moreMenuOpen, setMoreMenuOpen] = useState(false)
  const [isDragOverDock, setIsDragOverDock] = useState(false)
  const moreMenuRef = useRef<HTMLDivElement>(null)
  const turnMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target as Node)) {
        setMoreMenuOpen(false)
      }
      if (turnMenuRef.current && !turnMenuRef.current.contains(event.target as Node)) {
        setTurnMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const displayTitle = cleanTitle(threadTitle)
  const wsLabel = workspacePath ? workspaceLabel(workspacePath) : null
  const selectedProfiles = selectedRoleIds
    .map((id) => roleProfiles.find((profile) => profile.id === id))
    .filter((profile): profile is RoleProfile => Boolean(profile))

  return (
    <header className="codex-topbar" aria-label="应用顶部导航栏">
      {/* 左侧：原生窗口控制避让、历史导航与侧边栏开关 */}
      <div className="topbar-left">
        <div className="topbar-traffic-space" aria-hidden="true" />
        <button
          type="button"
          className="topbar-btn topbar-history-btn"
          onClick={onNavigateBack}
          disabled={!canNavigateBack}
          title="后退"
          aria-label="后退"
        >
          <ArrowLeft size={16} />
        </button>
        <button
          type="button"
          className="topbar-btn topbar-history-btn"
          onClick={onNavigateForward}
          disabled={!canNavigateForward}
          title="前进"
          aria-label="前进"
        >
          <ArrowRight size={16} />
        </button>
        <button
          type="button"
          className={`topbar-btn topbar-sidebar-toggle${navCollapsed ? ' is-collapsed' : ''}`}
          onClick={onToggleNav}
          title={navCollapsed ? '展开侧边栏' : '收起侧边栏'}
          aria-label={navCollapsed ? '展开侧边栏' : '收起侧边栏'}
        >
          <PanelLeft size={15} />
        </button>
        <span className="topbar-divider" aria-hidden="true" />
      </div>

      {/* 2. 中间：工作区/会话标题与 Bot 登场协作席位 (支持划入拖拽，呼吸闪烁) */}
      <div className="topbar-center">
        <div className="topbar-title-wrap" title={`${wsLabel ? `${wsLabel} · ` : ''}${displayTitle}`}>
          <span className="topbar-workspace-context">
            <span className="topbar-folder-icon" aria-hidden="true">
              {roleMode ? <Sparkles size={14} className="text-amber" /> : <Folder size={14} />}
            </span>
            {wsLabel && <span className="topbar-ws-label">{wsLabel}</span>}
            {wsLabel && <span className="topbar-title-sep">/</span>}
          </span>
          <strong className="topbar-thread-title">{displayTitle}</strong>
        </div>

        {/* 顶部栏常驻 Bot 协作席位 (从左侧划入添加，工作中一闪一闪) */}
        {roleMode && (
          <div
            className={`topbar-bot-dock ${isDragOverDock ? 'is-drag-over' : ''}`}
            onDragOver={(e) => {
              e.preventDefault()
              e.dataTransfer.dropEffect = 'copy'
              setIsDragOverDock(true)
            }}
            onDragLeave={() => setIsDragOverDock(false)}
            onDrop={(e) => {
              e.preventDefault()
              setIsDragOverDock(false)
              const botId = e.dataTransfer.getData('text/taskweaver-bot-id')
              if (botId && onSelectedRoleIdsChange && !selectedRoleIds.includes(botId)) {
                onSelectedRoleIdsChange([...selectedRoleIds, botId])
              }
            }}
            title="Bot 协作席位：从左侧将 Bot 划/拖至此处加入会话"
          >
            {selectedProfiles.map((profile, memberIndex) => {
              const profileIndex = roleProfiles.findIndex((item) => item.id === profile.id)
              const toneIndex = (profileIndex >= 0 ? profileIndex : memberIndex) % 6
              const isLead = memberIndex === 0
              const progress = roleProgress.find((item) => item.roleId === profile.id)
              const isWorking = progress?.status === 'started'
              const statusLabel = isWorking
                ? '正在执行'
                : progress?.status === 'completed'
                  ? '本轮已完成'
                  : progress?.status === 'failed'
                    ? '执行失败'
                    : progress?.status === 'cancelled'
                      ? '已停止'
                      : '待命'
              const roleSummary = (profile.description ?? '').trim()

              return (
                <div
                  key={profile.id}
                  className={`topbar-bot-pill role-avatar-tone-${toneIndex} ${isWorking ? 'is-active-pulsing' : ''}`}
                  title={`${profile.name}${roleSummary ? ` · ${roleSummary}` : ''} · ${isLead ? '主 Bot，默认接话' : '协作成员'} · ${statusLabel}`}
                  role="group"
                  aria-label={`${profile.name}${roleSummary ? `，${roleSummary}` : ''}${isLead ? '，主 Bot，默认接话' : '，协作成员'}，${statusLabel}`}
                >
                  <span className="topbar-bot-portrait-wrap">
                    <RolePortrait name={profile.name} variant={toneIndex} size="small" status={isWorking ? 'working' : 'idle'} />
                    {isWorking && <span className="topbar-bot-glow-halo" aria-hidden="true" />}
                  </span>
                  <span className="topbar-bot-name">{profile.name}</span>
                  {isLead ? (
                    <span className="topbar-bot-lead-label">主</span>
                  ) : (
                    <button
                      type="button"
                      className="topbar-bot-lead-btn"
                      onClick={(event) => {
                        event.stopPropagation()
                        onSelectedRoleIdsChange?.([profile.id, ...selectedRoleIds.filter((id) => id !== profile.id)])
                      }}
                      title={`设 ${profile.name} 为主 Bot`}
                      aria-label={`设 ${profile.name} 为主 Bot`}
                    >
                      <Crown size={10} />
                    </button>
                  )}
                  {isWorking ? (
                    <span className="topbar-bot-pulse-dot" aria-hidden="true" />
                  ) : (
                    <button
                      type="button"
                      className="topbar-bot-remove-btn"
                      onClick={(e) => {
                        e.stopPropagation()
                        onSelectedRoleIdsChange?.(selectedRoleIds.filter((id) => id !== profile.id))
                      }}
                      title={`移出 ${profile.name}`}
                      aria-label={`移出 ${profile.name}`}
                    >
                      <X size={11} />
                    </button>
                  )}
                </div>
              )
            })}

            <button
              type="button"
              className="topbar-bot-add-btn"
              onClick={onManageRoles}
              title="从左侧名册划入 Bot，或点击管理登场 Bot"
            >
              <Plus size={12} />
              <span>{selectedRoleIds.length === 0 ? '划入或添加 Bot' : '添加'}</span>
            </button>
          </div>
        )}
      </div>

      {/* 3. 右侧：完全对齐图 1 Codex 极简三按钮布局 (···更多、面板开关、[+]新建对话) */}
      <div className="topbar-right">
        {/* 1. 更多操作菜单 (···) */}
        <div className="topbar-dropdown-wrap" ref={moreMenuRef}>
          <button
            type="button"
            className={`topbar-btn ${moreMenuOpen ? 'active' : ''}`}
            onClick={() => setMoreMenuOpen((prev) => !prev)}
            title="更多操作与工具"
            aria-label="更多操作"
            aria-expanded={moreMenuOpen}
          >
            <MoreHorizontal size={15} />
          </button>
          {moreMenuOpen && (
            <div className="topbar-dropdown-menu more-dropdown">
              <button
                type="button"
                className="topbar-dropdown-item"
                onClick={() => {
                  onNewChat()
                  setMoreMenuOpen(false)
                }}
              >
                <SquarePlus size={14} />
                <span>新建会话</span>
                <kbd>⌘N</kbd>
              </button>
              {userTurns.length >= 2 && (
                <button
                  type="button"
                  className="topbar-dropdown-item"
                  onClick={() => {
                    setTurnMenuOpen(true)
                    setMoreMenuOpen(false)
                  }}
                >
                  <ListOrdered size={14} />
                  <span>问答大纲 ({userTurns.length} 轮)</span>
                </button>
              )}
              {workspacePath && (
                <>
                  <div className="topbar-dropdown-separator" />
                  <button
                    type="button"
                    className="topbar-dropdown-item"
                    onClick={() => {
                      onOpenWorkbenchTab('files')
                      setMoreMenuOpen(false)
                    }}
                  >
                    <span>项目文件工作台</span>
                  </button>
                  <button
                    type="button"
                    className="topbar-dropdown-item"
                    onClick={() => {
                      onOpenWorkbenchTab('git')
                      setMoreMenuOpen(false)
                    }}
                  >
                    <span>Git 快照与版本</span>
                  </button>
                  <button
                    type="button"
                    className="topbar-dropdown-item"
                    onClick={() => {
                      onToggleTerminal()
                      setMoreMenuOpen(false)
                    }}
                  >
                    <PanelBottom size={14} />
                    <span>交互式终端 (⌥~)</span>
                  </button>
                </>
              )}
              <div className="topbar-dropdown-separator" />
              {onRenameThread && (
                <button
                  type="button"
                  className="topbar-dropdown-item"
                  onClick={() => {
                    onRenameThread()
                    setMoreMenuOpen(false)
                  }}
                >
                  <Pencil size={14} />
                  <span>重命名会话</span>
                </button>
              )}
              {onClearThread && (
                <button
                  type="button"
                  className="topbar-dropdown-item"
                  onClick={() => {
                    onClearThread()
                    setMoreMenuOpen(false)
                  }}
                >
                  <RotateCcw size={14} />
                  <span>清空当前上下文</span>
                </button>
              )}
              <div className="topbar-dropdown-separator" />
              <button
                type="button"
                className="topbar-dropdown-item"
                onClick={() => {
                  onOpenSettings()
                  setMoreMenuOpen(false)
                }}
              >
                <Settings size={14} />
                <span>偏好设置</span>
                <kbd>⌘,</kbd>
              </button>
            </div>
          )}

          {turnMenuOpen && (
            <div className="topbar-dropdown-menu turn-dropdown" ref={turnMenuRef}>
              <div className="topbar-dropdown-head">
                <span>问答轮次导航</span>
                <button type="button" onClick={() => setTurnMenuOpen(false)} aria-label="关闭">
                  <X size={12} />
                </button>
              </div>
              <div className="topbar-dropdown-list">
                {userTurns.map((turn) => (
                  <button
                    key={turn.id}
                    type="button"
                    className="topbar-dropdown-item turn-item"
                    onClick={() => {
                      onScrollToTurn?.(turn.id)
                      setTurnMenuOpen(false)
                    }}
                  >
                    <span className="turn-number">#{turn.turnNumber}</span>
                    <span className="turn-preview">{turn.preview}</span>
                    <time>{turn.time}</time>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 2. 工作台与任务面板开关 */}
        <button
          type="button"
          className={`topbar-btn ${workbenchOpen ? 'active' : ''}`}
          onClick={() => onOpenWorkbenchTab('tasks')}
          title="切换侧边工作台 (⌘B)"
          aria-label="切换侧边工作台"
        >
          <SlidersHorizontal size={14} />
          {taskCount > 0 && <span className="topbar-badge">{taskCount}</span>}
        </button>

        <span className="topbar-right-divider" aria-hidden="true" />

        {/* 3. 新建对话按钮 */}
        <button
          type="button"
          className="topbar-btn topbar-new-chat-btn"
          onClick={onNewChat}
          title="新建工作会话 (⌘N)"
          aria-label="新建会话"
        >
          <SquarePlus size={15} />
        </button>
      </div>
    </header>
  )
}
