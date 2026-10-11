import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { buildApplicationMenuTemplate } = require('../backend/application-menu.cjs')
const roles = (template) => template.map((item) => item.role)

assert.deepEqual(roles(buildApplicationMenuTemplate({ platform: 'darwin' })), [
  'appMenu', 'editMenu', 'windowMenu',
], 'production macOS menu retains app, edit, and window menus')
assert.deepEqual(roles(buildApplicationMenuTemplate({ platform: 'linux' })), [
  'editMenu', 'windowMenu',
], 'production non-macOS menu retains edit and window menus')
assert.deepEqual(roles(buildApplicationMenuTemplate({ platform: 'darwin', includeDeveloperTools: true })), [
  'appMenu', 'editMenu', 'viewMenu', 'windowMenu',
], 'development menu exposes the standard view menu')
assert.deepEqual(roles(buildApplicationMenuTemplate({ platform: 'win32', includeDeveloperTools: true })), [
  'editMenu', 'viewMenu', 'windowMenu',
], 'development menu exposes view menu on non-macOS')

console.log('test-application-menu: ok')
