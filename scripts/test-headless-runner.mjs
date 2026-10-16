#!/usr/bin/env node
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough, Writable } from 'node:stream'
import { superviseHeadlessChild } from './headless-supervisor.mjs'
import {
  DEFAULT_HEADLESS_TASK_TIMEOUT_MS,
  MAX_HEADLESS_TASK_TIMEOUT_MS,
  parseHeadlessTaskTimeout,
} from './headless-run-options.mjs'

function makeChild({ pid = 123, kill } = {}) {
  const child = new EventEmitter()
  child.pid = pid
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  child.kill = kill ?? (() => true)
  return child
}

function capture() {
  let value = ''
  const stream = new Writable({ write(chunk, _encoding, done) { value += chunk.toString(); done() } })
  return { stream, value: () => value }
}

function launch(child, { timeoutMs = 1_000, terminationGraceMs = 30 } = {}) {
  const parent = new EventEmitter()
  const stdout = capture()
  const stderr = capture()
  const result = superviseHeadlessChild({
    executable: 'fixture-node',
    args: [],
    cwd: process.cwd(),
    env: {},
    jsonSummary: true,
    timeoutMs,
    terminationGraceMs,
    spawnChild: () => child,
    parent,
    stdout: stdout.stream,
    stderr: stderr.stream,
  })
  return { parent, stdout, stderr, result }
}

assert.equal(parseHeadlessTaskTimeout([]), DEFAULT_HEADLESS_TASK_TIMEOUT_MS)
assert.equal(parseHeadlessTaskTimeout(['--task-timeout', '1000']), 1000)
assert.throws(() => parseHeadlessTaskTimeout(['--task-timeout', '999']), /1000/)
assert.throws(() => parseHeadlessTaskTimeout(['--task-timeout', String(MAX_HEADLESS_TASK_TIMEOUT_MS + 1)]), /3600000/)
assert.throws(() => parseHeadlessTaskTimeout(['--task-timeout', '1000', '--task-timeout', '2000']), /once/)

{
  const child = makeChild()
  const { stdout, result } = launch(child)
  child.stdout.emit('data', Buffer.from('{"status":"starting"}\n{"status":"completed","fixture":true,"elapsedMs":2,"text":"ok"}'))
  child.emit('close', 0, null)
  assert.equal(await result, 0)
  const lines = stdout.value().trim().split('\n').map((line) => JSON.parse(line))
  assert.equal(lines.at(-1).ok, true)
  assert.equal(lines.at(-1).text, 'ok')
}

{
  const child = makeChild({ pid: null })
  const { stdout, result } = launch(child)
  child.emit('error', new Error('executable missing'))
  assert.equal(await result, 1)
  const summary = JSON.parse(stdout.value().trim().split('\n').at(-1))
  assert.match(summary.error, /executable missing/)
}

{
  const child = makeChild()
  const { stdout, result } = launch(child)
  child.stderr.emit('data', Buffer.from('{"status":"failed","error":"fixture failed"}\n'))
  child.emit('close', 0, null)
  assert.equal(await result, 1, 'a parsed smoke failure must not become a successful wrapper exit')
  const summary = JSON.parse(stdout.value().trim().split('\n').at(-1))
  assert.equal(summary.ok, false)
  assert.equal(summary.error, 'fixture failed')
}

{
  const signals = []
  const child = makeChild({ kill(signal) {
    signals.push(signal)
    if (signal === 'SIGINT') setImmediate(() => child.emit('close', null, signal))
    return true
  } })
  const { parent, result } = launch(child)
  parent.emit('SIGINT')
  assert.equal(await result, 130)
  assert.deepEqual(signals, ['SIGINT'])
}

{
  const signals = []
  const child = makeChild({ kill(signal) {
    signals.push(signal)
    if (signal === 'SIGKILL') setImmediate(() => child.emit('close', null, signal))
    return true
  } })
  const { stdout, result } = launch(child, { timeoutMs: 10, terminationGraceMs: 10 })
  assert.equal(await result, 124)
  assert.deepEqual(signals, ['SIGTERM', 'SIGKILL'])
  const summary = JSON.parse(stdout.value().trim().split('\n').at(-1))
  assert.equal(summary.exitCode, 124)
  assert.match(summary.error, /timed out/)
}

console.log('headless runner deadline, signal, spawn error, and close checks passed')
