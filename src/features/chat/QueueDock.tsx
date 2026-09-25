import { FastForward, Pencil, Trash2, Zap } from 'lucide-react'
import { useState } from 'react'
import type { PromptQueueSnapshot } from '../../shared/app-api'

type QueueKind = 'steering' | 'followUp'

export function QueueDock({
  queue,
  sending,
  onMutate,
}: {
  queue: PromptQueueSnapshot
  sending: boolean
  onMutate: (payload: { kind: QueueKind; index: number; action: 'remove' | 'update'; text?: string }) => void
}) {
  const [editing, setEditing] = useState<{ kind: QueueKind; index: number; text: string } | null>(null)
  const steering = queue.steering ?? []
  const followUp = queue.followUp ?? []
  const total = steering.length + followUp.length
  if (!sending || total === 0) return null

  const renderLane = (kind: QueueKind, label: string, items: string[], icon: 'steer' | 'follow') => (
    <div className="queue-dock-lane" key={kind}>
      <div className="queue-dock-lane-head">
        {icon === 'steer' ? <Zap size={13} /> : <FastForward size={13} />}
        <span>{label}</span>
        <span className="queue-dock-count">{items.length}</span>
      </div>
      <ul className="queue-dock-list">
        {items.map((text, index) => (
          <li key={`${kind}-${index}-${text.slice(0, 16)}`} className="queue-dock-row">
            {editing?.kind === kind && editing.index === index ? (
              <input
                className="queue-dock-editor"
                autoFocus
                value={editing.text}
                onChange={(e) => setEditing({ kind, index, text: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setEditing(null)
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                    e.preventDefault()
                    onMutate({ kind, index, action: 'update', text: editing.text })
                    setEditing(null)
                  }
                }}
              />
            ) : (
              <span className="queue-dock-text">{text}</span>
            )}
            <div className="queue-dock-actions">
              <button type="button" className="queue-dock-icon" title="编辑" onClick={() => setEditing({ kind, index, text })}>
                <Pencil size={13} />
              </button>
              <button
                type="button"
                className="queue-dock-icon danger"
                title="移除"
                onClick={() => onMutate({ kind, index, action: 'remove' })}
              >
                <Trash2 size={13} />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )

  return (
    <div className="queue-dock" role="region" aria-label="提示队列">
      {renderLane('steering', '纠偏队列', steering, 'steer')}
      {renderLane('followUp', '排队追问', followUp, 'follow')}
    </div>
  )
}
