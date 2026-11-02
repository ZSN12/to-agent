import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (file) => readFile(new URL(file, import.meta.url), 'utf8')

test('project header action creates and opens a conversation for that workspace', async () => {
  const [sidebar, app, appStateStore, threadStore, styles] = await Promise.all([
    read('../src/features/sidebar/AppSidebar.tsx'),
    read('../src/App.tsx'),
    read('../backend/app-state-store.mjs'),
    read('../backend/thread-store-sqlite.mjs'),
    read('../src/styles.css'),
  ])

  assert.match(sidebar, /className="project-group-new-chat"[\s\S]*?aria-label=\{`为项目 \$\{project\.name\} 新建会话`\}/)
  assert.match(sidebar, /event\.stopPropagation\(\)[\s\S]*?onNewProjectChat\(project\.path\)/)
  assert.match(sidebar, /aria-expanded=\{!projectCollapsed\}/)
  assert.match(sidebar, /setCollapsedProjects\(\(current\) =>/)
  assert.match(app, /onNewProjectChat=\{async \(projectPath\) => \{\s*const created = await appBackend\.clearConversation\(\{ workspacePath: projectPath \}\)\s*if \(!created\) return\s*setMultiAgentOrchestration\(preferMultiAgentByDefault\)\s*setPanel\(null\)\s*setMainView\('chat'\)/)
  assert.match(appStateStore, /async clearConversation\(options = \{\}\)[\s\S]*?threadStore\.createThread\(options\)/)
  assert.match(threadStore, /async createThread\(\{ workspacePath[\s\S]*?workspacePath: workspacePath !== undefined \? workspacePath : \(current\?\.workspacePath \?\? null\)/)
  assert.match(styles, /\.project-group:hover \.project-group-new-chat,[\s\S]*?\.project-group:focus-within \.project-group-new-chat/)
  assert.match(styles, /@media \(hover: none\)[\s\S]*?\.project-group-new-chat\s*\{\s*opacity: 1;/)
})
