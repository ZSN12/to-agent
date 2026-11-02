import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  bridgeFailureMessage,
  composerSubmissionKey,
  isSameComposerDraftTarget,
  reconcileRunningConversationIds,
  shouldAutoRestoreFailedDraft,
  UncertainSendTracker,
} from '../src/features/app/hooks/conversation-run-reliability.ts'

const reconcile = (overrides = {}) => reconcileRunningConversationIds({
  localIds: new Set(),
  backendIds: new Set(),
  eventVersionsAtRequest: new Map(),
  currentEventVersions: new Map(),
  inFlightSendIds: new Set(),
  uncertainSendAfterSync: new Map(),
  syncVersion: 1,
  ...overrides,
})

assert.deepEqual(
  [...reconcile({
    localIds: new Set(['c1']),
    eventVersionsAtRequest: new Map([['c1', 1]]),
    currentEventVersions: new Map([['c1', 2]]),
  })],
  ['c1'],
  'a stale backend snapshot cannot clear a run started after the snapshot began',
)

assert.deepEqual(
  [...reconcile({
    localIds: new Set(),
    backendIds: new Set(['c1']),
    eventVersionsAtRequest: new Map([['c1', 1]]),
    currentEventVersions: new Map([['c1', 2]]),
  })],
  [],
  'a stale backend snapshot cannot resurrect a run ended after the snapshot began',
)

assert.deepEqual(
  [...reconcile({
    localIds: new Set(['c1']),
    inFlightSendIds: new Set(['c1']),
  })],
  ['c1'],
  'a pre-admission poll cannot clear the optimistic state while send is in flight',
)

assert.deepEqual(
  [...reconcile({
    localIds: new Set(['c1']),
    uncertainSendAfterSync: new Map([['c1', 3]]),
    syncVersion: 3,
  })],
  ['c1'],
  'a poll that began before an uncertain send failed cannot reconcile it',
)

assert.deepEqual(
  [...reconcile({
    localIds: new Set(['c1']),
    uncertainSendAfterSync: new Map([['c1', 3]]),
    syncVersion: 4,
  })],
  [],
  'a later snapshot can clear the ordinary running marker once no run was observed; the hook separately retains the retry gate until transcript confirmation',
)

assert.deepEqual(
  [...reconcile({
    localIds: new Set(['c1']),
    backendIds: new Set(['c1']),
    uncertainSendAfterSync: new Map([['c1', 3]]),
    syncVersion: 4,
  })],
  ['c1'],
  'a later authoritative snapshot preserves an active backend run',
)

assert.equal(bridgeFailureMessage('发送', new Error('bridge closed')), '发送请求状态未能确认：bridge closed。正在等待连接恢复；恢复后会同步运行状态，请先检查对话再决定是否重试。')
assert.equal(bridgeFailureMessage('发送', 'offline'), '发送请求状态未能确认：offline。正在等待连接恢复；恢复后会同步运行状态，请先检查对话再决定是否重试。')
assert.equal(bridgeFailureMessage('停止', null), '停止请求状态未能确认。正在等待连接恢复；恢复后会同步运行状态，请先检查对话再决定是否重试。')
assert.equal(shouldAutoRestoreFailedDraft('rejected', true, true), true,
  'an explicitly rejected draft restores automatically when the same composer is still untouched')
assert.equal(shouldAutoRestoreFailedDraft('rejected', true, false), false,
  'a later user edit is never overwritten by an automatic draft restore')
assert.equal(shouldAutoRestoreFailedDraft('rejected', false, true), false,
  'a delayed failure from another conversation cannot populate the active composer')
assert.equal(shouldAutoRestoreFailedDraft('uncertain', true, true), false,
  'a lost reply requires a deliberate restore after checking for a duplicate')
assert.equal(isSameComposerDraftTarget('thread-2', 'c2', 'thread-1', 'c1'), false,
  'a delayed reply from another thread cannot update the active composer notice')
assert.equal(isSameComposerDraftTarget('thread-1', 'c1', 'thread-1', 'c1'), true,
  'composer feedback stays in the same thread and conversation that submitted it')
assert.equal(composerSubmissionKey('conversation:c1', 4), composerSubmissionKey('conversation:c1', 4),
  'the same draft revision is protected from duplicate submission')
assert.notEqual(composerSubmissionKey('conversation:c1', 4), composerSubmissionKey('conversation:c1', 5),
  'a new draft revision can be submitted while an earlier request in the same conversation is still running')

const composerSource = await readFile(new URL('../src/features/composer/Composer.tsx', import.meta.url), 'utf8')
assert.match(composerSource, /composerSubmissionKey\(snapshot\.key, snapshot\.revision\)/,
  'the submission guard is scoped to a draft revision instead of locking the whole conversation')
assert.match(composerSource, /data-testid="steer-message"/,
  'a running turn exposes a visible control for immediate steering')
assert.match(composerSource, /data-testid="queue-follow-up"/,
  'a running turn exposes a separate control for queued follow-up messages')
assert.match(composerSource, /dispatchRunningMessage\('steer'/,
  'steering shortcuts and the visible control use the same queued-message path')
assert.match(composerSource, /roleMode \? 'steer' : 'followUp'/,
  'sending in Bot group mode routes the entered correction to its active role sessions')
const mainConversationSource = await readFile(new URL('../src/features/chat/MainConversation.tsx', import.meta.url), 'utf8')
assert.match(mainConversationSource, /onSteer=\{onSteer\}/,
  'Bot group mode keeps the steering handler connected to the composer')
const successfulDispatch = composerSource.match(/if \(result !== false && result !== 'uncertain'\) \{([\s\S]*?)\n\s*\}/)
assert.ok(successfulDispatch, 'Composer keeps an explicit successful dispatch branch')
assert.doesNotMatch(successfulDispatch[1], /draftsMapRef/,
  'a delayed success from an earlier send cannot delete a draft cached after switching back and typing')

// UncertainSendTracker state transitions test
const tracker = new UncertainSendTracker()
assert.equal(tracker.has('c1'), false)
const gen1 = tracker.markUncertain('c1', 10)
assert.equal(gen1, 1)
assert.equal(tracker.has('c1'), true)
assert.equal(tracker.isTranscriptConfirmed('c1'), false)
assert.equal(tracker.getSyncVersion('c1'), 10)

// Ignore mismatched generation
tracker.confirmTranscript('c1', 999, 12)
assert.equal(tracker.isTranscriptConfirmed('c1'), false)
assert.equal(tracker.getSyncVersion('c1'), 10)

// Accept matching generation
tracker.confirmTranscript('c1', 1, 15)
assert.equal(tracker.isTranscriptConfirmed('c1'), true)
assert.equal(tracker.getSyncVersion('c1'), 15)

// toSyncVersionMap returns latest versions
const map = tracker.toSyncVersionMap()
assert.equal(map.get('c1'), 15)

tracker.clear('c1')
assert.equal(tracker.has('c1'), false)

console.log('conversation run reliability checks passed')
