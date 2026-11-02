import { Suspense, lazy } from 'react'
import type { RewindThreadResult, RoleProfile, RoleProfileDraft, ThreadSummary } from '../../shared/app-api'
import type { ShortcutItem } from '../../shared/shortcuts'
import type { ModelOption } from '../../types'
import type { SettingsSection } from '../settings/SettingsPage'
import { SettingsLoadingFallback } from '../settings/SettingsLoadingFallback'
import { RoleProfilesDialog } from '../roles/RoleModeControls'
import { ConfirmModal } from '../../shared/ConfirmModal'
import { MessageRewindDialog } from '../chat/MessageRewindDialog'
import { CommandPalette } from '../command-palette/CommandPalette'

const SettingsPage = lazy(() =>
  import('../settings/SettingsPage').then((module) => ({ default: module.SettingsPage })),
)

export type RewindDialogState = {
  messageId: string
  mode?: RewindThreadResult['mode']
  conflicts?: RewindThreadResult['conflicts']
  confirmationToken?: string | null
  busy?: boolean
  error?: string | null
} | null

export type AppModalsProps = {
  // 提示通知
  forkNotice: string | null

  // 角色弹窗
  roleProfilesDialogOpen: boolean
  roleProfiles: RoleProfile[]
  composerOptions: ModelOption[]
  roleProfilesSaving: boolean
  onCloseRoleProfiles: () => void
  onSaveRoleProfile: (draft: RoleProfileDraft) => Promise<void>
  onRemoveRoleProfile: (id: string) => Promise<void>

  // 删除对话确认
  deleteTargetThread: ThreadSummary | null
  onConfirmDeleteThread: () => void
  onCancelDeleteThread: () => void

  // 消息倒带确认
  rewindDialog: RewindDialogState
  workspacePath: string | null
  onChooseRewind: (mode: RewindThreadResult['mode']) => void
  onConfirmRewindConflicts: () => void
  onCancelRewind: () => void

  // 命令面板
  commandPaletteOpen: boolean
  onCloseCommandPalette: () => void
  threads: ThreadSummary[]
  onSwitchThread: (threadId: string) => void
  onNewChat: () => void
  onOpenSettingsFromPalette: () => void
  onPickWorkspaceFromPalette: () => void
  onDeleteThreadFromPalette: (threadId: string) => void
  onTogglePinThread: (threadId: string) => void
  onToggleArchiveThread: (threadId: string) => void
  onSelectMainView: (view: 'chat' | 'plugins' | 'pull-requests' | 'schedules' | 'explore') => void

  // 设置页
  settingsOpen: boolean
  settingsSection: SettingsSection
  onSectionChange: (section: SettingsSection) => void
  onCloseSettings: () => void
  modelCatalog: any
  shortcuts: ShortcutItem[]
  onUpdateShortcuts: (next: ShortcutItem[]) => void
  permissionMode?: any
  onPermissionModeChange: (mode: any) => void
  onPreferMultiAgentChange: (enabled: boolean) => void
  conversationId: string | null
}

export function AppModals({
  forkNotice,
  roleProfilesDialogOpen,
  roleProfiles,
  composerOptions,
  roleProfilesSaving,
  onCloseRoleProfiles,
  onSaveRoleProfile,
  onRemoveRoleProfile,
  deleteTargetThread,
  onConfirmDeleteThread,
  onCancelDeleteThread,
  rewindDialog,
  workspacePath,
  onChooseRewind,
  onConfirmRewindConflicts,
  onCancelRewind,
  commandPaletteOpen,
  onCloseCommandPalette,
  threads,
  onSwitchThread,
  onNewChat,
  onOpenSettingsFromPalette,
  onPickWorkspaceFromPalette,
  onDeleteThreadFromPalette,
  onTogglePinThread,
  onToggleArchiveThread,
  onSelectMainView,
  settingsOpen,
  settingsSection,
  onSectionChange,
  onCloseSettings,
  modelCatalog,
  shortcuts,
  onUpdateShortcuts,
  permissionMode,
  onPermissionModeChange,
  onPreferMultiAgentChange,
  conversationId,
}: AppModalsProps) {
  return (
    <>
      {forkNotice && (
        <div className="settings-toast" role="status" aria-live="polite">
          {forkNotice}
        </div>
      )}

      <RoleProfilesDialog
        open={roleProfilesDialogOpen}
        profiles={roleProfiles}
        models={composerOptions}
        saving={roleProfilesSaving}
        onClose={onCloseRoleProfiles}
        onSave={onSaveRoleProfile}
        onRemove={onRemoveRoleProfile}
      />

      {deleteTargetThread && (
        <ConfirmModal
          title="删除对话"
          description={`确定要删除“${deleteTargetThread.title}”吗？\n\n【删除范围】此操作仅永久清除应用内的该会话聊天历史，绝不会删除或修改您的本地代码和磁盘文件。`}
          confirmLabel="永久删除记录"
          confirmDanger
          onConfirm={onConfirmDeleteThread}
          onCancel={onCancelDeleteThread}
        />
      )}

      {rewindDialog && (
        <MessageRewindDialog
          mode={rewindDialog.mode}
          conflicts={rewindDialog.conflicts}
          confirmationToken={rewindDialog.confirmationToken}
          canRewindCode={Boolean(workspacePath)}
          busy={rewindDialog.busy}
          error={rewindDialog.error}
          onChoose={onChooseRewind}
          onConfirmConflicts={onConfirmRewindConflicts}
          onCancel={onCancelRewind}
        />
      )}

      <CommandPalette
        open={commandPaletteOpen}
        onClose={onCloseCommandPalette}
        threads={threads}
        onSwitchThread={onSwitchThread}
        onNewChat={onNewChat}
        onOpenSettings={onOpenSettingsFromPalette}
        onPickWorkspace={onPickWorkspaceFromPalette}
        onDeleteThread={onDeleteThreadFromPalette}
        onTogglePinThread={onTogglePinThread}
        onToggleArchiveThread={onToggleArchiveThread}
        onSelectMainView={onSelectMainView}
      />

      {settingsOpen && (
        <Suspense fallback={<SettingsLoadingFallback fullScreen />}>
          <SettingsPage
            section={settingsSection}
            onSectionChange={onSectionChange}
            onClose={onCloseSettings}
            modelCatalog={modelCatalog}
            shortcuts={shortcuts}
            onUpdateShortcuts={onUpdateShortcuts}
            permissionMode={permissionMode}
            onPermissionModeChange={onPermissionModeChange}
            onPreferMultiAgentChange={onPreferMultiAgentChange}
            conversationId={conversationId}
          />
        </Suspense>
      )}
    </>
  )
}
