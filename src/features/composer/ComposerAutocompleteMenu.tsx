import { FileText, Folder, Package } from 'lucide-react'
import type { RoleProfile, SkillOption, WorkspaceEntry } from '../../shared/app-api'
import { skillOptionSourceLabel } from '../../shared/app-api'
import { RolePortrait } from '../roles/RolePortrait'
import { skillDescriptionBlurb } from '../skills/skillDescription'
import type { SlashCommandItem } from './slashCommands'

export type ComposerAutocompleteMenuProps = {
  skillQuery: { start: number; query: string } | null
  matchingCommands: SlashCommandItem[]
  matchingSkills: SkillOption[]
  activeSkillIndex: number
  skillCatalogLoading: boolean
  skillCatalogSize: number
  onChooseCommand: (cmd: SlashCommandItem) => void
  onChooseSkill: (skill: SkillOption) => void

  roleMentionQuery: { start: number; query: string } | null
  matchingRoleProfiles: RoleProfile[]
  activeRoleMentionIndex: number
  selectedRoleProfiles: RoleProfile[]
  onChooseRoleMention: (profile: RoleProfile) => void

  contextQuery: { start: number; query: string } | null
  contextEntries: WorkspaceEntry[]
  activeContextIndex: number
  onChooseContext: (entry: WorkspaceEntry) => void
}

export function ComposerAutocompleteMenu({
  skillQuery,
  matchingCommands,
  matchingSkills,
  activeSkillIndex,
  skillCatalogLoading,
  skillCatalogSize,
  onChooseCommand,
  onChooseSkill,
  roleMentionQuery,
  matchingRoleProfiles,
  activeRoleMentionIndex,
  selectedRoleProfiles,
  onChooseRoleMention,
  contextQuery,
  contextEntries,
  activeContextIndex,
  onChooseContext,
}: ComposerAutocompleteMenuProps) {
  if (skillQuery) {
    return (
      <div className="skill-command-menu" id="skill-command-options" role="listbox" aria-label="斜杠命令与技能">
        {matchingCommands.length > 0 && (
          <>
            <div className="skill-command-heading"><span>模式与指令</span></div>
            {matchingCommands.map((cmd, index) => {
              const isSelected = index === activeSkillIndex
              return (
                <button
                  type="button"
                  id={`slash-cmd-${index}`}
                  key={cmd.id}
                  className={`skill-command-option ${isSelected ? 'selected' : ''}`}
                  role="option"
                  aria-selected={isSelected}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onChooseCommand(cmd)}
                >
                  <cmd.icon className="skill-command-icon" size={16} aria-hidden="true" />
                  <span className="skill-command-name">{cmd.title}</span>
                  <span className="skill-command-description" title={cmd.description}>{cmd.description}</span>
                  {cmd.badge && <span className="skill-command-tag">{cmd.badge}</span>}
                  <span className="skill-command-source">/{cmd.command}</span>
                </button>
              )
            })}
          </>
        )}
        {matchingSkills.length > 0 && (
          <>
            <div className="skill-command-heading">
              <span>技能</span>
              {skillQuery.query && <small>{matchingSkills.length} 项匹配</small>}
            </div>
            {matchingSkills.map((skill, index) => {
              const itemIndex = matchingCommands.length + index
              const isSelected = itemIndex === activeSkillIndex
              return (
                <button
                  type="button"
                  id={`slash-skill-${itemIndex}`}
                  key={skill.name}
                  className={`skill-command-option skill-command-option--skill ${isSelected ? 'selected' : ''}`}
                  role="option"
                  aria-selected={isSelected}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onChooseSkill(skill)}
                >
                  <Package className="skill-command-icon" size={16} aria-hidden="true" />
                  <span className="skill-command-name">/{skill.name}</span>
                  {skill.multiAgent && <span className="skill-command-tag">多智能体</span>}
                  <span className="skill-command-source">{skillOptionSourceLabel(skill)}</span>
                  <span className="skill-command-description" title={skill.description}>
                    {skillDescriptionBlurb(skill.description, 120)}
                  </span>
                </button>
              )
            })}
          </>
        )}
        {skillCatalogLoading && skillCatalogSize === 0 && (
          <>
            <div className="skill-command-heading"><span>技能</span><small>正在加载…</small></div>
            <p className="skill-menu-empty">正在读取当前工作区可用的 Skill。</p>
          </>
        )}
        {!skillCatalogLoading && matchingCommands.length === 0 && matchingSkills.length === 0 && (
          <p className="skill-menu-empty">没有匹配的指令或技能；按 Esc 保留并继续输入普通文本。</p>
        )}
      </div>
    )
  }

  if (roleMentionQuery) {
    return (
      <div className="skill-command-menu role-mention-menu" id="role-mention-options" role="listbox" aria-label="邀请 Bot 参与本轮">
        <div className="skill-command-heading"><span>邀请 Bot 参与本轮</span><small>未指定时由主 Bot 接话</small></div>
        {matchingRoleProfiles.map((profile, index) => (
          <button
            type="button"
            id={`role-mention-${index}`}
            key={profile.id}
            className="skill-command-option role-mention-option"
            role="option"
            aria-selected={index === activeRoleMentionIndex}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onChooseRoleMention(profile)}
          >
            <RolePortrait name={profile.name} variant={selectedRoleProfiles.indexOf(profile)} size="small" />
            <span className="role-mention-copy">
              <strong>{profile.name}</strong>
              <small>{selectedRoleProfiles[0]?.id === profile.id ? '主 Bot · 默认接话' : profile.description || '协作成员'}</small>
            </span>
          </button>
        ))}
        {matchingRoleProfiles.length === 0 && <p className="skill-menu-empty">没有匹配的会话成员；先在顶部添加 Bot。</p>}
      </div>
    )
  }

  if (contextQuery) {
    return (
      <div className="skill-command-menu context-command-menu" id="context-command-options" role="listbox" aria-label="工作区上下文">
        <div className="skill-command-heading">
          <span>工作区上下文</span>
          <small>{contextEntries.length ? `${contextEntries.length} 项` : '未找到匹配项'}</small>
        </div>
        {contextEntries.map((entry, index) => (
          <button
            type="button"
            id={`context-command-${index}`}
            key={`${entry.kind}:${entry.path}`}
            className="skill-command-option context-command-option"
            role="option"
            aria-selected={index === activeContextIndex}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onChooseContext(entry)}
          >
            {entry.kind === 'directory' ? (
              <Folder className="skill-command-icon" size={16} aria-hidden="true" />
            ) : (
              <FileText className="skill-command-icon" size={16} aria-hidden="true" />
            )}
            <span className="context-command-path" title={entry.path}>{entry.path}</span>
            <span className="skill-command-source">{entry.kind === 'directory' ? '文件夹' : '文件'}</span>
          </button>
        ))}
        {contextEntries.length === 0 && <p className="skill-menu-empty">输入文件名或路径搜索；只显示当前工作区内容。</p>}
      </div>
    )
  }

  return null
}
