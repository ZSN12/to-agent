import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAppBackend } from './features/app/useAppBackend'
import { SKILL_CATALOG_EVENT, useEnabledSkills } from './features/skills/useEnabledSkills'
import { useModelCatalog } from './features/models/useModelCatalog'
import type { SettingsSection } from './features/settings/SettingsPage'
import { useAppKeyboardShortcuts } from './features/app/useAppKeyboardShortcuts'
import { useInterruptedTurn } from './features/chat/useInterruptedTurn'
import {
  loadDismissedInterruptedTurnIds,
  rememberDismissedInterruptedTurn,
} from './features/chat/interrupted-turn-state'
import { DetailsPanel } from './features/chat/DetailsPanel'
import { ChangedFileReviewPanel } from './features/chat/ChangedFileReviewPanel'
import type { ChangedFileItem } from './features/chat/changed-files'
import type { PermissionMode, RewindThreadResult, RoleDiscussionStrategy, RoleProfile, RoleProfileDraft, SkillOption, ThreadSummary, ToolTraceItem, WorkMode } from './shared/app-api'
import type { ModelOption, TaskNode, ThinkingLevel } from './types'
import {
  loadShortcuts,
  saveShortcuts,
  type ShortcutItem,
} from './shared/shortcuts'
import {
  getStoredThemeMode,
  getStoredAccentColor,
  applyTheme,
} from './shared/theme'
import { AppSidebar } from './features/sidebar/AppSidebar'
import { DiffReviewCard } from './features/chat/DiffReviewCard'
import { MainConversation } from './features/chat/MainConversation'
import {
  ConversationStreamProvider,
  ConversationActionsProvider,
  type ConversationStreamState,
  type ConversationActions,
} from './features/chat/context'
import type { PanelView } from './features/chat/panel-view'
import { workspaceLabel } from './shared/ui-utils'
import { WorkbenchPanel } from './features/workbench/WorkbenchPanel'
import { useWorkbenchSessionState, type WorkbenchTabId } from './features/workbench/useWorkbenchSessionState'
import type { RoleProgressEntry } from './features/roles/RoleModeControls'
import {
  migrateLegacyRoleMembers,
  readRoleMemberships,
  removeRoleFromMemberships,
  roleMembersForConversation,
  setConversationRoleMembers,
  writeRoleMemberships,
  type RoleMemberships,
} from './features/roles/role-membership'
import { resolveRoleRecipients } from './features/roles/role-routing'
import { AppTopBar } from './features/topbar/AppTopBar'
import { useMainViewNavigation } from './features/app/useMainViewNavigation'
import { AppModals } from './features/app/AppModals'

const PluginsMarketplaceView = lazy(() => import('./features/plugins/PluginsMarketplaceView').then((module) => ({ default: module.PluginsMarketplaceView })))
const OutputLogPanel = lazy(() => import('./features/logs/OutputLogPanel').then((module) => ({ default: module.OutputLogPanel })))
const SchedulesPanel = lazy(() => import('./features/schedules/SchedulesPanel').then((module) => ({ default: module.SchedulesPanel })))
const ExploreView = lazy(() => import('./features/explore/ExploreView').then((module) => ({ default: module.ExploreView })))
const PullRequestsPanel = lazy(() => import('./features/pull-requests/PullRequestsPanel').then((module) => ({ default: module.PullRequestsPanel })))
const TaskConversation = lazy(() => import('./features/orchestration/TaskConversation').then((module) => ({ default: module.TaskConversation })))

export default function App() {
  const [panel, setPanel] = useState<PanelView>(null)
  const [navCollapsed, setNavCollapsed] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('models')
  const { mainView, setMainView, mainViewNavigation, navigateMainViewHistory, visitedViews } = useMainViewNavigation('chat')

  useEffect(() => {
    const preloadPanels = () => {
      void import('./features/plugins/PluginsMarketplaceView')
      void import('./features/settings/SettingsPage')
      void import('./features/explore/ExploreView')
      void import('./features/pull-requests/PullRequestsPanel')
      void import('./features/schedules/SchedulesPanel')
    }
    if (typeof window !== 'undefined') {
      const requestIdle = (window as Window & { requestIdleCallback?: Window['requestIdleCallback'] }).requestIdleCallback
      if (requestIdle) {
        const handle = requestIdle.call(window, preloadPanels, { timeout: 2500 })
        return () => window.cancelIdleCallback(handle)
      } else {
        const timer = window.setTimeout(preloadPanels, 1200)
        return () => window.clearTimeout(timer)
      }
    }
  }, [])
  const [conversationMode, setConversationMode] = useState<'chat' | 'roles'>(() => {
    try { return window.localStorage.getItem('taskweaver.conversation-mode') === 'roles' ? 'roles' : 'chat' }
    catch { return 'chat' }
  })
  const [shortcuts, setShortcuts] = useState<ShortcutItem[]>(() => loadShortcuts())
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const modelCatalog = useModelCatalog()
  const appBackend = useAppBackend()
  const tasks = appBackend.tasks
  const messages = appBackend.messages
  const workbenchConversationKey = appBackend.state?.conversationId || appBackend.currentThreadId || appBackend.toolOutputConversationId || 'draft'
  const { state: workbenchState, update: updateWorkbenchState } = useWorkbenchSessionState(workbenchConversationKey)
  const openWorkbenchTab = useCallback((tab: WorkbenchTabId) => {
    const isSelectedAndOpen = workbenchState.open && workbenchState.activeTab === tab
    updateWorkbenchState({ open: !isSelectedAndOpen, activeTab: tab })
  }, [updateWorkbenchState, workbenchState.activeTab, workbenchState.open])
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
  const [roleProfiles, setRoleProfiles] = useState<RoleProfile[]>([])
  const [roleProfilesLoading, setRoleProfilesLoading] = useState(false)
  const [roleProfilesError, setRoleProfilesError] = useState<string | null>(null)
  const roleProfilesLoadedRef = useRef(false)
  const roleProfilesRequestRef = useRef<Promise<boolean> | null>(null)
  const [roleProfilesDialogOpen, setRoleProfilesDialogOpen] = useState(false)
  const [roleProfilesSaving, setRoleProfilesSaving] = useState(false)
  const [roleProgress, setRoleProgress] = useState<RoleProgressEntry[]>([])
  const [roleDiscussionStrategy, setRoleDiscussionStrategy] = useState<RoleDiscussionStrategy>('relay')
  const [roleSummaryEnabled, setRoleSummaryEnabled] = useState(false)
  const [roleMemberships, setRoleMemberships] = useState<RoleMemberships>(() => {
    try { return readRoleMemberships(window.localStorage) }
    catch { return {} }
  })
  const roleMembershipConversationId = appBackend.state?.conversationId || appBackend.currentThreadId || null
  const roleMembershipKey = roleMembershipConversationId || 'draft'
  const selectedRoleIds = roleMembersForConversation(roleMemberships, roleMembershipKey)
  const setSelectedRoleIds = useCallback((next: string[] | ((current: string[]) => string[])) => {
    setRoleMemberships((current) => {
      const currentIds = roleMembersForConversation(current, roleMembershipKey)
      const nextIds = typeof next === 'function' ? next(currentIds) : next
      return setConversationRoleMembers(current, roleMembershipKey, nextIds)
    })
  }, [roleMembershipKey])
  const [deleteTargetThread, setDeleteTargetThread] = useState<ThreadSummary | null>(null)
  const [detailsTool, setDetailsTool] = useState<ToolTraceItem | null>(null)
  const [changedFileReview, setChangedFileReview] = useState<ChangedFileItem | null>(null)
  const [terminalOpen, setTerminalOpen] = useState(false)
  const toggleTerminal = useCallback(() => setTerminalOpen((prev) => !prev), [])
  const closeTerminal = useCallback(() => setTerminalOpen(false), [])
  const priorTaskCount = useRef(0)
  const [preferMultiAgentByDefault, setPreferMultiAgentByDefault] = useState(false)
  const [multiAgentOrchestration, setMultiAgentOrchestration] = useState(false)

  useEffect(() => {
    if (!roleMembershipConversationId) return
    setRoleMemberships((current) => migrateLegacyRoleMembers(current, roleMembershipConversationId))
  }, [roleMembershipConversationId])

  useEffect(() => {
    void window.taskweaver?.preferences?.get?.().then((res) => {
      if (res?.ok) {
        const preferMultiAgent = res.data?.preferMultiAgent === true
        setPreferMultiAgentByDefault(preferMultiAgent)
        setMultiAgentOrchestration(preferMultiAgent)
      }
    })
  }, [])

  const handleMultiAgentOrchestrationChange = useCallback((enabled: boolean) => {
    setMultiAgentOrchestration(enabled)
  }, [])
  const handlePreferMultiAgentDefaultChange = useCallback((enabled: boolean) => {
    setPreferMultiAgentByDefault(enabled)
    setMultiAgentOrchestration(enabled)
  }, [])

  const userTurns = useMemo(() => {
    const currentMessages = messages
    return currentMessages
      .filter((m) => m.author === 'user')
      .map((m, idx) => ({
        id: m.id,
        turnNumber: idx + 1,
        preview: (m.text || '').replace(/\s+/g, ' ').slice(0, 40) || '无文字内容',
        time: m.time || '',
      }))
  }, [messages])

  const handleScrollToTurn = useCallback((turnId: string) => {
    const el = document.getElementById(turnId) || document.querySelector(`[data-message-id="${turnId}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [])

  const loadRoleProfiles = useCallback((): Promise<boolean> => {
    if (roleProfilesLoadedRef.current) return Promise.resolve(true)
    if (roleProfilesRequestRef.current) return roleProfilesRequestRef.current
    const request = (async () => {
      setRoleProfilesLoading(true)
      setRoleProfilesError(null)
      try {
        const api = window.taskweaver?.roles
        if (!api) throw new Error('当前后端尚未启用角色模式，请重新编译安装应用。')
        const result = await api.list()
        if (!result.ok) throw new Error(result.error ?? '读取角色列表失败')
        const profiles = result.data ?? []
        roleProfilesLoadedRef.current = true
        setRoleProfiles(profiles)
        setRoleMemberships((current) => {
          const available = new Set(profiles.map((profile) => profile.id))
          let changed = false
          const next = Object.fromEntries(Object.entries(current).map(([conversationId, ids]) => {
            const validIds = ids.filter((id) => available.has(id)).slice(0, 5)
            changed ||= validIds.length !== ids.length
            return [conversationId, validIds]
          }))
          return changed ? next : current
        })
        return true
      } catch (error) {
        const message = error instanceof Error ? error.message : '读取角色列表失败'
        setRoleProfilesError(message)
        return false
      } finally {
        setRoleProfilesLoading(false)
        roleProfilesRequestRef.current = null
      }
    })()
    roleProfilesRequestRef.current = request
    return request
  }, [])

  const selectConversationMode = useCallback((mode: 'chat' | 'roles') => {
    setConversationMode(mode)
    try { window.localStorage.setItem('taskweaver.conversation-mode', mode) } catch { /* Mode preference is optional. */ }
    if (mode === 'roles') void loadRoleProfiles()
  }, [loadRoleProfiles])

  const [pendingWorkText, setPendingWorkText] = useState<string | null>(null)

  const handleTransferToWork = useCallback((text: string) => {
    setPendingWorkText(`基于此前 KAI Bot 研讨结论，请实施以下方案：\n\n${text.trim()}`)
    selectConversationMode('chat')
  }, [selectConversationMode])

  useEffect(() => {
    if (conversationMode === 'roles') void loadRoleProfiles()
  }, [conversationMode, loadRoleProfiles])

  const saveRoleProfile = useCallback(async (draft: RoleProfileDraft) => {
    const api = window.taskweaver?.roles
    if (!api) throw new Error('角色配置接口不可用，请重启 TaskWeaver 后重试。')
    setRoleProfilesSaving(true)
    try {
      const result = await api.upsert(draft)
      if (!result.ok) throw new Error(result.error ?? '保存角色失败')
      const profile = result.data
      setRoleProfiles((current) => {
        const next = current.filter((item) => item.id !== profile.id)
        next.push(profile)
        return next.sort((a, b) => a.createdAt - b.createdAt)
      })
      setSelectedRoleIds((current) => current.includes(profile.id) || current.length >= 5
        ? current
        : [...current, profile.id])
      setRoleProfilesError(null)
      roleProfilesLoadedRef.current = true
    } finally {
      setRoleProfilesSaving(false)
    }
  }, [setSelectedRoleIds])

  const removeRoleProfile = useCallback(async (id: string) => {
    const api = window.taskweaver?.roles
    if (!api) throw new Error('角色配置接口不可用，请重启 TaskWeaver 后重试。')
    setRoleProfilesSaving(true)
    try {
      const result = await api.remove(id)
      if (!result.ok) throw new Error(result.error ?? '删除角色失败')
      if (!result.data.removed) throw new Error('该角色已不存在，请刷新后重试。')
      setRoleProfiles((current) => current.filter((profile) => profile.id !== id))
      setRoleMemberships((current) => removeRoleFromMemberships(current, id))
    } finally {
      setRoleProfilesSaving(false)
    }
  }, [])

  useEffect(() => {
    try { writeRoleMemberships(window.localStorage, roleMemberships) }
    catch { /* Conversation roster state is a convenience cache. */ }
  }, [roleMemberships])

  useEffect(() => {
    const conversationId = appBackend.state?.conversationId
    setRoleProgress([])
    if (!conversationId) return
    const unsubscribe = window.taskweaver?.chat?.onStream((event) => {
      if (event.type !== 'role_progress' || event.conversationId !== conversationId) return
      setRoleProgress((current) => {
        const next = current.filter((item) => item.roleId !== event.roleId)
        next.push({
          roleId: event.roleId,
          roleName: event.roleName,
          status: event.status,
          ...(event.message ? { message: event.message } : {}),
        })
        return next
      })
    })
    return unsubscribe
  }, [appBackend.state?.conversationId])
  const primaryModelMigrationNotified = useRef(false)
  const [dismissedInterruptIds, setDismissedInterruptIds] = useState(() => loadDismissedInterruptedTurnIds())
  const [forkNotice, setForkNotice] = useState('')
  const [rewindDialog, setRewindDialog] = useState<{
    messageId: string
    mode?: RewindThreadResult['mode']
    conflicts?: string[]
    confirmationToken?: string | null
    busy?: boolean
    error?: string | null
  } | null>(null)
  const forkNoticeTimer = useRef<number | null>(null)
  const showForkNotice = useCallback((message: string) => {
    if (forkNoticeTimer.current !== null) window.clearTimeout(forkNoticeTimer.current)
    setForkNotice(message)
    forkNoticeTimer.current = window.setTimeout(() => {
      forkNoticeTimer.current = null
      setForkNotice('')
    }, 2600)
  }, [])
  useEffect(() => () => {
    if (forkNoticeTimer.current !== null) window.clearTimeout(forkNoticeTimer.current)
  }, [])

  // 命令面板快捷键 (Cmd+K / Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setCommandPaletteOpen(true)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

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
      return { ok: false, error: '请在 TaskWeaver 桌面端打开文件' }
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

  const activeConversationId = appBackend.state?.conversationId
  const interruptedTurn = useInterruptedTurn(messages, {
    sending: appBackend.sending,
    loading: appBackend.loading,
    running: Boolean(activeConversationId && appBackend.runningConversationIds.includes(activeConversationId)),
    runningStatusReady: appBackend.runningStatusReady,
  }, dismissedInterruptIds)

  useEffect(() => {
    setSelectedTaskId(null)
    setDetailsTool(null)
    setPanel((current) => current === 'details' ? null : current)
  }, [appBackend.currentThreadId])

  useEffect(() => {
    setMultiAgentOrchestration(preferMultiAgentByDefault)
  }, [appBackend.currentThreadId, preferMultiAgentByDefault])

  const selectedTask = useMemo(
    () => (selectedTaskId ? tasks.find((task) => task.id === selectedTaskId) ?? null : null),
    [tasks, selectedTaskId],
  )

  const composerModelOptions = modelCatalog.composerOptions

  const composerModelEmptyLabel = useMemo(() => {
    if (modelCatalog.loading) return undefined
    const message = modelCatalog.error?.trim()
    if (message) {
      if (/Z Host|未就绪|启动失败/i.test(message)) return 'Host 未就绪，请重启应用'
      if (/系统安全存储|钥匙串凭据|credentials\.enc/i.test(message)) {
        return '本机钥匙串不可用，请到设置重新保存模型密钥'
      }
      return message.length > 36 ? `${message.slice(0, 36)}…` : message
    }
    const catalogSize = modelCatalog.catalog?.candidateModels?.length ?? modelCatalog.catalog?.models?.length ?? 0
    if (catalogSize > 0) return '请在设置中配置模型凭据'
    return undefined
  }, [
    modelCatalog.loading,
    modelCatalog.error,
    modelCatalog.catalog?.candidateModels?.length,
    modelCatalog.catalog?.models?.length,
  ])

  useEffect(() => {
    if (!appBackend.loading && appBackend.sending && priorTaskCount.current === 0 && tasks.length > 0) {
      updateWorkbenchState({ open: true, activeTab: 'tasks' })
    }
    priorTaskCount.current = tasks.length
  }, [appBackend.loading, appBackend.sending, tasks.length, updateWorkbenchState])

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

  useAppKeyboardShortcuts({
    shortcuts,
    settingsOpen,
    terminalOpen,
    panelOpen: panel !== null || (mainView === 'chat' && workbenchState.open),
    sending: appBackend.sending,
    onToggleTerminal: toggleTerminal,
    onCloseTerminal: closeTerminal,
    onCloseSettings: () => setSettingsOpen(false),
    onClosePanel: () => {
      if (panel) setPanel(null)
      else updateWorkbenchState({ open: false })
    },
    onNewChat: () => {
      void appBackend.clearConversation({ workspacePath: appBackend.workspacePath })
      setPanel(null)
      setMainView('chat')
    },
    onToggleDagPanel: () => {
      if (workbenchState.open && workbenchState.activeTab === 'tasks') updateWorkbenchState({ open: false })
      else updateWorkbenchState({ open: true, activeTab: 'tasks' })
    },
    onCancelMessage: () => { void appBackend.cancelMessage() },
  })

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
    void appBackend.forkThread(messageId).then((result) => {
      if (!result) return
      setPanel(null)
      const turns = result.completedTurns
      showForkNotice(turns ? `已从第 ${turns} 轮分支` : '已创建分支')
    })
  }

  const handleChooseRewind = async (mode: RewindThreadResult['mode']) => {
    if (!rewindDialog || appBackend.sending) return
    setRewindDialog((current) => current ? { ...current, mode, busy: true, error: null } : current)
    const result = await appBackend.rewindThread(rewindDialog.messageId, mode)
    if (!result) {
      setRewindDialog((current) => current ? { ...current, busy: false, error: '回退失败，请查看页面上方的错误提示。' } : current)
      return
    }
    if (result.status === 'conflict') {
      setRewindDialog((current) => current ? {
        ...current,
        mode,
        conflicts: result.conflicts ?? [],
        confirmationToken: result.conflictToken,
        busy: false,
        error: null,
      } : current)
      return
    }
    setRewindDialog(null)
    if (mode === 'chat' || mode === 'both') {
      const turns = result.completedTurns
      const rewindLabel = turns ? `已回到第 ${turns} 轮` : '已回到所选消息'
      const codeLabel = mode === 'both'
        ? `，恢复了 ${result.restoredFiles?.length ?? 0} 个文件`
        : ''
      showForkNotice(`${rewindLabel}${codeLabel}，新分支已打开`)
    } else {
      const turns = result.completedTurns ? `第 ${result.completedTurns} 轮后的状态` : '所选消息后的状态'
      const files = result.restoredFiles?.length ?? 0
      showForkNotice(files ? `代码已回退到${turns}，恢复 ${files} 个文件` : `代码已处于${turns}`)
    }
  }

  const handleConfirmRewindConflicts = async () => {
    if (!rewindDialog?.mode || !rewindDialog.confirmationToken || appBackend.sending) return
    const { messageId, mode, confirmationToken } = rewindDialog
    setRewindDialog((current) => current ? { ...current, busy: true, error: null } : current)
    const result = await appBackend.rewindThread(messageId, mode, confirmationToken)
    if (!result) {
      setRewindDialog((current) => current ? { ...current, busy: false, error: '回退失败，请查看页面上方的错误提示。' } : current)
      return
    }
    if (result.status === 'conflict') {
      setRewindDialog((current) => current ? {
        ...current,
        conflicts: result.conflicts ?? [],
        confirmationToken: result.conflictToken,
        busy: false,
        error: '文件状态在确认期间又变化了，请核对更新后的冲突列表。',
      } : current)
      return
    }
    setRewindDialog(null)
    if (mode === 'chat' || mode === 'both') {
      const codeLabel = mode === 'both' ? `，恢复了 ${result.restoredFiles?.length ?? 0} 个文件` : ''
      showForkNotice(`已回到第 ${result.completedTurns ?? ''} 轮${codeLabel}，新分支已打开`)
    } else {
      const files = result.restoredFiles?.length ?? 0
      showForkNotice(files ? `代码已回退，恢复 ${files} 个文件` : '代码已处于所选回退点')
    }
  }

  const handleResendMessage = async (text: string, precedingAssistantId: string | null, modelKey?: string | null) => {
    if (appBackend.sending || !text.trim()) return
    let forkLabel = '已从对话开头重新发送'
    if (precedingAssistantId) {
      const result = await appBackend.forkThread(precedingAssistantId)
      if (!result) return
      forkLabel = result.completedTurns ? `已从第 ${result.completedTurns} 轮后分支并重新发送` : '已从上一轮后分支并重新发送'
    } else {
      const cleared = await appBackend.clearConversation({ workspacePath: appBackend.workspacePath })
      if (!cleared) return
    }
    setPanel(null)
    setMainView('chat')
    showForkNotice(forkLabel)
    if (conversationMode === 'roles') {
      setRoleProgress([])
      await appBackend.sendAsRoles(text, resolveRoleRecipients(text, selectedRoleIds, roleProfiles), undefined, undefined, {
        discussionStrategy: roleDiscussionStrategy,
        summarize: roleSummaryEnabled,
      })
    } else {
      await appBackend.sendMessage(text, modelKey ?? model?.id ?? undefined)
    }
  }

  const sendMainMessage = (
    text: string,
    skillName: string | null,
    workMode?: WorkMode,
    executionModeOverride?: 'single-agent' | 'multi-agent',
    attachments?: { id: string, mediaType: string, data: string, name: string }[],
    documents?: { id: string, name: string }[],
  ) => {
    if (conversationMode === 'roles' && !/^\/(compact|plan)(?:\s|$)/i.test(text.trim())) {
      setRoleProgress([])
      return appBackend.sendAsRoles(
        text,
        resolveRoleRecipients(text, selectedRoleIds, roleProfiles),
        attachments,
        documents,
        { discussionStrategy: roleDiscussionStrategy, summarize: roleSummaryEnabled },
      )
    }
    return appBackend.sendMessage(text, model?.id, skillName ?? undefined, executionModeOverride, workMode, attachments, documents)
  }

  const sendTaskMessage = (text: string) => {
    if (selectedTask) void appBackend.sendTaskMessage(selectedTask.id, text)
  }

  const cancelTask = () => {
    if (selectedTask) void appBackend.cancelTask(selectedTask.id)
  }

  const openTask = (task: TaskNode) => {
    setSelectedTaskId(task.id)
    setPanel('task')
  }
  const workbenchVisible = mainView === 'chat' && workbenchState.open && !panel
  const workspaceLayoutClass = `workspace${panel || workbenchVisible ? ' with-panel' : ''}${workbenchVisible && workbenchState.layout === 'bottom' ? ' with-workbench-bottom' : ''}`


  return (
    <div className={`app-shell has-topbar ${navCollapsed ? 'nav-collapsed' : ''}${conversationMode === 'roles' ? ' role-mode-shell' : ''}`} data-conversation-mode={conversationMode}>
      <AppTopBar
        navCollapsed={navCollapsed}
        onToggleNav={() => setNavCollapsed((prev) => !prev)}
        canNavigateBack={mainViewNavigation.canGoBack}
        canNavigateForward={mainViewNavigation.canGoForward}
        onNavigateBack={() => navigateMainViewHistory(-1)}
        onNavigateForward={() => navigateMainViewHistory(1)}
        workspacePath={appBackend.workspacePath}
        threadTitle={appBackend.threadTitle}
        roleMode={conversationMode === 'roles'}
        roleProfiles={roleProfiles}
        selectedRoleIds={selectedRoleIds}
        onSelectedRoleIdsChange={setSelectedRoleIds}
        roleProgress={roleProgress}
        onManageRoles={() => {
          void loadRoleProfiles().then(() => setRoleProfilesDialogOpen(true))
        }}
        userTurns={userTurns}
        onScrollToTurn={handleScrollToTurn}
        terminalOpen={terminalOpen}
        onToggleTerminal={toggleTerminal}
        workbenchOpen={workbenchState.open}
        workbenchTab={workbenchState.activeTab}
        onOpenWorkbenchTab={openWorkbenchTab}
        taskCount={tasks.length}
        onNewChat={() => {
          setMultiAgentOrchestration(preferMultiAgentByDefault)
          void appBackend.clearConversation({ workspacePath: appBackend.workspacePath })
          setPanel(null)
          setMainView('chat')
        }}
        onOpenSettings={() => setSettingsOpen(true)}
        onRenameThread={() => {
          if (appBackend.currentThreadId) {
            const nextTitle = window.prompt('修改会话标题：', appBackend.threadTitle)
            if (nextTitle?.trim()) {
              void appBackend.renameThread(appBackend.currentThreadId, nextTitle.trim())
            }
          }
        }}
        onClearThread={() => {
          if (window.confirm('确定清空当前会话的上下文记录吗？')) {
            void appBackend.clearConversation({ workspacePath: appBackend.workspacePath })
          }
        }}
      />
      <div className="app-main-body">
        <AppSidebar
        collapsed={navCollapsed}
        activeMode={conversationMode}
        roleProfiles={roleProfiles}
        selectedRoleIds={selectedRoleIds}
        roleProgress={roleProgress}
        roleModels={modelCatalog.composerOptions}
        onSelectedRoleIdsChange={setSelectedRoleIds}
        onManageRoles={() => {
          void loadRoleProfiles().then(() => setRoleProfilesDialogOpen(true))
        }}
        onSelectMode={(mode) => {
          selectConversationMode(mode)
          setMainView('chat')
          setPanel(null)
        }}
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
          setMultiAgentOrchestration(preferMultiAgentByDefault)
          void appBackend.clearConversation({ workspacePath: appBackend.workspacePath })
          setPanel(null)
          setMainView('chat')
        }}
        onNewProjectChat={async (projectPath) => {
          const created = await appBackend.clearConversation({ workspacePath: projectPath })
          if (!created) return
          setMultiAgentOrchestration(preferMultiAgentByDefault)
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
      <div className={workspaceLayoutClass}>
        {/* 聊天会话主视图：常驻保活，0 延迟切换 */}
        <div className="workspace-view-pane" hidden={mainView !== 'chat'}>
          <ConversationStreamProvider value={useMemo<ConversationStreamState>(() => ({
            sending: appBackend.sending,
            compacting: appBackend.compacting,
            compactedSeq: appBackend.compactedSeq,
            streamText: appBackend.streamText,
            streamStartedAt: appBackend.streamStartedAt,
            streamActivity: appBackend.streamActivity,
            streamThinking: appBackend.streamThinking,
            streamBlocks: appBackend.streamBlocks,
            retryBanner: appBackend.retryBanner,
            toolTraces: appBackend.toolTraces,
            dshToolRows: appBackend.dshToolRows,
            activeDshTurn: appBackend.activeDshTurn,
            liveContext: appBackend.liveContext,
            promptBudget: appBackend.promptBudget,
            sessionStats: appBackend.sessionStats,
            hostPlanModeActive: appBackend.hostPlanModeActive,
            hostTodos: appBackend.hostTodos,
          }), [
            appBackend.sending,
            appBackend.compacting,
            appBackend.compactedSeq,
            appBackend.streamText,
            appBackend.streamStartedAt,
            appBackend.streamActivity,
            appBackend.streamThinking,
            appBackend.streamBlocks,
            appBackend.retryBanner,
            appBackend.toolTraces,
            appBackend.dshToolRows,
            appBackend.activeDshTurn,
            appBackend.liveContext,
            appBackend.promptBudget,
            appBackend.sessionStats,
            appBackend.hostPlanModeActive,
            appBackend.hostTodos,
          ])}>
            <ConversationActionsProvider actions={useMemo<ConversationActions>(() => ({
              onCancel: () => { void appBackend.cancelMessage() },
              onSteer: appBackend.steerMessage,
              onFollowUp: appBackend.followUpMessage,
              onSearchContext: appBackend.searchWorkspaceContext,
              onCreateDroppedReference: appBackend.createDroppedReference,
              onOpenWorkbenchTab: openWorkbenchTab,
              onToggleNav: () => setNavCollapsed((current) => !current),
              onFork: handleForkThread,
              onRewind: (messageId) => setRewindDialog({ messageId }),
              onResendMessage: (text, precedingAssistantId, modelKey) => {
                void handleResendMessage(text, precedingAssistantId ?? null, modelKey)
              },
              onContinueMessage: (modelKey) => {
                if (conversationMode === 'roles') {
                  setRoleProgress([])
                  void appBackend.sendAsRoles('继续', resolveRoleRecipients('继续', selectedRoleIds, roleProfiles), undefined, undefined, {
                    discussionStrategy: roleDiscussionStrategy,
                    summarize: roleSummaryEnabled,
                  })
                } else {
                  void appBackend.sendMessage('继续', modelKey ?? model?.id ?? undefined)
                }
              },
              onShowToolDetails: showToolDetails,
              onOpenWorkspacePath: openWorkspacePath,
              onOpenChangedFileReview: (file) => {
                setChangedFileReview(file)
                setPanel('review')
              },
              onToggleTerminal: toggleTerminal,
              onCloseTerminal: closeTerminal,
              onTransferToWork: handleTransferToWork,
            }), [
              appBackend.cancelMessage,
              appBackend.steerMessage,
              appBackend.followUpMessage,
              appBackend.searchWorkspaceContext,
              appBackend.createDroppedReference,
              openWorkbenchTab,
              handleForkThread,
              handleResendMessage,
              conversationMode,
              appBackend.sendAsRoles,
              selectedRoleIds,
              roleProfiles,
              roleDiscussionStrategy,
              roleSummaryEnabled,
              appBackend.sendMessage,
              model?.id,
              showToolDetails,
              openWorkspacePath,
              toggleTerminal,
              closeTerminal,
              handleTransferToWork,
            ])}>
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
                modelEmptyLabel={composerModelEmptyLabel}
                promptQueue={appBackend.promptQueue}
                onQueueMutate={(payload) => { void appBackend.mutateQueue(payload) }}
                permissionPrompt={appBackend.permissionPrompt}
                onRespondPermission={(action, sandboxMode) => { void appBackend.respondPermissionPrompt(action, sandboxMode) }}
                userQuestionPrompt={appBackend.userQuestionPrompt}
                onAnswerUserQuestion={appBackend.answerUserQuestion}
                onDiscussPlanReview={appBackend.cancelUserQuestion}
                backendError={appBackend.error}
                threadTitle={appBackend.threadTitle}
                taskCount={tasks.length}
                workbenchOpen={workbenchState.open}
                workbenchTab={workbenchState.activeTab}
                workspacePath={appBackend.workspacePath}
                workspaceTrusted={appBackend.workspaceTrust?.trusted ?? null}
                availableProjects={availableProjects}
                onSelectProject={handleSelectProject}
                onPickWorkspace={handlePickWorkspace}
                onDetachWorkspace={handleDetachWorkspace}
                onSetWorkspaceTrust={(trusted) => { void appBackend.setWorkspaceTrust(trusted) }}
                onModelChange={handleModelChange}
                thinkingLevel={modelCatalog.activeThinkingLevel}
                onThinkingLevelChange={handleThinkingLevelChange}
                onPermissionModeChange={handlePermissionModeChange}
                onSend={sendMainMessage}
                orchestrationChoicePrompt={conversationMode === 'roles' ? null : appBackend.orchestrationChoicePrompt}
                onRespondOrchestrationChoice={appBackend.respondToOrchestrationChoice}
                roleMode={conversationMode === 'roles'}
                roleProfiles={roleProfiles}
                roleProfilesLoading={roleProfilesLoading}
                roleProfileLoadError={roleProfilesError}
                selectedRoleIds={selectedRoleIds}
                roleProgress={roleProgress}
                roleDiscussionStrategy={roleDiscussionStrategy}
                roleSummaryEnabled={roleSummaryEnabled}
                onRoleDiscussionStrategyChange={setRoleDiscussionStrategy}
                onRoleSummaryEnabledChange={setRoleSummaryEnabled}
                onSelectedRoleIdsChange={setSelectedRoleIds}
                onManageRoles={() => {
                  void loadRoleProfiles().then(() => setRoleProfilesDialogOpen(true))
                }}
                pendingComposerText={pendingWorkText}
                onClearPendingComposerText={() => setPendingWorkText(null)}
                multiAgentOrchestration={multiAgentOrchestration}
                onMultiAgentOrchestrationChange={handleMultiAgentOrchestrationChange}
                conversationId={appBackend.toolOutputConversationId}
                terminalOpen={terminalOpen}
                interruptedTurn={interruptedTurn}
                onDismissInterrupted={() => {
                  if (interruptedTurn) {
                    setDismissedInterruptIds((current) => rememberDismissedInterruptedTurn(current, interruptedTurn.id))
                  }
                }}
              />
            </ConversationActionsProvider>
          </ConversationStreamProvider>
        </div>

        {/* 插件与技能市场：首次访问后保活，0 延迟复原 */}
        {visitedViews.has('plugins') && (
          <div className="workspace-view-pane" hidden={mainView !== 'plugins'}>
            <Suspense fallback={<div className="codex-marketplace-page" role="status">正在加载插件…</div>}>
              <PluginsMarketplaceView
                onOpenSettings={() => {
                  setSettingsSection('mcp')
                  setSettingsOpen(true)
                }}
                skills={appBackend.skills}
              />
            </Suspense>
          </div>
        )}

        {/* Pull Requests 视图：首次访问后保活 */}
        {visitedViews.has('pull-requests') && (
          <div className="workspace-view-pane" hidden={mainView !== 'pull-requests'}>
            <Suspense fallback={<div className="codex-marketplace-page" role="status">正在加载…</div>}>
              <PullRequestsPanel
                workspacePath={appBackend.workspacePath}
                onBack={() => setMainView('chat')}
                onOpenIntegrations={() => {
                  setMainView('plugins')
                }}
                onReviewWithAgent={(text) => {
                  setMainView('chat')
                  void appBackend.sendMessage(text, model?.id, undefined, undefined, 'code')
                }}
              />
            </Suspense>
          </div>
        )}

        {/* Schedules 定时任务视图：首次访问后保活 */}
        {visitedViews.has('schedules') && (
          <div className="workspace-view-pane" hidden={mainView !== 'schedules'}>
            <Suspense fallback={<div className="codex-marketplace-page" role="status">正在加载…</div>}>
              <SchedulesPanel
                workspacePath={appBackend.workspacePath}
                onBack={() => setMainView('chat')}
                onOpenConversation={async (conversationId) => {
                  const listed = await window.taskweaver?.app?.listThreads()
                  if (!listed?.ok) return false
                  const thread = listed.data.find((candidate) => candidate.conversationId === conversationId)
                  if (!thread) return false
                  if (thread.archived && !(await appBackend.toggleArchiveThread(thread.id))) return false
                  const switched = await appBackend.switchThread(thread.id)
                  if (switched) {
                    setPanel(null)
                    setMainView('chat')
                  }
                  return switched
                }}
              />
            </Suspense>
          </div>
        )}

        {/* Explore 探索视图：首次访问后保活 */}
        {visitedViews.has('explore') && (
          <div className="workspace-view-pane" hidden={mainView !== 'explore'}>
            <Suspense fallback={<div className="codex-marketplace-page" role="status">正在加载…</div>}>
              <ExploreView
                skills={enabledSkills}
                onNavigate={setMainView}
                onTryPrompt={(text) => {
                  setMainView('chat')
                  void appBackend.sendMessage(text, model?.id, undefined, undefined, 'code')
                }}
              />
            </Suspense>
          </div>
        )}
        {mainView === 'chat' && workbenchState.open && !panel && (
          <WorkbenchPanel
            activeTab={workbenchState.activeTab}
            layout={workbenchState.layout}
            onSelectTab={(tab) => updateWorkbenchState({ activeTab: tab })}
            onSetLayout={(layout) => updateWorkbenchState({ layout })}
            context={{
              workspacePath: appBackend.workspacePath,
              tasks,
              conversationId: appBackend.state?.conversationId ?? null,
              modelOptions: modelCatalog.composerOptions,
              onTask: openTask,
              onOpenWorkspacePath: openWorkspacePath,
              onClose: () => updateWorkbenchState({ open: false }),
            }}
          />
        )}
        {panel === 'task' && selectedTask && (
          <Suspense fallback={null}>
            <TaskConversation
              task={selectedTask}
              conversationId={appBackend.state?.conversationId ?? null}
              onBack={() => {
                setPanel(null)
                updateWorkbenchState({ open: true, activeTab: 'tasks' })
              }}
              onClose={() => setPanel(null)}
              onSend={sendTaskMessage}
              onCancel={cancelTask}
            />
          </Suspense>
        )}

        {panel === 'details' && detailsTool && (
          <DetailsPanel
            item={detailsTool}
            conversationId={appBackend.toolOutputConversationId}
            workspacePath={appBackend.workspacePath}
            onClose={() => {
              setPanel(null)
              setDetailsTool(null)
            }}
            onOpenPath={openWorkspacePathForDetails}
            renderDiff={(fileDiff) => <DiffReviewCard fileDiff={fileDiff} defaultExpanded />}
          />
        )}
        {panel === 'review' && changedFileReview && (
          <ChangedFileReviewPanel
            file={changedFileReview}
            onClose={() => {
              setPanel(null)
              setChangedFileReview(null)
            }}
          />
        )}
        {panel === 'logs' && (
          <Suspense fallback={null}>
            <OutputLogPanel
              logs={appBackend.toolTraces}
              conversationId={appBackend.toolOutputConversationId}
              onClose={() => setPanel(null)}
              onShowToolDetails={showToolDetails}
              onOpenWorkspacePath={openWorkspacePath}
            />
          </Suspense>
        )}
      </div>
      </div>

      <AppModals
        forkNotice={forkNotice}
        roleProfilesDialogOpen={roleProfilesDialogOpen}
        roleProfiles={roleProfiles}
        composerOptions={modelCatalog.composerOptions}
        roleProfilesSaving={roleProfilesSaving}
        onCloseRoleProfiles={() => setRoleProfilesDialogOpen(false)}
        onSaveRoleProfile={saveRoleProfile}
        onRemoveRoleProfile={removeRoleProfile}
        deleteTargetThread={deleteTargetThread}
        onConfirmDeleteThread={() => {
          if (!deleteTargetThread) return
          const id = deleteTargetThread.id
          setDeleteTargetThread(null)
          void appBackend.deleteThread(id).then((changed) => { if (changed) setPanel(null) })
        }}
        onCancelDeleteThread={() => setDeleteTargetThread(null)}
        rewindDialog={rewindDialog}
        workspacePath={appBackend.workspacePath}
        onChooseRewind={(mode) => { void handleChooseRewind(mode) }}
        onConfirmRewindConflicts={() => { void handleConfirmRewindConflicts() }}
        onCancelRewind={() => { if (!rewindDialog?.busy) setRewindDialog(null) }}
        commandPaletteOpen={commandPaletteOpen}
        onCloseCommandPalette={() => setCommandPaletteOpen(false)}
        threads={appBackend.threads}
        onSwitchThread={(threadId) => {
          void appBackend.switchThread(threadId).then((changed) => { if (changed) setPanel(null) })
          setMainView('chat')
        }}
        onNewChat={() => {
          setMultiAgentOrchestration(preferMultiAgentByDefault)
          void appBackend.clearConversation({ workspacePath: appBackend.workspacePath })
          setPanel(null)
          setMainView('chat')
        }}
        onOpenSettingsFromPalette={() => {
          setSettingsOpen(true)
          setSettingsSection('models')
        }}
        onPickWorkspaceFromPalette={() => {
          void appBackend.pickWorkspace().then((changed) => { if (changed) setPanel(null) })
          setMainView('chat')
        }}
        onDeleteThreadFromPalette={(threadId) => {
          const thread = appBackend.threads.find((candidate) => candidate.id === threadId)
          if (thread) setDeleteTargetThread(thread)
        }}
        onTogglePinThread={(threadId) => {
          void appBackend.togglePinThread(threadId)
        }}
        onToggleArchiveThread={(threadId) => {
          void appBackend.toggleArchiveThread(threadId)
        }}
        onSelectMainView={(view) => {
          setMainView(view)
          setPanel(null)
        }}
        settingsOpen={settingsOpen}
        settingsSection={settingsSection}
        onSectionChange={setSettingsSection}
        onCloseSettings={() => setSettingsOpen(false)}
        modelCatalog={modelCatalog}
        shortcuts={shortcuts}
        onUpdateShortcuts={handleUpdateShortcuts}
        permissionMode={appBackend.state?.permissionMode}
        onPermissionModeChange={appBackend.setPermissionMode}
        onPreferMultiAgentChange={handlePreferMultiAgentDefaultChange}
        conversationId={appBackend.state?.conversationId ?? null}
      />
    </div>
  )
}
