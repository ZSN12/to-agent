import {
  ArrowUp,
  FileText,
  Folder,
  FolderOpen,
  ListTodo,
  Mic,
  Package,
  Paperclip,
  Plus,
  Sparkles,
  Square,
  Target,
  Users,
  X,
} from 'lucide-react'
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { getBridge } from '../app/getBridge'
import type {
  BusyEnterMode,
  ComposerDocumentAttachment,
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
import { AttachmentImagePreview } from '../chat/AttachmentImagePreview'
import {
  closestVisionModel,
  DEFAULT_IMAGE_ATTACHMENT_LIMITS,
  imageAttachmentProblems,
  localizedImageAttachmentError,
  type ComposerImage,
} from './image-attachment-validation'
import { skillDescriptionBlurb } from '../skills/skillDescription'
import { ALT_MODIFIER_KEY, matchesKeys, type ShortcutItem } from '../../shared/shortcuts'
import { useAutosizeTextarea } from '../../shared/ui-utils'
import { ConversationUsageFooter } from './ConversationUsageFooter'
import { ModelSelect } from './ModelSelect'
import { PermissionSelect } from './PermissionSelect'
import { ProjectSelector } from './ProjectSelector'
import { BUILTIN_SLASH_COMMANDS, findContextQuery, findSkillQuery, type SlashCommandItem } from './slashCommands'

function attachmentSizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
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
    attachments?: { id: string, mediaType: string, data: string, name: string }[],
    documents?: { id: string, name: string }[],
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
  const [attachments, setAttachments] = useState<ComposerImage[]>([])
  const attachmentsRef = useRef<ComposerImage[]>([])
  const [documents, setDocuments] = useState<ComposerDocumentAttachment[]>([])
  const documentsRef = useRef<ComposerDocumentAttachment[]>([])
  const documentConversationIdRef = useRef(conversationId)
  const conversationIdRef = useRef(conversationId)
  const [imageLimits, setImageLimits] = useState(DEFAULT_IMAGE_ATTACHMENT_LIMITS)
  const [attachmentNotice, setAttachmentNotice] = useState<string | null>(null)
  const imageProblems = useMemo(() => imageAttachmentProblems(attachments, imageLimits), [attachments, imageLimits])
  const suggestedVisionModel = useMemo(() => closestVisionModel(modelOptions, model), [modelOptions, model])
  const setComposerImages = (next: ComposerImage[] | ((previous: ComposerImage[]) => ComposerImage[])) => {
    const value = typeof next === 'function' ? next(attachmentsRef.current) : next
    attachmentsRef.current = value
    setAttachments(value)
  }
  const setComposerDocuments = (next: ComposerDocumentAttachment[] | ((previous: ComposerDocumentAttachment[]) => ComposerDocumentAttachment[])) => {
    const value = typeof next === 'function' ? next(documentsRef.current) : next
    documentsRef.current = value
    setDocuments(value)
  }
  const hasAttachments = attachments.length > 0 || documents.length > 0
  useEffect(() => { conversationIdRef.current = conversationId }, [conversationId])
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
    let active = true
    const bridge = getBridge()
    if (bridge?.chat?.getImageLimits) {
      void bridge.chat.getImageLimits(conversationId).then((result) => {
        if (active && result.ok && result.data) setImageLimits(result.data)
      }).catch(() => {})
    }
    return () => { active = false }
  }, [conversationId])

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
      for (const image of attachmentsRef.current) {
        if (image.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(image.previewUrl)
      }
      const staleDocuments = documentsRef.current
      const staleConversationId = documentConversationIdRef.current
      if (staleDocuments.length > 0 && staleConversationId) {
        void getBridge()?.chat?.releaseDocuments?.(staleDocuments.map(document => document.id), staleConversationId)
      }
      setComposerDocuments([])
      documentConversationIdRef.current = conversationId
      setComposerImages([])
      setAttachmentNotice(null)
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
    return item ? item.keys : [ALT_MODIFIER_KEY, '↩']
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

  const addImagePayload = async (
    payload: { mediaType: string, data: string, name: string, bytes: number },
    targetConversationId = conversationId,
  ) => {
    if (conversationIdRef.current !== targetConversationId) return
    const id = crypto.randomUUID()
    const previewUrl = `data:${payload.mediaType};base64,${payload.data}`
    const current = attachmentsRef.current
    const totalBytes = current.reduce((sum, image) => sum + image.bytes, 0) + payload.bytes
    const loadError = current.length >= imageLimits.maxImagesPerMessage
      ? `每条消息最多添加 ${imageLimits.maxImagesPerMessage} 张图片`
      : payload.bytes > imageLimits.maxImageBytes
        ? `单张图片不能超过 ${Math.ceil(imageLimits.maxImageBytes / (1024 * 1024))} MB`
        : totalBytes > imageLimits.maxMessageImageBytes
          ? `图片总大小不能超过 ${Math.ceil(imageLimits.maxMessageImageBytes / (1024 * 1024))} MB`
          : !imageLimits.mediaTypes.includes(payload.mediaType)
            ? '只支持 PNG、JPEG、WebP 和 GIF 图片'
            : null
    setComposerImages((previous) => [...previous, {
      ...payload,
      id,
      width: 0,
      height: 0,
      previewUrl,
      loading: !loadError,
      ...(loadError ? { loadError } : {}),
    }])
    if (loadError) return
    const image = new Image()
    image.src = previewUrl
    try {
      await image.decode()
      if (conversationIdRef.current !== targetConversationId) return
      setComposerImages((previous) => previous.map((item) => item.id === id
        ? { ...item, width: image.naturalWidth, height: image.naturalHeight, loading: false }
        : item))
    } catch {
      if (conversationIdRef.current !== targetConversationId) return
      setComposerImages((previous) => previous.map((item) => item.id === id
        ? { ...item, loading: false, loadError: '图片无法解码或文件已损坏' }
        : item))
    }
  }

  const addImageFiles = async (files: File[], source: 'paste' | 'drop') => {
    let skipped = 0
    for (const file of files) {
      if (conversationIdRef.current !== conversationId) break
      const current = attachmentsRef.current
      const id = crypto.randomUUID()
      const previewUrl = URL.createObjectURL(file)
      const name = file.name || `粘贴图片-${Date.now()}`
      const placeholder = (loadError: string) => setComposerImages((previous) => [...previous, {
        id,
        mediaType: file.type || 'image/png',
        data: '',
        name,
        bytes: file.size,
        width: 0,
        height: 0,
        previewUrl,
        loadError,
      }])

      if (current.length >= imageLimits.maxImagesPerMessage) {
        skipped += 1
        if (skipped <= 20) placeholder(`每条消息最多添加 ${imageLimits.maxImagesPerMessage} 张图片`)
        else URL.revokeObjectURL(previewUrl)
        continue
      }
      if (file.size > imageLimits.maxImageBytes) {
        placeholder(`单张图片不能超过 ${Math.ceil(imageLimits.maxImageBytes / (1024 * 1024))} MB`)
        continue
      }
      const currentBytes = current.reduce((sum, image) => sum + image.bytes, 0)
      if (currentBytes + file.size > imageLimits.maxMessageImageBytes) {
        placeholder(`图片总大小不能超过 ${Math.ceil(imageLimits.maxMessageImageBytes / (1024 * 1024))} MB`)
        continue
      }
      if (source === 'paste' && file.type && !imageLimits.mediaTypes.includes(file.type)) {
        placeholder('只支持 PNG、JPEG、WebP 和 GIF 图片')
        continue
      }

      try {
        let payload: { mediaType: string, data: string, name: string, bytes: number }
        if (source === 'drop') {
          const bridge = getBridge()
          if (!bridge?.chat?.readDroppedImageFile) throw new Error('主进程图片读取服务不可用')
          const result = await bridge.chat.readDroppedImageFile(file, conversationId)
          if (!result.ok) throw new Error(result.error)
          payload = result.data
        } else {
          const bytes = new Uint8Array(await file.arrayBuffer())
          let binary = ''
          for (let offset = 0; offset < bytes.length; offset += 0x8000) {
            binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length)))
          }
          payload = { mediaType: file.type || 'image/png', data: btoa(binary), name, bytes: bytes.byteLength }
        }
        URL.revokeObjectURL(previewUrl)
        if (conversationIdRef.current === conversationId) await addImagePayload(payload, conversationId)
      } catch (error) {
        if (conversationIdRef.current === conversationId) placeholder(localizedImageAttachmentError(error))
        else URL.revokeObjectURL(previewUrl)
      }
    }
    if (skipped > 0) {
      const remainder = Math.max(0, skipped - 20)
      setAttachmentNotice(`图片最多添加 ${imageLimits.maxImagesPerMessage} 张；${skipped} 张超出限制${remainder ? `，另有 ${remainder} 张未生成预览` : ''}。请移除超限项后发送。`)
    }
  }

  const pickImages = async () => {
    const bridge = getBridge()
    if (!bridge?.chat?.pickImages) {
      setAttachmentNotice('当前环境不支持选择图片附件。')
      return
    }
    try {
      const result = await bridge.chat.pickImages(conversationId)
      if (!result.ok) throw new Error(result.error)
      if (result.data.cancelled) return
      for (const image of result.data.images) await addImagePayload(image, conversationId)
      setAttachmentNotice(null)
    } catch (error) {
      setAttachmentNotice(localizedImageAttachmentError(error))
    }
  }

  const addDocumentPayload = (document: ComposerDocumentAttachment, targetConversationId = conversationId) => {
    if (conversationIdRef.current !== targetConversationId) {
      void getBridge()?.chat?.releaseDocuments?.([document.id], targetConversationId)
      return
    }
    documentConversationIdRef.current = targetConversationId
    setComposerDocuments((previous) => [...previous, document])
  }

  const addDroppedDocumentFile = async (file: File, targetConversationId = conversationId) => {
    const bridge = getBridge()
    if (!bridge?.chat?.stageDroppedDocumentFile) throw new Error('当前环境不支持添加文档附件。')
    const result = await bridge.chat.stageDroppedDocumentFile(file, targetConversationId)
    if (!result.ok) throw new Error(result.error)
    if (result.data.reference) insertReference(result.data.reference)
    else if (result.data.document) addDocumentPayload(result.data.document, targetConversationId)
    else throw new Error('主进程未返回文档附件。')
  }

  const pickAttachments = async () => {
    const bridge = getBridge()
    if (!bridge?.chat?.pickAttachments) {
      if (bridge?.chat?.pickImages) {
        await pickImages()
        return
      }
      setAttachmentNotice('当前环境不支持选择附件。')
      return
    }
    try {
      const result = await bridge.chat.pickAttachments(conversationId)
      if (!result.ok) throw new Error(result.error)
      if (result.data.cancelled) return
      for (const image of result.data.images) await addImagePayload(image, conversationId)
      for (const document of result.data.documents) addDocumentPayload(document, conversationId)
      for (const reference of result.data.references) insertReference(reference)
      setAttachmentNotice(null)
    } catch (error) {
      setAttachmentNotice(error instanceof Error ? error.message : String(error))
    }
  }

  const removeImage = (id: string) => {
    const removed = attachmentsRef.current.find((image) => image.id === id)
    if (removed?.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(removed.previewUrl)
    setComposerImages((previous) => previous.filter((image) => image.id !== id))
    setAttachmentNotice(null)
  }

  const removeDocument = (id: string) => {
    const targetConversationId = documentConversationIdRef.current
    if (targetConversationId) void getBridge()?.chat?.releaseDocuments?.([id], targetConversationId)
    setComposerDocuments((previous) => previous.filter((document) => document.id !== id))
    setAttachmentNotice(null)
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const raw = value.trim()
    if (!raw && !hasAttachments) return

    if (sending && hasAttachments) {
      setAttachmentNotice('当前消息仍在发送，请等待完成后再发送附件。')
      return
    }
    const firstImageProblem = imageAttachmentProblems(attachments, imageLimits).values().next().value
    if (firstImageProblem) {
      setAttachmentNotice(firstImageProblem)
      return
    }
    if (attachments.length > 0 && model?.vision === false) {
      setAttachmentNotice('当前模型不支持图片输入，请切换到视觉模型或移除图片。')
      return
    }
    if (attachments.length > 0 && model?.vision === undefined) {
      setAttachmentNotice('当前模型未声明视觉能力，Host 可能会拒绝图片；正在按 Host 校验结果处理。')
    } else {
      setAttachmentNotice(null)
    }

    if (currentThreadId) {
      draftsMapRef.current.delete(currentThreadId)
    }
    historyIndexRef.current = -1
    draftRef.current = ''

    if (!hasAttachments && (raw.toLowerCase() === '/compact' || raw.toLowerCase().startsWith('/compact '))) {
      onSend(raw, null, 'code')
      setValue('')
      setSelectedSkill(null)
      setSkillQuery(null)
      setContextQuery(null)
      return
    }

    const planLower = raw.toLowerCase()
    if (!hasAttachments && (planLower === '/plan' || planLower === '/plan off' || planLower.startsWith('/plan '))) {
      onSend(raw, null, 'code')
      setValue('')
      setSelectedSkill(null)
      setSkillQuery(null)
      setContextQuery(null)
      return
    }

    let effectiveMode = workMode
    let message = raw

    if (!hasAttachments && raw.toLowerCase() === '/goal') {
      setWorkMode('goal')
      setValue('')
      return
    }
    if (!hasAttachments && raw.toLowerCase() === '/code') {
      setWorkMode('code')
      setValue('')
      return
    }

    const multiLower = raw.toLowerCase()
    if (!hasAttachments && (multiLower === '/multi' || multiLower === '/multi on')) {
      onMultiAgentOrchestrationChange?.(true)
      setValue('')
      return
    }
    if (!hasAttachments && multiLower === '/multi off') {
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
    onSend(
      message,
      selectedSkill,
      effectiveMode,
      executionOverride,
      attachments.map(({ id, mediaType, data, name }) => ({ id, mediaType, data, name })),
      documents.map(({ id, name }) => ({ id, name })),
    )
    setValue('')
    setSelectedSkill(null)
    setSkillQuery(null)
    setContextQuery(null)
    setComposerImages([])
    setComposerDocuments([])
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
    void addImageFiles(imageFiles, 'paste')
  }

  const queue = promptQueue ?? { steering: [], followUp: [] }

  return (
    <div className="composer-shell" data-testid="composer">
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
              const reference = await onCreateDroppedReference(file)
              if (reference) insertReference(reference)
              else setAttachmentNotice(`${file.name || '此文件'}无法作为工作区引用添加；附件入口支持图片、PDF 和 Office 文档。`)
            }
          })()
        }
      }}>
        <div className="composer-input-wrap">
          {hasAttachments && (
            <div className="composer-attachments">
              {attachments.map(att => (
                <div key={att.id} className={`composer-attachment-item${imageProblems.has(att.id) ? ' has-error' : ''}`}>
                  {(att.previewUrl || att.data) && <AttachmentImagePreview src={att.previewUrl || `data:${att.mediaType};base64,${att.data}`} alt={att.name} />}
                  {imageProblems.has(att.id) && <span className="composer-attachment-error" role="status">{imageProblems.get(att.id)}</span>}
                  <button type="button" onClick={() => removeImage(att.id)} aria-label="移除图片">
                    <X size={12} />
                  </button>
                </div>
              ))}
              {documents.map(document => (
                <div
                  key={document.id}
                  className="composer-document-chip"
                  title={document.kind === 'doc' || document.kind === 'ppt' || document.kind === 'xls'
                    ? '旧版 Office 文档；按需读取，不会一次全部发送。读取时可能需要审批 LibreOffice 转换。'
                    : '按需读取，不会一次全部发送'}
                  data-testid="document-attachment"
                >
                  <FileText size={17} aria-hidden="true" />
                  <span className="composer-document-details">
                    <span className="composer-document-name">{document.name}</span>
                    <span className="composer-document-meta">
                      {document.kind.toUpperCase()} · {attachmentSizeLabel(document.bytes)}
                      {(document.kind === 'doc' || document.kind === 'ppt' || document.kind === 'xls') ? ' · 旧格式' : ''}
                    </span>
                  </span>
                  <button type="button" onClick={() => removeDocument(document.id)} aria-label={`移除文档 ${document.name}`}>
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        <label className="sr-only" htmlFor="main-message">给主控 Agent 发送消息</label>
          <textarea ref={textareaRef} rows={1} id="main-message" data-testid="message-input" value={value} onPaste={handlePaste} role="combobox" aria-label="给主控 Agent 发送消息" aria-autocomplete="list" aria-expanded={commandOpen} aria-controls={skillQuery ? 'skill-command-options' : contextQuery ? 'context-command-options' : undefined} aria-activedescendant={activeOptionId} onChange={(event) => {
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
        {dragging && <div className="composer-drop-overlay"><FolderOpen size={20} /><span>松开以添加图片、文档或引用工作区文件</span></div>}
        {attachmentNotice && <div className="composer-vision-warning" role="alert">{attachmentNotice}</div>}
        {attachments.length > 0 && model?.vision === false && (
          <div className="composer-vision-warning" role="status">
            <span>当前模型不支持图片输入。请切换到视觉模型，或移除图片。</span>
            {suggestedVisionModel && <button type="button" onClick={() => onModelChange(suggestedVisionModel)}>切换到 {suggestedVisionModel.name}</button>}
            <button type="button" onClick={() => { for (const image of attachmentsRef.current) removeImage(image.id) }}>移除图片</button>
          </div>
        )}
        {attachments.length > 0 && model?.vision === undefined && (
          <div className="composer-vision-warning" role="status">
            当前模型未声明视觉能力，可能无法处理图片；发送后由 Host 校验。
          </div>
        )}
        <div className="composer-footer">
          <div className="composer-left">
            <button type="button" className="composer-icon" aria-label="添加文件或上下文" title="添加文件或上下文" onClick={openContextMenu}><Plus size={23} /></button>
            <button type="button" className="composer-icon" aria-label="添加附件" title="添加图片或文档" onClick={() => void pickAttachments()} disabled={sending}><Paperclip size={18} /></button>
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
              emptyLabel={modelEmptyLabel}
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
              : <button className="send-button" data-testid="send-message" aria-label="发送消息" disabled={!model || (!value.trim() && !hasAttachments) || imageProblems.size > 0 || (attachments.length > 0 && model.vision === false)}><ArrowUp size={23} /></button>}
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
