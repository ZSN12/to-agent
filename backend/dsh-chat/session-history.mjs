import { rpcValue } from './prelude.mjs'

export async function readMissingEvents(api, sessionId, afterSeq) {
  const pages = []
  let beforeSeq
  for (;;) {
    const page = rpcValue(await api.sessions.history({ sessionId, maxMessages: 80,
      ...(beforeSeq === undefined ? {} : { beforeSeq }) }), '补齐 Z 会话历史')
    const rows = page.events ?? []
    pages.push(rows)
    const firstSeq = rows.reduce((min, row) => Number.isInteger(row.event?.seq) ? Math.min(min, row.event.seq) : min, Infinity)
    if (!page.hasMore || firstSeq <= afterSeq) break
    if (!Number.isFinite(firstSeq) || (beforeSeq !== undefined && firstSeq >= beforeSeq)) {
      throw new Error('Z 历史分页未前进，无法确认遗漏事件；未重新发送任务')
    }
    beforeSeq = firstSeq
  }
  const entries = new Map()
  for (const row of pages.flat()) {
    if (Number.isInteger(row.event?.seq) && row.event.seq > afterSeq) entries.set(row.event.seq, row)
  }
  return [...entries.values()].sort((a, b) => a.event.seq - b.event.seq)
}
