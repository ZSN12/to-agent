import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'

const source = await fs.readFile(new URL('../src/features/orchestration/SubagentSessionTree.tsx', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
})
const compiled = outputText.replace(/from (["'])(react(?:\/jsx-runtime)?)\1/g, (_, quote, specifier) => `from ${quote}${import.meta.resolve(specifier)}${quote}`)
const { buildSubagentSessionTree, SubagentSessionTree } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)

const task = (id, dependsOn = []) => ({ id, title: `Task ${id}`, role: 'implementation', status: 'queued', dependsOn })
function flatten(forest) {
  const all = []
  const stack = [...forest].reverse()
  while (stack.length) {
    const node = stack.pop()
    all.push(node)
    stack.push(...[...node.children].reverse())
  }
  return all
}
function inspect(tasks) {
  const forest = buildSubagentSessionTree(tasks)
  const nodes = flatten(forest)
  const expanded = nodes.filter((node) => !node.reference)
  const references = nodes.filter((node) => node.reference)
  assert.equal(expanded.length, new Set(tasks.map((task) => task.id)).size)
  assert.equal(new Set(expanded.map((node) => node.task.id)).size, expanded.length)
  assert(references.length <= tasks.reduce((sum, task) => sum + (task.dependsOn?.length ?? 0), 0))
  assert(references.every((node) => node.children.length === 0))
  return { forest, expanded, references }
}

assert.deepEqual(buildSubagentSessionTree([]), [])
assert.equal(renderToStaticMarkup(createElement(SubagentSessionTree, { tasks: [] })), '')
for (let size = 1; size <= 12; size++) {
  const tasks = Array.from({ length: size }, (_, i) => task(`chain-${i}`, i ? [`chain-${i - 1}`] : []))
  const { forest, references } = inspect(tasks)
  assert.equal(forest.length, 1)
  assert.equal(references.length, 0)
}

const diamond = [task('a'), task('b', ['a']), task('c', ['a']), task('d', ['b', 'c'])]
const diamondTree = inspect(diamond)
assert.deepEqual(diamondTree.expanded.map((node) => node.task.id), ['a', 'b', 'd', 'c'])
assert.deepEqual(diamondTree.references.map((node) => [node.task.id, node.reference]), [['d', 'shared']])
const html = renderToStaticMarkup(createElement(SubagentSessionTree, { tasks: diamond }))
assert.equal((html.match(/class="subagent-tree-node"/g) ?? []).length, 4)
assert.equal((html.match(/class="subagent-tree-reference"/g) ?? []).length, 1)
for (const [, href] of html.matchAll(/href="#([^"]+)"/g)) assert(html.includes(`id="${href}"`))
assert.match(html, /共享节点/)
assert.match(html, /子 Agent 树（DAG）/)
assert.match(html, /status-queued/)

const dense = Array.from({ length: 12 }, (_, i) => task(`dense-${i}`, Array.from({ length: i }, (_, j) => `dense-${j}`)))
const denseTree = inspect(dense)
assert.equal(denseTree.expanded.length, 12)
assert.equal(denseTree.references.length, 66 - 11)

const disconnected = inspect([task('a'), task('b', ['a']), task('isolated'), task('orphan', ['missing'])])
assert.deepEqual(disconnected.forest.map((node) => node.task.id), ['a', 'isolated', 'orphan'])
assert.deepEqual(disconnected.forest[2].missingDependencies, ['missing'])
const partialMissing = inspect([task('root'), task('child', ['root', 'missing'])])
assert.deepEqual(partialMissing.expanded[1].missingDependencies, ['missing'])
assert.equal(partialMissing.forest.length, 1)
assert.match(renderToStaticMarkup(createElement(SubagentSessionTree, { tasks: [task('orphan', ['missing'])] })), /缺失依赖：missing/)

for (const tasks of [
  [task('self', ['self'])],
  [task('a', ['b']), task('b', ['a'])],
  [task('root'), task('a', ['root', 'b']), task('b', ['a']), task('isolated-cycle', ['isolated-cycle'])],
]) {
  const { references } = inspect(tasks)
  assert(references.some((node) => node.reference === 'cycle'))
  const html = renderToStaticMarkup(createElement(SubagentSessionTree, { tasks }))
  assert.match(html, /循环依赖/)
}
const repeatedEdges = inspect([task('a'), task('b', ['a', 'a'])])
assert.equal(repeatedEdges.references.length, 0)

// Count actual data reads rather than machine-dependent timings. Indexing each
// dependency list once prevents the previous repeated whole-task filters.
let dependencyReads = 0
const counted = dense.map((node) => ({ ...node, get dependsOn() { dependencyReads++; return node.dependsOn } }))
buildSubagentSessionTree(counted)
assert.equal(dependencyReads, counted.length)
assert.deepEqual(diamond.map((node) => node.dependsOn), [[], ['a'], ['a'], ['b', 'c']])
console.log('Subagent session-tree source checks passed: 1–12 nodes, diamond/dense DAG, orphan/missing edges, cycles, bounded references and one adjacency scan.')
