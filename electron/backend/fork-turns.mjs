/**
 * 分支点换算（纯函数，便于单测）。
 *
 * 语义：
 * - assistant 消息：分支保留到该消息为止（含）。
 * - user 消息：分支保留「该用户消息所在的整轮」——从该消息到下一条 user 消息之前。
 *   DSH 侧 `sessions.fork({ atSeq })` 切在该轮的 turn/end，模型会看到这一轮的回答，
 *   所以 UI 分支也必须包含这一轮的回答，否则模型上下文与界面不一致。
 * - messageId 缺失或找不到：保留全部消息。
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
