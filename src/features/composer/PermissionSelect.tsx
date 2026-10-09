import { Check, ChevronDown, ShieldAlert } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { PermissionMode } from '../../shared/app-api'

const permissionOptions: { mode: PermissionMode; title: string; description: string }[] = [
  { mode: 'readonly', title: '只读', description: 'Host read-only：禁止修改文件；计划审阅或纯理解任务可用。' },
  { mode: 'ask', title: '工作区可写', description: 'Host workspace-write：工作区内可改；越界时请求审批。' },
  { mode: 'full', title: '完全访问', description: 'Host danger-full-access：关闭沙箱；意外审批仍会显示。' },
]

export function PermissionSelect({ value, onChange }: { value: PermissionMode; onChange: (mode: PermissionMode) => void }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const selected = permissionOptions.find((option) => option.mode === value)
    ?? (value === 'on-risk' ? permissionOptions.find((option) => option.mode === 'ask') : undefined)
    ?? permissionOptions[1]
  useEffect(() => {
    if (!open) return
    const dismiss = (event: MouseEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false)
    }
    window.addEventListener('mousedown', dismiss)
    return () => window.removeEventListener('mousedown', dismiss)
  }, [open])

  return <div className="permission-select" ref={rootRef}>
    <button type="button" className="access-button permission-trigger" onClick={() => setOpen((current) => !current)} aria-expanded={open} aria-haspopup="listbox">
      <ShieldAlert size={17} /><span>{selected.title}</span><ChevronDown size={13} />
    </button>
    {open && <div className="permission-menu" role="listbox" aria-label="工具审批模式">
      <div className="permission-menu-heading">工具审批</div>
      {permissionOptions.map((option) => <button key={option.mode} type="button" role="option" aria-selected={option.mode === value} className="permission-option" onClick={() => { onChange(option.mode); setOpen(false) }}>
        <span className="permission-option-copy"><strong>{option.title}</strong><small>{option.description}</small></span>
        {option.mode === value && <Check size={15} />}
      </button>)}
      <p className="permission-notice">审批提示不等于操作系统沙箱；完整访问不会限制 Agent 对本机文件或网络的访问。</p>
    </div>}
  </div>
}
