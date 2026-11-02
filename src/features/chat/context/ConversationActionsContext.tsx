import { createContext, useContext, type ReactNode } from 'react'
import type { ToolTraceItem, WorkspaceReference } from '../../../shared/app-api'
import type { ChangedFileItem } from '../changed-files'
import type { WorkbenchTabId } from '../../workbench/useWorkbenchSessionState'

export interface ConversationActions {
  onCancel?: () => void
  onSteer?: (text: string) => Promise<unknown>
  onFollowUp?: (text: string) => Promise<unknown>
  onSearchContext?: (query: string) => Promise<unknown>
  onCreateDroppedReference?: (file: File) => Promise<WorkspaceReference | null>
  onOpenWorkbenchTab?: (tab: WorkbenchTabId) => void
  onToggleNav?: () => void
  onFork?: (messageId: string) => void
  onRewind?: (messageId: string) => void
  onResendMessage?: (text: string, precedingAssistantId?: string | null, modelKey?: string) => Promise<void> | void
  onContinueMessage?: (modelKey?: string) => Promise<void> | void
  onShowToolDetails?: (trace: ToolTraceItem | any) => void
  onOpenWorkspacePath?: (path: string, options?: unknown) => void
  onOpenChangedFileReview?: (file: ChangedFileItem) => void
  onToggleTerminal?: () => void
  onCloseTerminal?: () => void
  onTransferToWork?: (text: string) => void
}

const EMPTY_ACTIONS: ConversationActions = {}

const ConversationActionsContext = createContext<ConversationActions>(EMPTY_ACTIONS)

export function ConversationActionsProvider({
  actions,
  children,
}: {
  actions: ConversationActions
  children: ReactNode
}) {
  return (
    <ConversationActionsContext.Provider value={actions}>
      {children}
    </ConversationActionsContext.Provider>
  )
}

export function useConversationActions(): ConversationActions {
  return useContext(ConversationActionsContext)
}
