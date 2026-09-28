import assert from 'node:assert/strict'
import path from 'node:path'
import os from 'node:os'
import fsp from 'node:fs/promises'
import { SessionManager } from '../electron/agent/agent-runtime.mjs'
import { resolveCutLeafFromUiMessages } from '../electron/backend/session-fork.mjs'

const agentData = await fsp.mkdtemp(path.join(os.tmpdir(), 'tw-fork-'))
const sessionDir = path.join(agentData, 'conversations')
await fsp.mkdir(sessionDir, { recursive: true })
const cwd = agentData

const manager = SessionManager.create(cwd, sessionDir)
manager.appendMessage({ role: 'user', content: [{ type: 'text', text: 'hello' }] })
manager.appendMessage({ role: 'assistant', content: [{ type: 'text', text: 'hi' }] })
manager.appendMessage({ role: 'user', content: [{ type: 'text', text: 'step2' }] })
manager.appendMessage({ role: 'assistant', content: [{ type: 'text', text: 'done' }] })
const file = manager.getSessionFile()
assert.ok(file)

const open = SessionManager.open(file, sessionDir, cwd)
const cut = resolveCutLeafFromUiMessages(open, [
  { author: 'user', text: 'hello' },
  { author: 'orchestrator', text: 'hi' },
])
const branch = open.getBranch(cut)
const assistants = branch.filter((e) => e.type === 'message' && e.message?.role === 'assistant')
assert.equal(assistants.length, 1)

console.log('session-fork alignment checks passed')
