import { useMemo } from 'react'
import {
  Compass,
  Target,
  Users,
  Clock,
  Puzzle,
  Sparkles,
  Terminal,
  BookOpen,
  ArrowRight,
} from 'lucide-react'

type MainView = 'chat' | 'plugins' | 'pull-requests' | 'schedules' | 'explore'

interface ExploreSkill {
  name: string
  description: string
  multiAgent?: boolean
}

const WORKFLOWS: Array<{
  id: string
  title: string
  description: string
  icon: typeof Target
  hint?: string
  view?: MainView
  composerHint?: string
}> = [
  {
    id: 'goal-dag',
    title: '目标模式 · 多 Agent DAG',
    description: '复杂需求拆分子任务并行，右侧查看任务图与证据汇总。',
    icon: Target,
    hint: '输入 /goal 后描述目标',
    composerHint: '/goal ',
  },
  {
    id: 'multi-chip',
    title: '常规多 Agent',
    description: '不关目标模式，用输入框「多 Agent」芯片或设置默认 DAG。',
    icon: Users,
    hint: '侧栏设置 → 默认启用多 Agent',
    view: 'chat',
  },
  {
    id: 'readonly-audit',
    title: '只读仓库巡检',
    description: '适合毕设验收：只读扫描目录与关键入口，不改动文件。',
    icon: BookOpen,
    composerHint: '只读概览本仓库：根目录、package.json、electron 入口与 src 主界面，不要修改文件。',
  },
  {
    id: 'scheduled',
    title: '定时后台巡检',
    description: '应用打开时进程内调度；可安装 macOS LaunchAgent 关 App 仍执行。',
    icon: Clock,
    view: 'schedules',
  },
  {
    id: 'mcp',
    title: 'MCP 集成市场',
    description: '内置 GitHub、数据库等 MCP 模版，安装后 Host 工具即可调用。',
    icon: Puzzle,
    view: 'plugins',
  },
  {
    id: 'pr-review',
    title: 'GitHub Pull Requests',
    description: '读取工作区 origin 的开放 PR，一键交给 Agent 做只读审查。',
    icon: BookOpen,
    view: 'pull-requests',
  },
  {
    id: 'headless',
    title: '无头 CLI',
    description: '终端单轮：`npm run headless -- --text "…"`（需模型与 Host 已配置）。',
    icon: Terminal,
    hint: '见 docs/release-rhythm-v1.2.md',
  },
]

export function ExploreView({
  skills = [],
  onNavigate,
  onTryPrompt,
}: {
  skills?: ExploreSkill[]
  onNavigate: (view: MainView) => void
  onTryPrompt?: (text: string) => void
}) {
  const featuredSkills = useMemo(() => {
    const multi = skills.filter((s) => s.multiAgent)
    const rest = skills.filter((s) => !s.multiAgent)
    return [...multi, ...rest].slice(0, 8)
  }, [skills])

  return (
    <div className="codex-marketplace-page explore-view">
      <header className="explore-header">
        <h1><Compass size={24} aria-hidden /> 探索</h1>
        <p>推荐工作流、技能与路线图能力入口；与「集成」页互补（此处偏编排与毕设演示）。</p>
      </header>

      <section className="explore-section">
        <h2>推荐工作流</h2>
        <div className="explore-card-grid">
          {WORKFLOWS.map((card) => {
            const Icon = card.icon
            return (
              <article key={card.id} className="explore-card">
                <div className="explore-card-icon"><Icon size={20} /></div>
                <h3>{card.title}</h3>
                <p>{card.description}</p>
                {card.hint && <span className="explore-card-meta">{card.hint}</span>}
                <div className="explore-card-actions">
                  {card.view && (
                    <button type="button" className="codex-btn-primary" onClick={() => onNavigate(card.view!)}>
                      打开 <ArrowRight size={14} />
                    </button>
                  )}
                  {card.composerHint && onTryPrompt && (
                    <button
                      type="button"
                      className="settings-secondary-button"
                      onClick={() => {
                        onTryPrompt(card.composerHint!)
                        onNavigate('chat')
                      }}
                    >
                      试一下
                    </button>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      </section>

      <section className="explore-section">
        <h2><Sparkles size={18} /> 技能目录精选</h2>
        {featuredSkills.length === 0 ? (
          <p className="explore-empty">绑定工作区后可在「集成 → 技能」查看完整列表。</p>
        ) : (
          <ul className="explore-skill-list">
            {featuredSkills.map((skill) => (
              <li key={skill.name}>
                <strong>{skill.name}</strong>
                {skill.multiAgent && <span className="skill-command-tag">多智能体</span>}
                <span>{skill.description}</span>
              </li>
            ))}
          </ul>
        )}
        <button type="button" className="settings-secondary-button" onClick={() => onNavigate('plugins')}>
          打开集成市场
        </button>
      </section>
    </div>
  )
}
