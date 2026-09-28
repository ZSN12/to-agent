import React, { useEffect, useRef, useState, useCallback } from 'react'
import { Plus, X, Search, RotateCcw, ChevronUp, ChevronDown, AlertCircle } from 'lucide-react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import '@xterm/xterm/css/xterm.css'
import type { TerminalSessionInfo } from '../../shared/app-api'

interface TerminalTab {
  id: string
  title: string
  cwd: string
  isPty?: boolean
  shell?: string
  error?: string | null
}

interface TerminalDrawerProps {
  isOpen?: boolean
  open?: boolean
  onClose: () => void
  workspacePath?: string | null
}

/**
 * 终端图标 (类似 DSH 的 >_ 极简终端徽标)
 */
function DshTerminalIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
      <rect x="1" y="2" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.2" />
      <path d="M4.5 5.5L7 8L4.5 10.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 11H11.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

const XTERM_THEME = {
  background: '#0d0e11',
  foreground: '#e2e8f0',
  cursor: '#38bdf8',
  cursorAccent: '#0d0e11',
  selectionBackground: 'rgba(56, 189, 248, 0.28)',
  black: '#4b5563',
  red: '#ef4444',
  green: '#10b981',
  yellow: '#f59e0b',
  blue: '#3b82f6',
  magenta: '#a855f7',
  cyan: '#06b6d4',
  white: '#f3f4f6',
  brightBlack: '#6b7280',
  brightRed: '#f87171',
  brightGreen: '#34d399',
  brightYellow: '#fbbf24',
  brightBlue: '#60a5fa',
  brightMagenta: '#c084fc',
  brightCyan: '#22d3ee',
  brightWhite: '#ffffff',
}

export function TerminalDrawer({ isOpen, open, onClose, workspacePath }: TerminalDrawerProps) {
  const isDrawerOpen = Boolean(isOpen ?? open)
  const [tabs, setTabs] = useState<TerminalTab[]>([])
  const [activeTabId, setActiveTabId] = useState<string>('')
  const [drawerHeight, setDrawerHeight] = useState<number>(240)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const isDraggingRef = useRef(false)
  const startYRef = useRef(0)
  const startHeightRef = useRef(240)

  const searchInputRef = useRef<HTMLInputElement>(null)
  const containersRef = useRef<Map<string, HTMLDivElement>>(new Map())
  const terminalInstancesRef = useRef<Map<string, { term: Terminal; fit: FitAddon; search: SearchAddon }>>(new Map())

  // 调整尺寸并同步给 PTY
  const syncDimensionsForTab = useCallback((tabId: string) => {
    const inst = terminalInstancesRef.current.get(tabId)
    if (!inst) return
    try {
      inst.fit.fit()
      const { cols, rows } = inst.term
      if (window.taskweaver?.terminal?.resize && cols > 0 && rows > 0) {
        void window.taskweaver.terminal.resize(tabId, cols, rows)
      }
    } catch {
      // ignore
    }
  }, [])

  // 窗口 / 抽屉尺寸变化监听
  useEffect(() => {
    if (!isDrawerOpen || !activeTabId) return
    const container = containersRef.current.get(activeTabId)
    if (!container) return

    const observer = new ResizeObserver(() => {
      syncDimensionsForTab(activeTabId)
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [isDrawerOpen, activeTabId, syncDimensionsForTab])

  // 创建并挂载单个 xterm 终端实例
  const mountTerminal = useCallback((tabId: string, el: HTMLDivElement) => {
    if (!el || terminalInstancesRef.current.has(tabId)) return

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, "Liberation Mono", monospace',
      fontSize: 12.5,
      lineHeight: 1.45,
      theme: XTERM_THEME,
      scrollback: 5000,
      allowTransparency: true,
    })

    const fit = new FitAddon()
    const search = new SearchAddon()

    term.loadAddon(fit)
    term.loadAddon(search)
    term.open(el)

    // 输入捕获：将用户的每一个按键直接发送给主进程 PTY
    term.onData((data) => {
      if (window.taskweaver?.terminal?.write) {
        void window.taskweaver.terminal.write(tabId, data)
      }
    })

    terminalInstancesRef.current.set(tabId, { term, fit, search })

    setTimeout(() => {
      try {
        fit.fit()
        term.focus()
        const { cols, rows } = term
        if (window.taskweaver?.terminal?.resize && cols > 0 && rows > 0) {
          void window.taskweaver.terminal.resize(tabId, cols, rows)
        }
      } catch {
        // ignore
      }
    }, 40)
  }, [])

  // 创建新 Tab
  const createNewTab = useCallback(async (cwd?: string) => {
    const targetCwd = cwd || workspacePath || ''
    const currentCount = tabs.length + 1
    const defaultTitle = `终端 ${currentCount}`
    const newId = `term-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

    let sessionInfo: TerminalSessionInfo | null = null
    let launchError: string | null = null

    if (window.taskweaver?.terminal) {
      try {
        const res = await window.taskweaver.terminal.create({
          id: newId,
          cwd: targetCwd,
          title: defaultTitle,
          cols: 80,
          rows: 24,
        })
        if (res.ok && res.data) {
          sessionInfo = res.data
        } else if (!res.ok) {
          launchError = res.error || '无法创建终端会话'
        }
      } catch (err: unknown) {
        launchError = err instanceof Error ? err.message : String(err)
      }
    }

    const newTab: TerminalTab = {
      id: newId,
      title: defaultTitle,
      cwd: sessionInfo?.cwd || targetCwd,
      isPty: sessionInfo?.isPty,
      shell: sessionInfo?.shell,
      error: launchError,
    }

    setTabs((prev) => [...prev, newTab])
    setActiveTabId(newId)
  }, [tabs.length, workspacePath])

  // 关闭 Tab
  const closeTab = useCallback((id: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    if (window.taskweaver?.terminal) {
      void window.taskweaver.terminal.kill(id)
    }

    const inst = terminalInstancesRef.current.get(id)
    if (inst) {
      inst.term.dispose()
      terminalInstancesRef.current.delete(id)
    }
    containersRef.current.delete(id)

    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== id)
      if (next.length === 0) {
        onClose()
      } else if (activeTabId === id) {
        setActiveTabId(next[next.length - 1].id)
      }
      return next
    })
  }, [activeTabId, onClose])

  // 清屏
  const clearCurrentTab = useCallback(() => {
    if (!activeTabId) return
    const inst = terminalInstancesRef.current.get(activeTabId)
    if (inst) {
      inst.term.clear()
    }
    if (window.taskweaver?.terminal) {
      void window.taskweaver.terminal.write(activeTabId, 'clear\n')
    }
  }, [activeTabId])

  // 监听后端流式输出与退出通知
  useEffect(() => {
    if (!window.taskweaver?.terminal) return

    const unsubData = window.taskweaver.terminal.onData(({ id, data }) => {
      const inst = terminalInstancesRef.current.get(id)
      if (inst) {
        inst.term.write(data)
      }
    })

    const unsubExit = window.taskweaver.terminal.onExit(({ id, code }) => {
      const inst = terminalInstancesRef.current.get(id)
      if (inst) {
        inst.term.writeln(`\r\n\x1b[90m[进程已退出 (代码: ${code ?? 0})]\x1b[0m\r\n`)
      }
    })

    return () => {
      unsubData()
      unsubExit()
    }
  }, [])

  // 展开抽屉时如果无 Tab，自动创建默认 Tab
  useEffect(() => {
    if (isDrawerOpen && tabs.length === 0) {
      void createNewTab()
    }
  }, [isDrawerOpen, tabs.length, createNewTab])

  // 切换活跃 Tab 时自动聚焦和 fit
  useEffect(() => {
    if (!activeTabId) return
    setTimeout(() => {
      syncDimensionsForTab(activeTabId)
      terminalInstancesRef.current.get(activeTabId)?.term.focus()
    }, 30)
  }, [activeTabId, syncDimensionsForTab])

  // 拖拽调整高度
  const handleMouseDown = (e: React.MouseEvent) => {
    isDraggingRef.current = true
    startYRef.current = e.clientY
    startHeightRef.current = drawerHeight

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingRef.current) return
      const delta = startYRef.current - moveEvent.clientY
      const nextHeight = Math.min(Math.max(startHeightRef.current + delta, 120), 650)
      setDrawerHeight(nextHeight)
    }

    const onMouseUp = () => {
      isDraggingRef.current = false
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      if (activeTabId) syncDimensionsForTab(activeTabId)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  // 搜索处理
  const handleSearchNext = () => {
    if (!activeTabId || !searchQuery) return
    const inst = terminalInstancesRef.current.get(activeTabId)
    inst?.search.findNext(searchQuery)
  }

  const handleSearchPrev = () => {
    if (!activeTabId || !searchQuery) return
    const inst = terminalInstancesRef.current.get(activeTabId)
    inst?.search.findPrevious(searchQuery)
  }

  if (!isDrawerOpen) return null

  return (
    <div
      className="terminal-drawer dsh-terminal"
      style={{ height: drawerHeight }}
      onClick={() => {
        if (!searchOpen && activeTabId) {
          terminalInstancesRef.current.get(activeTabId)?.term.focus()
        }
      }}
    >
      {/* 顶部调整尺寸控制条 */}
      <div className="terminal-resize-handle" onMouseDown={handleMouseDown} />

      {/* DSH 风格精致 Tab 栏 */}
      <div className="terminal-header">
        <div className="terminal-tabs-list">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={`terminal-tab-item ${tab.id === activeTabId ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                setActiveTabId(tab.id)
              }}
            >
              <DshTerminalIcon />
              <span className="terminal-tab-title">{tab.title}</span>
              <button
                type="button"
                className="terminal-tab-close"
                onClick={(e) => closeTab(tab.id, e)}
                title="关闭此终端"
              >
                <X size={11} />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="terminal-add-tab-btn"
            onClick={(e) => {
              e.stopPropagation()
              void createNewTab()
            }}
            title="新建终端 Tab"
          >
            <Plus size={13} />
          </button>
        </div>

        {/* 右侧极简工具区 */}
        <div className="terminal-header-actions">
          {searchOpen ? (
            <div className="terminal-inline-search" onClick={(e) => e.stopPropagation()}>
              <input
                ref={searchInputRef}
                className="terminal-search-input"
                placeholder="搜索输出..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  if (activeTabId && e.target.value) {
                    terminalInstancesRef.current.get(activeTabId)?.search.findNext(e.target.value)
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (e.shiftKey) handleSearchPrev()
                    else handleSearchNext()
                  } else if (e.key === 'Escape') {
                    setSearchOpen(false)
                  }
                }}
              />
              <button
                type="button"
                className="terminal-subtle-btn"
                onClick={handleSearchPrev}
                title="上一个匹配 (Shift+Enter)"
              >
                <ChevronUp size={11} />
              </button>
              <button
                type="button"
                className="terminal-subtle-btn"
                onClick={handleSearchNext}
                title="下一个匹配 (Enter)"
              >
                <ChevronDown size={11} />
              </button>
              <button
                type="button"
                className="terminal-subtle-btn"
                onClick={() => setSearchOpen(false)}
                title="关闭搜索"
              >
                <X size={11} />
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                className="terminal-header-action-btn"
                onClick={(e) => {
                  e.stopPropagation()
                  setSearchOpen(true)
                  setTimeout(() => searchInputRef.current?.focus(), 50)
                }}
                title="在终端中搜索 (⌘F)"
              >
                <Search size={12} />
              </button>
              <button
                type="button"
                className="terminal-header-action-btn"
                onClick={(e) => {
                  e.stopPropagation()
                  clearCurrentTab()
                }}
                title="清屏 (⌃L)"
              >
                <RotateCcw size={12} />
              </button>
            </>
          )}

          {/* DSH 风格关闭终端按钮 */}
          <button
            type="button"
            className="terminal-close-drawer-btn"
            onClick={(e) => {
              e.stopPropagation()
              onClose()
            }}
            title="收起终端"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* 终端主体区：真正的 xterm.js 容器 */}
      <div className="terminal-body">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className="terminal-xterm-tab-container"
            style={{ display: tab.id === activeTabId ? 'block' : 'none', width: '100%', height: '100%' }}
            ref={(el) => {
              if (el) {
                containersRef.current.set(tab.id, el)
                mountTerminal(tab.id, el)
              }
            }}
          >
            {tab.error && (
              <div className="terminal-tab-error-banner">
                <AlertCircle size={14} className="error-icon" />
                <span>终端启动异常: {tab.error}</span>
                <button
                  type="button"
                  className="terminal-retry-btn"
                  onClick={() => createNewTab(tab.cwd)}
                >
                  重试
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
