import assert from 'node:assert/strict'
import {
  migrateLegacyRoleMembers,
  readRoleMemberships,
  removeRoleFromMemberships,
  roleMembersForConversation,
  setConversationRoleMembers,
  writeRoleMemberships,
} from '../src/features/roles/role-membership.ts'

class MemoryStorage {
  values = new Map()
  getItem(key) { return this.values.get(key) ?? null }
  setItem(key, value) { this.values.set(key, value) }
  removeItem(key) { this.values.delete(key) }
}

const storage = new MemoryStorage()
storage.setItem('taskweaver.selected-role-ids', JSON.stringify(['bot-wang', 'bot-zhang']))
const loaded = readRoleMemberships(storage)
assert.deepEqual(roleMembersForConversation(loaded, 'conversation-one'), [],
  'legacy members are not treated as a global roster')

const migrated = migrateLegacyRoleMembers(loaded, 'conversation-one')
assert.deepEqual(roleMembersForConversation(migrated, 'conversation-one'), ['bot-wang', 'bot-zhang'])
assert.deepEqual(roleMembersForConversation(migrated, 'conversation-two'), [],
  'members from one conversation do not appear in another')

const secondConversation = setConversationRoleMembers(migrated, 'conversation-two', ['bot-zhang'])
assert.deepEqual(roleMembersForConversation(secondConversation, 'conversation-one'), ['bot-wang', 'bot-zhang'])
assert.deepEqual(roleMembersForConversation(secondConversation, 'conversation-two'), ['bot-zhang'])
assert.equal(Object.hasOwn(secondConversation, '__legacy__'), false)

const withoutDeletedBot = removeRoleFromMemberships(secondConversation, 'bot-zhang')
assert.deepEqual(roleMembersForConversation(withoutDeletedBot, 'conversation-one'), ['bot-wang'])
assert.deepEqual(roleMembersForConversation(withoutDeletedBot, 'conversation-two'), [])

writeRoleMemberships(storage, withoutDeletedBot)
assert.equal(storage.getItem('taskweaver.selected-role-ids'), null,
  'the old global roster is cleared after migration')
assert.deepEqual(JSON.parse(storage.getItem('taskweaver.role-members-by-conversation.v1')), withoutDeletedBot)

console.log('角色会话成员验证通过：会话隔离、旧数据迁移和角色删除清理。')
