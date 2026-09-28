import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createApprovalAuditStore } from '../electron/backend/approval-audit.mjs'

const agentDataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'tw-audit-'))
const conversationId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
const audit = createApprovalAuditStore({ agentDataPath })

await audit.append(conversationId, 'approval/asked', {
  id: 'appr-1',
  toolName: 'bash',
  reason: '运行终端命令',
})
await audit.append(conversationId, 'approval/decided', {
  id: 'appr-1',
  outcome: 'allowed-once',
})

const rows = await audit.listRecent(conversationId, 10)
assert.equal(rows.length, 2)
assert.equal(rows[0].type, 'approval/asked')
assert.equal(rows[1].type, 'approval/decided')
assert.equal(rows[1].outcome, 'allowed-once')

const file = path.join(agentDataPath, 'conversations', `${conversationId}.approval.jsonl`)
const raw = await fs.readFile(file, 'utf8')
assert.ok(raw.includes('approval/asked'))

console.log('test-approval-audit: ok')
