import {
  ArrowUp,
  FileText,
  Folder,
  FolderOpen,
  ListTodo,
  Mic,
  Package,
  Plus,
  Sparkles,
  Square,
  Target,
  Users,
  X,
} from 'lucide-react'
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import type {
  BusyEnterMode,
  LiveContextUsage,
  PermissionMode,
  PermissionPromptPayload,
  PromptBudgetSnapshot,
  PromptQueueSnapshot,
  SessionStatsSnapshot,
  SkillOption,
  UserQuestionAnswer,
  UserQuestionPromptPayload,
  HostTodoItem,
  WorkMode,
  WorkspaceEntry,
  WorkspaceReference,
} from '../../shared/app-api'
import { skillOptionSourceLabel } from '../../shared/app-api'
import type { ChatMessage, ModelOption, ThinkingLevel } from '../../types'
import { ApprovalPanel } from '../chat/ApprovalPanel'
import { CompactSuggestBanner } from '../chat/CompactSuggestBanner'
import { ComposerContextMeter } from '../chat/ComposerContextMeter'
import { HostTodoProjection } from '../chat/HostTodoProjection'
import { QueueDock } from '../chat/QueueDock'
import { UserQuestionPanel } from '../chat/UserQuestionPanel'
import { skillDescriptionBlurb } from '../skills/skillDescription'
import { matchesKeys, type ShortcutItem } from '../../shared/shortcuts'
import { useAutosizeTextarea } from '../../shared/ui-utils'
import { ConversationUsageFooter } from './ConversationUsageFooter'
import { ModelSelect } from './ModelSelect'
import { PermissionSelect } from './PermissionSelect'
import { ProjectSelector } from './ProjectSelector'
import { BUILTIN_SLASH_COMMANDS, findContextQuery, findSkillQuery, type SlashCommandItem } from './slashCommands'

export function Composer({
  model,
  modelOptions,
  skills,
  skillCatalogLoading = false,
  skillCatalogSize = skills.length,
  onLoadSkills,
  permissionMode,
  modelsLoading,
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
  promptBudget,
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
  busyEnterMode = 'followUp',
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
  ) => void
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
}) {
  const [value, setValue] = useState('')
  const [workMode, setWorkMode] = useState<WorkMode>('code')
  const contextPercent = liveContext?.contextPercent ?? sessionStats?.contextPercent ?? null
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
    if (cmd.id === 'multi-on') {
      onMultiAgentOrchestrationChange?.(true)
      setSkillQuery(null)
      setValue('')
      return
    }
    if (cmd.id === 'multi-off') {
      onMultiAgentOrchestrationChange?.(false)
      setSkillQuery(null)
      setValue('')
      return
    }
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

    const multiLower = raw.toLowerCase()
    if (multiLower === '/multi' || multiLower === '/multi on') {
      onMultiAgentOrchestrationChange?.(true)
      setValue('')
      return
    }
    if (multiLower === '/multi off') {
      onMultiAgentOrchestrationChange?.(false)
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

    const executionOverride =
      effectiveMode === 'goal' || multiAgentOrchestration ? 'multi-agent' : undefined
    onSend(message, selectedSkill, effectiveMode, executionOverride)
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
    void (async () => {
      for (const file of imageFiles) {
        let reference = await onCreateDroppedReference(file)
        if (!reference && window.taskweaver?.workspace?.saveClipboardImage) {
          try {
            const reader = new FileReader()
            const base64 = await new Promise<string>((resolve, reject) => {
              reader.onload = () => {
                const res = reader.result as string
                const b64 = res.split(',')[1] || ''
                resolve(b64)
              }
              reader.onerror = reject
              reader.readAsDataURL(file)
            })
            if (base64) {
              const ext = file.type === 'image/jpeg' ? '.jpg' : file.type === 'image/webp' ? '.webp' : '.png'
              const filename = `paste-${Date.now()}-${Math.random().toString(36).slice(2, 6)}${ext}`
              const saved = await window.taskweaver.workspace.saveClipboardImage({
                base64,
                mimeType: file.type || 'image/png',
                filename,
              })
              if (saved?.ok && saved.data) {
                reference = saved.data
              }
            }
          } catch (err) {
            console.error('[Composer] 保存剪贴板图片失败:', err)
          }
        }
        if (reference) insertReference(reference)
      }
    })()
  }

  const queue = promptQueue ?? { steering: [], followUp: [] }

  return (
    <div className="composer-shell">
      <CompactSuggestBanner
        conversationKey={conversationId ?? currentThreadId ?? null}
        contextPercent={contextPercent}
        sending={sending}
        compacting={compacting}
        compactedSeq={compactedSeq}
        onCompact={() => onSend('/compact', null, 'code')}
      />
      <HostTodoProjection items={hostTodos ?? null} />
      {permissionPrompt && onRespondPermission && (
        <div className="composer-approval-slot">
          <ApprovalPanel prompt={permissionPrompt} onRespond={onRespondPermission} />
        </div>
      )}
      {userQuestionPrompt && onAnswerUserQuestion && (
        <div className="composer-approval-slot">
          <UserQuestionPanel prompt={userQuestionPrompt} onAnswer={onAnswerUserQuestion} onDiscuss={onDiscussPlanReview} />
        </div>
      )}
      {sending && onQueueMutate && (
        <QueueDock queue={queue} sending={sending} onMutate={(payload) => { void onQueueMutate(payload) }} />
      )}
      {!hasMessages && (
        <ProjectSelector
          currentWorkspace={workspacePath}
          availableProjects={availableProjects}
          workspaceTrusted={workspaceTrusted}
          onSelectProject={onSelectProject}
          onPickWorkspace={onPickWorkspace}
          onDetachWorkspace={onDetachWorkspace}
          onSetWorkspaceTrust={onSetWorkspaceTrust}
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
        <div className="composer-input-wrap">
        <label className="sr-only" htmlFor="main-message">给主控 Agent 发送消息</label>
        <textarea ref={textareaRef} rows={1} id="main-message" value={value} onPaste={handlePaste} role="combobox" aria-autocomplete="list" aria-expanded={commandOpen} aria-controls={skillQuery ? 'skill-command-options' : contextQuery ? 'context-command-options' : undefined} aria-activedescendant={activeOptionId} onChange={(event) => {
          const nextVal = event.target.value
          setValue(nextVal)
          if (historyIndexRef.current >= 0) {
            historyIndexRef.current = -1
          }
          updateCommandQuery(nextVal, event.target.selectionStart)
        }} onClick={(event) => updateCommandQuery(event.currentTarget.value, event.currentTarget.selectionStart)} onKeyUp={(event) => {
          if (!['ArrowUp', 'ArrowDown', 'Escape', 'Enter'].includes(event.key)) updateCommandQuery(event.currentTarget.value, event.currentTarget.selectionStart)
        }} onBlur={() => { setSkillQuery(null); setContextQuery(null) }} placeholder="发消息，/ 指令，@ 引用文件" onKeyDown={(event) => {
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
        </div>
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
            {workMode !== 'goal' && multiAgentOrchestration && (
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
            <ComposerContextMeter
              liveContext={liveContext}
              sessionStats={sessionStats}
              promptBudget={promptBudget}
              messages={messages}
              onCompact={() => onSend('/compact', null, 'code')}
              compacting={compacting}
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
