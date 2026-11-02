import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (file) => readFile(new URL(file, import.meta.url), 'utf8')

test('role-mode recent threads hide pin/delete actions until hover or focus', async () => {
  const [sidebar, styles] = await Promise.all([
    read('../src/features/sidebar/AppSidebar.tsx'),
    read('../src/styles.css'),
  ])

  assert.match(sidebar, /className=\{`role-recent-item\$\{thread\.id === currentThreadId \? ' is-current' : ''\}`\}[\s\S]*?className="role-recent-thread"/)
  assert.match(sidebar, /className="role-recent-actions"[\s\S]*?className=\{`role-recent-action role-recent-pin/)
  assert.match(sidebar, /className="role-recent-action role-recent-delete"[\s\S]*?aria-label=\{`删除 \$\{cleanDisplayTitle\(thread\.title\)\}`\}/)
  assert.match(sidebar, /onTogglePinThread\(thread\.id\)/)
  assert.match(sidebar, /onDeleteThread\(thread\.id\)/)
  assert.match(sidebar, /<RoleModeSidebar[\s\S]*?onDeleteThread=\{onDeleteThread\}/)
  assert.match(styles, /\.role-recent-item:hover \.role-recent-actions,[\s\S]*?\.role-recent-item:focus-within \.role-recent-actions/)
  assert.match(styles, /\.role-recent-actions\s*\{[\s\S]*?display: none;/)
  assert.match(styles, /\.role-recent-item\.is-current\s*\{[\s\S]*?background:/)
  assert.match(styles, /\.role-recent-item\.is-current::before/)
  assert.match(styles, /@media \(hover: none\)[\s\S]*?\.role-recent-actions\s*\{\s*display: flex;\s*opacity: \.72;/)
})

test('project row toggles expansion without a separate chevron control', async () => {
  const sidebar = await read('../src/features/sidebar/AppSidebar.tsx')
  const headingStart = sidebar.indexOf('<div className="project-group-heading">')
  const headingEnd = sidebar.indexOf('</div>', sidebar.indexOf('className="project-group-new-chat"', headingStart))
  const heading = sidebar.slice(headingStart, headingEnd)
  assert.match(heading, /className="project-group-head"[\s\S]*?aria-expanded=\{!projectCollapsed\}[\s\S]*?onClick=\{toggleProjectCollapsed\}/)
  assert.ok(heading.indexOf('className="project-group-head"') < heading.indexOf('className="project-group-new-chat"'))
  assert.doesNotMatch(heading, /ChevronRight|project-group-collapse/)
})
