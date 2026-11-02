import type { RoleProfile } from '../../shared/app-api'

export type RoleMentionQuery = { start: number; query: string }
export type RoleMentionRange = { start: number; end: number; id: string }

const mentionBoundary = /[\s,，。！？!?;；:：()[\]{}<>]/u

function normalizeName(name: string): string {
  return name.trim().toLocaleLowerCase()
}

const stageActionPatterns = [
  /(?:审查|审阅|审核|复核|检查|review(?:er)?|audit)/iu,
  /(?:规划|设计方案|拆解|plan(?:ning)?|architect)/iu,
  /(?:修改|改动|实现|写代码|编码|开发|实施|修复|implement|coding)/iu,
  /(?:研究|检索|核查|调研|research|investigate)/iu,
]

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function isExplicitRoleAssignment(text: string, profile: RoleProfile): boolean {
  const name = escapeRegExp(profile.name.trim())
  const assignmentLead = String.raw`(?:让|请|叫|交给|安排给|指派给)`
  return stageActionPatterns.some((action) => {
    const pattern = new RegExp(
      `${assignmentLead}\\s*@?(?:"${name}"|${name})\\s*(?:(?:先|再|去|来)\\s*)?(?:(?:负责|进行|执行|做|帮忙|帮我)\\s*)?${action.source}`,
      'iu',
    )
    return pattern.test(text)
  })
}

function readKnownRoleMention(
  text: string,
  index: number,
  profiles: readonly RoleProfile[],
): { id: string; end: number } | null {
  const candidates = [...profiles]
    .filter((profile) => profile.name && !/\s/u.test(profile.name))
    .sort((left, right) => right.name.length - left.name.length)
  for (const profile of candidates) {
    const end = index + 1 + profile.name.length
    if (normalizeName(text.slice(index + 1, end)) === normalizeName(profile.name)) {
      return { id: profile.id, end }
    }
  }
  return null
}

function isRoleMentionStart(text: string, index: number): boolean {
  if (index === 0) return true
  const previous = [...text.slice(0, index)].at(-1) ?? ''
  // Chinese text commonly attaches mentions directly to the preceding phrase
  // (for example, "帮我看看@小王"). Keep ASCII word characters as a boundary
  // guard so an email address such as "user@example.com" is not treated as a
  // Bot mention.
  return mentionBoundary.test(previous) || /\p{Script=Han}/u.test(previous)
}

function readMentionToken(text: string, index: number): { name: string; end: number } | null {
  if (text[index] !== '@') return null
  if (/^(file|dir):/i.test(text.slice(index + 1))) return null
  if (text[index + 1] === '"') {
    const end = text.indexOf('"', index + 2)
    if (end < 0) return null
    return { name: text.slice(index + 2, end), end: end + 1 }
  }
  let end = index + 1
  while (end < text.length && text[end] !== '@' && !mentionBoundary.test(text[end])) end += 1
  const name = text.slice(index + 1, end)
  if (/^(file|dir):/i.test(name)) return null
  return name ? { name, end } : null
}

export function findRoleMentionQuery(text: string, cursor: number): RoleMentionQuery | null {
  const beforeCursor = text.slice(0, cursor)
  const atIndex = beforeCursor.lastIndexOf('@')
  if (atIndex < 0 || !isRoleMentionStart(beforeCursor, atIndex)) return null
  if (atIndex >= 0 && /^(file|dir):/i.test(text.slice(atIndex + 1, cursor))) return null
  const mentionText = beforeCursor.slice(atIndex + 1)
  const match = mentionText.match(/^(?:"([^"\n]*)"?|([^\s@,，。！？!?;；:：()[\]{}<>]*))$/u)
  if (!match) return null
  const query = match[1] ?? match[2] ?? ''
  if (/^(file|dir):/i.test(query)) return null
  return { start: atIndex, query }
}

export function findRoleMentionRanges(
  text: string,
  profiles: readonly RoleProfile[],
): RoleMentionRange[] {
  const ranges: RoleMentionRange[] = []
  const byName = new Map(profiles.map((profile) => [normalizeName(profile.name), profile.id]))
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== '@' || !isRoleMentionStart(text, index)) continue
    const knownMention = readKnownRoleMention(text, index, profiles)
    if (knownMention) {
      ranges.push({ start: index, end: knownMention.end, id: knownMention.id })
      index = knownMention.end - 1
      continue
    }
    const mention = readMentionToken(text, index)
    if (!mention) continue
    const id = byName.get(normalizeName(mention.name))
    if (id) ranges.push({ start: index, end: mention.end, id })
    index = mention.end - 1
  }
  return ranges
}

export function resolveRoleRecipients(
  text: string,
  memberIds: readonly string[],
  profiles: readonly RoleProfile[],
): string[] {
  const members = [...new Set(memberIds)]
  if (members.length === 0) return []

  const selectedProfiles = profiles.filter((profile) => members.includes(profile.id))
  const byName = new Map(selectedProfiles.map((profile) => [normalizeName(profile.name), profile.id]))
  const mentionedIds: string[] = []
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== '@' || !isRoleMentionStart(text, index)) continue
    const knownMention = readKnownRoleMention(text, index, selectedProfiles)
    if (knownMention) {
      if (!mentionedIds.includes(knownMention.id)) mentionedIds.push(knownMention.id)
      index = knownMention.end - 1
      continue
    }
    const mention = readMentionToken(text, index)
    if (!mention) continue
    const id = byName.get(normalizeName(mention.name))
    if (id && !mentionedIds.includes(id)) mentionedIds.push(id)
    index = mention.end - 1
  }

  // A direct stage assignment such as “让 Kai 审查” is an explicit Bot
  // recipient even when the user did not type @. Include that profile so the
  // backend can assign the requested stage instead of silently choosing the
  // room's first default reviewer.
  const directedIds = profiles
    .filter((profile) => isExplicitRoleAssignment(text, profile))
    .map((profile) => profile.id)
  const explicitIds = [...new Set([...mentionedIds, ...directedIds])]

  // Explicit mentions narrow the turn to those Bots. Without mentions, every
  // Bot selected for this room participates in the shared group conversation.
  // A directly assigned stage owner joins even if they were not in the room.
  const recipients = mentionedIds.length > 0 ? [...mentionedIds] : [...members]
  for (const id of directedIds) {
    if (!recipients.includes(id)) recipients.push(id)
  }
  if (recipients.length <= 5) return recipients

  const required = new Set(explicitIds)
  const retained = recipients.filter((id) => required.has(id)).slice(0, 5)
  for (const id of recipients) {
    if (retained.length >= 5) break
    if (!retained.includes(id)) retained.push(id)
  }
  return retained
}

export function insertRoleMention(text: string, query: RoleMentionQuery, name: string): { text: string; cursor: number } {
  const token = /\s/u.test(name) ? `@"${name.replaceAll('"', '\\"')}"` : `@${name}`
  const quoted = text.slice(query.start, query.start + 2) === '@"'
  let end = query.start + query.query.length + (quoted ? 2 : 1)
  if (quoted && text[end] === '"') end += 1
  const spacer = text.slice(end).startsWith(' ') || end === text.length ? '' : ' '
  const nextText = `${text.slice(0, query.start)}${token}${spacer}${text.slice(end)}`
  return { text: nextText, cursor: query.start + token.length + spacer.length }
}
