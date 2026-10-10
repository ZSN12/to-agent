import fs from 'node:fs/promises'
import path from 'node:path'

/**
 * 审批审计日志存储 (JSONL 基于会话隔离)
 * @param {{ agentDataPath: string }} options
 */
export function createApprovalAuditStore({ agentDataPath } = {}) {
  if (!agentDataPath) {
    throw new Error('agentDataPath is required for approval audit store')
  }

  const conversationsDir = path.join(agentDataPath, 'conversations')

  function getFilePath(conversationId) {
    if (!conversationId || typeof conversationId !== 'string') {
      throw new Error('Invalid conversationId')
    }
    return path.join(conversationsDir, `${conversationId}.approval.jsonl`)
  }

  /**
   * 追加一条审批审计事件
   * @param {string} conversationId
   * @param {string} type 事件类型，如 'approval/asked', 'approval/decided'
   * @param {object} payload 审计明细
   */
  async function append(conversationId, type, payload = {}) {
    await fs.mkdir(conversationsDir, { recursive: true })
    const entry = {
      type,
      ...payload,
      timestamp: Date.now(),
    }
    const line = JSON.stringify(entry) + '\n'
    await fs.appendFile(getFilePath(conversationId), line, 'utf8')
    return entry
  }

  /**
   * 查询最近 N 条审批审计事件
   * @param {string} conversationId
   * @param {number} limit
   */
  async function listRecent(conversationId, limit = 20) {
    const file = getFilePath(conversationId)
    try {
      const raw = await fs.readFile(file, 'utf8')
      const lines = raw.trim().split('\n').filter(Boolean)
      const rows = []
      for (const line of lines) {
        try {
          rows.push(JSON.parse(line))
        } catch {
          // 忽略格式损坏的单行
        }
      }
      return rows.slice(-limit)
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        return []
      }
      throw error
    }
  }

  return {
    append,
    listRecent,
  }
}
