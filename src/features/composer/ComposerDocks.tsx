import type {
  HostTodoItem,
  PermissionPromptPayload,
  PromptQueueSnapshot,
  UserQuestionAnswer,
  UserQuestionPromptPayload,
} from '../../shared/app-api'
import { ApprovalPanel } from '../chat/ApprovalPanel'
import { CompactSuggestBanner } from '../chat/CompactSuggestBanner'
import { HostTodoProjection } from '../chat/HostTodoProjection'
import { OrchestrationChoiceCard } from '../chat/OrchestrationChoiceCard'
import { QueueDock } from '../chat/QueueDock'
import { UserQuestionPanel } from '../chat/UserQuestionPanel'
import { ProjectSelector } from './ProjectSelector'

export interface ComposerDocksProps {
  roleMode?: boolean
  conversationKey: string | null
  contextPercent: number | null
  sending?: boolean
  compacting?: boolean
  compactedSeq?: number
  onCompact: () => void
  hostTodos?: HostTodoItem[] | null
  orchestrationChoicePrompt?: { confidence: number; reasons: string[] } | null
  onRespondOrchestrationChoice?: (choice: 'single-agent' | 'multi-agent') => Promise<boolean>
  permissionPrompt?: PermissionPromptPayload | null
  onRespondPermission?: (
    action: 'allow-once' | 'allow-always' | 'allow-always-session' | 'deny' | 'escalate-once',
    sandboxMode?: 'workspace-write' | 'danger-full-access',
  ) => void
  userQuestionPrompt?: UserQuestionPromptPayload | null
  onAnswerUserQuestion?: (id: string, answer: UserQuestionAnswer) => Promise<boolean>
  onDiscussPlanReview?: (id: string) => Promise<boolean>
  promptQueue?: PromptQueueSnapshot
  onQueueMutate?: (payload: { kind: 'steering' | 'followUp'; index: number; action: 'remove' | 'update'; text?: string }) => void
  hasMessages?: boolean
  workspacePath: string | null
  availableProjects: { path: string; name: string }[]
  workspaceTrusted?: boolean | null
  onSelectProject: (path: string) => void
  onPickWorkspace: () => void
  onDetachWorkspace: () => void
  onSetWorkspaceTrust?: (trusted: boolean) => void | Promise<void>
}

/**
 * 抽离管理 Composer 输入框上方的停靠组件群（Docks）：
 * 包含压缩建议、待办投影、编排决策、权限审批、用户提问、排队底座及未选项目选择器
 */
export function ComposerDocks({
  roleMode = false,
  conversationKey,
  contextPercent,
  sending = false,
  compacting = false,
  compactedSeq,
  onCompact,
  hostTodos,
  orchestrationChoicePrompt,
  onRespondOrchestrationChoice,
  permissionPrompt,
  onRespondPermission,
  userQuestionPrompt,
  onAnswerUserQuestion,
  onDiscussPlanReview,
  promptQueue,
  onQueueMutate,
  hasMessages = false,
  workspacePath,
  availableProjects,
  workspaceTrusted,
  onSelectProject,
  onPickWorkspace,
  onDetachWorkspace,
  onSetWorkspaceTrust,
}: ComposerDocksProps) {
  const queue = promptQueue ?? { steering: [], followUp: [] }

  return (
    <>
      {!roleMode && (
        <CompactSuggestBanner
          conversationKey={conversationKey}
          contextPercent={contextPercent}
          sending={sending}
          compacting={compacting}
          compactedSeq={compactedSeq}
          onCompact={onCompact}
        />
      )}

      {!roleMode && <HostTodoProjection items={hostTodos ?? null} />}

      {orchestrationChoicePrompt && onRespondOrchestrationChoice && (
        <div className="composer-approval-slot">
          <OrchestrationChoiceCard
            decision={orchestrationChoicePrompt}
            onChoose={onRespondOrchestrationChoice}
          />
        </div>
      )}

      {permissionPrompt && onRespondPermission && (
        <div className="composer-approval-slot">
          <ApprovalPanel prompt={permissionPrompt} onRespond={onRespondPermission} />
        </div>
      )}

      {userQuestionPrompt && onAnswerUserQuestion && (
        <div className="composer-approval-slot">
          <UserQuestionPanel
            prompt={userQuestionPrompt}
            onAnswer={onAnswerUserQuestion}
            onDiscuss={onDiscussPlanReview}
          />
        </div>
      )}

      {sending && onQueueMutate && (
        <QueueDock
          queue={queue}
          sending={sending}
          onMutate={(payload) => { void onQueueMutate(payload) }}
        />
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
    </>
  )
}
