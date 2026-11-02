import {
  Bot,
  Files,
  Folder,
  GitBranch,
  ListOrdered,
  MessageSquare,
  PanelBottom,
  PanelLeft,
  PanelRight,
  X,
} from 'lucide-react'
import { useState } from 'react'
import type { RoleProfile } from '../../shared/app-api'
import type { ModelOption } from '../../types'
import type { WorkbenchTabId } from '../workbench/useWorkbenchSessionState'
import {
  CONTROL_MODIFIER_KEY,
  PRIMARY_MODIFIER_KEY,
} from '../../shared/shortcuts'
import { RolePortrait } from '../roles/RolePortrait'

export interface UserTurnItem {
  id: string
  turnNumber: number
  preview: string
  time: string
}

export interface ConversationHeaderProps {
  roleMode?: boolean
  threadTitle: string
  workspacePath: string | null
  activeRoleProfiles: RoleProfile[]
  roleProfiles: RoleProfile[]
  modelOptions: ModelOption[]
  rolePresence: 'working' | 'blocked' | 'done' | 'idle'
  userTurns: UserTurnItem[]
  workbenchOpen: boolean
  workbenchTab: WorkbenchTabId
  taskCount?: number
  terminalOpen?: boolean
  onToggleNav?: () => void
  onOpenWorkbenchTab?: (tab: WorkbenchTabId) => void
  onToggleTerminal?: () => void
  onScrollToTurn: (turnId: string) => void
}

export function ConversationHeader({
  roleMode = false,
  threadTitle,
  workspacePath,
  activeRoleProfiles,
  roleProfiles,
  modelOptions,
  rolePresence,
  userTurns,
  workbenchOpen,
  workbenchTab,
  taskCount = 0,
  terminalOpen = false,
  onToggleNav,
  onOpenWorkbenchTab,
  onToggleTerminal,
  onScrollToTurn,
}: ConversationHeaderProps) {
  const [turnMenuOpen, setTurnMenuOpen] = useState(false)

  const roleModelName = (profile: RoleProfile) =>
    modelOptions.find((m) => m.id === profile.modelKey)?.displayName ??
    modelOptions.find((m) => m.id === profile.modelKey)?.name ??
    profile.modelKey

  const handleSelectTurn = (turnId: string) => {
    setTurnMenuOpen(false)
    onScrollToTurn(turnId)
  }

  return (
    <header className="conversation-header">
      <div className="conversation-title">
        <button
          className="header-icon nav-toggle"
          onClick={onToggleNav}
          title="显示/隐藏导航栏"
          aria-label="显示或隐藏导航栏"
        >
          <PanelLeft size={19} />
        </button>
        {roleMode ? (
          <div className="role-header-identity">
            <span
              className={`role-header-avatar-stack${activeRoleProfiles.length > 1 ? ' is-group' : ''}`}
            >
              {activeRoleProfiles.length > 0 ? (
                activeRoleProfiles
                  .slice(0, 3)
                  .map((profile) => (
                    <RolePortrait
                      key={profile.id}
                      name={profile.name}
                      variant={roleProfiles.indexOf(profile)}
                      size="small"
                    />
                  ))
              ) : (
                <span className="role-header-empty-avatar">
                  <Bot size={17} />
                </span>
              )}
              {activeRoleProfiles.length > 3 && (
                <span className="role-header-avatar-overflow">
                  +{activeRoleProfiles.length - 3}
                </span>
              )}
            </span>
            <span className="role-header-copy">
              <strong>
                {activeRoleProfiles.length === 1
                  ? activeRoleProfiles[0].name
                  : activeRoleProfiles.length > 1
                    ? '协作小组'
                    : 'Bot 工作区'}
              </strong>
              <small>
                {activeRoleProfiles.length === 1
                  ? `${activeRoleProfiles[0].description || '专属工作伙伴'} · ${roleModelName(activeRoleProfiles[0])}`
                  : activeRoleProfiles.length > 1
                    ? `${activeRoleProfiles.length} 位 Bot · 按顺序参与本轮工作`
                    : '从左侧名册选择 Bot，或创建一个专属工作伙伴'}
              </small>
            </span>
            <span className={`role-header-presence is-${rolePresence}`}>
              <i />
              {rolePresence === 'working'
                ? '工作中'
                : rolePresence === 'blocked'
                  ? '需要关注'
                  : rolePresence === 'done'
                    ? '已完成'
                    : '待命'}
            </span>
          </div>
        ) : (
          <>
            {workspacePath ? <Folder size={19} /> : <MessageSquare size={19} />}
            <strong>{threadTitle}</strong>
          </>
        )}
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
                  <button
                    type="button"
                    onClick={() => setTurnMenuOpen(false)}
                    aria-label="关闭大纲"
                  >
                    <X size={13} />
                  </button>
                </div>
                <div className="turn-menu-list">
                  {userTurns.map((turn) => (
                    <button
                      key={turn.id}
                      type="button"
                      className="turn-menu-item"
                      onClick={() => handleSelectTurn(turn.id)}
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

        {workspacePath && (
          <>
            <button
              type="button"
              className={`header-icon sidebar-toggle ${workbenchOpen && workbenchTab === 'files' ? 'active' : ''}`}
              onClick={() => onOpenWorkbenchTab?.('files')}
              aria-label="显示或隐藏项目文件工作台"
              aria-pressed={workbenchOpen && workbenchTab === 'files'}
              title="项目文件"
            >
              <Files size={17} />
            </button>
            <button
              type="button"
              className={`header-icon sidebar-toggle ${workbenchOpen && workbenchTab === 'git' ? 'active' : ''}`}
              onClick={() => onOpenWorkbenchTab?.('git')}
              aria-label="显示或隐藏 Git 工作台"
              aria-pressed={workbenchOpen && workbenchTab === 'git'}
              title="Git 快照与版本"
            >
              <GitBranch size={17} />
            </button>
          </>
        )}
        <button
          className={`header-icon sidebar-toggle ${terminalOpen ? 'active' : ''}`}
          onClick={onToggleTerminal}
          aria-label={terminalOpen ? '隐藏终端抽屉' : '显示终端抽屉'}
          aria-pressed={terminalOpen}
          title={'显示或隐藏交互式终端 · ' + CONTROL_MODIFIER_KEY + '`'}
        >
          <PanelBottom size={18} />
        </button>
        <button
          type="button"
          className={`header-icon sidebar-toggle ${workbenchOpen && workbenchTab === 'tasks' ? 'active' : ''}`}
          onClick={() => onOpenWorkbenchTab?.('tasks')}
          aria-label={
            workbenchOpen && workbenchTab === 'tasks' ? '隐藏任务工作台' : '显示任务工作台'
          }
          aria-pressed={workbenchOpen && workbenchTab === 'tasks'}
          title={`显示或隐藏任务工作台 · ${PRIMARY_MODIFIER_KEY}B`}
        >
          <PanelRight size={19} />
          {taskCount > 0 && <span>{taskCount}</span>}
        </button>
      </div>
    </header>
  )
}
