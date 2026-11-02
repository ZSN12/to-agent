import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (file) => readFile(new URL(file, import.meta.url), 'utf8')

test('manual git commit keeps progress, failure and success visible in the confirmation dialog', async () => {
  const panel = await read('../src/features/git/GitCheckpointPanel.tsx')
  const submitStart = panel.indexOf('const handleConfirmManualCommit = async () => {')
  const submitEnd = panel.indexOf('const handleDeleteCheckpoint = async', submitStart)
  const submitHandler = panel.slice(submitStart, submitEnd)

  assert.ok(submitStart >= 0 && submitEnd > submitStart)
  assert.match(submitHandler, /桌面 Git 提交接口不可用/)
  assert.match(submitHandler, /try\s*\{[\s\S]*catch \(error\)[\s\S]*finally\s*\{\s*setCommitting\(false\)/)
  assert.match(submitHandler, /kind: 'error', message: `提交失败/)
  assert.match(submitHandler, /kind: 'success',[\s\S]*data\.branch/)
  assert.match(panel, /role=\{commitFeedback\.kind === 'error' \? 'alert' : 'status'\}/)
  assert.match(panel, /commitFeedback\?\.kind === 'success' \? '提交已完成' : '确认提交快照'/)
  assert.match(panel, /committing \? '提交中…' : commitFeedback\?\.kind === 'success' \? '完成' : '确认提交'/)
})
