/**
 * 命令面板 (Cmd+K / Ctrl+K)
 * 快速访问所有功能：会话、设置、插件、命令
 */

import { useEffect, useState, useMemo, useCallback } from 'react'
import {
  Search,
  SquarePen,
  Settings,
  Folder,
  GitPullRequest,
  Clock,
  Puzzle,
  Compass,
  X,
  Command,
  CornerDownLeft,
} from 'lucide-react'
import type { ThreadSummary } from '../../shared/app-api'
import './command-palette.css'

export interface Command {
  id: string
  label: string
  description?: string
  icon?: React.ReactNode
  keywords?: string[]
  action: () => void
  category: 'navigation' | 'thread' | 'settings' | 'action'
}

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
  threads: ThreadSummary[]
  onSwitchThread: (threadId: string) => void
  onNewChat: () => void
  onOpenSettings: () => void
  onPickWorkspace: () => void
  onDeleteThread?: (threadId: string) => void
  onTogglePinThread?: (threadId: string) => void
  onToggleArchiveThread?: (threadId: string) => void
  onSelectMainView?: (view: 'chat' | 'plugins' | 'pull-requests' | 'schedules' | 'explore') => void
}

export function CommandPalette({
  open,
  onClose,
  threads,
  onSwitchThread,
  onNewChat,
  onOpenSettings,
  onPickWorkspace,
  onSelectMainView,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)

  // 构建所有可用命令
  const allCommands = useMemo<Command[]>(() => {
    const commands: Command[] = [
      // 导航命令
      {
        id: 'new-chat',
        label: '新对话',
        description: '创建新的对话会话',
        icon: <SquarePen size={16} />,
        keywords: ['new', 'chat', 'conversation', '新建', '对话', '会话'],
        action: () => {
          onNewChat()
          onClose()
        },
        category: 'navigation',
      },
      {
        id: 'pick-workspace',
        label: '打开项目',
        description: '选择本地工作区',
        icon: <Folder size={16} />,
        keywords: ['open', 'workspace', 'project', '打开', '项目', '工作区'],
        action: () => {
          onPickWorkspace()
          onClose()
        },
        category: 'navigation',
      },
      {
        id: 'pull-requests',
        label: 'Pull Request',
        description: '查看和管理 PR',
        icon: <GitPullRequest size={16} />,
        keywords: ['pr', 'pull', 'request', 'github'],
        action: () => {
          onSelectMainView?.('pull-requests')
          onClose()
        },
        category: 'navigation',
      },
      {
        id: 'schedules',
        label: '定时任务',
        description: '管理定时任务',
        icon: <Clock size={16} />,
        keywords: ['schedule', 'cron', 'timer', '定时', '任务'],
        action: () => {
          onSelectMainView?.('schedules')
          onClose()
        },
        category: 'navigation',
      },
      {
        id: 'plugins',
        label: '插件市场',
        description: '浏览和安装插件',
        icon: <Puzzle size={16} />,
        keywords: ['plugin', 'extension', 'marketplace', '插件', '扩展'],
        action: () => {
          onSelectMainView?.('plugins')
          onClose()
        },
        category: 'navigation',
      },
      {
        id: 'explore',
        label: '探索',
        description: '发现新功能',
        icon: <Compass size={16} />,
        keywords: ['explore', 'discover', '探索', '发现'],
        action: () => {
          onSelectMainView?.('explore')
          onClose()
        },
        category: 'navigation',
      },

      // 设置命令
      {
        id: 'settings',
        label: '设置',
        description: '打开应用设置',
        icon: <Settings size={16} />,
        keywords: ['settings', 'preferences', 'config', '设置', '配置', '偏好'],
        action: () => {
          onOpenSettings()
          onClose()
        },
        category: 'settings',
      },
    ]

    // 添加会话命令（最近 20 个）
    const recentThreads = threads
      .filter(t => !t.archived)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 20)

    for (const thread of recentThreads) {
      commands.push({
        id: `thread-${thread.id}`,
        label: thread.title,
        description: thread.workspacePath ? `项目: ${thread.workspacePath.split('/').pop()}` : '独立对话',
        keywords: [thread.title, thread.workspacePath ?? ''].filter(Boolean),
        action: () => {
          onSwitchThread(thread.id)
          onClose()
        },
        category: 'thread',
      })
    }

    return commands
  }, [threads, onNewChat, onOpenSettings, onPickWorkspace, onSwitchThread, onSelectMainView, onClose])

  // 简单的模糊搜索（可以后续替换为 BM25）
  const filteredCommands = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return allCommands.slice(0, 10) // 默认显示前 10 个

    return allCommands.filter(cmd => {
      const searchText = [
        cmd.label,
        cmd.description,
        ...(cmd.keywords ?? []),
      ].join(' ').toLowerCase()

      return searchText.includes(q)
    }).slice(0, 10)
  }, [query, allCommands])

  // 键盘导航
  useEffect(() => {
    if (!open) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex(prev => Math.min(prev + 1, filteredCommands.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex(prev => Math.max(prev - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const selected = filteredCommands[selectedIndex]
        if (selected) selected.action()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, filteredCommands, selectedIndex, onClose])

  // 重置选中索引
  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  // 清空查询并重置
  const handleClose = useCallback(() => {
    setQuery('')
    setSelectedIndex(0)
    onClose()
  }, [onClose])

  if (!open) return null

  return (
    <div className="command-palette-overlay" onClick={handleClose}>
      <div className="command-palette" onClick={e => e.stopPropagation()}>
        <div className="command-palette-header">
          <Search size={16} className="command-palette-search-icon" />
          <input
            type="text"
            className="command-palette-input"
            placeholder="输入命令或搜索..."
            value={query}
            autoFocus
            onChange={e => setQuery(e.target.value)}
          />
          <button
            type="button"
            className="command-palette-close"
            onClick={handleClose}
            title="关闭 (Esc)"
          >
            <X size={14} />
          </button>
        </div>

        <div className="command-palette-results">
          {filteredCommands.length === 0 ? (
            <div className="command-palette-empty">
              没有找到匹配的命令
            </div>
          ) : (
            filteredCommands.map((cmd, index) => (
              <button
                key={cmd.id}
                type="button"
                className={`command-palette-item ${index === selectedIndex ? 'selected' : ''}`}
                onClick={() => cmd.action()}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                {cmd.icon && (
                  <span className="command-palette-item-icon">
                    {cmd.icon}
                  </span>
                )}
                <span className="command-palette-item-content">
                  <span className="command-palette-item-label">{cmd.label}</span>
                  {cmd.description && (
                    <span className="command-palette-item-description">{cmd.description}</span>
                  )}
                </span>
                {index === selectedIndex && (
                  <span className="command-palette-item-hint">
                    <CornerDownLeft size={12} />
                  </span>
                )}
              </button>
            ))
          )}
        </div>

        <div className="command-palette-footer">
          <div className="command-palette-tips">
            <kbd><Command size={10} />K</kbd>
            <span>打开</span>
            <kbd>↑↓</kbd>
            <span>导航</span>
            <kbd>↵</kbd>
            <span>选择</span>
            <kbd>Esc</kbd>
            <span>关闭</span>
          </div>
        </div>
      </div>
    </div>
  )
}
