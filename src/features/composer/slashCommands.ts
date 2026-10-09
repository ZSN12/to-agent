import { Code2, ListTodo, Minimize2, Target, Users, type LucideIcon } from 'lucide-react'
import type { WorkMode } from '../../shared/app-api'

export interface SlashCommandItem {
  id: string
  kind: 'mode' | 'action'
  command: string
  title: string
  description: string
  icon: LucideIcon
  badge?: string
  mode?: WorkMode
}

export const BUILTIN_SLASH_COMMANDS: SlashCommandItem[] = [
  {
    id: 'goal',
    kind: 'mode',
    command: 'goal',
    title: '目标模式',
    description: '设置要持续追求的目标，由规划器拆解 DAG 多智能体推进',
    icon: Target,
    badge: '多智能体',
    mode: 'goal',
  },
  {
    id: 'plan',
    kind: 'action',
    command: 'plan',
    title: '计划模式',
    description: '执行 Host 原生 /plan 命令；状态来自当前会话投影，不代表只读权限',
    icon: ListTodo,
    badge: 'Host',
  },
  {
    id: 'code',
    kind: 'mode',
    command: 'code',
    title: '常规执行',
    description: '常规编码执行模式，单 Agent 极速直达代码修改与测试',
    icon: Code2,
    mode: 'code',
  },
  {
    id: 'multi-on',
    kind: 'action',
    command: 'multi on',
    title: '开启多 Agent',
    description: '常规模式下本条及后续消息走 DAG 多智能体（可在输入框旁关闭）',
    icon: Users,
    badge: '编排',
  },
  {
    id: 'multi-off',
    kind: 'action',
    command: 'multi off',
    title: '关闭多 Agent',
    description: '恢复常规单 Agent，保留目标模式 (/goal) 不变',
    icon: Users,
  },
  {
    id: 'compact',
    kind: 'action',
    command: 'compact',
    title: '压缩上下文',
    description: '手动压缩会话历史，提炼核心上下文记忆并释放 Token 空间',
    icon: Minimize2,
    badge: '优化',
  },
]

export function findSkillQuery(text: string, cursor: number) {
  const beforeCursor = text.slice(0, cursor)
  const match = beforeCursor.match(/(?:^|\s)\/([^\s/]*)$/)
  if (!match) return null
  return { start: cursor - match[1].length - 1, query: match[1] }
}

export function findContextQuery(text: string, cursor: number) {
  const beforeCursor = text.slice(0, cursor)
  const match = beforeCursor.match(/(?:^|\s)@([^\s@]*)$/)
  if (!match || /^(file|dir):/i.test(match[1])) return null
  return { start: cursor - match[1].length - 1, query: match[1] }
}
