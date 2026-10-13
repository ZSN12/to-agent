import assert from 'node:assert/strict'
import { isDshContextMessage, mergeStoredMessagesWithDshTranscript } from '../src/features/dsh-runtime/dshTranscriptMessages'

const originalText = '你好'
const assembledPrompt = '<taskweaver_cursor_tools>read, grep, bash</taskweaver_cursor_tools>\n你好'
const displayed = mergeStoredMessagesWithDshTranscript(
  [{
    id: 'local-user-1',
    author: 'user',
    name: '你',
    time: '20:49',
    timestamp: 1_000,
    text: originalText,
  }],
  [
    {
      dshKey: 'plugin-context-1',
      role: 'context',
      text: '审批策略上下文',
      plugin: 'user-approval',
      timestamp: 995,
    },
    {
      dshKey: 'host-user-1',
      role: 'user',
      text: assembledPrompt,
      timestamp: 1_010,
    },
    {
      dshKey: 'host-assistant-1',
      role: 'assistant',
      text: '你好。',
      timestamp: 2_000,
    },
  ],
  true,
)

const userMessage = displayed.find((message) => message.author === 'user')
assert.equal(userMessage?.text, originalText, 'the user bubble should show only the text they typed')
assert.doesNotMatch(userMessage?.text ?? '', /taskweaver_cursor_tools/)
const contextMessage = displayed.find(isDshContextMessage)
assert.equal(contextMessage?.dshContext.plugin, 'user-approval', 'plugin context remains a separate auditable row')

const unmatched = mergeStoredMessagesWithDshTranscript(
  [{
    id: 'old-user',
    author: 'user',
    name: '你',
    time: '20:00',
    timestamp: 1_000,
    text: '早上好',
  }],
  [{
    dshKey: 'later-host-user',
    role: 'user',
    text: assembledPrompt,
    timestamp: 1_000 + 11 * 60 * 1000,
  }],
  true,
)
assert.equal(unmatched[0].text, assembledPrompt, 'unrelated older local messages must not replace a Host row')

console.log('dsh-transcript-messages regression passed')
