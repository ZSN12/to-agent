import { useEffect, useMemo, useState } from 'react'
import { skillOptionSourceLabel, type SkillOption } from '../../shared/app-api'
import { skillDescriptionBlurb } from './skillDescription'
import { SKILL_CATALOG_EVENT, useEnabledSkills, writeSkillCatalogCache } from './useEnabledSkills'

export function SkillSettingsPanel() {
  const [skills, setSkills] = useState<SkillOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
        const catalog = res.data ?? []
        setSkills(catalog)
        const appState = await window.taskweaver?.app?.getState()
        writeSkillCatalogCache(catalog, appState?.ok ? appState.data.workspacePath : null)
        window.dispatchEvent(new CustomEvent(SKILL_CATALOG_EVENT, { detail: catalog }))
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
  const skillNames = useMemo(() => sorted.map((skill) => skill.name), [sorted])
  const { enabledNames, toggleSkill } = useEnabledSkills(skillNames)

  return (
    <section className="model-settings skill-settings-panel">
      <h2>Skill</h2>
      <p className="model-editor-note skill-settings-intro">
        开启后，该 Skill 才会出现在 Composer 输入 <code>/</code> 菜单中。主对话与单 Agent 会注入所选 Skill；多智能体 DAG 中仅
        <strong> implementation </strong>
        子任务继承全局 Skill。
      </p>
      {error && <p className="settings-inline-error">{error}</p>}
      {loading ? (
        <p className="skill-settings-muted">加载中…</p>
      ) : sorted.length === 0 ? (
        <p className="settings-list-empty">
          未发现 Skill。可放入应用目录、用户级 <code>~/.agents/skills</code>，或受信任工作区的 <code>.taskweaver/skills</code>。
        </p>
      ) : (
        <div className="skill-settings-table" role="table" aria-label="Skill 列表">
          <div className="skill-settings-row skill-settings-row--heading" role="row">
            <span role="columnheader">Skill 名称</span>
            <span role="columnheader">中文说明</span>
            <span role="columnheader">启动开关</span>
          </div>
          <ul className="skill-settings-list" role="rowgroup">
          {sorted.map((skill) => {
            const desc = skill.description?.trim() ?? ''
            const blurb = skillDescriptionBlurb(desc, 200, skill.name)
            const source = skillOptionSourceLabel(skill)
            const enabled = enabledNames.has(skill.name)
            return (
              <li key={skill.name} className="skill-settings-row" role="row">
                <span
                  className="skill-settings-name"
                  role="cell"
                  title={`${source}${skill.multiAgent ? ' · 多智能体门控' : ''}`}
                >
                  {skill.name}
                </span>
                <span className="skill-settings-desc" role="cell" title={desc || '（无简介）'}>
                  {blurb || '（无简介）'}
                </span>
                <span className="skill-settings-launch" role="cell" title={`${source} · ${enabled ? '已启动：会显示在输入框 / 菜单' : '未启动：不会显示在输入框 / 菜单'}`}>
                  <button
                    type="button"
                    className={`skill-settings-toggle${enabled ? ' is-enabled' : ''}`}
                    role="switch"
                    aria-checked={enabled}
                    aria-label={`${enabled ? '关闭' : '启动'} Skill ${skill.name}`}
                    onClick={() => toggleSkill(skill.name)}
                  >
                    <span />
                  </button>
                </span>
              </li>
            )
          })}
          </ul>
        </div>
      )}
    </section>
  )
}
