import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAppBackend } from './features/app/useAppBackend'
import { SKILL_CATALOG_EVENT, useEnabledSkills } from './features/skills/useEnabledSkills'
import { useModelCatalog } from './features/models/useModelCatalog'
import { SchedulesPanel } from './features/schedules/SchedulesPanel'
import { ExploreView } from './features/explore/ExploreView'
import { PullRequestsPanel } from './features/pull-requests/PullRequestsPanel'
import { SettingsPage, type SettingsSection } from './features/settings/SettingsPage'
import { DagPanel } from './features/orchestration/DagPanel'
import { OrchestrationChoiceOverlay } from './features/orchestration/OrchestrationChoiceOverlay'
import { TaskConversation } from './features/orchestration/TaskConversation'
import { useAppKeyboardShortcuts } from './features/app/useAppKeyboardShortcuts'
import { useInterruptedTurn } from './features/chat/useInterruptedTurn'
import { DetailsPanel } from './features/chat/DetailsPanel'
import type { PermissionMode, SkillOption, ThreadSummary, ToolTraceItem, WorkMode } from './shared/app-api'
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
import { ConfirmModal } from './shared/ConfirmModal'
import { MainConversation } from './features/chat/MainConversation'
import type { PanelView } from './features/chat/panel-view'
import { workspaceLabel } from './shared/ui-utils'

const PluginsMarketplaceView = lazy(() => import('./features/plugins/PluginsMarketplaceView').then((module) => ({ default: module.PluginsMarketplaceView })))
const OutputLogPanel = lazy(() => import('./features/logs/OutputLogPanel').then((module) => ({ default: module.OutputLogPanel })))
const GitCheckpointPanel = lazy(() => import('./features/git/GitCheckpointPanel').then((module) => ({ default: module.GitCheckpointPanel })))
export default function App() {
  const [panel, setPanel] = useState<PanelView>(null)
  const [navCollapsed, setNavCollapsed] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('models')
  const [mainView, setMainView] = useState<'chat' | 'plugins' | 'pull-requests' | 'schedules' | 'explore'>('chat')
  const [shortcuts, setShortcuts] = useState<ShortcutItem[]>(() => loadShortcuts())
  const modelCatalog = useModelCatalog()
  const appBackend = useAppBackend()
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
  const [deleteTargetThread, setDeleteTargetThread] = useState<ThreadSummary | null>(null)
  const [detailsTool, setDetailsTool] = useState<ToolTraceItem | null>(null)
  const [terminalOpen, setTerminalOpen] = useState(false)
  const toggleTerminal = useCallback(() => setTerminalOpen((prev) => !prev), [])
  const closeTerminal = useCallback(() => setTerminalOpen(false), [])
  const priorTaskCount = useRef(0)
  const [multiAgentOrchestration, setMultiAgentOrchestration] = useState(true)

  useEffect(() => {
    void window.taskweaver?.preferences?.get?.().then((res) => {
      if (res?.ok && res.data?.preferMultiAgent) setMultiAgentOrchestration(true)
    })
  }, [])

  const handleMultiAgentOrchestrationChange = useCallback((enabled: boolean) => {
    setMultiAgentOrchestration(enabled)
    void window.taskweaver?.preferences?.set?.({ preferMultiAgent: enabled })
  }, [])
  const primaryModelMigrationNotified = useRef(false)
  const [dismissedInterruptId, setDismissedInterruptId] = useState<string | null>(null)
  const [forkNotice, setForkNotice] = useState('')
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
      return { ok: false, error: '请在 Electron 桌面端打开文件' }
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

  const tasks = appBackend.tasks
  const messages = appBackend.messages

  const interruptedTurn = useInterruptedTurn(messages, appBackend.sending, dismissedInterruptId)

  useEffect(() => {
    setDismissedInterruptId(null)
    setSelectedTaskId(null)
  }, [appBackend.currentThreadId])

  const selectedTask = useMemo(
    () => (selectedTaskId ? tasks.find((task) => task.id === selectedTaskId) ?? null : null),
    [tasks, selectedTaskId],
  )

  const composerModelOptions = modelCatalog.composerOptions

  useEffect(() => {
    if (priorTaskCount.current === 0 && tasks.length > 0) setPanel('dag')
    priorTaskCount.current = tasks.length
  }, [tasks.length])

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
    panelOpen: panel !== null,
    sending: appBackend.sending,
    onToggleTerminal: toggleTerminal,
    onCloseTerminal: closeTerminal,
    onCloseSettings: () => setSettingsOpen(false),
    onClosePanel: () => setPanel(null),
    onNewChat: () => {
      void appBackend.clearConversation({ workspacePath: appBackend.workspacePath })
      setPanel(null)
      setMainView('chat')
    },
    onToggleDagPanel: () => setPanel((current) => (current ? null : 'dag')),
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

  const sendMainMessage = (
    text: string,
    skillName: string | null,
    workMode?: WorkMode,
    executionModeOverride?: 'single-agent' | 'multi-agent',
    attachments?: { id: string, mediaType: string, data: string, name: string }[],
  ) => {
    void appBackend.sendMessage(text, model?.id, skillName ?? undefined, executionModeOverride, workMode, attachments)
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

  if (settingsOpen) {
    return (
      <SettingsPage
        section={settingsSection}
        onSectionChange={setSettingsSection}
        onClose={() => setSettingsOpen(false)}
        modelCatalog={modelCatalog}
        shortcuts={shortcuts}
        onUpdateShortcuts={handleUpdateShortcuts}
        permissionMode={appBackend.state?.permissionMode}
        onPermissionModeChange={appBackend.setPermissionMode}
        conversationId={appBackend.state?.conversationId ?? null}
      />
    )
  }

  return (
    <div className={`app-shell ${navCollapsed ? 'nav-collapsed' : ''}`}>
      {appBackend.orchestrationChoice && (
        <OrchestrationChoiceOverlay
          reason={appBackend.orchestrationChoice.reason}
          onConfirmSingle={() => { void appBackend.confirmOrchestration('single-agent') }}
          onConfirmMulti={() => { void appBackend.confirmOrchestration('multi-agent') }}
          onDismiss={appBackend.dismissOrchestrationChoice}
        />
      )}
      <div className="window-drag-region" aria-hidden="true" />
      {forkNotice && <div className="settings-toast" role="status" aria-live="polite">{forkNotice}</div>}
      <AppSidebar
        collapsed={navCollapsed}
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
          void appBackend.clearConversation({ workspacePath: appBackend.workspacePath })
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
      <div className={`workspace ${panel ? 'with-panel' : ''}`}>
        {mainView === 'plugins' ? (
          <Suspense fallback={<div className="codex-marketplace-page" role="status">正在加载插件…</div>}>
          <PluginsMarketplaceView
            onOpenSettings={() => {
              setSettingsSection('mcp')
              setSettingsOpen(true)
            }}
            skills={appBackend.skills}
          />
          </Suspense>
        ) : mainView === 'pull-requests' ? (
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
        ) : mainView === 'schedules' ? (
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
        ) : mainView === 'explore' ? (
          <ExploreView
            skills={enabledSkills}
            onNavigate={setMainView}
            onTryPrompt={(text) => {
              setMainView('chat')
              void appBackend.sendMessage(text, model?.id, undefined, undefined, 'code')
            }}
          />
        ) : (
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
          sending={appBackend.sending}
          compacting={appBackend.compacting}
          compactedSeq={appBackend.compactedSeq}
          streamText={appBackend.streamText}
          streamStartedAt={appBackend.streamStartedAt}
          streamActivity={appBackend.streamActivity}
          streamThinking={appBackend.streamThinking}
          streamBlocks={appBackend.streamBlocks}
          retryBanner={appBackend.retryBanner}
          toolTraces={appBackend.toolTraces}
          dshToolRows={appBackend.dshToolRows}
          promptQueue={appBackend.promptQueue}
          busyEnterMode={appBackend.busyEnterMode}
          onQueueMutate={(payload) => { void appBackend.mutateQueue(payload) }}
          onBusyEnterModeChange={(mode) => { void appBackend.setBusyEnterMode(mode) }}
          permissionPrompt={appBackend.permissionPrompt}
          onRespondPermission={(action, sandboxMode) => { void appBackend.respondPermissionPrompt(action, sandboxMode) }}
          userQuestionPrompt={appBackend.userQuestionPrompt}
          onAnswerUserQuestion={appBackend.answerUserQuestion}
          onDiscussPlanReview={appBackend.cancelUserQuestion}
          liveContext={appBackend.liveContext}
          promptBudget={appBackend.promptBudget}
          sessionStats={appBackend.sessionStats}
          hostPlanModeActive={appBackend.hostPlanModeActive}
          hostTodos={appBackend.hostTodos}
          backendError={appBackend.error}
          threadTitle={appBackend.threadTitle}
          taskCount={tasks.length}
          panelOpen={panel !== null}
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
          multiAgentOrchestration={multiAgentOrchestration}
          onMultiAgentOrchestrationChange={handleMultiAgentOrchestrationChange}
          conversationId={appBackend.state?.conversationId ?? null}
          onCancel={() => { void appBackend.cancelMessage() }}
          onSteer={(text) => { void appBackend.steerMessage(text) }}
          onFollowUp={(text) => { void appBackend.followUpMessage(text) }}
          onSearchContext={appBackend.searchWorkspaceContext}
          onCreateDroppedReference={appBackend.createDroppedReference}
          activePanel={panel}
          onSelectPanel={setPanel}
          onToggleNav={() => setNavCollapsed((current) => !current)}
          onFork={handleForkThread}
          onShowToolDetails={showToolDetails}
          onOpenWorkspacePath={openWorkspacePath}
          terminalOpen={terminalOpen}
          onToggleTerminal={toggleTerminal}
          onCloseTerminal={closeTerminal}
          interruptedTurn={interruptedTurn}
          onDismissInterrupted={() => {
            if (interruptedTurn) setDismissedInterruptId(interruptedTurn.id)
          }}
        />
        )}
        {panel === 'dag' && <DagPanel tasks={tasks} onTask={openTask} onClose={() => setPanel(null)} />}
        {panel === 'task' && selectedTask && (
          <TaskConversation
            task={selectedTask}
            conversationId={appBackend.state?.conversationId ?? null}
            onBack={() => setPanel('dag')}
            onClose={() => setPanel(null)}
            onSend={sendTaskMessage}
            onCancel={cancelTask}
          />
        )}

        {panel === 'details' && detailsTool && (
          <DetailsPanel
            item={detailsTool}
            workspacePath={appBackend.workspacePath}
            onClose={() => {
              setPanel(null)
              setDetailsTool(null)
            }}
            onOpenPath={openWorkspacePathForDetails}
            renderDiff={(fileDiff) => <DiffReviewCard fileDiff={fileDiff} defaultExpanded />}
          />
        )}
        {panel === 'git' && (
          <Suspense fallback={null}>
          <GitCheckpointPanel workspacePath={appBackend.workspacePath} onClose={() => setPanel(null)} />
          </Suspense>
        )}
        {panel === 'logs' && (
          <Suspense fallback={null}>
            <OutputLogPanel
              logs={appBackend.toolTraces}
              conversationId={appBackend.state?.conversationId ?? null}
              onClose={() => setPanel(null)}
              onShowToolDetails={showToolDetails}
              onOpenWorkspacePath={openWorkspacePath}
            />
          </Suspense>
        )}
      </div>

      {deleteTargetThread && (
        <ConfirmModal
          title="删除对话"
          description={`确定要删除“${deleteTargetThread.title}”吗？\n\n【删除范围】此操作仅永久清除应用内的该会话聊天历史，绝不会删除或修改您的本地代码和磁盘文件。`}
          confirmLabel="永久删除记录"
          confirmDanger
          onConfirm={() => {
            const id = deleteTargetThread.id
            setDeleteTargetThread(null)
            void appBackend.deleteThread(id).then((changed) => { if (changed) setPanel(null) })
          }}
          onCancel={() => setDeleteTargetThread(null)}
        />
      )}
    </div>
  )
}
