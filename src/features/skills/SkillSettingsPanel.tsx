import { useEffect, useMemo, useState } from 'react'
import { skillOptionSourceLabel, type SkillOption } from '../../shared/app-api'
import { skillCommandPrefix, skillDescriptionBlurb } from './skillDescription'

const ENABLED_SKILLS_KEY = 'taskweaver:enabled-skills'

function loadEnabledSkills(): Set<string> {
  try {
    const stored = localStorage.getItem(ENABLED_SKILLS_KEY)
    return stored ? new Set(JSON.parse(stored)) : new Set()
  } catch {
    return new Set()
  }
}

function saveEnabledSkills(enabled: Set<string>) {
  try {
    localStorage.setItem(ENABLED_SKILLS_KEY, JSON.stringify([...enabled]))
  } catch (err) {
    console.error('Failed to save enabled skills:', err)
  }
}

export function SkillSettingsPanel() {
  const [skills, setSkills] = useState<SkillOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [enabledSkills, setEnabledSkills] = useState<Set<string>>(loadEnabledSkills)

  useEffect(() => {
    void (async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await window.taskweaver?.skills?.list()
        if (!res?.ok) {
          setError(res?.error ?? '无法加载 Skill 列表')
          setLoading(false)
          return
        }
        setSkills(res.data ?? [])
        setLoading(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载 Skill 列表失败')
        setLoading(false)
      }
    })()
  }, [])

  const sorted = useMemo(
    () => [...skills].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN')),
    [skills],
  )

  const toggleExpand = (name: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const toggleSkillEnabled = (name: string) => {
    setEnabledSkills((prev) => {
      const next = new Set(prev)
      if (next.has(name)) {
        next.delete(name)
      } else {
        next.add(name)
      }
      saveEnabledSkills(next)
      return next
    })
  }

  return (
    <section className="model-settings skill-settings-panel">
      <h2>Skill</h2>
      <p className="model-editor-note skill-settings-intro">
        在 Composer 输入 <code>/</code> 选择 Skill。主对话与单 Agent 会注入所选 Skill；多智能体 DAG 中仅
        <strong> implementation </strong>
        子任务继承全局 Skill。
      </p>
      {error && <p className="settings-inline-error">{error}</p>}
      {loading ? (
        <p className="skill-settings-muted">加载中…</p>
      ) : sorted.length === 0 ? (
        <p className="settings-list-empty">
          未发现 Skill。可在应用目录或受信任工作区的 <code>.taskweaver/skills</code> 添加。
        </p>
      ) : (
        <ul className="skill-settings-list">
          {sorted.map((skill) => {
            const isOpen = expanded.has(skill.name)
            const isEnabled = enabledSkills.has(skill.name)
            const desc = skill.description?.trim() ?? ''
            const prefix = skillCommandPrefix(desc)
            const blurb = skillDescriptionBlurb(desc, 200, skill.name)
            const needsExpand = desc.length > blurb.length + 24 || desc.includes('\n')
            return (
              <li key={skill.name} className="skill-settings-card">
                <div className="skill-settings-card-header">
                  <span className="skill-settings-name">/{skill.name}</span>
                  {skill.multiAgent && <span className="skill-command-tag">多智能体门控</span>}
                  <span className={`skill-settings-badge skill-settings-badge--${skill.source}`}>
                    {skillOptionSourceLabel(skill)}
                  </span>
                  {prefix && <span className="skill-settings-prefix" title="命令前缀">{prefix}</span>}
                  <label className="skill-settings-toggle">
                    <input
                      type="checkbox"
                      checked={isEnabled}
                      onChange={() => toggleSkillEnabled(skill.name)}
                      aria-label={`${isEnabled ? '禁用' : '启用'} ${skill.name}`}
                    />
                    <span className="skill-settings-toggle-slider" />
                  </label>
                </div>
                <p className={`skill-settings-desc${isOpen ? ' skill-settings-desc--open' : ''}`}>
                  {isOpen ? (desc || '（无简介）') : blurb}
                </p>
                {needsExpand && (
                  <button
                    type="button"
                    className="skill-settings-expand"
                    onClick={() => toggleExpand(skill.name)}
                  >
                    {isOpen ? '收起' : '展开全文'}
                  </button>
                )}
                {skill.source === 'dsh' && !skill.path && (
                  <p className="skill-settings-hint">
                    由 DSH Runtime 管理；选择后通过 Host 的 <code>/{skill.name}</code> 手势加载。
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
