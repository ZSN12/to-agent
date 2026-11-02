import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { ComponentType, KeyboardEvent } from 'react'
import { File, Files, Folder, GitBranch, ListTodo, PanelBottom, PanelRight, RefreshCw, Search, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { WorkspaceEntry } from '../../shared/app-api'
import type { ModelOption, TaskNode } from '../../types'
import type { WorkbenchLayoutId, WorkbenchTabId } from './useWorkbenchSessionState'
import { readWorkbenchFileState, workbenchFileStateKey, type WorkbenchFileState } from './workbench-file-state'

const GitCheckpointPanel = lazy(() => import('../git/GitCheckpointPanel').then((module) => ({ default: module.GitCheckpointPanel })))
const DagPanel = lazy(() => import('../orchestration/DagPanel').then((module) => ({ default: module.DagPanel })))

export interface WorkbenchTabContext {
  workspacePath: string | null
  tasks: TaskNode[]
  conversationId: string | null
  modelOptions: ModelOption[]
  onTask: (task: TaskNode) => void
  onOpenWorkspacePath: (path: string) => void
  onClose: () => void
}

export interface WorkbenchTabDefinition {
  id: WorkbenchTabId
  label: string
  icon: LucideIcon
  available?: (context: WorkbenchTabContext) => boolean
  component: ComponentType<WorkbenchTabContext>
}

const FileListTab = ({ workspacePath, conversationId, onOpenWorkspacePath }: WorkbenchTabContext) => {
  const stateKey = workbenchFileStateKey(conversationId, workspacePath)
  const [fileState, setFileState] = useState<WorkbenchFileState>(() => {
    try { return readWorkbenchFileState(window.localStorage, stateKey) } catch {
      return { query: '', scrollTop: 0, selectedPath: null }
    }
  })
  const rememberedState = useRef(fileState)
  const scrollFrame = useRef<number | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const query = fileState.query
  const persistState = () => {
    try { window.localStorage.setItem(stateKey, JSON.stringify(rememberedState.current)) } catch { /* optional view state */ }
  }
  const updateFileState = (patch: Partial<WorkbenchFileState>) => {
    rememberedState.current = { ...rememberedState.current, ...patch }
    setFileState(rememberedState.current)
    persistState()
  }
  const [entries, setEntries] = useState<WorkspaceEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [refreshVersion, setRefreshVersion] = useState(0)

  useEffect(() => () => {
    if (scrollFrame.current !== null) window.cancelAnimationFrame(scrollFrame.current)
    try { window.localStorage.setItem(stateKey, JSON.stringify(rememberedState.current)) } catch { /* optional view state */ }
  }, [stateKey])

  useLayoutEffect(() => {
    if (!loading && listRef.current) listRef.current.scrollTop = rememberedState.current.scrollTop
  }, [loading, entries, query])

  useEffect(() => {
    let cancelled = false
    if (!workspacePath) {
      setEntries([])
      setLoading(false)
      setError('')
      return () => { cancelled = true }
    }

    setLoading(true)
    setError('')
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const result = await window.taskweaver?.workspace?.listContext(query.trim(), 500)
          if (cancelled) return
          if (!result?.ok) {
            setError(result?.error || '读取项目文件失败')
            setEntries([])
          } else {
            setEntries(result.data)
          }
        } catch (cause) {
          if (!cancelled) {
            setError(cause instanceof Error ? cause.message : '读取项目文件失败')
            setEntries([])
          }
        } finally {
          if (!cancelled) setLoading(false)
        }
      })()
    }, query ? 220 : 0)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [workspacePath, query, refreshVersion])

  const orderedEntries = useMemo(
    () => [...entries].sort((left, right) => left.path.localeCompare(right.path, 'zh-CN', { numeric: true })),
    [entries],
  )

  return (
    <section className="workbench-tab-panel files-workbench-tab" aria-label="项目文件">
      <header className="workbench-content-header">
        <div className="workbench-content-title"><Files size={16} aria-hidden="true" /><h2>项目文件</h2></div>
        <button type="button" className="panel-icon" onClick={() => setRefreshVersion((version) => version + 1)} disabled={loading || !workspacePath} aria-label="刷新项目文件" title="刷新项目文件">
          <RefreshCw size={14} className={loading ? 'spinning' : ''} />
        </button>
      </header>
      {workspacePath ? (
        <>
          <label className="workbench-search">
            <Search size={15} aria-hidden="true" />
            <span className="sr-only">搜索项目文件</span>
            <input value={query} onChange={(event) => updateFileState({ query: event.target.value, scrollTop: 0 })} placeholder="搜索文件和文件夹" />
          </label>
          <div className="workbench-file-list" aria-live="polite" ref={listRef} onScroll={(event) => {
            if (loading) return
            rememberedState.current = { ...rememberedState.current, scrollTop: event.currentTarget.scrollTop }
            if (scrollFrame.current === null) scrollFrame.current = window.requestAnimationFrame(() => {
              scrollFrame.current = null
              persistState()
            })
          }}>
            {loading && <div className="workbench-loading" role="status">正在读取项目文件…</div>}
            {!loading && error && <div className="workbench-error" role="alert">{error}</div>}
            {!loading && !error && orderedEntries.length === 0 && <div className="workbench-empty">{query ? '没有匹配的项目文件' : '当前项目没有可显示的文件'}</div>}
            {!loading && !error && orderedEntries.map((entry) => {
              const Icon = entry.kind === 'directory' ? Folder : File
              const depth = Math.max(0, entry.path.split('/').length - 1)
              return (
                <button
                  type="button"
                  className="workbench-file-entry"
                  key={`${entry.kind}:${entry.path}`}
                  style={{ paddingLeft: 9 + Math.min(depth, 5) * 12 }}
                  aria-current={fileState.selectedPath === entry.path ? 'true' : undefined}
                  onClick={() => {
                    updateFileState({ selectedPath: entry.path })
                    onOpenWorkspacePath(entry.path)
                  }}
                  title={entry.path}
                  aria-label={`打开${entry.kind === 'directory' ? '文件夹' : '文件'} ${entry.path}`}
                >
                  <Icon size={15} aria-hidden="true" />
                  <span>{entry.path.split('/').at(-1) || entry.path}</span>
                  {depth > 0 && <small>{entry.path}</small>}
                </button>
              )
            })}
            {!loading && !error && orderedEntries.length >= 500 && <div className="workbench-list-limit">已达到 500 项显示上限，可继续搜索定位文件。</div>}
          </div>
        </>
      ) : (
        <div className="workbench-empty">打开一个项目后即可浏览文件。</div>
      )}
    </section>
  )
}

const GitTab = (context: WorkbenchTabContext) => (
  <Suspense fallback={<div className="workbench-loading" role="status">正在加载 Git 工作区…</div>}>
    <GitCheckpointPanel workspacePath={context.workspacePath} onClose={context.onClose} embedded />
  </Suspense>
)

const TasksTab = (context: WorkbenchTabContext) => (
  <Suspense fallback={<div className="workbench-loading" role="status">正在加载任务…</div>}>
    <DagPanel
      tasks={context.tasks}
      onTask={context.onTask}
      onClose={context.onClose}
      conversationId={context.conversationId}
      modelOptions={context.modelOptions}
      embedded
    />
  </Suspense>
)

const initialRegistry: WorkbenchTabDefinition[] = [
  { id: 'files', label: '文件', icon: Files, available: (context) => Boolean(context.workspacePath), component: FileListTab },
  { id: 'git', label: 'Git', icon: GitBranch, available: (context) => Boolean(context.workspacePath), component: GitTab },
  { id: 'tasks', label: '任务', icon: ListTodo, component: TasksTab },
]

let registrySnapshot: readonly WorkbenchTabDefinition[] = Object.freeze([...initialRegistry])
const registryListeners = new Set<() => void>()

function subscribeRegistry(listener: () => void) {
  registryListeners.add(listener)
  return () => registryListeners.delete(listener)
}

/** Register a workbench tab and return a disposer for optional/runtime integrations. */
export function registerWorkbenchTab(definition: WorkbenchTabDefinition) {
  if (registrySnapshot.some((tab) => tab.id === definition.id)) {
    throw new Error(`Workbench tab "${definition.id}" is already registered`)
  }
  registrySnapshot = Object.freeze([...registrySnapshot, definition])
  registryListeners.forEach((listener) => listener())
  return () => {
    registrySnapshot = Object.freeze(registrySnapshot.filter((tab) => tab !== definition))
    registryListeners.forEach((listener) => listener())
  }
}

export function WorkbenchPanel({
  activeTab,
  layout,
  context,
  onSelectTab,
  onSetLayout,
}: {
  activeTab: WorkbenchTabId
  layout: WorkbenchLayoutId
  context: WorkbenchTabContext
  onSelectTab: (tab: WorkbenchTabId) => void
  onSetLayout: (layout: WorkbenchLayoutId) => void
}) {
  const registry = useSyncExternalStore(subscribeRegistry, () => registrySnapshot, () => registrySnapshot)
  const tabs = useMemo(() => registry.filter((tab) => tab.available?.(context) ?? true), [registry, context])
  const selected = tabs.find((tab) => tab.id === activeTab) ?? tabs[0]

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const offset = event.key === 'ArrowRight' ? 1 : -1
    const nextIndex = (index + offset + tabs.length) % tabs.length
    const nextTab = tabs[nextIndex]
    if (!nextTab) return
    onSelectTab(nextTab.id)
    document.getElementById(`workbench-tab-${nextTab.id}`)?.focus()
  }

  return (
    <aside className="side-panel workbench-panel" aria-label="项目工作台">
      <div className="workbench-tab-strip">
        <div className="workbench-tabs" role="tablist" aria-label="工作台标签">
          {tabs.map(({ id, label, icon: Icon }, index) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={`workbench-tab-${id}`}
              aria-selected={selected?.id === id}
              aria-controls={selected?.id === id ? `workbench-content-${id}` : undefined}
              tabIndex={selected?.id === id ? 0 : -1}
              className={`workbench-tab${selected?.id === id ? ' active' : ''}`}
              onClick={() => onSelectTab(id)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
            >
              <Icon size={15} aria-hidden="true" />{label}
            </button>
          ))}
        </div>
        <div className="workbench-layout-controls" role="group" aria-label="工作台布局">
          <button type="button" className={`panel-icon workbench-layout-button${layout === 'side' ? ' active' : ''}`} onClick={() => onSetLayout('side')} aria-label="工作台显示在聊天右侧" aria-pressed={layout === 'side'} title="显示在右侧">
            <PanelRight size={15} />
          </button>
          <button type="button" className={`panel-icon workbench-layout-button${layout === 'bottom' ? ' active' : ''}`} onClick={() => onSetLayout('bottom')} aria-label="工作台显示在聊天下方" aria-pressed={layout === 'bottom'} title="显示在下方">
            <PanelBottom size={15} />
          </button>
        </div>
        <button type="button" className="panel-icon workbench-close" onClick={context.onClose} aria-label="关闭项目工作台" title="关闭工作台">
          <X size={17} />
        </button>
      </div>
      {selected ? (
        <div className="workbench-tab-content" role="tabpanel" id={`workbench-content-${selected.id}`} aria-labelledby={`workbench-tab-${selected.id}`}>
          <selected.component key={`${context.conversationId ?? 'draft'}:${context.workspacePath ?? ''}:${selected.id}`} {...context} />
        </div>
      ) : (
        <div className="workbench-empty">当前没有可用的工作台标签。</div>
      )}
    </aside>
  )
}
