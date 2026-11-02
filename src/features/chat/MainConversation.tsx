import { ArrowDown } from 'lucide-react'
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import type {
  DshProjectedToolCall,
  HostTodoItem,
  LiveContextUsage,
  PermissionMode,
  PermissionPromptPayload,
  PromptBudgetSnapshot,
  PromptQueueSnapshot,
  RoleDiscussionStrategy,
  SessionStatsSnapshot,
  SkillOption,
  ToolTraceItem,
  UserQuestionAnswer,
  UserQuestionPromptPayload,
  WorkMode,
  WorkspaceEntry,
  WorkspaceReference,
  RoleProfile,
} from '../../shared/app-api'
import type { AssistantContentBlock, ChatMessage, ModelOption, ThinkingLevel } from '../../types'
import { Composer } from '../composer/Composer'
import { buildChatMessageNavigation, buildDshToolHistoryIndex, isDshContextMessage } from '../dsh-runtime/dshTranscriptMessages'
import { Message } from './Message'
import { WorkStreamingStatus } from './WorkStreamingStatus'
import { ChangedFilesDock } from './ChangedFilesDock'
import type { ChangedFileItem } from './changed-files'
import { PendingSteeringBubble } from './PendingSteeringBubble'
import { RetryBanner } from './RetryBanner'
import { isFailedTurnMessage } from './turn-message-status'
import type { WorkbenchTabId } from '../workbench/useWorkbenchSessionState'
import { useStableCallbacks } from './stable-callbacks'
import { useStableArrays } from './stable-messages'
import {
  ALT_MODIFIER_KEY,
  matchesKeys,
  type ShortcutItem,
} from '../../shared/shortcuts'
import type { RoleProgressEntry } from '../roles/RoleModeControls'
import { useConversationStream, useConversationActions } from './context'
import { ConversationHeader } from './ConversationHeader'
import { ConversationEmptyState } from './ConversationEmptyState'

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
  modelEmptyLabel,
  sending: propSending,
  compacting,
  compactedSeq,
  streamText: propStreamText,
  streamStartedAt: propStreamStartedAt,
  streamActivity: propStreamActivity,
  streamThinking: propStreamThinking,
  streamBlocks: propStreamBlocks,
  retryBanner: propRetryBanner,
  toolTraces: propToolTraces,
  dshToolRows: propDshToolRows,
  activeDshTurn: propActiveDshTurn,
  promptQueue,
  onQueueMutate,
  liveContext,
  promptBudget,
  sessionStats,
  hostPlanModeActive,
  hostTodos,
  backendError,
  threadTitle,
  taskCount,
  workbenchOpen,
  workbenchTab,
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
  onCancel: propOnCancel,
  onSteer: propOnSteer,
  onFollowUp: propOnFollowUp,
  onSearchContext: propOnSearchContext,
  onCreateDroppedReference: propOnCreateDroppedReference,
  onOpenWorkbenchTab: propOnOpenWorkbenchTab,
  onToggleNav,
  onFork: propOnFork,
  onRewind: propOnRewind,
  onResendMessage: propOnResendMessage,
  onContinueMessage: propOnContinueMessage,
  onShowToolDetails: propOnShowToolDetails,
  onOpenWorkspacePath: propOnOpenWorkspacePath,
  onOpenChangedFileReview: propOnOpenChangedFileReview,
  shortcuts,
  terminalOpen,
  onToggleTerminal: propOnToggleTerminal,
  onCloseTerminal: propOnCloseTerminal,
  interruptedTurn,
  onDismissInterrupted,
  permissionPrompt,
  onRespondPermission,
  userQuestionPrompt,
  onAnswerUserQuestion,
  onDiscussPlanReview,
  multiAgentOrchestration,
  onMultiAgentOrchestrationChange,
  orchestrationChoicePrompt,
  onRespondOrchestrationChoice,
  conversationId,
  roleMode = false,
  roleProfiles = [],
  selectedRoleIds = [],
  roleProgress = [],
  roleDiscussionStrategy = 'relay',
  roleSummaryEnabled = false,
  onRoleDiscussionStrategyChange,
  onRoleSummaryEnabledChange,
  roleProfileLoadError: _roleProfileLoadError,
  roleProfilesLoading: _roleProfilesLoading = false,
  onSelectedRoleIdsChange: _onSelectedRoleIdsChange,
  onManageRoles,
  onTransferToWork: propOnTransferToWork,
  pendingComposerText,
  onClearPendingComposerText,
}: {
  currentThreadId?: string | null
  conversationId?: string | null
  roleMode?: boolean
  roleProfiles?: RoleProfile[]
  selectedRoleIds?: string[]
  roleProgress?: RoleProgressEntry[]
  roleDiscussionStrategy?: RoleDiscussionStrategy
  roleSummaryEnabled?: boolean
  onRoleDiscussionStrategyChange?: (strategy: RoleDiscussionStrategy) => void
  onRoleSummaryEnabledChange?: (enabled: boolean) => void
  roleProfileLoadError?: string | null
  roleProfilesLoading?: boolean
  onSelectedRoleIdsChange?: (ids: string[]) => void
  onManageRoles?: () => void
  messages: ChatMessage[]
  model: ModelOption | null
  modelOptions: ModelOption[]
  skills: SkillOption[]
  skillCatalogLoading?: boolean
  skillCatalogSize?: number
  onLoadSkills?: () => Promise<void>
  permissionMode: PermissionMode
  modelsLoading?: boolean
  modelEmptyLabel?: string
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
  toolTraces?: ToolTraceItem[]
  dshToolRows?: readonly DshProjectedToolCall[]
  activeDshTurn?: number | null
  promptQueue?: PromptQueueSnapshot
  onQueueMutate?: (payload: { kind: 'steering' | 'followUp'; index: number; action: 'remove' | 'update'; text?: string }) => void
  liveContext?: LiveContextUsage | null
  promptBudget?: PromptBudgetSnapshot | null
  sessionStats?: SessionStatsSnapshot | null
  hostPlanModeActive?: boolean | null
  hostTodos?: HostTodoItem[] | null
  backendError?: string | null
  threadTitle: string
  taskCount: number
  workbenchOpen: boolean
  workbenchTab: WorkbenchTabId
  onOpenWorkbenchTab?: (tab: WorkbenchTabId) => void
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
    attachments?: { id: string, mediaType: string, data: string, name: string }[],
    documents?: { id: string, name: string }[],
  ) => void
  onCancel?: () => void
  onSteer?: (text: string) => void
  onFollowUp?: (text: string) => void
  onSearchContext?: (query: string) => Promise<WorkspaceEntry[] | any>
  onCreateDroppedReference?: (file: File) => Promise<WorkspaceReference | null>
  onToggleNav?: () => void
  onFork?: (messageId: string) => void
  onRewind?: (messageId: string) => void
  onResendMessage?: (text: string, precedingAssistantId: string | null, modelKey?: string | null) => void
  onContinueMessage?: (modelKey?: string | null) => void
  onShowToolDetails?: (item: ToolTraceItem) => void
  onOpenWorkspacePath?: (relativePath: string) => void
  onOpenChangedFileReview?: (file: ChangedFileItem) => void
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
  orchestrationChoicePrompt?: { confidence: number; reasons: string[] } | null
  onRespondOrchestrationChoice?: (choice: 'single-agent' | 'multi-agent') => Promise<boolean>
  onTransferToWork?: (text: string) => void
  pendingComposerText?: string | null
  onClearPendingComposerText?: () => void
}) {
  const contextStream = useConversationStream()
  const contextActions = useConversationActions()

  const sending = propSending ?? contextStream.sending
  const streamText = propStreamText !== undefined ? propStreamText : contextStream.streamText
  const streamStartedAt = propStreamStartedAt !== undefined ? propStreamStartedAt : contextStream.streamStartedAt
  const streamActivity = propStreamActivity !== undefined ? propStreamActivity : contextStream.streamActivity
  const streamThinking = propStreamThinking !== undefined ? propStreamThinking : contextStream.streamThinking
  const streamBlocks = propStreamBlocks ?? contextStream.streamBlocks
  const retryBanner = propRetryBanner !== undefined ? propRetryBanner : contextStream.retryBanner
  const toolTraces = propToolTraces ?? contextStream.toolTraces
  const dshToolRows = propDshToolRows ?? contextStream.dshToolRows
  const activeDshTurn = propActiveDshTurn !== undefined ? propActiveDshTurn : contextStream.activeDshTurn

  const onOpenWorkbenchTab = propOnOpenWorkbenchTab ?? contextActions.onOpenWorkbenchTab
  const onCancel = propOnCancel ?? contextActions.onCancel
  const onSteer = propOnSteer ?? contextActions.onSteer
  const onFollowUp = propOnFollowUp ?? contextActions.onFollowUp
  const onSearchContext = propOnSearchContext ?? contextActions.onSearchContext
  const onCreateDroppedReference = propOnCreateDroppedReference ?? contextActions.onCreateDroppedReference
  const onFork = propOnFork ?? contextActions.onFork
  const onRewind = propOnRewind ?? contextActions.onRewind
  const onResendMessage = propOnResendMessage ?? contextActions.onResendMessage
  const onContinueMessage = propOnContinueMessage ?? contextActions.onContinueMessage
  const onShowToolDetails = propOnShowToolDetails ?? contextActions.onShowToolDetails
  const onOpenWorkspacePath = propOnOpenWorkspacePath ?? contextActions.onOpenWorkspacePath
  const onOpenChangedFileReview = propOnOpenChangedFileReview ?? contextActions.onOpenChangedFileReview
  const onToggleTerminal = propOnToggleTerminal ?? contextActions.onToggleTerminal
  const onCloseTerminal = propOnCloseTerminal ?? contextActions.onCloseTerminal
  const onTransferToWork = propOnTransferToWork ?? contextActions.onTransferToWork

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const scrollPositionsRef = useRef<Map<string, { top: number; atBottom: boolean }>>(new Map())
  const isAtBottomRef = useRef(true)
  const scrollFollowRafRef = useRef<number | null>(null)
  const [showScrollBottomBtn, setShowScrollBottomBtn] = useState(false)
  const [focusedMessageIndex, setFocusedMessageIndex] = useState<number>(-1)
  const draftCacheOwnerRef = useRef({})
  const cacheOwner = currentThreadId ?? conversationId ?? draftCacheOwnerRef.current
  const activeCacheKeys = useMemo(() => ({
    callbacks: [
      'open-dag-panel', 'show-tool-details', 'open-workspace-path', 'open-changed-file-review',
      ...messages.flatMap((message) => ['fork', 'rewind', 'edit', 'regenerate', 'retry'].map((action) => `${message.id}:${action}`)),
    ],
    arrays: messages.flatMap((message) => [`${message.id}:rows`, `${message.id}:traces`]),
  }), [messages])
  const bindCallback = useStableCallbacks(cacheOwner, activeCacheKeys.callbacks)
  const stableArray = useStableArrays(cacheOwner, activeCacheKeys.arrays)
  const openDagPanel = bindCallback('open-dag-panel', onOpenWorkbenchTab ? () => onOpenWorkbenchTab('tasks') : undefined)

  const navigation = useMemo(() => buildChatMessageNavigation(messages), [messages])
  // Both modes share one conversation transcript; roleMode changes the composer and
  // presentation, not which historical messages belong to this conversation.
  const visibleMessages = messages
  const { lastAgentMessageId, latestUserMessageIndex, latestAssistantIndex } = navigation
  const toolHistory = useMemo(() => buildDshToolHistoryIndex(
    roleMode ? [] : dshToolRows,
    roleMode && !sending ? [] : toolTraces,
  ), [dshToolRows, roleMode, sending, toolTraces])
  const latestAssistant = latestAssistantIndex >= 0 ? messages[latestAssistantIndex] : undefined
  const latestAssistantTraceHistory = latestAssistant && latestAssistantIndex > latestUserMessageIndex
    ? toolHistory.forMessage(latestAssistant, !sending)
    : undefined
  const activeRoleProgress = roleMode ? roleProgress.find((item) => item.status === 'started') : undefined
  const activeRoleProfiles = useMemo(() => selectedRoleIds
    .map((id) => roleProfiles.find((profile) => profile.id === id))
    .filter((profile): profile is RoleProfile => Boolean(profile)), [selectedRoleIds, roleProfiles])
  const rolePresence: 'working' | 'blocked' | 'done' | 'idle' = roleProgress.some((item) => item.status === 'started')
    ? 'working'
    : roleProgress.some((item) => item.status === 'failed')
      ? 'blocked'
      : roleProgress.some((item) => item.status === 'completed')
        ? 'done'
        : 'idle'
  const currentRunHistory = !roleMode && activeDshTurn != null
    ? toolHistory.forTurn(activeDshTurn)
    : { rows: [], traces: roleMode && !sending ? [] : toolTraces }
  const changedFilesTraces = sending ? currentRunHistory.traces : latestAssistantTraceHistory?.traces
  const changedFilesSummary = sending ? undefined : latestAssistantTraceHistory ? latestAssistant?.fileChanges : undefined

  const streamFollowKey = useMemo(() => {
    const traceTail = toolTraces.length ? toolTraces[toolTraces.length - 1]?.id ?? '' : ''
    return `${messages.length}:${lastAgentMessageId ?? ''}:${streamText?.length ?? 0}:${sending ? 1 : 0}:${traceTail}`
  }, [messages.length, lastAgentMessageId, streamText, sending, toolTraces])

  const userTurns = useMemo(() => {
    return visibleMessages
      .filter((m) => m.author === 'user')
      .map((m, idx) => ({
        turnNumber: idx + 1,
        id: m.id,
        preview: m.text.trim().replace(/\s+/g, ' ').slice(0, 30) + (m.text.trim().length > 30 ? '…' : ''),
        time: m.time,
      }))
  }, [visibleMessages])

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
    const jumpShortcut = shortcuts?.find((item) => item.id === 'jump-bottom')?.keys ?? [ALT_MODIFIER_KEY, '↓']
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
    const el = document.getElementById(`msg-${turnId}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      isAtBottomRef.current = false
      setShowScrollBottomBtn(true)
    }
  }

  return (
    <main className={`conversation${roleMode ? ' role-mode-conversation' : ''}`} aria-label={roleMode ? '角色对话' : '主控 Agent 对话'} data-testid="conversation">
      <ConversationHeader
        roleMode={roleMode}
        threadTitle={threadTitle}
        workspacePath={workspacePath}
        activeRoleProfiles={activeRoleProfiles}
        roleProfiles={roleProfiles}
        modelOptions={modelOptions}
        rolePresence={rolePresence}
        userTurns={userTurns}
        workbenchOpen={workbenchOpen}
        workbenchTab={workbenchTab}
        taskCount={taskCount}
        terminalOpen={terminalOpen}
        onToggleNav={onToggleNav}
        onOpenWorkbenchTab={onOpenWorkbenchTab}
        onToggleTerminal={onToggleTerminal}
        onScrollToTurn={scrollToTurn}
      />
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
      {/* 登场 Bot 协作席位已迁移至顶部贯通栏，彻底释放主聊天区纵向空间 */}
      <div className="conversation-scroll" ref={scrollContainerRef} onScroll={handleScroll}>
        <div className="transcript" data-dsh-chat data-testid="message-list" role="log" aria-label="消息列表" aria-relevant="additions text">
          {visibleMessages.length === 0 && !sending && (
            <ConversationEmptyState
              roleMode={roleMode}
              workspacePath={workspacePath}
              activeRoleProfiles={activeRoleProfiles}
              roleProfiles={roleProfiles}
              onSend={onSend}
              onManageRoles={onManageRoles}
            />
          )}
          {messages.map((message, index) => {
            if (isDshContextMessage(message)) return null
            const failedTurn = isFailedTurnMessage(message)
            const isLatestAgent = !sending && message.id === lastAgentMessageId && index > latestUserMessageIndex
            const messageToolHistory = toolHistory.forMessage(message, isLatestAgent)
            const mayResend = Boolean(onResendMessage)
              && !sending
              && (promptQueue?.steering?.length ?? 0) === 0

            const priorUserIndex = !message.compaction && message.author !== 'user'
              ? navigation.relations[index].previousUserIndex
              : -1
            const priorUserMessage = priorUserIndex >= 0 ? messages[priorUserIndex] : undefined
            const resendText = priorUserMessage?.text
            const resendAnchor = priorUserIndex >= 0 ? navigation.relations[priorUserIndex].previousAssistantId : null
            const resendModelKey = message.modelKey ?? (priorUserIndex >= 0 ? navigation.relations[priorUserIndex].responseForUser?.modelKey : undefined) ?? model?.id
            const editResponse = message.author === 'user' && !message.behavior
              ? navigation.relations[index].responseForUser
              : undefined
            const canForkHere =
              Boolean(onFork)
              && !sending
              && !message.compaction
              && !message.id.includes('-error')
              // 助手消息仅允许最新一条；用户消息可在任意一轮上分支（保留该轮及其回答）。
              && (message.author === 'user' || message.id === lastAgentMessageId)
              && (promptQueue?.steering?.length ?? 0) === 0
            const canRewindHere =
              Boolean(onRewind)
              && !sending
              && !message.compaction
              && !failedTurn
              && !message.id.includes('-error')
              && (promptQueue?.steering?.length ?? 0) === 0
            const isFocused = index === focusedMessageIndex
            return (
              <Message
                key={message.id}
                message={message}
                historySourceLabel={roleMode && message.author !== 'user' && !message.roleMode ? 'KAI Work' : undefined}
                dshToolRows={stableArray(`${message.id}:rows`, messageToolHistory.rows)}
                toolTraceItems={stableArray(`${message.id}:traces`, messageToolHistory.traces)}
                workspacePath={workspacePath}
                conversationId={conversationId}
                onFork={bindCallback(`${message.id}:fork`, canForkHere ? onFork : undefined)}
                onRewind={bindCallback(`${message.id}:rewind`, canRewindHere ? onRewind : undefined)}
                onEditAndResend={bindCallback(`${message.id}:edit`, mayResend && message.author === 'user' && !message.behavior
                  ? (text: string) => onResendMessage?.(text, navigation.relations[index].previousAssistantId, editResponse?.modelKey ?? model?.id)
                  : undefined)}
                onRegenerate={bindCallback(`${message.id}:regenerate`, mayResend && isLatestAgent && message.author !== 'user' && !failedTurn && resendText
                  ? () => onResendMessage?.(resendText, resendAnchor, resendModelKey)
                  : undefined)}
                onRetry={bindCallback(`${message.id}:retry`, mayResend && message.author !== 'user' && failedTurn && resendText
                  ? message.errorCode === 'MAX_STEPS'
                    ? () => onContinueMessage?.(resendModelKey)
                    : () => onResendMessage?.(resendText, resendAnchor, resendModelKey)
                  : undefined)}
                onShowToolDetails={bindCallback('show-tool-details', onShowToolDetails)}
                onOpenWorkspacePath={bindCallback('open-workspace-path', onOpenWorkspacePath)}
                onOpenChangedFileReview={bindCallback('open-changed-file-review', onOpenChangedFileReview)}
                onTransferToWork={bindCallback('transfer-to-work', onTransferToWork)}
                dagTaskCount={taskCount}
                onOpenDagPanel={openDagPanel}
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
              key="streaming-assistant"
              message={{
                id: 'streaming-assistant',
                author: 'orchestrator',
                name: roleMode ? activeRoleProgress?.roleName ?? '角色' : 'TaskWeaver',
                time: '生成中',
                timestamp: streamStartedAt ?? undefined,
                text: streamBlocks?.length ? '' : (streamText || ''),
                ...(roleMode ? { roleMode: true, speakerId: activeRoleProgress?.roleId } : {}),
                thinking: streamBlocks?.length ? undefined : streamThinking?.text,
                thinkingDurationMs: streamThinking?.durationMs,
                contentBlocks: streamBlocks?.length ? streamBlocks : undefined,
              }}
              dshToolRows={currentRunHistory.rows}
              toolTraceItems={currentRunHistory.traces}
              workspacePath={workspacePath}
              conversationId={conversationId}
              isStreaming={true}
              streamStatus={roleMode ? undefined : (
                <WorkStreamingStatus
                  startTime={streamStartedAt ?? undefined}
                  toolTraceItems={currentRunHistory.traces}
                  activity={streamActivity}
                />
              )}
              thinkingIsStreaming={streamThinking?.isActive}
              dagTaskCount={taskCount}
              onOpenDagPanel={openDagPanel}
              onShowToolDetails={onShowToolDetails}
              onOpenWorkspacePath={onOpenWorkspacePath}
              onOpenChangedFileReview={onOpenChangedFileReview}
            />
          )}
        </div>
      </div>
      {showScrollBottomBtn && (
        <button
          type="button"
          className="scroll-to-bottom-pill"
          onClick={scrollToLatest}
          title={`定位到最新答案 (快捷键: ${ALT_MODIFIER_KEY}↓)`}
          aria-label="回到底部最新答案"
        >
          <ArrowDown size={14} className={sending ? 'pulse-icon' : ''} />
          <span>{sending ? (roleMode ? '角色正在回复 · 定位到底部' : 'TaskWeaver 正在输出 · 定位到底部') : '定位到最新答案'}</span>
        </button>
      )}
        {onOpenChangedFileReview && (
          <ChangedFilesDock
            traces={changedFilesTraces}
            fileChanges={changedFilesSummary}
            workspacePath={workspacePath}
            onOpenReview={onOpenChangedFileReview}
          />
        )}
        <Composer
          shortcuts={shortcuts}
          messages={visibleMessages}
          model={model}
          modelOptions={modelOptions}
          skills={skills}
          skillCatalogLoading={skillCatalogLoading}
          skillCatalogSize={skillCatalogSize}
          onLoadSkills={onLoadSkills}
          permissionMode={permissionMode}
          modelsLoading={modelsLoading}
          modelEmptyLabel={modelEmptyLabel}
          sending={sending}
          compacting={compacting}
          compactedSeq={compactedSeq}
          promptQueue={roleMode ? undefined : promptQueue}
          workspacePath={workspacePath}
          workspaceTrusted={workspaceTrusted}
          availableProjects={availableProjects}
          hasMessages={visibleMessages.length > 0}
          sessionStats={roleMode ? null : sessionStats}
          liveContext={roleMode ? null : liveContext}
          promptBudget={roleMode ? null : promptBudget}
          hostPlanModeActive={roleMode ? false : hostPlanModeActive}
          hostTodos={roleMode ? null : hostTodos}
          onPermissionModeChange={onPermissionModeChange}
          onModelChange={onModelChange}
          thinkingLevel={thinkingLevel}
          onThinkingLevelChange={onThinkingLevelChange}
          onSend={onSend}
          roleMode={roleMode}
          selectedRoleCount={selectedRoleIds.length}
          selectedRoleProfiles={activeRoleProfiles}
          roleDiscussionStrategy={roleDiscussionStrategy}
          onRoleDiscussionStrategyChange={onRoleDiscussionStrategyChange}
          roleSummaryEnabled={roleSummaryEnabled}
          onRoleSummaryEnabledChange={onRoleSummaryEnabledChange}
          onCancel={onCancel}
          onSteer={onSteer}
          onFollowUp={roleMode ? undefined : onFollowUp}
          onSearchContext={onSearchContext}
          onCreateDroppedReference={onCreateDroppedReference}
          onSelectProject={onSelectProject}
          onPickWorkspace={onPickWorkspace}
          onDetachWorkspace={onDetachWorkspace}
          onSetWorkspaceTrust={onSetWorkspaceTrust}
          onQueueMutate={roleMode ? undefined : onQueueMutate}
          currentThreadId={currentThreadId}
          permissionPrompt={permissionPrompt}
          onRespondPermission={onRespondPermission}
          userQuestionPrompt={userQuestionPrompt}
          onAnswerUserQuestion={onAnswerUserQuestion}
          onDiscussPlanReview={onDiscussPlanReview}
          multiAgentOrchestration={multiAgentOrchestration}
          onMultiAgentOrchestrationChange={onMultiAgentOrchestrationChange}
          orchestrationChoicePrompt={orchestrationChoicePrompt}
          onRespondOrchestrationChoice={onRespondOrchestrationChoice}
          conversationId={conversationId}
          pendingInitialText={pendingComposerText}
          onClearPendingInitialText={onClearPendingComposerText}
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
