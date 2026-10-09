import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const vendorRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'vendor', 'opencodex')
const distUrl = pathToFileURL(path.join(vendorRoot, 'src/lib/taskweaver-distribution.mjs')).href

const {
  TASKWEAVER_PACKAGE,
  distributionPackageName,
  isTaskWeaverDistribution,
  isTaskWeaverDistributionPath,
  taskweaverDistributionUpdateMessage,
} = await import(distUrl)

assert.equal(distributionPackageName(), TASKWEAVER_PACKAGE)
assert.equal(isTaskWeaverDistribution(), true)
assert.equal(
  isTaskWeaverDistributionPath('/Users/foo/毕设/vendor/opencodex/bin/ocx.mjs'),
  true,
)
assert.equal(
  isTaskWeaverDistributionPath('/Users/foo/毕设/node_modules/@taskweaver/opencodex/bin/ocx.mjs'),
  true,
)
assert.match(taskweaverDistributionUpdateMessage(), /TaskWeaver/)
assert.doesNotMatch(taskweaverDistributionUpdateMessage(), /@bitkyc08/)

console.log('test-opencodex-taskweaver-distribution: ok')
