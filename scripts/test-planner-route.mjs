import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { selectModelForTask } from '../desktop/backend/orchestration-policy.mjs'
import {
  createPlannerOutputSchema,
  normalizePlannerRoute,
  normalizePlannerTaskRoute,
  PLANNER_ROUTE_PROMPT,
  PLANNER_ROUTE_SCHEMA,
  PLANNER_ROUTE_SCHEMA_ID,
  PLANNER_ROUTE_SCHEMA_REFERENCE,
  supportsPlannerOutputSchema,
  taskReferencesImage,
} from '../desktop/backend/orchestration/planner-routing.mjs'

assert.equal(PLANNER_ROUTE_SCHEMA_ID, 'taskweaver/planner-route.v2')
assert.deepEqual(PLANNER_ROUTE_SCHEMA_REFERENCE, { $ref: PLANNER_ROUTE_SCHEMA_ID })
assert.equal(PLANNER_ROUTE_SCHEMA.$schema, 'https://json-schema.org/draft/2020-12/schema')
assert.equal(PLANNER_ROUTE_SCHEMA.additionalProperties, false)
assert.deepEqual(PLANNER_ROUTE_SCHEMA.required, ['tier_adjust', 'needs_vision', 'reason'])
assert.deepEqual(PLANNER_ROUTE_SCHEMA.properties.tier_adjust, { type: 'integer', enum: [-1, 0, 1] })
assert.deepEqual(PLANNER_ROUTE_SCHEMA.properties.needs_vision, { type: 'boolean' })
assert.deepEqual(PLANNER_ROUTE_SCHEMA.properties.reason, { type: 'string', maxLength: 120 })
assert.equal(supportsPlannerOutputSchema('openai-completions'), true)
assert.equal(supportsPlannerOutputSchema('openai-responses'), true)
assert.equal(supportsPlannerOutputSchema('azure-openai-responses'), true)
assert.equal(supportsPlannerOutputSchema('anthropic-messages'), false)
assert.equal(supportsPlannerOutputSchema('openai-codex-responses'), false)

const plannerOutputSchema = createPlannerOutputSchema()
const plannerTaskSchema = plannerOutputSchema.properties.tasks.items
assert.deepEqual(plannerOutputSchema.required, ['tasks'])
assert.equal(plannerOutputSchema.additionalProperties, false)
assert.deepEqual(plannerTaskSchema.properties.route.required, ['tier_adjust', 'needs_vision', 'reason'])
assert.equal(plannerTaskSchema.properties.route.additionalProperties, false)
assert.deepEqual(plannerTaskSchema.properties.route.properties.tier_adjust, { type: 'integer', enum: [-1, 0, 1] })
assert.equal(Object.hasOwn(plannerTaskSchema.properties.route.properties.reason, 'maxLength'), false,
  'the transport schema uses Host-supported keywords; normalizePlannerRoute enforces C5 maxLength')
assert.equal(plannerTaskSchema.properties.model, undefined, 'planner schema cannot select a model')

assert.match(PLANNER_ROUTE_PROMPT, /^## Sub-task roles and tier exceptions/m)
assert.match(PLANNER_ROUTE_PROMPT, /Never adjust review\. Never lower research\./)
assert.match(PLANNER_ROUTE_PROMPT, /Add to each task:/)
assert.match(PLANNER_ROUTE_PROMPT, /"route": \{"tier_adjust": -1 \| 0 \| 1, "needs_vision": true \| false, "reason":/)
assert.doesNotMatch(PLANNER_ROUTE_PROMPT, /"model"\s*:/)
const plannerPreset = await readFile(new URL('../packages/runtime/host-cli/config/agent-presets/tw-taskweaver-planner/agent.cordis.yml', import.meta.url), 'utf8')
const presetLines = plannerPreset.split(/\r?\n/)
const routeStart = presetLines.findIndex((line) => line === '      ## Sub-task roles and tier exceptions')
const routeEnd = presetLines.findIndex((line) => line.startsWith('      6. research｜'))
assert.ok(routeStart >= 0 && routeEnd >= routeStart, 'planner system persona contains the P17.C1 route section')
const presetRoutePrompt = presetLines.slice(routeStart, routeEnd + 1).map((line) => line.slice(6)).join('\n')
assert.equal(presetRoutePrompt, PLANNER_ROUTE_PROMPT, 'planner persona keeps the fixed C1 wording in sync')

const emptyRoute = { tier_adjust: 0, needs_vision: false, reason: '' }
assert.deepEqual(normalizePlannerRoute('implementation', undefined), emptyRoute)
assert.deepEqual(normalizePlannerRoute('implementation', {
  tier_adjust: 1,
  needs_vision: false,
  reason: '跨模块',
  model: 'must-not-control-routing',
}, { strict: true }), {
  tier_adjust: 0,
  needs_vision: false,
  reason: '',
}, 'strict mode rejects additional route properties by falling back to the safe default')
assert.deepEqual(normalizePlannerRoute('implementation', {
  tier_adjust: 1,
  needs_vision: false,
  reason: '跨模块',
  model: 'must-not-control-routing',
}, { strict: false }), {
  tier_adjust: 1,
  needs_vision: false,
  reason: '跨模块',
}, 'permissive mode ignores model fields')
assert.deepEqual(normalizePlannerRoute('implementation', { tier_adjust: 1, needs_vision: false, reason: '   ' }), emptyRoute)
assert.deepEqual(normalizePlannerRoute('research', { tier_adjust: -1, needs_vision: false, reason: '简单' }), emptyRoute)
assert.deepEqual(normalizePlannerRoute('research', { tier_adjust: 1, needs_vision: false, reason: '需推理根因' }), {
  tier_adjust: 1,
  needs_vision: false,
  reason: '需推理根因',
})
assert.deepEqual(normalizePlannerRoute('review', { tier_adjust: 1, needs_vision: false, reason: '复杂审查' }), emptyRoute)
assert.deepEqual(normalizePlannerRoute('planning', { tier_adjust: -1, needs_vision: false, reason: '简单规划' }), emptyRoute)
assert.deepEqual(normalizePlannerRoute('test', { tier_adjust: -1, needs_vision: false, reason: '机械测试' }), {
  tier_adjust: -1,
  needs_vision: false,
  reason: '机械测试',
})
assert.deepEqual(normalizePlannerRoute('implementation', {
  tier_adjust: 0,
  needs_vision: true,
  reason: '需要读截图',
}), {
  tier_adjust: 0,
  needs_vision: true,
  reason: '需要读截图',
})
assert.deepEqual(normalizePlannerRoute('implementation', undefined, { imageReferenced: true }), {
  tier_adjust: 0,
  needs_vision: true,
  reason: '',
}, 'image detection remains active even when planner route data is missing')

assert.equal(taskReferencesImage({ description: '检查 src/assets/settings.png 的边缘' }), true)
assert.equal(taskReferencesImage({ description: '按上传的截图修复窗口布局' }), true)
assert.equal(taskReferencesImage({ attachments: [{ mimeType: 'image/png', attachmentId: 'sha256:abc' }] }), true)
assert.equal(taskReferencesImage({ images: ['sha256:abc'] }), true)
assert.equal(taskReferencesImage({ imageRefs: ['attachment:01'] }), true)
assert.equal(taskReferencesImage({ description: '比较图片处理库的吞吐量' }), false)
assert.equal(taskReferencesImage({ description: '重构缩略图生成服务，不读取图片附件' }), false)

assert.deepEqual(normalizePlannerTaskRoute({
  id: 'T1',
  taskType: 'implementation',
  description: '修复 src/assets/settings.png 的预览',
  route: emptyRoute,
}), {
  id: 'T1',
  taskType: 'implementation',
  description: '修复 src/assets/settings.png 的预览',
  route: { tier_adjust: 0, needs_vision: true, reason: '' },
})

const routingPortfolio = {
  display_names: {},
  subscriptions: [],
  free_model_patterns: [],
  metered_surge: [],
  routing_weights: {},
  task_affinity: {},
  capabilities: {},
}
const nonVisionModel = {
  key: 'test/non-vision',
  provider: 'test',
  id: 'non-vision',
  name: 'Non-vision',
  available: true,
  routeRegistered: true,
  profile: { tier: 'balanced', enabledForAllocation: true },
  costPerMillion: { input: 1, output: 1 },
}
const visionModel = {
  ...nonVisionModel,
  key: 'test/vision',
  id: 'vision',
  name: 'Vision',
  vision: true,
}
assert.equal(selectModelForTask('implementation', {
  models: [nonVisionModel, visionModel],
}, nonVisionModel.key, { portfolio: routingPortfolio, needsVision: true }).modelKey, visionModel.key)
const noVisionRoute = selectModelForTask('implementation', {
  models: [nonVisionModel],
}, nonVisionModel.key, { portfolio: routingPortfolio, needsVision: true })
assert.equal(noVisionRoute.model, null, 'vision-required tasks never fall back to a non-vision model')
assert.match(noVisionRoute.reason, /视觉模型/)

console.log('Planner route assertions passed.')
