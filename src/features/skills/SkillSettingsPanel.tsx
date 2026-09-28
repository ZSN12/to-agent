import { useEffect, useState } from 'react'
import { skillOptionSourceLabel, type SkillOption } from '../../shared/app-api'

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
        setSkills(res.data ?? [])
        setLoading(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载 Skill 列表失败')
        setLoading(false)
      }
    })()
  }, [])

  return (
    <section className="model-settings">
      <h2>Skill</h2>
      <p className="model-editor-note">
        在 Composer 输入 <code>/</code> 选择 Skill。主对话与单 Agent 会注入所选 Skill；多智能体 DAG 中仅
        <strong> implementation </strong>
        子任务继承全局 Skill（research / review / test 使用任务画像 preamble，不自动加载 Skill）。
      </p>
      {error && <p className="settings-inline-error">{error}</p>}
      {loading ? (
        <p>加载中…</p>
      ) : !skills || skills.length === 0 ? (
        <p className="settings-list-empty">未发现 Skill。可在应用目录或受信任工作区的 <code>.taskweaver/skills</code> 添加。</p>
      ) : (
        <ul className="provider-list model-catalog-list" style={{ listStyle: 'none', padding: 0 }}>
          {skills.map((skill) => (
            <li key={skill.name} className="provider-row" style={{ display: 'block', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <strong>/{skill.name}</strong>
                {skill.multiAgent && (
                  <span className="skill-command-tag" style={{ fontSize: 11 }}>多智能体门控</span>
                )}
                <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                  {skillOptionSourceLabel(skill)}
                </span>
              </div>
              <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
                {skill.description || '（无简介）'}
              </p>
              {skill.source === 'dsh' && !skill.path && (
                <p style={{ margin: '5px 0 0', fontSize: 12, color: 'var(--text-tertiary)' }}>
                  由 DSH Runtime 原生管理。TaskWeaver 不读取其指令文件；选择后通过 DSH 的 /{skill.name} 手势加载。
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
