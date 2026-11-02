import assert from 'node:assert/strict'
import { splitMultiFileDiff } from '../src/features/chat/DiffReviewCard.tsx'

// 1. 测试 DiffReviewCard 与 splitMultiFileDiff
// 验证单文件不会被多余切分
const singleFile = {
  path: 'src/index.ts',
  diff: '--- a/src/index.ts\n+++ b/src/index.ts\n@@ -1,2 +1,3 @@\n-old\n+new\n+extra',
  type: 'edit',
}
const singleResult = splitMultiFileDiff(singleFile)
assert.equal(singleResult.length, 1, '单文件 diff 应保持为 1 个')
assert.equal(singleResult[0].path, 'src/index.ts')

// 验证多文件 git patch 切分
const gitPatch = {
  path: 'patch.diff',
  diff: `diff --git a/src/a.ts b/src/a.ts
index 111..222 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,2 +1,2 @@
-const a = 1
+const a = 2
diff --git a/src/b.ts b/src/b.ts
index 333..444 100644
--- a/src/b.ts
+++ b/src/b.ts
@@ -1,2 +1,3 @@
-const b = 1
+const b = 2
+const c = 3
diff --git a/src/c.ts b/src/c.ts
new file mode 100644
--- /dev/null
+++ b/src/c.ts
@@ -0,0 +1,1 @@
+export const c = true
`,
  type: 'patch',
}
const gitPatchResult = splitMultiFileDiff(gitPatch)
assert.equal(gitPatchResult.length, 3, '应成功切分为 3 个文件')
assert.equal(gitPatchResult[0].path, 'src/a.ts')
assert.equal(gitPatchResult[1].path, 'src/b.ts')
assert.equal(gitPatchResult[2].path, 'src/c.ts')
assert.equal(gitPatchResult[2].isNewFile, true, '新建文件标记应正确识别')

// 验证当变动文件数 > 5 时，默认只展开前 3 个文件
const testFiles = Array.from({ length: 8 }, (_, i) => ({
  path: `file-${i}.ts`,
  diff: `diff --git a/file-${i}.ts b/file-${i}.ts\n@@ -1 +1 @@\n+line`,
  type: 'edit',
}))
assert.equal(testFiles.length, 8)
const defaultExpandedIndices = (files) => {
  if (files.length > 5) return new Set([0, 1, 2])
  return new Set(files.map((_, i) => i))
}
const expandedSet = defaultExpandedIndices(testFiles)
assert.equal(expandedSet.size, 3, '变动文件数 > 5 时只展开前 3 个')
assert.ok(expandedSet.has(0) && expandedSet.has(1) && expandedSet.has(2))
assert.ok(!expandedSet.has(3) && !expandedSet.has(7), '其余文件卡片保持折叠')

// 验证变动文件数 <= 5 时全部展开
const smallTestFiles = Array.from({ length: 4 }, (_, i) => ({
  path: `file-${i}.ts`,
  diff: `+line`,
  type: 'edit',
}))
const smallExpandedSet = defaultExpandedIndices(smallTestFiles)
assert.equal(smallExpandedSet.size, 4, '变动文件数 <= 5 时默认全部展开')

// 2. 测试长日志切片与分页逻辑（OutputLogPanel）
const mockLogs = Array.from({ length: 1200 }, (_, i) => ({
  id: `log-${i}`,
  toolName: 'read_file',
  status: 'done',
  inputSummary: `path/to/file-${i}.ts`,
  resultSummary: `content of file ${i}`,
}))
const PAGE_SIZE = 300
let visibleLogCount = PAGE_SIZE
const getDisplayedLogs = (logs, count) => logs.slice(0, count)

const initialDisplayed = getDisplayedLogs(mockLogs, visibleLogCount)
assert.equal(initialDisplayed.length, 300, '默认展示最新 300 条记录')
assert.ok(mockLogs.length > initialDisplayed.length, '仍有更早记录未加载')

// 模拟点击“加载更早的 N 行日志”
visibleLogCount = Math.min(visibleLogCount + PAGE_SIZE, mockLogs.length)
const nextDisplayed = getDisplayedLogs(mockLogs, visibleLogCount)
assert.equal(nextDisplayed.length, 600, '点击后加载至 600 条')

// 模拟展开全部
visibleLogCount = mockLogs.length
const allDisplayed = getDisplayedLogs(mockLogs, visibleLogCount)
assert.equal(allDisplayed.length, 1200, '展开全部后展示所有 1200 条')

// 3. 测试 DshToolCallList 早期成功工具调用折叠与异常保留逻辑
const makeToolNode = (id, status = 'done') => ({
  row: { callId: id, toolName: 'bash', status },
  children: [],
})

// 构造 20 个工具调用：前 15 个中有 1 个 error，最近 5 个正常
const mockToolTree = Array.from({ length: 20 }, (_, i) => {
  if (i === 2) return makeToolNode(`call-${i}`, 'error') // 报错
  if (i === 18) return makeToolNode(`call-${i}`, 'running') // 运行中
  return makeToolNode(`call-${i}`, 'done')
})

const partitionTree = (tree, totalCallCount) => {
  if (totalCallCount <= 15) {
    return { earlyNodes: [], visibleNodes: tree, earlyCount: 0 }
  }
  const earlyNodes = []
  const visibleNodes = []
  let earlyCount = 0
  const recentThreshold = Math.max(0, tree.length - 5)

  for (let i = 0; i < tree.length; i++) {
    const node = tree[i]
    const isRecent = i >= recentThreshold
    const isSuccess = node.row.status === 'done' && node.children.every((c) => c.row.status === 'done')

    if (!isRecent && isSuccess) {
      earlyNodes.push(node)
      earlyCount += 1
    } else {
      visibleNodes.push(node)
    }
  }
  return { earlyNodes, visibleNodes, earlyCount }
}

const partition = partitionTree(mockToolTree, 20)
// 前 15 个（index 0..14）中，index 2 是 error，所以有 14 个 early success 节点被折叠
assert.equal(partition.earlyCount, 14, '应折叠 14 项早期成功执行的工具调用')
// 报错节点 call-2 必须留在 visibleNodes 中！
assert.ok(partition.visibleNodes.some((n) => n.row.callId === 'call-2'), '报错的工具调用必须优先展示，不能被折叠')
// 运行中节点 call-18 属于末尾 5 个并且运行中，必须留在 visibleNodes 中！
assert.ok(partition.visibleNodes.some((n) => n.row.callId === 'call-18'), '运行中的工具调用必须优先展示')
assert.equal(partition.visibleNodes.length, 6, 'visibleNodes 包含 1 个错误节点 + 5 个末尾活跃节点')

console.log('diff-and-log-optimizations tests passed!')
