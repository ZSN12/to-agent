import assert from 'node:assert/strict'
import { createTerminalOutputThrottle } from '../backend/terminal-output-throttle.mjs'

function manualTimers() {
  const queue = []
  return {
    setTimer: (callback) => {
      const handle = { callback }
      queue.push(handle)
      return handle
    },
    clearTimer: (handle) => {
      const index = queue.indexOf(handle)
      if (index >= 0) queue.splice(index, 1)
    },
    tick() {
      const handle = queue.shift()
      handle?.callback()
      return Boolean(handle)
    },
    get pending() { return queue.length },
  }
}

{
  const timers = manualTimers()
  const emitted = []
  const output = createTerminalOutputThrottle({ emit: (data) => emitted.push(data), ...timers })
  output.push('a')
  output.push('b')
  output.push('c')
  assert.deepEqual(emitted, [], 'chunks wait for the next flush')
  assert.equal(timers.pending, 1, 'a burst schedules a single flush')
  timers.tick()
  assert.deepEqual(emitted, ['abc'], 'a burst is coalesced into one push')
  assert.equal(timers.pending, 0)
}

{
  const timers = manualTimers()
  const emitted = []
  const output = createTerminalOutputThrottle({ emit: (data) => emitted.push(data), maxCharsPerFlush: 4, ...timers })
  output.push('0123456789')
  timers.tick()
  assert.deepEqual(emitted, ['0123'], 'each push is rate limited')
  timers.tick()
  timers.tick()
  assert.deepEqual(emitted, ['0123', '4567', '89'], 'the remainder drains on later flushes in order')
  assert.equal(timers.pending, 0)
}

{
  const timers = manualTimers()
  const emitted = []
  const output = createTerminalOutputThrottle({ emit: (data) => emitted.push(data), maxPendingChars: 10, maxCharsPerFlush: 100, ...timers })
  output.push('x'.repeat(30))
  output.push('tail!')
  timers.tick()
  assert.equal(emitted.length, 1)
  assert.match(emitted[0], /输出过快，已省略约 \d+ 个字符/, 'dropped output is reported to the user')
  assert.ok(emitted[0].endsWith('tail!'), 'the newest output is kept')
  assert.ok(emitted[0].replace(/\r\n.*?\r\n/, '').length <= 10, 'pending output stays within its bound')
}

{
  const timers = manualTimers()
  const emitted = []
  const output = createTerminalOutputThrottle({ emit: (data) => emitted.push(data), maxCharsPerFlush: 3, ...timers })
  output.push('😀😀')
  timers.tick()
  assert.equal(emitted[0], '😀😀'.slice(0, 4), 'a surrogate pair is never split across pushes')
}

{
  const timers = manualTimers()
  const emitted = []
  const output = createTerminalOutputThrottle({ emit: (data) => emitted.push(data), maxCharsPerFlush: 2, ...timers })
  output.push('final output')
  output.flush()
  assert.deepEqual(emitted, ['final output'], 'flush delivers everything before exit')
  assert.equal(timers.pending, 0, 'flush cancels the scheduled push')
  output.dispose()
  output.push('late')
  assert.equal(timers.pending, 0, 'a disposed throttle ignores late output')
  output.flush()
  assert.deepEqual(emitted, ['final output'])
}

console.log('terminal output throttle checks passed: coalescing, rate limit, bounded backlog and exit flush')
