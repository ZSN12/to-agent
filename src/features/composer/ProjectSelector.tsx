import { Check, ChevronDown, Folder, Plus, Search, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { workspaceLabel } from '../../shared/ui-utils'

export function ProjectSelector({
  currentWorkspace,
  availableProjects,
  workspaceTrusted,
  onSelectProject,
  onPickWorkspace,
  onDetachWorkspace,
  onSetWorkspaceTrust,
}: {
  currentWorkspace: string | null
  availableProjects: { path: string; name: string }[]
  workspaceTrusted?: boolean | null
  onSelectProject: (path: string) => void
  onPickWorkspace: () => void
  onDetachWorkspace: () => void
  onSetWorkspaceTrust?: (trusted: boolean) => void | Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [trustConfirm, setTrustConfirm] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const dismiss = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', dismiss)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('mousedown', dismiss)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  const label = workspaceLabel(currentWorkspace)
  const filteredProjects = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return availableProjects
    return availableProjects.filter(
      (p) => p.name.toLowerCase().includes(query) || p.path.toLowerCase().includes(query)
    )
  }, [availableProjects, search])

  return (
    <div className="project-selector-wrapper" ref={menuRef}>
      <button
        type="button"
        className={`project-pill ${!currentWorkspace ? 'no-project' : ''}`}
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Folder size={14} />
        <span>{currentWorkspace ? label : '不在项目中工作'}</span>
        {currentWorkspace && (
          <span className="project-trust-badge" title={workspaceTrusted ? '已信任工作区' : '未信任：不会加载项目内 Skills / hooks'}>
            {workspaceTrusted ? '已信任' : '未信任'}
          </span>
        )}
        <ChevronDown size={12} className="project-pill-arrow" />
      </button>

      {open && (
        <div className="project-selector-menu" role="dialog" aria-label="切换项目">
          <div className="project-search-row">
            <Search size={14} />
            <input
              type="text"
              placeholder="搜索项目"
              value={search}
              autoFocus
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="project-menu-list">
            {filteredProjects.map((p) => {
              const isSelected = p.path === currentWorkspace
              return (
                <button
                  type="button"
                  key={p.path}
                  className={`project-menu-item ${isSelected ? 'selected' : ''}`}
                  onClick={() => {
                    onSelectProject(p.path)
                    setOpen(false)
                  }}
                >
                  <Folder size={14} />
                  <span className="project-menu-name" title={p.path}>{p.name}</span>
                  {isSelected && <Check size={14} className="project-menu-check" />}
                </button>
              )
            })}
            {filteredProjects.length === 0 && search && (
              <div className="project-menu-empty">未匹配到项目</div>
            )}
          </div>
          {currentWorkspace && onSetWorkspaceTrust && (
            <>
              <div className="project-menu-divider" />
              <div className="project-menu-trust">
                {trustConfirm ? (
                  <div className="project-trust-confirm">
                    <p>信任后将加载本项目的 Skills 与 hooks，并允许工作区级自动化。确定信任？</p>
                    <div className="project-trust-confirm-actions">
                      <button type="button" className="project-menu-action" onClick={() => setTrustConfirm(false)}>取消</button>
                      <button
                        type="button"
                        className="project-menu-action"
                        onClick={() => {
                          void onSetWorkspaceTrust(true)
                          setTrustConfirm(false)
                          setOpen(false)
                        }}
                      >
                        信任此工作区
                      </button>
                    </div>
                  </div>
                ) : workspaceTrusted ? (
                  <button
                    type="button"
                    className="project-menu-action"
                    onClick={() => {
                      void onSetWorkspaceTrust(false)
                      setOpen(false)
                    }}
                  >
                    取消信任此工作区
                  </button>
                ) : (
                  <button type="button" className="project-menu-action" onClick={() => setTrustConfirm(true)}>
                    信任此工作区…
                  </button>
                )}
              </div>
            </>
          )}
          <div className="project-menu-divider" />
          <div className="project-menu-actions">
            <button
              type="button"
              className="project-menu-action"
              onClick={() => {
                onPickWorkspace()
                setOpen(false)
              }}
            >
              <Plus size={14} />
              <span>新建或打开项目…</span>
            </button>
            <button
              type="button"
              className={`project-menu-action ${!currentWorkspace ? 'selected' : ''}`}
              onClick={() => {
                if (currentWorkspace) {
                  onDetachWorkspace()
                }
                setOpen(false)
              }}
            >
              <X size={14} />
              <span>不在项目中工作</span>
              {!currentWorkspace && <Check size={14} className="project-menu-check" style={{ marginLeft: 'auto' }} />}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
