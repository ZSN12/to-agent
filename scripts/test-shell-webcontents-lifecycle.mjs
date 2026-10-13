import assert from 'node:assert/strict'
import { createShellPlatform } from '../backend/platform/shell-platform.mjs'

const { BrowserWindow } = createShellPlatform()
const webContents = BrowserWindow.getFocusedWindow().webContents

assert.equal(typeof webContents.once, 'function', 'Shell webContents must support Electron once() lifecycle listeners')

let destroyedEvents = 0
webContents.once('destroyed', () => { destroyedEvents += 1 })
webContents.destroy()
webContents.destroy()

assert.equal(destroyedEvents, 1, 'destroyed should fire once when the shell webContents is destroyed')
assert.equal(webContents.isDestroyed(), true)

console.log('test-shell-webcontents-lifecycle: ok')
