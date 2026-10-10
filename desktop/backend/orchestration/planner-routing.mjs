/**
 * The route object is deliberately small and contains no model identifiers.
 * Model selection stays deterministic in the host-side router.
 */
export const PLANNER_ROUTE_SCHEMA_ID = 'taskweaver/planner-route.v2'

export const PLANNER_ROUTE_SCHEMA = Object.freeze({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: PLANNER_ROUTE_SCHEMA_ID,
  type: 'object',
  additionalProperties: false,
  required: ['tier_adjust', 'needs_vision', 'reason'],
  properties: Object.freeze({
    tier_adjust: Object.freeze({ type: 'integer', enum: [-1, 0, 1] }),
    needs_vision: Object.freeze({ type: 'boolean' }),
    reason: Object.freeze({ type: 'string', maxLength: 120 }),
  }),
})

export const PLANNER_ROUTE_SCHEMA_REFERENCE = Object.freeze({ $ref: PLANNER_ROUTE_SCHEMA_ID })

const PLANNER_NATIVE_OUTPUT_APIS = new Set([
  'openai-completions',
  'openai-responses',
  'azure-openai-responses',
])

const TASK_TYPES = new Set(['planning', 'research', 'implementation', 'test', 'review'])
const PLANNER_TASK_TYPES = ['research', 'implementation', 'test', 'review']
const ARRAY_OF_STRINGS = Object.freeze({ type: 'array', items: Object.freeze({ type: 'string' }) })
const INLINE_ROUTE_SCHEMA = Object.freeze({
  type: 'object',
  properties: Object.freeze({
    tier_adjust: Object.freeze({ type: 'integer', enum: [-1, 0, 1] }),
    needs_vision: Object.freeze({ type: 'boolean' }),
    reason: Object.freeze({ type: 'string' }),
  }),
  required: ['tier_adjust', 'needs_vision', 'reason'],
  additionalProperties: false,
})

/** The output schema subset supported by the Host; route fields are inlined. */
export function createPlannerOutputSchema() {
  const taskProperties = {
    id: { type: 'string' },
    title: { type: 'string' },
    taskType: { type: 'string', enum: PLANNER_TASK_TYPES },
    role: { type: 'string' },
    description: { type: 'string' },
    acceptance: ARRAY_OF_STRINGS,
    scopePaths: ARRAY_OF_STRINGS,
    writeScopes: ARRAY_OF_STRINGS,
    dependsOn: ARRAY_OF_STRINGS,
    reasons: ARRAY_OF_STRINGS,
    route: INLINE_ROUTE_SCHEMA,
  }
  return {
    type: 'object',
    properties: {
      tasks: {
        type: 'array',
        items: {
          type: 'object',
          properties: taskProperties,
          required: Object.keys(taskProperties),
          additionalProperties: false,
        },
      },
    },
    required: ['tasks'],
    additionalProperties: false,
  }
}

export function supportsPlannerOutputSchema(api) {
  return PLANNER_NATIVE_OUTPUT_APIS.has(api)
}

/** Fixed system-prompt text from P17.C1; keep dynamic model/quota data out of it. */
export const PLANNER_ROUTE_PROMPT = `## Sub-task roles and tier exceptions

Code assigns each task's model from the user's capability tiers (strong / medium / weak). You do not pick models. For every task you only:
1. set \`taskType\` correctly; it is the task's role;
2. flag an exception when the role's default tier clearly does not fit;
3. say whether the task must read images.

### Default tier per role
planning: strong · review: strong · implementation: medium · test: medium · research: weak
The user may change this table; the current one is in <routing_context>.

### Exceptions (\`tier_adjust\`)
- -1: an implementation or test task that is mechanical and local (rename, copy edit, config value, one obvious fix).
- +1: an implementation or test task that spans modules or touches security, concurrency, data migration or a public API; a research task that needs causal reasoning (root cause, design trade-off), not just locating code.
- 0: everything else. Most tasks are 0. Use ±1 only with a concrete reason.
- Never adjust review. Never lower research.
- Tiers describe capability. Do not reason about price, quota, context size, vendor or brand; code handles those and the fallbacks.

### Research feeds back to you
Research tasks return structured findings. When later tasks depend on facts you do not have yet, schedule research first, one question per task. You may be called again with <research_findings> to revise tasks that have not started.

### Output
Add to each task:
"route": {"tier_adjust": -1 | 0 | 1, "needs_vision": true | false, "reason": "<≤ 20 words in the user's language; empty when tier_adjust is 0 and needs_vision is false>"}

### Examples (taskType｜task → route)
1. implementation｜把 README 的安装命令从 npm 改成 pnpm → {"tier_adjust":-1,"needs_vision":false,"reason":"单文件文案替换，机械修改"}
2. implementation｜把鉴权逻辑从 IPC 处理器抽到独立 auth-service，更新 6 个调用点 → {"tier_adjust":1,"needs_vision":false,"reason":"跨 3 个模块且涉及鉴权"}
3. implementation｜按附带截图修复设置页窄窗口下按钮重叠 → {"tier_adjust":0,"needs_vision":true,"reason":"需要读截图"}
4. test｜为 parsePlan 补边界单测（空数组、重复 id、环） → {"tier_adjust":0,"needs_vision":false,"reason":""}
5. review｜审查 T2 的鉴权重构 → {"tier_adjust":0,"needs_vision":false,"reason":""}
6. research｜在约 40 万 token 的 runtime 里定位会话偶发丢失的竞态根因 → {"tier_adjust":1,"needs_vision":false,"reason":"要推理竞态根因，不只是找代码"}`

const ROUTE_FIELDS = new Set(['tier_adjust', 'needs_vision', 'reason'])
const IMAGE_FILE_REFERENCE = /(?:^|[\s"'`([{<])[^\s"'`<>]*\.(?:png|jpe?g|gif|webp|bmp|tiff?|avif|heic)(?=$|[\s"'`),;:\]>?])/iu
const IMAGE_LANGUAGE_REFERENCE = /\b(?:attached|uploaded|provided|referenced)\s+(?:image|screenshot|photo|picture)s?\b|\b(?:image|screenshot|photo|picture)\s+(?:attachment|file|provided|above|attached)\b|\b(?:read|inspect|view|analy[sz]e|look at|describe|transcribe)\s+(?:the\s+)?(?:image|screenshot|photo|picture)\b|\battached\s+diagram\b|(?:附带|上传|提供|引用|查看|读取|分析|识别|描述).{0,8}(?:图片|图像|截图|照片)|(?:图片|图像|截图|照片).{0,8}(?:附件|文件|内容|识别|读取|分析)|(?:附件|文件).{0,8}(?:是|为)?(?:图片|图像|截图|照片)/iu
const IMAGE_METADATA_KEYS = new Set(['images', 'image', 'imagerefs', 'imagereferences', 'imageattachments', 'imageattachment', 'imagepaths', 'imagepath'])

const DEFAULT_ROUTE = Object.freeze({ tier_adjust: 0, needs_vision: false, reason: '' })

function stringLength(value) {
  return [...value].length
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function isRouteShapeValid(route, strict) {
  if (!isPlainObject(route)) return false
  if (strict && Object.keys(route).some((key) => !ROUTE_FIELDS.has(key))) return false
  return Number.isInteger(route.tier_adjust)
    && [-1, 0, 1].includes(route.tier_adjust)
    && typeof route.needs_vision === 'boolean'
    && typeof route.reason === 'string'
    && stringLength(route.reason) <= 120
}

function allowedTierAdjust(taskType, adjustment) {
  if (!TASK_TYPES.has(taskType)) return 0
  if (taskType === 'planning' || taskType === 'review') return 0
  if (taskType === 'research') return adjustment === 1 ? 1 : 0
  return adjustment
}

function textReferencesImage(text) {
  const withoutNegatedImageRequests = String(text)
    .replace(/(?:do not|don't|must not|should not|without)\s+(?:read|inspect|view|analy[sz]e|describe|transcribe)\s+(?:the\s+)?(?:image|screenshot|photo|picture)s?\b/giu, '')
    .replace(/(?:不需要|无需|无须|不用|不要|禁止|不)\s*(?:读取|查看|分析|识别|描述|转写|读图|看图)\s*(?:附带|上传|提供)?\s*(?:图片|图像|截图|照片|图像文件|图片附件)?/gu, '')
  return IMAGE_FILE_REFERENCE.test(withoutNegatedImageRequests)
    || IMAGE_LANGUAGE_REFERENCE.test(withoutNegatedImageRequests)
}

function metadataReferencesImage(value, depth = 0) {
  if (depth > 5 || value == null) return false
  if (typeof value === 'string') return textReferencesImage(value) || /^image\//i.test(value)
  if (Array.isArray(value)) return value.some((item) => metadataReferencesImage(item, depth + 1))
  if (typeof value !== 'object') return false

  for (const [key, child] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase()
    if (IMAGE_METADATA_KEYS.has(normalizedKey) && child != null && child !== false) {
      if (child === true || (Array.isArray(child) && child.length > 0)) return true
      if (metadataReferencesImage(child, depth + 1)) return true
    }
    if (['mimetype', 'mediatype', 'contenttype', 'media_type', 'content_type', 'type', 'kind'].includes(normalizedKey)
      && typeof child === 'string' && /^image\//i.test(child)) return true
    if (['name', 'filename', 'path', 'filepath', 'file_path'].includes(normalizedKey)
      && typeof child === 'string' && textReferencesImage(child)) return true
  }
  return false
}

/**
 * Whether a planned node explicitly references an image attachment or image file.
 * Text-only model mentions (for example, “compare image libraries”) do not count.
 */
export function taskReferencesImage(task) {
  if (!task || typeof task !== 'object') return false
  for (const field of [
    'title', 'description', 'acceptance', 'scopePaths', 'writeScopes',
    'image', 'images', 'imageRefs', 'imageReferences', 'imageAttachments', 'imageAttachment', 'imagePaths', 'imagePath',
    'attachments',
  ]) {
    const value = task[field]
    if (IMAGE_METADATA_KEYS.has(field.toLowerCase())) {
      if (value == null || value === false || value === '') continue
      if (Array.isArray(value) && value.length === 0) continue
      return true
    }
    if (typeof value === 'string' && textReferencesImage(value)) return true
    if (Array.isArray(value) && value.some((item) => typeof item === 'string' && textReferencesImage(item))) return true
    if (field === 'attachments' && metadataReferencesImage(value)) return true
  }
  return false
}

/**
 * Validate and clamp a planner route. Invalid routes fall back to defaults;
 * image references are applied after fallback so malformed model output cannot
 * silently route an image task to a non-vision model.
 *
 * @param {string} taskType
 * @param {unknown} route
 * @param {{ imageReferenced?: boolean, strict?: boolean }} options
 */
export function normalizePlannerRoute(taskType, route, { imageReferenced = false, strict = true } = {}) {
  const valid = isRouteShapeValid(route, strict)
  let tierAdjust = valid ? route.tier_adjust : DEFAULT_ROUTE.tier_adjust
  let needsVision = valid ? route.needs_vision : DEFAULT_ROUTE.needs_vision
  let reason = valid ? route.reason.trim() : DEFAULT_ROUTE.reason

  if (tierAdjust !== 0 && reason.length === 0) tierAdjust = 0
  tierAdjust = allowedTierAdjust(taskType, tierAdjust)
  needsVision ||= imageReferenced

  if (tierAdjust === 0 && !needsVision) reason = ''
  return { tier_adjust: tierAdjust, needs_vision: needsVision, reason }
}

export function normalizePlannerTaskRoute(task, options = {}) {
  return {
    ...task,
    route: normalizePlannerRoute(task?.taskType, task?.route, {
      ...options,
      imageReferenced: options.imageReferenced ?? taskReferencesImage(task),
    }),
  }
}
