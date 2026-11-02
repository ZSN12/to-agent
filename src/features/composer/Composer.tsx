import {
  ArrowUp,
  FolderOpen,
  ListTodo,
  Mic,
  Paperclip,
  Plus,
  Sparkles,
  Square,
  Target,
  Users,
  X,
  FileText,
} from 'lucide-react'
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { getBridge } from '../app/getBridge'
import type {
  ComposerDocumentAttachment,
  HostTodoItem,
  LiveContextUsage,
  PermissionMode,
  PermissionPromptPayload,
  PromptBudgetSnapshot,
  PromptQueueSnapshot,
  RoleDiscussionStrategy,
  RoleProfile,
  SessionStatsSnapshot,
  SkillOption,
  UserQuestionAnswer,
  UserQuestionPromptPayload,
  WorkMode,
  WorkspaceEntry,
  WorkspaceReference,
} from '../../shared/app-api'
import type { ChatMessage, ModelOption, ThinkingLevel } from '../../types'
import { composerSubmissionKey, isSameComposerDraftTarget, shouldAutoRestoreFailedDraft } from '../app/hooks/conversation-run-reliability'
import { ALT_MODIFIER_KEY, DEFAULT_SHORTCUTS, matchesKeys, type ShortcutItem } from '../../shared/shortcuts'
import { useAutosizeTextarea } from '../../shared/ui-utils'
import { ConversationUsageFooter } from './ConversationUsageFooter'
import { ModelSelect } from './ModelSelect'
import { PermissionSelect } from './PermissionSelect'
import { ComposerDocks } from './ComposerDocks'
import { useComposerAutocomplete } from './useComposerAutocomplete'
import { findRoleMentionRanges } from '../roles/role-routing'
import { useComposerAttachments } from './useComposerAttachments'
import { ComposerAttachmentsPreview } from './ComposerAttachmentsPreview'
import { ComposerAutocompleteMenu } from './ComposerAutocompleteMenu'
import type { ComposerImage } from './image-attachment-validation'

const DEFAULT_STEER_KEYS = DEFAULT_SHORTCUTS.find((item) => item.id === 'steer')?.defaultKeys ?? []

type ComposerSendResult = void | boolean | 'uncertain'

type ComposerDraftSnapshot = {
  key: string
  revision: number
  threadId: string | null
  conversationId: string | null
  text: string
  selectedSkill: string | null
  attachments: ComposerImage[]
  documents: ComposerDocumentAttachment[]
}

function composerDraftKey(threadId: string | null | undefined, conversationId: string | null | undefined): string {
  if (threadId) return `thread:${threadId}`
  if (conversationId) return `conversation:${conversationId}`
  return '__unbound__'
}

export function Composer({
  model,
  modelOptions,
  skills,
  skillCatalogLoading = false,
  skillCatalogSize = skills.length,
  onLoadSkills,
  permissionMode,
  modelsLoading,
  modelEmptyLabel,
  sending,
  compacting,
  compactedSeq,
  promptQueue,
  workspacePath,
  availableProjects,
  hasMessages = false,
  messages,
  sessionStats,
  liveContext,
  promptBudget: _promptBudget,
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
  workspaceTrusted,
  onSetWorkspaceTrust,
  shortcuts,
  thinkingLevel = 'medium',
  onThinkingLevelChange,
  onQueueMutate,
  currentThreadId,
  conversationId,
  permissionPrompt,
  onRespondPermission,
  userQuestionPrompt,
  onAnswerUserQuestion,
  onDiscussPlanReview,
  multiAgentOrchestration = false,
  onMultiAgentOrchestrationChange,
  orchestrationChoicePrompt,
  onRespondOrchestrationChoice,
  roleMode = false,
  selectedRoleCount = 0,
  selectedRoleProfiles = [],
  roleDiscussionStrategy = 'relay',
  onRoleDiscussionStrategyChange,
  roleSummaryEnabled = false,
  onRoleSummaryEnabledChange,
  pendingInitialText,
  onClearPendingInitialText,
}: {
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
  promptQueue?: PromptQueueSnapshot
  workspacePath: string | null
  workspaceTrusted?: boolean | null
  availableProjects: { path: string; name: string }[]
  hasMessages?: boolean
  messages?: ChatMessage[]
  sessionStats?: SessionStatsSnapshot | null
  liveContext?: LiveContextUsage | null
  promptBudget?: PromptBudgetSnapshot | null
  hostPlanModeActive?: boolean | null
  hostTodos?: HostTodoItem[] | null
  onPermissionModeChange: (mode: PermissionMode) => void
  onModelChange: (model: ModelOption) => void
  thinkingLevel?: ThinkingLevel
  onThinkingLevelChange?: (level: ThinkingLevel) => void
  onSetWorkspaceTrust?: (trusted: boolean) => void | Promise<void>
  onSend: (
    message: string,
    skillName: string | null,
    workMode?: WorkMode,
    executionModeOverride?: 'single-agent' | 'multi-agent',
    attachments?: { id: string; mediaType: string; data: string; name: string }[],
    documents?: { id: string; name: string }[],
  ) => ComposerSendResult | Promise<ComposerSendResult>
  onCancel?: () => void
  onSteer?: (text: string) => ComposerSendResult | Promise<ComposerSendResult>
  onFollowUp?: (text: string) => ComposerSendResult | Promise<ComposerSendResult>
  onSearchContext?: (query: string) => Promise<WorkspaceEntry[]>
  onCreateDroppedReference?: (file: File) => Promise<WorkspaceReference | null>
  onSelectProject: (path: string) => void
  onPickWorkspace: () => void
  onDetachWorkspace: () => void
  shortcuts?: ShortcutItem[]
  onQueueMutate?: (payload: { kind: 'steering' | 'followUp'; index: number; action: 'remove' | 'update'; text?: string }) => void
  currentThreadId?: string | null
  conversationId?: string | null
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
  roleMode?: boolean
  selectedRoleCount?: number
  selectedRoleProfiles?: RoleProfile[]
  roleDiscussionStrategy?: RoleDiscussionStrategy
  onRoleDiscussionStrategyChange?: (strategy: RoleDiscussionStrategy) => void
  roleSummaryEnabled?: boolean
  onRoleSummaryEnabledChange?: (enabled: boolean) => void
  pendingInitialText?: string | null
  onClearPendingInitialText?: () => void
}) {
  const [value, setValue] = useState('')
  const valueRef = useRef(value)
  const draftRevisionRef = useRef(0)
  const [workMode, setWorkMode] = useState<WorkMode>('code')
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [plusMenuOpen, setPlusMenuOpen] = useState(false)
  const plusMenuRef = useRef<HTMLDivElement>(null)

  const contextPercent = liveContext?.contextPercent ?? sessionStats?.contextPercent ?? null
  const activeDraftKey = composerDraftKey(currentThreadId, conversationId)
  const activeDraftKeyRef = useRef(activeDraftKey)
  activeDraftKeyRef.current = activeDraftKey
  const conversationIdRef = useRef(conversationId)
  useEffect(() => { conversationIdRef.current = conversationId }, [conversationId])

  const textareaRef = useAutosizeTextarea(value, 38, 132)
  const mentionHighlightRef = useRef<HTMLDivElement>(null)
  const roleMentionRanges = useMemo(
    () => roleMode ? findRoleMentionRanges(value, selectedRoleProfiles) : [],
    [roleMode, selectedRoleProfiles, value],
  )
  const hasRoleMentionHighlight = roleMentionRanges.length > 0
  const roleMentionSegments = useMemo(() => {
    if (!hasRoleMentionHighlight) return []
    const segments: Array<{ text: string; mention: boolean }> = []
    let offset = 0
    for (const range of roleMentionRanges) {
      if (range.start > offset) segments.push({ text: value.slice(offset, range.start), mention: false })
      segments.push({ text: value.slice(range.start, range.end), mention: true })
      offset = range.end
    }
    if (offset < value.length) segments.push({ text: value.slice(offset), mention: false })
    return segments
  }, [hasRoleMentionHighlight, roleMentionRanges, value])
  useEffect(() => {
    if (textareaRef.current && mentionHighlightRef.current) {
      mentionHighlightRef.current.scrollTop = textareaRef.current.scrollTop
    }
  }, [hasRoleMentionHighlight, value])
  const draftsMapRef = useRef<Map<string, string>>(new Map())
  const failedDraftsRef = useRef<Map<string, ComposerDraftSnapshot>>(new Map())
  const [failedDraftRevision, setFailedDraftRevision] = useState(0)
  const submissionsInFlightRef = useRef(new Set<string>())
  const prevThreadIdRef = useRef<string | null>(currentThreadId ?? null)
  const historyIndexRef = useRef<number>(-1)
  const draftRef = useRef<string>('')

  const setComposerValue = (next: string | ((previous: string) => string)) => {
    const nextValue = typeof next === 'function' ? next(valueRef.current) : next
    valueRef.current = nextValue
    draftRevisionRef.current += 1
    setValue(nextValue)
  }

  useEffect(() => {
    if (pendingInitialText) {
      setComposerValue(pendingInitialText)
      onClearPendingInitialText?.()
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.focus()
          const len = pendingInitialText.length
          textareaRef.current.setSelectionRange(len, len)
        }
      })
    }
  }, [pendingInitialText, onClearPendingInitialText])

  // 附件管理 Hook
  const {
    attachments,
    attachmentsRef,
    documents,
    documentsRef,
    documentConversationIdRef,
    imageProblems,
    suggestedVisionModel,
    attachmentNotice,
    setAttachmentNotice,
    hasAttachments,
    addImageFiles,
    pickAttachments,
    addDroppedDocumentFile,
    removeImage,
    removeDocument,
    clearAttachments,
    restoreAttachments,
  } = useComposerAttachments({
    conversationId,
    model,
    modelOptions,
    onDraftRevision: () => { draftRevisionRef.current += 1 },
    onInsertReference: (ref) => insertReference(ref),
  })

  // 自动补全 Hook
  const {
    skillQuery,
    setSkillQuery,
    contextQuery,
    setContextQuery,
    roleMentionQuery,
    setRoleMentionQuery,
    contextEntries,
    activeSkillIndex,
    activeContextIndex,
    activeRoleMentionIndex,
    matchingCommands,
    matchingSkills,
    matchingRoleProfiles,
    updateCommandQuery,
    chooseCommand,
    chooseSkill,
    chooseRoleMention,
    insertReference,
    openContextMenu,
    handleKeyDownForAutocomplete,
  } = useComposerAutocomplete({
    value,
    setValue: setComposerValue,
    skills,
    roleMode,
    selectedRoleProfiles,
    textareaRef,
    onSearchContext: onSearchContext ?? (async () => []),
    onMultiAgentOrchestrationChange,
    onWorkModeChange: setWorkMode,
    onSelectedSkillChange: setSelectedSkill,
  })

  // 加载 Skill 目录
  const slashMenuWasOpenRef = useRef(false)
  useEffect(() => {
    const isOpen = Boolean(skillQuery)
    if (isOpen && !slashMenuWasOpenRef.current && skillCatalogSize === 0) {
      void onLoadSkills?.()
    }
    slashMenuWasOpenRef.current = isOpen
  }, [onLoadSkills, skillCatalogSize, Boolean(skillQuery)])

  // 切换会话时保存/恢复当前草稿
  useEffect(() => {
    const prevId = prevThreadIdRef.current
    const nextId = currentThreadId ?? null
    if (prevId !== nextId) {
      if (prevId) {
        draftsMapRef.current.set(prevId, value)
      }
      setComposerValue(nextId ? (draftsMapRef.current.get(nextId) ?? '') : '')
      setWorkMode('code')
      setSelectedSkill(null)
      setSkillQuery(null)
      setContextQuery(null)
      setRoleMentionQuery(null)
      clearAttachments()
      const staleDocuments = documentsRef.current
      const staleConversationId = documentConversationIdRef.current
      if (staleDocuments.length > 0 && staleConversationId) {
        void getBridge()?.chat?.releaseDocuments?.(staleDocuments.map((d) => d.id), staleConversationId)
      }
      setAttachmentNotice(null)
      historyIndexRef.current = -1
      draftRef.current = ''
      prevThreadIdRef.current = nextId
    }
  }, [currentThreadId])

  // 点击外部收起 Plus 菜单
  useEffect(() => {
    if (!plusMenuOpen) return
    const dismiss = (event: MouseEvent) => {
      if (event.target instanceof Node && !plusMenuRef.current?.contains(event.target)) {
        setPlusMenuOpen(false)
      }
    }
    window.addEventListener('mousedown', dismiss)
    return () => window.removeEventListener('mousedown', dismiss)
  }, [plusMenuOpen])

  const userHistory = useMemo(() => {
    return (messages || [])
      .filter((m) => m.author === 'user' && m.text && m.text.trim())
      .map((m) => m.text)
  }, [messages])

  const followUpShortcut = useMemo(() => {
    const item = shortcuts?.find((s) => s.id === 'follow-up')
    return item ? item.keys : [ALT_MODIFIER_KEY, '↩']
  }, [shortcuts])

  const steerShortcut = useMemo(() => {
    const item = shortcuts?.find((s) => s.id === 'steer')
    return item ? item.keys : DEFAULT_STEER_KEYS
  }, [shortcuts])

  const sendShortcut = useMemo(() => {
    const item = shortcuts?.find((s) => s.id === 'send')
    return item ? item.keys : ['↩']
  }, [shortcuts])

  const steerHasOwnShortcut = steerShortcut.length > 0 &&
    (steerShortcut.length !== sendShortcut.length || steerShortcut.some((key, index) => key !== sendShortcut[index]))

  const newLineShortcut = useMemo(() => {
    const item = shortcuts?.find((s) => s.id === 'new-line')
    return item ? item.keys : ['⇧', '↩']
  }, [shortcuts])

  const selectedSkillOption = skills.find((skill) => skill.name === selectedSkill)
  useEffect(() => {
    if (selectedSkill && !selectedSkillOption) setSelectedSkill(null)
  }, [selectedSkill, selectedSkillOption])

  const createDraftSnapshot = (text = valueRef.current): ComposerDraftSnapshot => ({
    key: activeDraftKey,
    revision: draftRevisionRef.current,
    threadId: currentThreadId ?? null,
    conversationId: conversationId ?? null,
    text,
    selectedSkill,
    attachments: attachmentsRef.current.map((image) => ({
      ...image,
      previewUrl: image.previewUrl?.startsWith('blob:')
        ? `data:${image.mediaType};base64,${image.data}`
        : image.previewUrl,
    })),
    documents: [...documentsRef.current],
  })

  const resetComposerForSubmission = () => {
    setComposerValue('')
    setSelectedSkill(null)
    setSkillQuery(null)
    setContextQuery(null)
    clearAttachments()
  }

  const restoreDraftSnapshot = (snapshot: ComposerDraftSnapshot) => {
    setComposerValue(snapshot.text)
    setSelectedSkill(snapshot.selectedSkill)
    restoreAttachments(snapshot.attachments, snapshot.documents, snapshot.conversationId)
  }

  const dispatchWithDraftRecovery = async (
    snapshot: ComposerDraftSnapshot,
    dispatch: () => ComposerSendResult | Promise<ComposerSendResult>,
  ) => {
    const submissionKey = composerSubmissionKey(snapshot.key, snapshot.revision)
    if (submissionsInFlightRef.current.has(submissionKey)) {
      setAttachmentNotice('这条消息正在发送，请勿重复提交。')
      return
    }
    submissionsInFlightRef.current.add(submissionKey)
    resetComposerForSubmission()
    const clearedRevision = draftRevisionRef.current
    try {
      let result: ComposerSendResult
      try {
        result = await dispatch()
      } catch {
        result = 'uncertain'
      }
      const sameDraftTarget = isSameComposerDraftTarget(
        activeDraftKeyRef.current,
        conversationIdRef.current,
        snapshot.key,
        snapshot.conversationId,
      )
      if (result !== false && result !== 'uncertain') {
        if (sameDraftTarget) setAttachmentNotice(null)
        return
      }

      const untouchedSinceSubmit = draftRevisionRef.current === clearedRevision
      if (shouldAutoRestoreFailedDraft(result === 'uncertain' ? 'uncertain' : 'rejected', sameDraftTarget, untouchedSinceSubmit)) {
        restoreDraftSnapshot(snapshot)
      } else {
        failedDraftsRef.current.set(snapshot.key, snapshot)
        setFailedDraftRevision((revision) => revision + 1)
      }
    } finally {
      submissionsInFlightRef.current.delete(submissionKey)
    }
  }

  const dispatchRunningMessage = (behavior: 'steer' | 'followUp', text = valueRef.current.trim()) => {
    if (!text) return
    if (attachmentsRef.current.length > 0 || documentsRef.current.length > 0) {
      setAttachmentNotice('任务运行期间暂不支持追加附件，请等待本轮完成后发送。')
      return
    }
    const handler = behavior === 'steer' ? onSteer : onFollowUp
    if (!handler) {
      setAttachmentNotice(behavior === 'steer' ? '当前模式暂不支持插话纠偏。' : '当前无法添加补充消息，请稍后重试。')
      return
    }
    const snapshot = createDraftSnapshot()
    void dispatchWithDraftRecovery(snapshot, () => handler(text))
  }

  const restoreFailedDraft = (key: string) => {
    const snapshot = failedDraftsRef.current.get(key)
    if (!snapshot) return
    if (valueRef.current.trim() || attachmentsRef.current.length > 0 || documentsRef.current.length > 0) {
      return
    }
    if (conversationIdRef.current !== snapshot.conversationId) {
      return
    }
    restoreDraftSnapshot(snapshot)
    failedDraftsRef.current.delete(key)
    setFailedDraftRevision((revision) => revision + 1)
    setAttachmentNotice(null)
  }

  const discardFailedDraft = (key: string) => {
    const snapshot = failedDraftsRef.current.get(key)
    if (!snapshot) return
    if (snapshot.documents.length && snapshot.conversationId) {
      void getBridge()?.chat?.releaseDocuments?.(
        snapshot.documents.map((document) => document.id),
        snapshot.conversationId,
      ).catch(() => {})
    }
    failedDraftsRef.current.delete(key)
    setFailedDraftRevision((revision) => revision + 1)
  }

  const retainedFailedDraft = useMemo(
    () => failedDraftsRef.current.get(activeDraftKey) ?? null,
    [activeDraftKey, failedDraftRevision],
  )
  const composerIsEmpty = !value.trim() && attachments.length === 0 && documents.length === 0

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (orchestrationChoicePrompt) return
    const raw = value.trim()
    if (!raw && !hasAttachments) return

    if (sending && hasAttachments) {
      setAttachmentNotice('当前消息仍在发送，请等待完成后再发送附件。')
      return
    }
    const firstImageProblem = imageProblems.values().next().value
    if (firstImageProblem) {
      setAttachmentNotice(firstImageProblem)
      return
    }
    if (!roleMode && attachments.length > 0 && model?.vision === false) {
      setAttachmentNotice('当前模型不支持图片输入，请切换到视觉模型或移除图片。')
      return
    }
    if (!roleMode && attachments.length > 0 && model?.vision === undefined) {
      setAttachmentNotice('当前模型未声明视觉能力，Host 可能会拒绝图片；正在按 Host 校验结果处理。')
    } else {
      setAttachmentNotice(null)
    }

    historyIndexRef.current = -1
    draftRef.current = ''

    if (!hasAttachments && (raw.toLowerCase() === '/compact' || raw.toLowerCase().startsWith('/compact '))) {
      const snapshot = createDraftSnapshot()
      void dispatchWithDraftRecovery(snapshot, () => onSend(raw, null, 'code'))
      return
    }

    const planLower = raw.toLowerCase()
    if (!hasAttachments && (planLower === '/plan' || planLower === '/plan off' || planLower.startsWith('/plan '))) {
      const snapshot = createDraftSnapshot()
      void dispatchWithDraftRecovery(snapshot, () => onSend(raw, null, 'code'))
      return
    }

    let effectiveMode = workMode
    let message = raw

    if (!hasAttachments && raw.toLowerCase() === '/goal') {
      setWorkMode('goal')
      setComposerValue('')
      return
    }
    if (!hasAttachments && raw.toLowerCase() === '/code') {
      setWorkMode('code')
      setComposerValue('')
      return
    }

    const multiLower = raw.toLowerCase()
    if (!hasAttachments && (multiLower === '/multi' || multiLower === '/multi on')) {
      onMultiAgentOrchestrationChange?.(true)
      setComposerValue('')
      return
    }
    if (!hasAttachments && multiLower === '/multi off') {
      onMultiAgentOrchestrationChange?.(false)
      setComposerValue('')
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

    const snapshot = createDraftSnapshot()
    if (sending) {
      dispatchRunningMessage(roleMode ? 'steer' : 'followUp', message)
      return
    }

    const executionOverride =
      effectiveMode === 'goal' || multiAgentOrchestration ? 'multi-agent' : undefined
    void dispatchWithDraftRecovery(snapshot, () => onSend(
      message,
      selectedSkill,
      effectiveMode,
      executionOverride,
      snapshot.attachments.map(({ id, mediaType, data, name }) => ({ id, mediaType, data, name })),
      snapshot.documents.map(({ id, name }) => ({ id, name })),
    ))
  }

  const commandOpen = Boolean(skillQuery || contextQuery || roleMentionQuery)
  const activeOptionId = skillQuery
    ? (activeSkillIndex < matchingCommands.length ? `slash-cmd-${activeSkillIndex}` : `slash-skill-${activeSkillIndex}`)
    : roleMentionQuery && matchingRoleProfiles[activeRoleMentionIndex]
      ? `role-mention-${activeRoleMentionIndex}`
    : contextQuery && contextEntries[activeContextIndex]
      ? `context-command-${activeContextIndex}`
      : undefined

  const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = event.clipboardData?.items
    if (!items || items.length === 0) return
    const imageFiles: File[] = []
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (file) imageFiles.push(file)
      }
    }
    if (imageFiles.length === 0) return

    event.preventDefault()
    void addImageFiles(imageFiles, 'paste')
  }

  return (
    <div className="composer-shell" data-testid="composer">
      <ComposerDocks
        roleMode={roleMode}
        conversationKey={conversationId ?? currentThreadId ?? null}
        contextPercent={contextPercent}
        sending={sending}
        compacting={compacting}
        compactedSeq={compactedSeq}
        onCompact={() => void onSend('/compact', null, 'code')}
        hostTodos={hostTodos}
        orchestrationChoicePrompt={orchestrationChoicePrompt}
        onRespondOrchestrationChoice={onRespondOrchestrationChoice}
        permissionPrompt={permissionPrompt}
        onRespondPermission={onRespondPermission}
        userQuestionPrompt={userQuestionPrompt}
        onAnswerUserQuestion={onAnswerUserQuestion}
        onDiscussPlanReview={onDiscussPlanReview}
        promptQueue={promptQueue}
        onQueueMutate={onQueueMutate}
        hasMessages={hasMessages}
        workspacePath={workspacePath}
        workspaceTrusted={workspaceTrusted}
        availableProjects={availableProjects}
        onSelectProject={onSelectProject}
        onPickWorkspace={onPickWorkspace}
        onDetachWorkspace={onDetachWorkspace}
        onSetWorkspaceTrust={onSetWorkspaceTrust}
      />

      <form
        className={`composer ${dragging ? 'is-dragging' : ''}`}
        onSubmit={submit}
        onDragEnter={(event) => { event.preventDefault(); setDragging(true) }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false)
        }}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          const files = [...event.dataTransfer.files]
          const isImageFile = (file: File) => file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(file.name)
          const imageFiles = files.filter(isImageFile)
          const otherFiles = files.filter((file) => !isImageFile(file))
          if (imageFiles.length) void addImageFiles(imageFiles, 'drop')
          if (otherFiles.length) {
            void (async () => {
              for (const file of otherFiles) {
                if (/\.(pdf|pptx?|docx?|xlsx?)$/i.test(file.name)) {
                  try {
                    await addDroppedDocumentFile(file)
                  } catch (error) {
                    setAttachmentNotice(error instanceof Error ? error.message : String(error))
                  }
                  continue
                }
                if (onCreateDroppedReference) {
                  const reference = await onCreateDroppedReference(file)
                  if (reference) insertReference(reference)
                  else setAttachmentNotice(`${file.name || '此文件'}无法作为工作区引用添加；附件入口支持图片、PDF 和 Office 文档。`)
                } else {
                  setAttachmentNotice(`${file.name || '此文件'}无法作为工作区引用添加；附件入口支持图片、PDF 和 Office 文档。`)
                }
              }
            })()
          }
        }}
      >
        <ComposerAttachmentsPreview
          attachments={attachments}
          documents={documents}
          imageProblems={imageProblems}
          onRemoveImage={removeImage}
          onRemoveDocument={removeDocument}
        />

        <label className="sr-only" htmlFor="main-message">
          {roleMode ? '给所选 Bot 发送工作要求' : '给主控 Agent 发送消息'}
        </label>
        <div className="composer-input-wrap">
          {hasRoleMentionHighlight && (
            <div ref={mentionHighlightRef} className="composer-mention-highlight" aria-hidden="true">
              {roleMentionSegments.map((segment, index) => segment.mention
                ? <span className="composer-role-mention-text" key={'mention-' + index}>{segment.text}</span>
                : <span key={'text-' + index}>{segment.text}</span>)}
            </div>
          )}
        <textarea
          ref={textareaRef}
          rows={1}
          id="main-message"
          className={hasRoleMentionHighlight ? 'composer-input--mentions' : undefined}
          data-testid="message-input"
          value={value}
          disabled={Boolean(orchestrationChoicePrompt)}
          onPaste={handlePaste}
          role="combobox"
          aria-label={roleMode ? '向 Bot 群聊发送消息' : '给主控 Agent 发送消息'}
          aria-autocomplete="list"
          aria-expanded={commandOpen}
          aria-controls={
            skillQuery ? 'skill-command-options' : roleMentionQuery ? 'role-mention-options' : contextQuery ? 'context-command-options' : undefined
          }
          aria-activedescendant={activeOptionId}
          onChange={(event) => {
            const nextVal = event.target.value
            setComposerValue(nextVal)
            if (historyIndexRef.current >= 0) {
              historyIndexRef.current = -1
            }
            updateCommandQuery(nextVal, event.target.selectionStart)
          }}
          onClick={(event) => updateCommandQuery(event.currentTarget.value, event.currentTarget.selectionStart)}
          onKeyUp={(event) => {
            if (!['ArrowUp', 'ArrowDown', 'Escape', 'Enter'].includes(event.key)) {
              updateCommandQuery(event.currentTarget.value, event.currentTarget.selectionStart)
            }
          }}
          onBlur={() => {
            setSkillQuery(null)
            setContextQuery(null)
            setRoleMentionQuery(null)
          }}
          onScroll={(event) => {
            if (mentionHighlightRef.current) {
              mentionHighlightRef.current.scrollTop = event.currentTarget.scrollTop
            }
          }}
          placeholder={
            sending
              ? roleMode
                ? 'Bot 正在协作；输入后可立即纠偏当前任务'
                : `任务运行中：↑ 排队补充 · ${steerShortcut.join('')} 插话纠偏`
              : roleMode
                ? (selectedRoleCount === 0
                  ? '先从左侧选择 Bot，再开始群聊'
                  : selectedRoleCount === 1
                    ? `给 ${selectedRoleProfiles[0]?.name ?? 'Bot'} 发消息…`
                    : `由 ${selectedRoleProfiles[0]?.name ?? '主 Bot'} 默认接话；输入 @ 邀请其他成员`)
                : '输入消息…'
          }
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return

            // 先让 autocomplete 处理上下键与回车
            const autocompleteHandled = handleKeyDownForAutocomplete(event)
            if (autocompleteHandled) return

            if (matchesKeys(event, newLineShortcut)) {
              event.preventDefault()
              const textarea = event.currentTarget
              const start = textarea.selectionStart
              const end = textarea.selectionEnd
              const nextValue = `${value.slice(0, start)}\n${value.slice(end)}`
              const nextCursor = start + 1
              setComposerValue(nextValue)
              updateCommandQuery(nextValue, nextCursor)
              requestAnimationFrame(() => {
                textarea.focus()
                textarea.setSelectionRange(nextCursor, nextCursor)
              })
              return
            }

            // 历史记录向上检索
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
                setComposerValue(historicalText)
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

            // 历史记录向下检索
            if (!commandOpen && event.key === 'ArrowDown') {
              if (historyIndexRef.current >= 0) {
                event.preventDefault()
                const nextIndex = historyIndexRef.current - 1
                historyIndexRef.current = nextIndex
                const targetText = nextIndex < 0 ? (draftRef.current || '') : userHistory[userHistory.length - 1 - nextIndex]
                setComposerValue(targetText)
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
              if (sending) {
                dispatchRunningMessage(roleMode ? 'steer' : 'followUp', text)
              } else {
                event.currentTarget.form?.requestSubmit()
              }
              return
            }

            if (steerHasOwnShortcut && matchesKeys(event, steerShortcut)) {
              event.preventDefault()
              const text = value.trim()
              if (!text) return
              if (sending) {
                dispatchRunningMessage('steer', text)
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
                dispatchRunningMessage(roleMode ? 'steer' : 'followUp', text)
              } else {
                event.currentTarget.form?.requestSubmit()
              }
            }
          }}
        />
        </div>

        <ComposerAutocompleteMenu
          skillQuery={skillQuery}
          matchingCommands={matchingCommands}
          matchingSkills={matchingSkills}
          activeSkillIndex={activeSkillIndex}
          skillCatalogLoading={skillCatalogLoading}
          skillCatalogSize={skillCatalogSize}
          onChooseCommand={chooseCommand}
          onChooseSkill={chooseSkill}
          roleMentionQuery={roleMentionQuery}
          matchingRoleProfiles={matchingRoleProfiles}
          activeRoleMentionIndex={activeRoleMentionIndex}
          selectedRoleProfiles={selectedRoleProfiles}
          onChooseRoleMention={chooseRoleMention}
          contextQuery={contextQuery}
          contextEntries={contextEntries}
          activeContextIndex={activeContextIndex}
          onChooseContext={insertReference}
        />

        {dragging && (
          <div className="composer-drop-overlay">
            <FolderOpen size={20} />
            <span>松开以添加图片、文档或引用工作区文件</span>
          </div>
        )}

        {attachmentNotice && <div className="composer-vision-warning" role="alert">{attachmentNotice}</div>}

        {retainedFailedDraft && (
          <div className="composer-failed-draft-actions" role="group" aria-label="失败草稿操作">
            <button type="button" disabled={!composerIsEmpty} onClick={() => restoreFailedDraft(activeDraftKey)}>
              恢复草稿
            </button>
            <button type="button" onClick={() => discardFailedDraft(activeDraftKey)}>
              丢弃
            </button>
          </div>
        )}

        {!roleMode && attachments.length > 0 && model?.vision === false && (
          <div className="composer-vision-warning" role="status">
            <span>当前模型不支持图片输入。请切换到视觉模型，或移除图片。</span>
            {suggestedVisionModel && (
              <button type="button" onClick={() => onModelChange(suggestedVisionModel)}>
                切换到 {suggestedVisionModel.name}
              </button>
            )}
            <button type="button" onClick={() => { for (const image of attachmentsRef.current) removeImage(image.id) }}>
              移除图片
            </button>
          </div>
        )}

        {!roleMode && attachments.length > 0 && model?.vision === undefined && (
          <div className="composer-vision-warning" role="status">
            当前模型未声明视觉能力，可能无法处理图片；发送后由 Host 校验。
          </div>
        )}

        <div className="composer-footer">
          <div className="composer-left">
            <div className="composer-plus-dropdown-wrap" ref={plusMenuRef}>
              <button
                type="button"
                className={`composer-icon composer-plus-btn ${plusMenuOpen ? 'active' : ''}`}
                aria-label="添加附件或引用"
                title="添加附件或引用"
                onClick={() => setPlusMenuOpen((prev) => !prev)}
                disabled={Boolean(orchestrationChoicePrompt)}
              >
                <Plus size={18} />
              </button>
              {plusMenuOpen && (
                <div className="composer-plus-menu" role="menu">
                  <button
                    type="button"
                    className="composer-plus-menu-item"
                    onClick={() => {
                      setPlusMenuOpen(false)
                      void pickAttachments()
                    }}
                  >
                    <Paperclip size={14} />
                    <span>添加图片或文档</span>
                  </button>
                  <button
                    type="button"
                    className="composer-plus-menu-item"
                    onClick={() => {
                      setPlusMenuOpen(false)
                      openContextMenu()
                    }}
                  >
                    <FileText size={14} />
                    <span>引用文件或上下文 (@)</span>
                  </button>
                </div>
              )}
            </div>

            <PermissionSelect value={permissionMode} onChange={onPermissionModeChange} />

            {!roleMode && hostPlanModeActive === true && (
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

            {!roleMode && workMode === 'goal' && (
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

            {!roleMode && workMode !== 'goal' && multiAgentOrchestration && (
              <button
                type="button"
                className="selected-skill-chip mode-chip goal"
                onClick={() => onMultiAgentOrchestrationChange?.(false)}
                title="当前为常规多 Agent 编排。点击恢复单 Agent。"
              >
                <Users size={13} />
                <span>多 Agent</span>
                <X size={13} />
              </button>
            )}

            {!roleMode && selectedSkillOption && (
              <button
                type="button"
                className="selected-skill-chip"
                onClick={() => setSelectedSkill(null)}
                title="移除本次 Skill"
              >
                <Sparkles size={13} />
                <span>{selectedSkillOption.name}{selectedSkillOption.multiAgent ? ' · 多 Agent' : ''}</span>
                <X size={13} />
              </button>
            )}
          </div>

          <div className="composer-right">
            {roleMode ? (
              <>
                {selectedRoleCount > 1 && (
                  <div className="role-discussion-controls" aria-label="本轮 Bot 协作方式">
                    <div className="role-discussion-segment" role="group" aria-label="回答策略">
                      <button
                        type="button"
                        className={roleDiscussionStrategy === 'relay' ? 'is-active' : ''}
                        aria-pressed={roleDiscussionStrategy === 'relay'}
                        title="后续 Bot 会参考前序回答并补充或提出分歧"
                        onClick={() => onRoleDiscussionStrategyChange?.('relay')}
                      >接力</button>
                      <button
                        type="button"
                        className={roleDiscussionStrategy === 'independent' ? 'is-active' : ''}
                        aria-pressed={roleDiscussionStrategy === 'independent'}
                        title="Bot 并行回答，不读取本轮其他 Bot 的回答"
                        onClick={() => onRoleDiscussionStrategyChange?.('independent')}
                      >独立</button>
                    </div>
                    <button
                      type="button"
                      className={`role-summary-toggle${roleSummaryEnabled ? ' is-active' : ''}`}
                      aria-pressed={roleSummaryEnabled}
                      title={selectedRoleCount < 2 ? '至少选择两个 Bot 才能汇总' : '完成后由主 Bot 汇总共识、分歧和建议'}
                      disabled={selectedRoleCount < 2}
                      onClick={() => onRoleSummaryEnabledChange?.(!roleSummaryEnabled)}
                    >
                      <Sparkles size={12} />汇总
                    </button>
                  </div>
                )}
                {selectedRoleCount <= 1 && (
                  <span className="role-composer-model-hint">
                    {selectedRoleCount === 0 ? '先在顶部添加 Bot' : '使用 Bot 绑定的模型'}
                  </span>
                )}
              </>
            ) : (
              <ModelSelect
                value={model}
                options={modelOptions}
                loading={modelsLoading}
                emptyLabel={modelEmptyLabel}
                onChange={onModelChange}
                thinkingLevel={thinkingLevel}
                onThinkingLevelChange={onThinkingLevelChange}
              />
            )}
            <button type="button" className="composer-icon mic-button" aria-label="语音输入" title="语音输入">
              <Mic size={18} />
            </button>
            {sending ? (
              <>
                {!roleMode && onFollowUp && (
                  <button
                    type="button"
                    className="send-button follow-up"
                    data-testid="queue-follow-up"
                    aria-label="排队补充消息"
                    title="排队补充消息"
                    disabled={!value.trim() || hasAttachments}
                    onClick={() => dispatchRunningMessage('followUp')}
                  >
                    <ArrowUp size={15} />
                  </button>
                )}
                {onSteer && (
                  <button
                    type="button"
                    className="send-button steer"
                    data-testid="steer-message"
                    aria-label={roleMode ? '纠偏当前运行中的 Bot' : '插话纠偏'}
                    title={roleMode ? '纠偏当前运行中的 Bot' : `插话纠偏（${steerShortcut.join('')}）`}
                    disabled={!value.trim() || hasAttachments}
                    onClick={() => dispatchRunningMessage('steer')}
                  >
                    纠偏
                  </button>
                )}
                <button
                  type="button"
                  className="send-button stop"
                  aria-label="停止生成"
                  title="停止生成"
                  onClick={onCancel}
                >
                  <Square size={12} fill="currentColor" />
                </button>
              </>
            ) : (
              <button
                className="send-button"
                data-testid="send-message"
                aria-label="发送消息"
                disabled={
                  (roleMode ? selectedRoleCount < 1 : !model) ||
                  (!value.trim() && !hasAttachments) ||
                  (!roleMode && imageProblems.size > 0) ||
                  (!roleMode && attachments.length > 0 && model?.vision === false)
                }
              >
                <ArrowUp size={16} />
              </button>
            )}
          </div>
        </div>
      </form>

      {!roleMode && (
        <ConversationUsageFooter
          messages={messages ?? []}
          sessionStats={sessionStats}
          liveContext={liveContext}
          modelContextWindow={model?.contextWindow}
        />
      )}
    </div>
  )
}
