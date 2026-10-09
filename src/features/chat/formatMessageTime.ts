import { clockLabelZh } from '../../shared/time-label'

export function formatMessageTime(time: string, timestamp?: number, id?: string): string {
  let ts = timestamp
  if (!ts && id) {
    const match = id.match(/^m-(\d{10,13})-/)
    if (match) {
      const parsed = Number(match[1])
      if (!Number.isNaN(parsed) && parsed > 0) ts = parsed
    }
  }

  if (ts) {
    const msgDate = new Date(ts)
    const now = new Date()
    const isToday =
      msgDate.getFullYear() === now.getFullYear() &&
      msgDate.getMonth() === now.getMonth() &&
      msgDate.getDate() === now.getDate()

    if (isToday) {
      return time || clockLabelZh(ts)
    }

    const year = msgDate.getFullYear()
    const month = String(msgDate.getMonth() + 1).padStart(2, '0')
    const day = String(msgDate.getDate()).padStart(2, '0')
    const clock = time || clockLabelZh(ts)

    return `${year}-${month}-${day} ${clock}`
  }

  return time
}
