import assert from 'node:assert/strict'
import { findRunningTaskWeaverPids } from './macos/install-process-guard.mjs'

const processList = [
  '  101 /Applications/TaskWeaver.app/Contents/MacOS/TaskWeaver',
  '  202 /Applications/TaskWeaver.app/Contents/Resources/host-node/bin/node /Applications/TaskWeaver.app/Contents/Resources/app/backend/shell/run.mjs',
  '  303 /Applications/TaskWeaver.app.previous-20261030145446/Contents/MacOS/TaskWeaver',
  '  404 /opt/other-app/Contents/MacOS/OtherApp',
  '  505 node /workspace/TaskWeaver/scripts/install-mac-app.mjs',
].join('\n')

assert.deepEqual(findRunningTaskWeaverPids(processList, 505), [101, 202, 303])
assert.deepEqual(findRunningTaskWeaverPids(processList, 101), [202, 303])
assert.deepEqual(findRunningTaskWeaverPids(''), [])

console.log('macOS install guard tests passed')
