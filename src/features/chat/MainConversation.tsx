import {
  ArrowDown,
  Folder,
  GitBranch,
  ListOrdered,
  MessageSquare,
  PanelBottom,
  PanelLeft,
  PanelRight,
  Sparkles,
  X,
} from 'lucide-react'
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import type {
  BusyEnterMode,
  DshProjectedToolCall,
  HostTodoItem,
  LiveContextUsage,
  PermissionMode,
  PermissionPromptPayload,
  PromptBudgetSnapshot,
  PromptQueueSnapshot,
  SessionStatsSnapshot,
  SkillOption,
  ToolTraceItem,
  UserQuestionAnswer,
  UserQuestionPromptPayload,
  WorkMode,
  WorkspaceEntry,
  WorkspaceReference,
} from '../../shared/app-api'
import type { AssistantContentBlock, ChatMessage, ModelOption, ThinkingLevel } from '../../types'
import { Composer } from '../composer/Composer'
import { isDshContextMessage } from '../dsh-runtime/dshTranscriptMessages'
import { ContextInjectionRow } from './ContextInjectionRow'
import { Message } from './Message'
import { PendingSteeringBubble } from './PendingSteeringBubble'
import { RetryBanner } from './RetryBanner'
import type { PanelView } from './panel-view'
import { matchesKeys, type ShortcutItem } from '../../shared/shortcuts'
import { workspaceLabel } from '../../shared/ui-utils'

const TerminalDrawer = lazy(() =>
  import('../terminal/TerminalDrawer').then((module) => ({ default: module.TerminalDrawer })),
)

export function MainConversation({
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
  compacting,
  compactedSeq,
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
  promptBudget,
  sessionStats,
  hostPlanModeActive,
  hostTodos,
  backendError,
  threadTitle,
  taskCount,
  panelOpen,
  workspacePath,
  workspaceTrusted,
  availableProjects,
  onSelectProject,
  onPickWorkspace,
  onDetachWorkspace,
  onSetWorkspaceTrust,
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
  onDiscussPlanReview,
  multiAgentOrchestration,
  onMultiAgentOrchestrationChange,
  conversationId,
}: {
  currentThreadId?: string | null
  conversationId?: string | null
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
  compacting?: boolean
  compactedSeq?: number
  streamText?: string | null
  streamStartedAt?: number | null
  streamActivity?: string | null
  streamThinking?: { text: string; durationMs?: number; isActive?: boolean } | null
  streamBlocks?: AssistantContentBlock[]
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
  promptBudget?: PromptBudgetSnapshot | null
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
  workspaceTrusted?: boolean | null
  availableProjects: { path: string; name: string }[]
  onSelectProject: (path: string) => void
  onPickWorkspace: () => void
  onDetachWorkspace: () => void
  onSetWorkspaceTrust?: (trusted: boolean) => void | Promise<void>
  onModelChange: (model: ModelOption) => void
  thinkingLevel?: ThinkingLevel
  onThinkingLevelChange?: (level: ThinkingLevel) => void
  onPermissionModeChange: (mode: PermissionMode) => void
  onSend: (
    message: string,
    skillName: string | null,
    workMode?: WorkMode,
    executionModeOverride?: 'single-agent' | 'multi-agent',
  ) => void
  onCancel: () => void
  onSteer?: (text: string) => void
  onFollowUp?: (text: string) => void
  onSearchContext: (query: string) => Promise<WorkspaceEntry[]>
  onCreateDroppedReference: (file: File) => Promise<WorkspaceReference | null>
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
  onDiscussPlanReview?: (id: string) => Promise<boolean>
  multiAgentOrchestration?: boolean
  onMultiAgentOrchestrationChange?: (enabled: boolean) => void
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
    <main className="conversation" aria-label="主控 Agent 对话" data-testid="conversation">
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
        <div className="transcript" data-dsh-chat data-testid="message-list" role="log" aria-label="消息列表" aria-relevant="additions text">
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
              && !message.compaction
              && !message.id.includes('-error')
              // 助手消息仅允许最新一条；用户消息可在任意一轮上分支（保留该轮及其回答）。
              && (message.author === 'user' || message.id === lastAgentMessageId)
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
              thinkingIsStreaming={streamThinking?.isActive}
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
          compacting={compacting}
          compactedSeq={compactedSeq}
          promptQueue={promptQueue}
          workspacePath={workspacePath}
          workspaceTrusted={workspaceTrusted}
          availableProjects={availableProjects}
          hasMessages={messages.length > 0}
          sessionStats={sessionStats}
          liveContext={liveContext}
          promptBudget={promptBudget}
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
          onSetWorkspaceTrust={onSetWorkspaceTrust}
          busyEnterMode={busyEnterMode}
          onBusyEnterModeChange={onBusyEnterModeChange}
          onQueueMutate={onQueueMutate}
          currentThreadId={currentThreadId}
          permissionPrompt={permissionPrompt}
          onRespondPermission={onRespondPermission}
          userQuestionPrompt={userQuestionPrompt}
          onAnswerUserQuestion={onAnswerUserQuestion}
          onDiscussPlanReview={onDiscussPlanReview}
          multiAgentOrchestration={multiAgentOrchestration}
          onMultiAgentOrchestrationChange={onMultiAgentOrchestrationChange}
          conversationId={conversationId}
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
