import assert from 'node:assert/strict'
import {
  findRoleMentionQuery,
  findRoleMentionRanges,
  insertRoleMention,
  resolveRoleRecipients,
} from '../src/features/roles/role-routing.ts'

const profiles = [
  { id: 'wang', name: '小王' },
  { id: 'zhang', name: '小张' },
  { id: 'kai', name: 'Kai' },
  { id: 'reviewer', name: 'Code Reviewer' },
].map((profile) => ({
  ...profile,
  description: '',
  modelKey: 'test-model',
  persona: 'test persona',
  createdAt: 0,
  updatedAt: 0,
}))

assert.deepEqual(resolveRoleRecipients('帮我看看这个设计', ['wang', 'zhang'], profiles), ['wang', 'zhang'],
  'ordinary messages go to every selected Bot in room order')
assert.deepEqual(resolveRoleRecipients('请 @小张 给建议', ['wang', 'zhang'], profiles), ['zhang'],
  'an explicit mention narrows the turn to that Bot')
assert.deepEqual(resolveRoleRecipients('帮我看看@小张', ['wang', 'zhang'], profiles), ['zhang'],
  'a Bot mention attached to Chinese text still routes correctly')
assert.deepEqual(resolveRoleRecipients('@小王你修改一下 然后让Kai审查一下', ['wang', 'zhang'], profiles), ['wang', 'kai'],
  'a Chinese sentence attached to a known @name parses the name, and a named reviewer joins explicitly')
assert.deepEqual(resolveRoleRecipients(
  '@小王你修改一下 然后让Kai审查一下',
  ['wang', 'zhang'],
  profiles.filter((profile) => profile.id !== 'kai'),
), ['wang'], 'an unavailable named reviewer does not widen a valid @mention to all room members')
assert.deepEqual(resolveRoleRecipients('修改后请让Kai审查', ['wang', 'zhang'], profiles), ['wang', 'zhang', 'kai'],
  'a directly assigned Bot joins the selected room for its requested stage')
assert.deepEqual(resolveRoleRecipients('@小张 和 @小王 一起讨论', ['wang', 'zhang'], profiles), ['zhang', 'wang'],
  'multiple mentions route in the order written')
assert.deepEqual(resolveRoleRecipients('@小张 @小张', ['wang', 'zhang'], profiles), ['zhang'],
  'duplicate mentions are deduplicated')
assert.deepEqual(resolveRoleRecipients('请 @Code Reviewer 看一下', ['wang', 'reviewer'], profiles), ['wang', 'reviewer'],
  'unquoted multiword names are not guessed')
assert.deepEqual(resolveRoleRecipients('请 @"Code Reviewer" 看一下', ['wang', 'reviewer'], profiles), ['reviewer'],
  'quoted Bot names with spaces route correctly')
assert.deepEqual(resolveRoleRecipients('请 @小张 看一下', ['wang'], profiles), ['wang'],
  'a Bot outside the room does not join through a mention')
assert.deepEqual(resolveRoleRecipients('请引用 @file:src/App.tsx', ['wang', 'zhang'], profiles), ['wang', 'zhang'],
  'file references do not route the message to a Bot')

assert.deepEqual(findRoleMentionQuery('请 @小', 4), { start: 2, query: '小' })
assert.deepEqual(findRoleMentionQuery('帮我看看@小', 6), { start: 4, query: '小' },
  'the Bot picker opens when a mention follows Chinese text without a space')
assert.deepEqual(findRoleMentionQuery('请 @"Code Rev', 12), { start: 2, query: 'Code Rev' })
assert.equal(findRoleMentionQuery('user@example.com', 11), null,
  'email addresses do not open the Bot picker')
assert.equal(findRoleMentionQuery('请 @file:src', 12), null,
  'workspace file references do not open the Bot picker')
assert.deepEqual(insertRoleMention('请 @小', { start: 2, query: '小' }, '小张'), {
  text: '请 @小张',
  cursor: 5,
})
assert.deepEqual(insertRoleMention('问 @"Code Rev"', { start: 2, query: 'Code Rev' }, 'Code Reviewer'), {
  text: '问 @"Code Reviewer"',
  cursor: 18,
})
assert.deepEqual(findRoleMentionRanges('请 @小张 和 @"Code Reviewer"', profiles), [
  { start: 2, end: 5, id: 'zhang' },
  { start: 8, end: 24, id: 'reviewer' },
], 'only known Bot mentions are highlighted, including quoted names')
assert.deepEqual(findRoleMentionRanges('user@example.com @file:src/App.tsx', profiles), [],
  'email addresses and file references are not highlighted as Bot mentions')

console.log('Bot 群聊路由验证通过：默认全员协作、@ 限定单人/多人、成员边界和 @ 输入。')
