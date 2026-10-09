import { useEffect, useRef } from 'react'
import type { TaskStatus } from '../types'

export function useAutosizeTextarea(value: string, minHeight: number, maxHeight: number) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const textarea = ref.current
    if (!textarea) return
    textarea.style.height = '0px'
    const nextHeight = Math.min(Math.max(textarea.scrollHeight, minHeight), maxHeight)
    textarea.style.height = `${nextHeight}px`
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden'
  }, [value, minHeight, maxHeight])

  return ref
}

export const statusMeta: Record<TaskStatus, { label: string; className: string }> = {
  done: { label: '已完成', className: 'done' },
  running: { label: '执行中', className: 'running' },
  queued: { label: '排队中', className: 'queued' },
  review: { label: '审查中', className: 'review' },
  cancelled: { label: '已停止', className: 'cancelled' },
}

export function workspaceLabel(path: string | null) {
  if (!path) return '未设置工作区'
  const parts = path.split(/[/\\]/).filter(Boolean)
  return parts[parts.length - 1] ?? path
}

export function threadUpdatedLabel(updatedAt: number) {
  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - updatedAt) / 60_000))
  if (elapsedMinutes < 1) return '刚刚'
  if (elapsedMinutes < 60) return `${elapsedMinutes} 分钟前`
  const elapsedHours = Math.floor(elapsedMinutes / 60)
  if (elapsedHours < 24) return `${elapsedHours} 小时前`
  const elapsedDays = Math.floor(elapsedHours / 24)
  return elapsedDays < 30 ? `${elapsedDays} 天前` : new Date(updatedAt).toLocaleDateString('zh-CN')
}
