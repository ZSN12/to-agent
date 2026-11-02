import { useCallback, useEffect, useState } from 'react'

export type WorkbenchTabId = 'files' | 'git' | 'tasks' | (string & {})
export type WorkbenchLayoutId = 'side' | 'bottom'

export interface WorkbenchSessionState {
  open: boolean
  activeTab: WorkbenchTabId
  layout: WorkbenchLayoutId
}

const STORAGE_PREFIX = 'taskweaver.workbench.v1.'
const DEFAULT_STATE: WorkbenchSessionState = { open: false, activeTab: 'files', layout: 'side' }

function storageKey(conversationKey: string) {
  return `${STORAGE_PREFIX}${encodeURIComponent(conversationKey)}`
}

function readState(conversationKey: string): WorkbenchSessionState {
  try {
    const raw = window.localStorage.getItem(storageKey(conversationKey))
    if (!raw) return DEFAULT_STATE
    const parsed = JSON.parse(raw) as Partial<WorkbenchSessionState>
    return {
      open: parsed.open === true,
      activeTab: typeof parsed.activeTab === 'string' && parsed.activeTab ? parsed.activeTab : DEFAULT_STATE.activeTab,
      layout: parsed.layout === 'bottom' ? 'bottom' : 'side',
    }
  } catch {
    return DEFAULT_STATE
  }
}

export function useWorkbenchSessionState(conversationKey: string) {
  const [snapshot, setSnapshot] = useState(() => ({ key: conversationKey, value: readState(conversationKey) }))
  const state = snapshot.key === conversationKey ? snapshot.value : readState(conversationKey)

  useEffect(() => {
    if (snapshot.key !== conversationKey) {
      setSnapshot({ key: conversationKey, value: readState(conversationKey) })
      return
    }
    try {
      window.localStorage.setItem(storageKey(conversationKey), JSON.stringify(state))
    } catch {
      // Conversation view state is best-effort when storage is unavailable.
    }
  }, [conversationKey, snapshot, state])

  const update = useCallback((patch: Partial<WorkbenchSessionState>) => {
    setSnapshot((current) => {
      const base = current.key === conversationKey ? current.value : readState(conversationKey)
      return { key: conversationKey, value: { ...base, ...patch } }
    })
  }, [conversationKey])

  return { state, update }
}
