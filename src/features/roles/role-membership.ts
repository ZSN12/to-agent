export type RoleMemberships = Record<string, string[]>

const STORAGE_KEY = 'taskweaver.role-members-by-conversation.v1'
const LEGACY_STORAGE_KEY = 'taskweaver.selected-role-ids'
const LEGACY_CONVERSATION_KEY = '__legacy__'

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function normalizeIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((id): id is string => typeof id === 'string' && id.length > 0))].slice(0, 5)
}

export function readRoleMemberships(storage: Pick<StorageLike, 'getItem'>): RoleMemberships {
  let memberships: RoleMemberships = {}
  try {
    const stored: unknown = JSON.parse(storage.getItem(STORAGE_KEY) ?? '{}')
    if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
      memberships = Object.fromEntries(
        Object.entries(stored).flatMap(([conversationId, ids]) => {
          if (!conversationId || !Array.isArray(ids)) return []
          return [[conversationId, normalizeIds(ids)]]
        }),
      )
    }
  } catch {
    // A corrupt convenience cache should never prevent the app from opening.
  }

  try {
    const legacyIds = normalizeIds(JSON.parse(storage.getItem(LEGACY_STORAGE_KEY) ?? '[]'))
    if (legacyIds.length && !memberships[LEGACY_CONVERSATION_KEY]) {
      memberships[LEGACY_CONVERSATION_KEY] = legacyIds
    }
  } catch {
    // Ignore an invalid legacy selection and start with empty rosters.
  }
  return memberships
}

export function writeRoleMemberships(storage: StorageLike, memberships: RoleMemberships): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(memberships))
  if (!memberships[LEGACY_CONVERSATION_KEY]) storage.removeItem(LEGACY_STORAGE_KEY)
}

export function roleMembersForConversation(memberships: RoleMemberships, conversationId: string): string[] {
  return memberships[conversationId] ?? []
}

export function setConversationRoleMembers(
  memberships: RoleMemberships,
  conversationId: string,
  roleIds: string[],
): RoleMemberships {
  return { ...memberships, [conversationId]: normalizeIds(roleIds) }
}

export function migrateLegacyRoleMembers(memberships: RoleMemberships, conversationId: string): RoleMemberships {
  const legacyIds = memberships[LEGACY_CONVERSATION_KEY]
  if (!legacyIds) return memberships

  const next = { ...memberships }
  delete next[LEGACY_CONVERSATION_KEY]
  if (!Object.hasOwn(memberships, conversationId)) next[conversationId] = legacyIds
  return next
}

export function removeRoleFromMemberships(memberships: RoleMemberships, roleId: string): RoleMemberships {
  let changed = false
  const next: RoleMemberships = {}
  for (const [conversationId, roleIds] of Object.entries(memberships)) {
    const filtered = roleIds.filter((id) => id !== roleId)
    changed ||= filtered.length !== roleIds.length
    next[conversationId] = filtered
  }
  return changed ? next : memberships
}
