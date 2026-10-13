/**
 * 分支点换算（纯函数，便于单测）。
 *
 * 语义：
 * - assistant 消息：分支保留到该消息为止（含）。
 * - user 消息：分支保留「该用户消息所在的整轮」——从该消息到下一条 user 消息之前。
 *   DSH 侧 `sessions.fork({ atSeq })` 切在该轮的 turn/end，模型会看到这一轮的回答，
 *   所以 UI 分支也必须包含这一轮的回答，否则模型上下文与界面不一致。
 * - 低层切片函数在 messageId 缺失或找不到时保留全部消息；IPC 入口先用
 *   resolveForkSelection 校验 UI 分支点，缺失或无法映射时会 fail closed。
 */

/** 返回切片的结束下标（不含）。 */
export function resolveForkSliceEnd(messages, messageId) {
  const list = Array.isArray(messages) ? messages : []
  if (!messageId) return list.length
  const index = list.findIndex((message) => message?.id === messageId)
  if (index < 0) return list.length
  if (list[index]?.author !== 'user') return index + 1
  for (let next = index + 1; next < list.length; next += 1) {
    if (list[next]?.author === 'user') return next
  }
  return list.length
}

export function sliceForkMessages(messages, messageId) {
  const list = Array.isArray(messages) ? messages : []
  return list.slice(0, resolveForkSliceEnd(list, messageId))
}

/** 切片内的 user 消息数 = 保留的轮数（一条 user 消息对应 DSH 日志里的一个 turn）。 */
export function resolveForkCompletedTurns(messages, messageId) {
  const list = Array.isArray(messages) ? messages : []
  if (!list.length) return undefined
  const userTurns = sliceForkMessages(list, messageId).filter((message) => message?.author === 'user').length
  return userTurns > 0 ? userTurns : undefined
}

/**
 * Resolve a displayed transcript row to the durable thread message used for
 * the local fork. DSH transcript IDs are projection keys, while older thread
 * messages have TaskWeaver-generated IDs; treating a projection key as an
 * unknown local ID would otherwise make sliceForkMessages retain the whole
 * transcript silently.
 *
 * @returns {{ messageId: string | null, completedTurns?: number } | null}
 */
export function resolveForkSelection(messages, messageId, transcriptRows = []) {
  const list = Array.isArray(messages) ? messages : []
  if (messageId === undefined || messageId === null || messageId === '') {
    return null
  }

  if (list.some((message) => message?.id === messageId)) {
    return { messageId, completedTurns: resolveForkCompletedTurns(list, messageId) }
  }

  const match = /^dsh-(user|asst)-(.+)$/.exec(String(messageId))
  if (!match || !Array.isArray(transcriptRows)) return null
  const expectedRole = match[1] === 'user' ? 'user' : 'assistant'
  const targetIndex = transcriptRows.findIndex((row) =>
    row?.dshKey === match[2] && row?.role === expectedRole,
  )
  if (targetIndex < 0) return null

  // Forking a user row keeps its entire turn; for the latest assistant row,
  // the same count lands on the turn that produced that answer.
  const transcriptUsers = transcriptRows
    .slice(0, targetIndex + 1)
    .filter((row) => row?.role === 'user')
  const persistedUsers = list.filter((message) => message?.author === 'user')
  if (transcriptUsers.length < 1) return null

  // DSH stores the fully assembled prompt, while the local thread stores the
  // user's original text. Use the turn timestamp when available; text is only
  // a fallback for old messages without timestamps. Missing local error turns
  // can otherwise shift every later ordinal and fork the wrong point.
  const normalizeTimestamp = (value) => {
    const timestamp = Number(value)
    if (!Number.isFinite(timestamp) || timestamp <= 0) return null
    return timestamp < 100_000_000_000 ? timestamp * 1000 : timestamp
  }
  let previousUserIndex = -1
  let persistedUser = null
  for (const row of transcriptUsers) {
    const rowTimestamp = normalizeTimestamp(row?.timestamp)
    const candidates = []
    for (let index = previousUserIndex + 1; index < persistedUsers.length; index += 1) {
      const local = persistedUsers[index]
      const localTimestamp = normalizeTimestamp(local?.timestamp)
      if (rowTimestamp !== null && localTimestamp !== null) {
        candidates.push({ index, distance: Math.abs(localTimestamp - rowTimestamp) })
      }
    }

    let matchedIndex = -1
    if (candidates.length > 0) {
      candidates.sort((a, b) => a.distance - b.distance)
      if (candidates[1]?.distance === candidates[0].distance) return null
      matchedIndex = candidates[0].index
    } else {
      const remaining = persistedUsers
        .map((message, index) => ({ message, index }))
        .filter(({ index }) => index > previousUserIndex)
      const textMatches = remaining.filter(({ message }) => message?.text === row?.text)
      if (textMatches.length === 1) matchedIndex = textMatches[0].index
      else if (textMatches.length === 0 && remaining.length === 1) matchedIndex = remaining[0].index
      else return null
    }

    persistedUser = persistedUsers[matchedIndex]
    previousUserIndex = matchedIndex
  }

  if (typeof persistedUser?.id !== 'string' || !persistedUser.id) return null
  return { messageId: persistedUser.id, completedTurns: transcriptUsers.length }
}
