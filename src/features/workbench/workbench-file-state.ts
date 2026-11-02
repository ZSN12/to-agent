export interface WorkbenchFileState {
  query: string
  scrollTop: number
  selectedPath: string | null
}

const PREFIX = 'taskweaver.workbench.files.v1.'
const emptyState = (): WorkbenchFileState => ({ query: '', scrollTop: 0, selectedPath: null })

export function workbenchFileStateKey(conversationId: string | null, workspacePath: string | null) {
  return `${PREFIX}${encodeURIComponent(conversationId || 'draft')}:${encodeURIComponent(workspacePath || '')}`
}

export function readWorkbenchFileState(storage: Pick<Storage, 'getItem'>, key: string): WorkbenchFileState {
  try {
    const value = JSON.parse(storage.getItem(key) || 'null')
    if (!value || typeof value !== 'object') return emptyState()
    return {
      query: typeof value.query === 'string' ? value.query.slice(0, 2000) : '',
      scrollTop: Number.isFinite(value.scrollTop) && value.scrollTop >= 0 ? value.scrollTop : 0,
      selectedPath: typeof value.selectedPath === 'string' ? value.selectedPath : null,
    }
  } catch {
    return emptyState()
  }
}

export function clearWorkbenchConversationState(storage: Storage, conversationId: string) {
  const filePrefix = `${PREFIX}${encodeURIComponent(conversationId)}:`
  try {
    const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index))
    for (const key of keys) {
      if (key?.startsWith(filePrefix) || key === `taskweaver.workbench.v1.${encodeURIComponent(conversationId)}`) {
        storage.removeItem(key)
      }
    }
  } catch {
    // View-state cleanup must not prevent deleting a conversation.
  }
}
