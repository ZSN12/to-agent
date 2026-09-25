export interface ShortcutItem {
  id: string
  title: string
  description: string
  defaultKeys: string[]
  keys: string[]
}

export const DEFAULT_SHORTCUTS: ShortcutItem[] = [
  {
    id: 'follow-up',
    title: '排队追问 (Follow Up)',
    description: '在任务执行中将当前消息加入排队队列，待本轮任务结束后自动执行',
    defaultKeys: ['⌥', '↩'],
    keys: ['⌥', '↩'],
  },
  {
    id: 'steer',
    title: '实时插话纠偏 (Steering)',
    description: '在 Agent 运行中即时注入纠偏指令，实时调整当前执行计划',
    defaultKeys: ['↩'],
    keys: ['↩'],
  },
  {
    id: 'send',
    title: '发送消息',
    description: '在输入框中向主控 Agent 发送任务',
    defaultKeys: ['↩'],
    keys: ['↩'],
  },
  {
    id: 'new-line',
    title: '输入框换行',
    description: '在输入框中换行而不发送',
    defaultKeys: ['⇧', '↩'],
    keys: ['⇧', '↩'],
  },
  {
    id: 'jump-bottom',
    title: '定位到最新答案',
    description: '向上翻看历史记录时，快速平滑跳至最新输出',
    defaultKeys: ['⌥', '↓'],
    keys: ['⌥', '↓'],
  },
  {
    id: 'new-chat',
    title: '新聊天',
    description: '开始新聊天，重置对话上下文',
    defaultKeys: ['⌘', 'N'],
    keys: ['⌘', 'N'],
  },
  {
    id: 'toggle-dag',
    title: '切换任务 DAG 侧栏',
    description: '在主界面侧边展开或隐藏多智能体任务依赖图',
    defaultKeys: ['⌘', 'B'],
    keys: ['⌘', 'B'],
  },
  {
    id: 'cancel-esc',
    title: '退出 / 取消',
    description: '关闭当前设置、模态弹窗或终止正在执行的任务',
    defaultKeys: ['Esc'],
    keys: ['Esc'],
  },
]

const STORAGE_KEY = 'taskweaver.shortcuts'

export function loadShortcuts(): ShortcutItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as ShortcutItem[]
      // 保持与最新的默认项合并，确保新增项不丢失
      return DEFAULT_SHORTCUTS.map((def) => {
        const found = parsed.find((p) => p.id === def.id)
        return found ? { ...def, keys: Array.isArray(found.keys) ? found.keys : def.keys } : def
      })
    }
  } catch {
    // 忽略异常，降级到默认
  }
  return DEFAULT_SHORTCUTS.map((item) => ({ ...item, keys: [...item.defaultKeys] }))
}

export function saveShortcuts(shortcuts: ShortcutItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(shortcuts))
  } catch {
    // 忽略存储失败
  }
}

export interface KeyEventLike {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
}

export function parseEventToKeys(e: KeyEventLike): string[] | null {
  // 单独按修饰键时不作为有效按键捕获
  if (['Meta', 'Control', 'Alt', 'Shift'].includes(e.key)) {
    return null
  }

  const keys: string[] = []
  if (e.metaKey) keys.push('⌘')
  if (e.ctrlKey) keys.push('⌃')
  if (e.altKey) keys.push('⌥')
  if (e.shiftKey) keys.push('⇧')

  const k = e.key
  if (k === 'Enter') keys.push('↩')
  else if (k === 'Escape') keys.push('Esc')
  else if (k === 'Backspace') keys.push('⌫')
  else if (k === 'Delete') keys.push('Del')
  else if (k === 'ArrowUp') keys.push('↑')
  else if (k === 'ArrowDown') keys.push('↓')
  else if (k === 'ArrowLeft') keys.push('←')
  else if (k === 'ArrowRight') keys.push('→')
  else if (k === 'Tab') keys.push('Tab')
  else if (k === ' ') keys.push('Space')
  else keys.push(k.length === 1 ? k.toUpperCase() : k)

  return keys
}

export function matchesKeys(e: KeyEventLike, targetKeys: string[] | undefined): boolean {
  if (!targetKeys || targetKeys.length === 0) return false
  const eventKeys = parseEventToKeys(e)
  if (!eventKeys || eventKeys.length === 0) return false
  if (eventKeys.length !== targetKeys.length) return false
  return eventKeys.every((key, index) => key === targetKeys[index])
}
