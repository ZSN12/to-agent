import { Check, Circle, ListTodo, LoaderCircle } from 'lucide-react'
import type { HostTodoItem } from '../../shared/app-api'

/** Read-only rendering of the current session's Host-owned todo projection. */
export function HostTodoProjection({ items }: { items: readonly HostTodoItem[] | null }) {
  if (!items?.length) return null
  const completed = items.filter((item) => item.status === 'completed').length
  const active = items.filter((item) => item.status === 'in_progress').length

  return (
    <details className="host-todo-projection" open={items.length <= 5}>
      <summary>
        <ListTodo size={15} aria-hidden="true" />
        <span>Agent 任务 · Host</span>
        <span className="host-todo-count">{completed}/{items.length} 完成{active ? ` · ${active} 进行中` : ''}</span>
      </summary>
      <ul>
        {items.map((item, index) => (
          <li className={`host-todo-item ${item.status}`} key={`${item.status}:${item.content}:${index}`}>
            {item.status === 'completed'
              ? <Check size={14} aria-label="已完成" />
              : item.status === 'in_progress'
                ? <LoaderCircle size={14} aria-label="进行中" />
                : <Circle size={13} aria-label="待处理" />}
            <span>{item.content}</span>
          </li>
        ))}
      </ul>
    </details>
  )
}

