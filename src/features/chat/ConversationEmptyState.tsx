import { ArrowDown, Bot, Plus, Sparkles } from 'lucide-react'
import type { RoleProfile } from '../../shared/app-api'
import { workspaceLabel } from '../../shared/ui-utils'
import { RolePortrait } from '../roles/RolePortrait'

export interface ConversationEmptyStateProps {
  roleMode?: boolean
  workspacePath: string | null
  activeRoleProfiles: RoleProfile[]
  roleProfiles: RoleProfile[]
  onSend: (message: string, skillName: string | null) => void
  onManageRoles?: () => void
}

export function ConversationEmptyState({
  roleMode = false,
  workspacePath,
  activeRoleProfiles,
  roleProfiles,
  onSend,
  onManageRoles,
}: ConversationEmptyStateProps) {
  if (roleMode) {
    return (
      <div className={`role-work-intro${activeRoleProfiles.length ? ' has-bots' : ''}`}>
        <div className="role-work-intro-art" aria-hidden="true">
          {activeRoleProfiles.length > 0 ? (
            activeRoleProfiles.slice(0, 4).map((profile) => (
              <span key={profile.id} className="role-work-intro-avatar">
                <RolePortrait
                  name={profile.name}
                  variant={roleProfiles.indexOf(profile)}
                  size="large"
                />
              </span>
            ))
          ) : (
            <span className="role-work-intro-empty-avatar">
              <Bot size={31} />
            </span>
          )}
        </div>
        <div className="role-work-intro-copy">
          <span className="role-intro-eyebrow">
            <Sparkles size={12} /> BOT WORKSPACE
          </span>
          <strong>
            {activeRoleProfiles.length === 1
              ? `开始与${activeRoleProfiles[0].name}协作`
              : activeRoleProfiles.length > 1
                ? '把任务交给这支小队'
                : roleProfiles.length
                  ? '选择 Bot，开始工作'
                  : '从一个专属 Bot 开始'}
          </strong>
          <span>
            {activeRoleProfiles.length === 1
              ? `${activeRoleProfiles[0].description || '已为它绑定专属模型和工作方式。'} 直接在下方交代你希望完成的结果。`
              : activeRoleProfiles.length > 1
                ? '这几位 Bot 会依次参与同一项工作。你可以在左侧调整成员，再告诉他们共同目标。'
                : roleProfiles.length
                  ? '左侧 Bot 名册会记住每位伙伴的职责与模型。选择一位单独工作，或组合多人协作。'
                  : '创建一个 Bot，为它绑定模型并设定职责；之后可以单独使用，也可以加入协作小组。'}
          </span>
        </div>
        {activeRoleProfiles.length > 0 ? (
          <div className="role-work-starters" aria-label="快速开始">
            {(activeRoleProfiles.length > 1
              ? ['拆解任务并给出执行方案', '从不同角度评审这项工作', '检查结果并指出风险']
              : ['帮我梳理这项任务', '先提出一个可执行方案', '检查当前项目中的相关问题']
            ).map((prompt) => (
              <button
                type="button"
                key={prompt}
                onClick={() => onSend(prompt, null)}
              >
                {prompt}
                <ArrowDown size={13} />
              </button>
            ))}
          </div>
        ) : (
          <button
            type="button"
            className="role-work-create-button"
            onClick={onManageRoles}
          >
            <Plus size={15} />
            {roleProfiles.length ? '管理 Bots' : '创建第一个 Bot'}
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="conversation-empty">
      <div className="empty-brand-icon">
        <Sparkles size={24} aria-hidden="true" />
      </div>
      <strong>
        {workspacePath
          ? `我们应该在${workspaceLabel(workspacePath)}中做些什么？`
          : '我们今天要做些什么？'}
      </strong>
      <span>普通请求由单 Agent 直接执行 · 需要并行协作时可主动启用多智能体模式</span>
      <div className="empty-hints-grid">
        <div className="empty-hint-card">
          <code>单 Agent 直达</code>
          <p>常规需求保持单 Agent 极速交互，零多余协调开销</p>
        </div>
        <div className="empty-hint-card">
          <code>/ 技能命令</code>
          <p>输入 / 选择多智能体 Skill，或在模式菜单中主动切换到目标模式</p>
        </div>
        <div className="empty-hint-card">
          <code>@ 文件上下文</code>
          <p>输入 @ 快速索引并精准注入工作区代码上下文</p>
        </div>
      </div>
    </div>
  )
}
