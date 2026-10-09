/** 将 DSH / Cursor 风格的长段 Skill 说明压缩为设置页与菜单可扫读的摘要 */
export function skillDescriptionBlurb(description: string, maxLen = 160, skillName?: string): string {
  const trimmed = description.trim()
  if (!trimmed) {
    if (skillName) return `在 Composer 输入 /${skillName} 调用该技能。`
    return '（无简介）'
  }

  const useWhen = trimmed.match(/Use when\s+([\s\S]+?)(?=命令前缀|$)/i)?.[1]?.trim()
  if (useWhen) {
    const firstClause = useWhen.split(/[。；;]/)[0]?.trim() ?? useWhen
    if (firstClause.length <= maxLen) return firstClause
    return `${firstClause.slice(0, maxLen).trim()}…`
  }

  const firstLine = trimmed.split(/\n/)[0]?.trim() ?? trimmed
  const firstSentence = firstLine.split(/[。.]/)[0]?.trim() ?? firstLine
  if (firstSentence.length <= maxLen) return firstSentence
  return `${firstSentence.slice(0, maxLen).trim()}…`
}
