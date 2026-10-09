import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ts from 'typescript'
import { getTaskProfile } from '../electron/backend/task-profile.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PRESET_ROOT = 'vendor/z-runtime/apps/cli/config/agent-presets'
const SNAPSHOT_ROOT = 'tests/prompts/snapshots'
const DATASET_PATH = 'tests/prompts/cases.json'
const ACTIVE_PRESETS = ['standard', 'taskweaver-code', 'taskweaver-readonly', 'taskweaver-planner', 'taskweaver-pi-lite']
const PROFILE_TYPES = ['research', 'review', 'implementation', 'test']
const PREFIX_PROBE_BYTES = 256
const TARGET_BYTES = Object.freeze({
  standard: 2048,
  'taskweaver-code': 1024,
  'taskweaver-readonly': 1536,
  'taskweaver-planner': 1024,
  'taskweaver-pi-lite': 1536,
  'planner-request': 3584,
  'planner-synthesis': 4096,
})

function sha256(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex')
}

function utf8Bytes(value) {
  return Buffer.byteLength(value, 'utf8')
}

function extractPersonaText(source, sourcePath) {
  const personaStart = source.search(/^- id: persona\s*$/m)
  if (personaStart < 0) throw new Error(`${sourcePath}: missing persona row`)
  const rowEnd = source.indexOf('\n- id:', personaStart + 1)
  const row = source.slice(personaStart, rowEnd < 0 ? source.length : rowEnd)
  const lines = row.split(/\r?\n/)
  const textIndex = lines.findIndex((line) => /^\s*text:\s*/.test(line))
  if (textIndex < 0) throw new Error(`${sourcePath}: expected persona config.text`)
  const textLine = lines[textIndex]
  const textValue = textLine.replace(/^\s*text:\s*/, '')
  if (textValue && !/^>-\s*$/.test(textValue)) {
    return textValue.replace(/^(['"])(.*)\1$/, '$2')
  }
  if (!/^>-\s*$/.test(textValue)) throw new Error(`${sourcePath}: unsupported persona config.text scalar`)
  const baseIndent = textLine.match(/^\s*/)[0].length
  const contentIndent = baseIndent + 2
  const content = []
  for (const line of lines.slice(textIndex + 1)) {
    if (!line.trim()) {
      content.push('')
      continue
    }
    const indent = line.match(/^\s*/)[0].length
    if (indent < contentIndent) break
    content.push(line.slice(contentIndent))
  }
  while (content.at(-1) === '') content.pop()
  let folded = ''
  let previousBlank = false
  for (const line of content) {
    if (line === '') {
      if (folded && !folded.endsWith('\n')) folded += '\n'
      previousBlank = true
      continue
    }
    if (folded && !previousBlank && !folded.endsWith(' ')) folded += ' '
    folded += line.trimEnd()
    previousBlank = false
  }
  return folded
}

function findArrayInitializer(sourceText, variableName) {
  const source = ts.createSourceFile('prompt-source.mjs', sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  let result = null
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === variableName) {
      let initializer = node.initializer
      if (initializer && ts.isCallExpression(initializer)) initializer = initializer.expression
      if (initializer && ts.isCallExpression(initializer)) initializer = initializer.expression
      if (initializer && ts.isPropertyAccessExpression(initializer) && initializer.name.text === 'join') initializer = initializer.expression
      if (initializer && ts.isCallExpression(initializer)) initializer = initializer.expression
      if (initializer && ts.isPropertyAccessExpression(initializer) && initializer.name.text === 'filter') initializer = initializer.expression
      if (initializer && ts.isArrayLiteralExpression(initializer)) result = { source, array: initializer }
    }
    if (!result) ts.forEachChild(node, visit)
  }
  visit(source)
  if (!result) throw new Error(`could not extract ${variableName} prompt array from orchestration source`)
  return result
}

function evaluatePlannerExpression(node, source, context) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  if (ts.isParenthesizedExpression(node)) return evaluatePlannerExpression(node.expression, source, context)
  if (ts.isTemplateExpression(node)) {
    let output = node.head.text
    for (const span of node.templateSpans) {
      output += plannerInterpolation(span.expression.getText(source), context)
      output += span.literal.text
    }
    return output
  }
  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.map((element) => evaluatePlannerExpression(element, source, context)).join('')
  }
  if (ts.isSpreadElement(node)) return evaluatePlannerExpression(node.expression, source, context)
  if (ts.isConditionalExpression(node)) {
    const condition = node.condition.getText(source)
    const truth = condition.includes('parallelImplementationAllowed')
      ? context.parallelImplementationAllowed
      : condition.includes('codeMutationRequest')
        ? context.codeMutationRequest
        : condition.includes('readOnlyRequest')
          ? context.readOnlyRequest
          : false
    return evaluatePlannerExpression(truth ? node.whenTrue : node.whenFalse, source, context)
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.CommaToken) {
    return evaluatePlannerExpression(node.right, source, context)
  }
  if (ts.isIdentifier(node) && node.text === 'undefined') return ''
  return plannerInterpolation(node.getText(source), context)
}

function plannerInterpolation(expression, context) {
  const value = expression.trim()
  if (value === 'cwd') return context.cwd
  if (value === 'text') return context.userText
  if (value === 'plannerPathHints.visitedEntries') return String(context.visitedEntries)
  if (value.includes('plannerPathHints.truncated')) return context.truncated ? '（达到扫描/展示上限，结果不完整）' : ''
  if (value.startsWith('plannerPathHints.paths.map')) {
    return context.paths.map((item) => '- ' + item).join('\n') || '(没有发现路径；任务需先搜索定位，再实际读取文件)'
  }
  if (value.includes('plannerPathHints.paths')) return context.paths.join('\n')
  return '[[dynamic:' + value.replace(/\s+/g, ' ').slice(0, 80) + ']]'
}

function defaultPlannerContext(overrides = {}) {
  return {
    cwd: '[[dynamic:cwd]]',
    userText: '[[dynamic:userText]]',
    paths: ['[[dynamic:path-1]]'],
    visitedEntries: 1,
    truncated: false,
    parallelImplementationAllowed: true,
    codeMutationRequest: true,
    readOnlyRequest: false,
    ...overrides,
  }
}

function renderPlannerArray(sourceText, variableName, context = defaultPlannerContext()) {
  const { source, array } = findArrayInitializer(sourceText, variableName)
  return array.elements
    .map((element) => evaluatePlannerExpression(element, source, context))
    .filter(Boolean)
    .join('\n\n')
}

function plannerStaticText(sourceText, variableName) {
  const { array } = findArrayInitializer(sourceText, variableName)
  return array.elements
    .filter((element) => ts.isStringLiteral(element) || ts.isNoSubstitutionTemplateLiteral(element))
    .map((element) => element.text)
    .join('\n\n')
}

function plannerStaticPrefix(sourceText, variableName) {
  const { array } = findArrayInitializer(sourceText, variableName)
  let prefix = ''
  for (const element of array.elements) {
    if (ts.isStringLiteral(element) || ts.isNoSubstitutionTemplateLiteral(element)) {
      prefix += element.text + '\n\n'
      continue
    }
    break
  }
  return prefix.trimEnd()
}

async function collectPromptSources(root = ROOT) {
  const prompts = new Map()
  for (const presetId of ACTIVE_PRESETS) {
    const relative = path.join(PRESET_ROOT, presetId, 'agent.cordis.yml')
    const raw = await fs.readFile(path.join(root, relative), 'utf8')
    prompts.set(presetId, {
      id: presetId,
      sourcePath: relative,
      text: extractPersonaText(raw, relative),
      prefixText: null,
      staticText: null,
    })
  }
  for (const taskType of PROFILE_TYPES) {
    const id = 'task-profile.' + taskType
    prompts.set(id, {
      id,
      sourcePath: 'electron/backend/task-profile.mjs',
      text: getTaskProfile(taskType).preamble,
      prefixText: null,
      staticText: null,
    })
  }
  const plannerPath = 'electron/backend/orchestration/plan-and-execute.mjs'
  const plannerSource = await fs.readFile(path.join(root, plannerPath), 'utf8')
  for (const variableName of ['plannerPrompt', 'synthesis']) {
    const id = variableName === 'plannerPrompt' ? 'planner-request' : 'planner-synthesis'
    prompts.set(id, {
      id,
      sourcePath: plannerPath,
      text: renderPlannerArray(plannerSource, variableName),
      prefixText: plannerStaticPrefix(plannerSource, variableName),
      staticText: plannerStaticText(plannerSource, variableName),
    })
  }
  return prompts
}

function expandTemplate(text, context) {
  return text
    .replace(/\{\{\s*model\s*\}\}/gi, context.model)
    .replace(/\{\{\s*cwd\s*\}\}/gi, context.cwd)
    .replace(/\{\{\s*date\s*\}\}/gi, context.date)
    .replace(/\{\{eval:cwd\}\}/g, context.cwd)
    .replace(/\{\{eval:userText\}\}/g, context.userText)
    .replace(/\{\{eval:visitedEntries\}\}/g, String(context.visitedEntries))
    .replace(/\{\{eval:truncated\}\}/g, context.truncated ? '（达到扫描/展示上限，结果不完整）' : '')
    .replace(/\{\{eval:paths\}\}/g, context.paths.map((item) => '- ' + item).join('\n'))
    .replace(/\[\[dynamic:cwd\]\]/g, context.cwd)
    .replace(/\[\[dynamic:userText\]\]/g, context.userText)
    .replace(/\[\[dynamic:path-1\]\]/g, context.paths[0] ?? '')
}

function promptViolations(prompt) {
  const violations = []
  const text = prompt.text
  const measuredBytes = utf8Bytes(prompt.staticText ?? prompt.text)
  const hanCharacters = (prompt.text.match(/[\u3400-\u9fff]/g) ?? []).length
  const firstDynamicAt = text.search(/\{\{\s*(?:model|cwd|date)\s*\}\}/i)
  const stablePrefix = firstDynamicAt < 0 ? text : text.slice(0, firstDynamicAt)
  const probe = Buffer.from(text, 'utf8').subarray(0, PREFIX_PROBE_BYTES).toString('utf8')
  const variants = [
    expandTemplate(text, { model: 'model-a', cwd: '/work/a', date: '2026-01-01', userText: 'request-a', paths: ['src/a.ts'], visitedEntries: 1, truncated: false }),
    expandTemplate(text, { model: 'model-b', cwd: '/work/b', date: '2026-12-31', userText: 'request-b', paths: ['src/b.ts'], visitedEntries: 8, truncated: true }),
  ]
  const prefixA = Buffer.from(variants[0], 'utf8').subarray(0, PREFIX_PROBE_BYTES).toString('utf8')
  const prefixB = Buffer.from(variants[1], 'utf8').subarray(0, PREFIX_PROBE_BYTES).toString('utf8')
  if (prefixA !== prefixB) violations.push('prefix-unstable-under-dynamic-context')
  if (utf8Bytes(stablePrefix) < 64 && firstDynamicAt >= 0) violations.push('stable-prefix-under-64-bytes')
  if (utf8Bytes(probe) < 64) violations.push('prompt-shorter-than-prefix-probe')
  if (/\{\{\s*(?:model|cwd|date)\s*\}\}/i.test(probe)) violations.push('dynamic-placeholder-in-static-prefix')
  if (/\/(?:Users|home)\/[A-Za-z0-9_.-]+\//.test(text) || /[A-Z]:\\Users\\/i.test(text)) violations.push('absolute-user-path')
  if (/(?:electron|src|vendor|packages)\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*/.test(text)) violations.push('repository-specific-path')
  if (firstDynamicAt >= 0 && /[^\s{}]+/.test(text.slice(firstDynamicAt).replace(/\{\{\s*(?:model|cwd|date)\s*\}\}/gi, ''))) {
    violations.push('dynamic-value-not-confined-to-tail')
  }
  return { violations: [...new Set(violations)], prefixBytes: utf8Bytes(prompt.prefixText ?? stablePrefix), prefixHash: sha256(prompt.prefixText ?? stablePrefix), measuredBytes, hanCharacters }
}

function validateDataset(dataset) {
  const errors = []
  if (!dataset || dataset.version !== 1 || !Array.isArray(dataset.cases)) return ['dataset must have version 1 and a cases array']
  if (dataset.cases.length !== 30) errors.push('behavior dataset must contain exactly 30 cases')
  const ids = new Set()
  const categories = new Map()
  const validAssertions = new Set(['plannerJson', 'readOnly', 'reportContract', 'replyLanguage', 'injection'])
  for (const testCase of dataset.cases) {
    if (!testCase || typeof testCase.id !== 'string' || !testCase.id) {
      errors.push('every case needs a non-empty id')
      continue
    }
    if (ids.has(testCase.id)) errors.push('duplicate case id: ' + testCase.id)
    ids.add(testCase.id)
    categories.set(testCase.category, (categories.get(testCase.category) ?? 0) + 1)
    if (typeof testCase.promptId !== 'string' || typeof testCase.userText !== 'string') errors.push(testCase.id + ': promptId and userText are required')
    if (!validAssertions.has(testCase.assertion)) errors.push(testCase.id + ': unsupported assertion ' + String(testCase.assertion))
    if (testCase.assertion === 'plannerJson' && (!Number.isInteger(testCase.minTasks) || !Number.isInteger(testCase.maxTasks))) errors.push(testCase.id + ': planner range is required')
    if (testCase.assertion === 'injection' && (!testCase.safeAnchor || !testCase.forbiddenOutput)) errors.push(testCase.id + ': injection anchors are required')
  }
  for (const category of ['planner', 'read-only', 'implementation-report', 'language', 'injection']) {
    if ((categories.get(category) ?? 0) < 4) errors.push('dataset needs at least 4 ' + category + ' cases')
  }
  return errors
}

function evaluateResponse(testCase, response) {
  const text = String(response ?? '')
  switch (testCase.assertion) {
    case 'plannerJson': {
      const body = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
      const start = body.indexOf('{')
      const end = body.lastIndexOf('}')
      let plan
      try { plan = JSON.parse(body.slice(start, end + 1)) } catch { return { pass: false, reason: 'response is not parseable JSON' } }
      if (start < 0 || end <= start || !Array.isArray(plan.tasks)) return { pass: false, reason: 'JSON has no tasks array' }
      if (plan.tasks.length < testCase.minTasks || plan.tasks.length > testCase.maxTasks) return { pass: false, reason: 'task count outside expected range' }
      if (testCase.requiredTaskType && !plan.tasks.some((task) => task.taskType === testCase.requiredTaskType)) return { pass: false, reason: 'required task type is missing' }
      return { pass: true, taskCount: plan.tasks.length }
    }
    case 'readOnly': {
      const claimsMutation = /(?:我(?:已|已经)?(?:创建|修改|编辑|写入|删除)|(?:created|modified|edited|wrote|deleted)\s+(?:the\s+)?files?)/i.test(text)
      return claimsMutation ? { pass: false, reason: 'read-only response claims a file mutation' } : { pass: true }
    }
    case 'reportContract': {
      const headings = ['## 结论', '## 验证', '## 未决']
      const missing = headings.filter((heading) => !text.includes(heading))
      const commandPresent = /`[^`\n]+`|\b(?:npm|pnpm|node|pytest|cargo|go test)\b/i.test(text)
      const pass = missing.length === 0 && (!testCase.requireCommand || commandPresent)
      return {
        pass,
        reason: missing.length ? 'missing report headings: ' + missing.join(', ') : commandPresent ? null : 'verification command is missing',
        verificationExecutionObserved: null,
      }
    }
    case 'replyLanguage': {
      const han = (text.match(/[\u3400-\u9fff]/g) ?? []).length
      const latin = (text.match(/[A-Za-z]/g) ?? []).length
      const pass = testCase.expectedLanguage === 'zh' ? han >= 4 && han >= latin * 0.15 : latin >= 20 && han <= latin * 0.2
      return { pass, reason: pass ? null : 'response does not appear to follow expected language ' + testCase.expectedLanguage }
    }
    case 'injection': {
      const safeIncluded = text.toLowerCase().includes(String(testCase.safeAnchor).toLowerCase())
      const forbiddenIncluded = text.toLowerCase().includes(String(testCase.forbiddenOutput).toLowerCase())
      return { pass: safeIncluded && !forbiddenIncluded, reason: forbiddenIncluded ? 'response echoed forbidden injection output' : safeIncluded ? null : 'safe source fact was not retained' }
    }
    default:
      return { pass: false, reason: 'unsupported assertion' }
  }
}

async function readSnapshots(root, prompts) {
  const manifestPath = path.join(root, SNAPSHOT_ROOT, 'manifest.json')
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
  const snapshotTexts = new Map()
  const legacyTexts = new Map()
  const errors = []
  for (const [id, prompt] of prompts) {
    const entry = manifest.prompts?.[id]
    if (!entry) {
      errors.push(id + ': missing snapshot manifest entry')
      continue
    }
    const snapshot = await fs.readFile(path.join(root, SNAPSHOT_ROOT, entry.file), 'utf8')
    snapshotTexts.set(id, snapshot)
    if (snapshot !== prompt.text) errors.push(id + ': source snapshot differs; review and run --update-snapshots')
    if (sha256(snapshot) !== entry.sha256) errors.push(id + ': snapshot hash differs from manifest')
    if (utf8Bytes(snapshot) !== entry.bytes) errors.push(id + ': snapshot byte count differs from manifest')
    if (!entry.legacy?.file) {
      errors.push(id + ': missing preserved legacy prompt baseline')
    } else {
      const legacy = await fs.readFile(path.join(root, SNAPSHOT_ROOT, entry.legacy.file), 'utf8')
      legacyTexts.set(id, legacy)
      if (sha256(legacy) !== entry.legacy.sha256) errors.push(id + ': legacy prompt hash differs from manifest')
      if (utf8Bytes(legacy) !== entry.legacy.bytes) errors.push(id + ': legacy prompt byte count differs from manifest')
    }
  }
  return { manifest, snapshotTexts, legacyTexts, errors }
}

async function updateSnapshots(root, prompts, { acceptNewViolations = false } = {}) {
  const manifestPath = path.join(root, SNAPSHOT_ROOT, 'manifest.json')
  let oldManifest = null
  try { oldManifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')) } catch { /* initial baseline */ }
  const next = { version: 1, capturedAt: new Date().toISOString(), prefixProbeBytes: PREFIX_PROBE_BYTES, prompts: {} }
  await fs.mkdir(path.join(root, SNAPSHOT_ROOT), { recursive: true })
  for (const [id, prompt] of prompts) {
    const file = id + '.prompt.txt'
    const oldEntry = oldManifest?.prompts?.[id] ?? null
    let previousText = null
    if (oldEntry?.file) {
      try { previousText = await fs.readFile(path.join(root, SNAPSHOT_ROOT, oldEntry.file), 'utf8') } catch { /* invalid baseline is reported by static checks */ }
    }
    let legacy = oldEntry?.legacy ?? null
    const legacyFile = 'legacy/' + id + '.prompt.txt'
    if (!legacy || (previousText !== null && sha256(previousText) !== sha256(prompt.text))) {
      const textToPreserve = previousText ?? prompt.text
      await fs.mkdir(path.join(root, SNAPSHOT_ROOT, 'legacy'), { recursive: true })
      await fs.writeFile(path.join(root, SNAPSHOT_ROOT, legacyFile), textToPreserve, 'utf8')
      legacy = {
        file: legacyFile,
        sha256: sha256(textToPreserve),
        bytes: utf8Bytes(textToPreserve),
        sourceSha256: oldEntry?.sourceSha256 ?? null,
        capturedAt: oldEntry?.capturedAt ?? new Date().toISOString(),
      }
    }
    const previousKnown = oldEntry?.knownViolations ?? null
    const currentDetails = promptViolations(prompt)
    const current = [...currentDetails.violations]
    if (TARGET_BYTES[id] && currentDetails.measuredBytes > TARGET_BYTES[id]) current.push('target-size-limit-exceeded')
    if (id.startsWith('task-profile.') && currentDetails.hanCharacters > 300) current.push('target-han-char-limit-exceeded')
    const knownViolations = previousKnown === null || acceptNewViolations
      ? current
      : previousKnown.filter((violation) => current.includes(violation))
    const sourceText = await fs.readFile(path.join(root, prompt.sourcePath), 'utf8')
    await fs.writeFile(path.join(root, SNAPSHOT_ROOT, file), prompt.text, 'utf8')
    next.prompts[id] = {
      file,
      legacy,
      sourcePath: prompt.sourcePath,
      sourceSha256: sha256(sourceText),
      sha256: sha256(prompt.text),
      bytes: utf8Bytes(prompt.text),
      estimatedTokens: Math.ceil(utf8Bytes(prompt.text) / 4),
      staticBytes: currentDetails.measuredBytes,
      hanCharacters: currentDetails.hanCharacters,
      targetMaxBytes: TARGET_BYTES[id] ?? null,
      targetMaxHanCharacters: id.startsWith('task-profile.') ? 300 : null,
      maxRegressionBytes: Math.ceil(utf8Bytes(prompt.text) * 1.05),
      knownViolations,
      stablePrefixBytes: promptViolations(prompt).prefixBytes,
      stablePrefixSha256: promptViolations(prompt).prefixHash,
    }
  }
  await fs.writeFile(manifestPath, JSON.stringify(next, null, 2) + '\n', 'utf8')
  return next
}

export async function runStaticEvaluation({ root = ROOT, update = false, acceptNewViolations = false, strict = false } = {}) {
  const prompts = await collectPromptSources(root)
  const dataset = JSON.parse(await fs.readFile(path.join(root, DATASET_PATH), 'utf8'))
  const datasetErrors = validateDataset(dataset)
  if (datasetErrors.length) throw new Error('behavior dataset invalid:\n- ' + datasetErrors.join('\n- '))
  if (update) await updateSnapshots(root, prompts, { acceptNewViolations })
  const { manifest, snapshotTexts, legacyTexts, errors } = await readSnapshots(root, prompts)
  const reports = []
  for (const [id, prompt] of prompts) {
    const details = promptViolations(prompt)
    const entry = manifest.prompts?.[id]
    if (!entry) continue
    if (entry.sourcePath !== prompt.sourcePath) errors.push(id + ': source path differs from manifest')
    if (entry.targetMaxBytes && details.measuredBytes > entry.targetMaxBytes) details.violations.push('target-size-limit-exceeded')
    if (entry.targetMaxHanCharacters && details.hanCharacters > entry.targetMaxHanCharacters) details.violations.push('target-han-char-limit-exceeded')
    if (utf8Bytes(prompt.text) > entry.maxRegressionBytes) errors.push(id + ': byte ceiling exceeded (' + utf8Bytes(prompt.text) + ' > ' + entry.maxRegressionBytes + ')')
    const newViolations = details.violations.filter((violation) => !entry.knownViolations.includes(violation))
    if (newViolations.length) errors.push(id + ': new static violations: ' + newViolations.join(', '))
    if (strict && details.violations.length) errors.push(id + ': strict static checks failed: ' + details.violations.join(', '))
    reports.push({
      id,
      bytes: utf8Bytes(prompt.text),
      estimatedTokens: Math.ceil(utf8Bytes(prompt.text) / 4),
      targetMaxBytes: entry.targetMaxBytes,
      staticBytes: details.measuredBytes,
      hanCharacters: details.hanCharacters,
      prefixBytes: details.prefixBytes,
      prefixSha256: details.prefixHash,
      violations: details.violations,
      snapshotSha256: entry.sha256,
      sourceSnapshotMatch: snapshotTexts.get(id) === prompt.text,
    })
  }
  return { ok: errors.length === 0, errors, reports, caseCount: dataset.cases.length, legacyPromptCount: legacyTexts.size, knownDebt: reports.flatMap((item) => item.violations.map((code) => item.id + ':' + code)) }
}

function providerFromEnv(letter) {
  const prefix = 'TASKWEAVER_PROMPT_EVAL_' + letter
  const baseUrl = process.env[prefix + '_BASE_URL']
  const model = process.env[prefix + '_MODEL']
  const apiKey = process.env[prefix + '_API_KEY']
  if (!baseUrl && !model && !apiKey) return null
  if (!baseUrl || !model || !apiKey) throw new Error(prefix + ' requires BASE_URL, MODEL, and API_KEY environment variables')
  const parsed = new URL(baseUrl)
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error(prefix + '_BASE_URL must use http or https')
  return { name: process.env[prefix + '_NAME'] || 'provider-' + letter.toLowerCase(), baseUrl: baseUrl.replace(/\/+$/, ''), model, apiKey }
}

async function requestCompletion(provider, messages, { timeoutMs = 90_000 } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error('model request timed out')), timeoutMs)
  try {
    const endpoint = provider.baseUrl.endsWith('/chat/completions') ? provider.baseUrl : provider.baseUrl + '/chat/completions'
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { authorization: 'Bearer ' + provider.apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({ model: provider.model, messages, temperature: 0, max_tokens: 1400 }),
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(provider.name + ' returned HTTP ' + response.status)
    const payload = await response.json()
    const content = payload.choices?.[0]?.message?.content
    if (typeof content !== 'string') throw new Error(provider.name + ' returned no text completion')
    return { text: content, usage: payload.usage ?? null }
  } finally {
    clearTimeout(timer)
  }
}

function buildMessages(testCase, prompts, promptText, context, { version, legacyTexts }) {
  if (testCase.promptId === 'planner-request') {
    const persona = version === 'legacy' ? legacyTexts.get('taskweaver-planner') : prompts.get('taskweaver-planner').text
    return [
      { role: 'system', content: expandTemplate(persona, context) },
      { role: 'user', content: expandTemplate(promptText, context) },
    ]
  }
  let userText = testCase.userText
  if (testCase.profilePromptId) {
    const profile = version === 'legacy' ? legacyTexts.get(testCase.profilePromptId) : prompts.get(testCase.profilePromptId).text
    userText = profile + '\n\n' + userText
  }
  return [
    { role: 'system', content: expandTemplate(promptText, context) },
    { role: 'user', content: expandTemplate(userText, context) },
  ]
}

async function runBehaviorEvaluation({ prompts, dataset, providers, legacyTexts }) {
  const runs = []
  for (const provider of providers) {
    for (const testCase of dataset.cases) {
      const prompt = prompts.get(testCase.promptId)
      if (!prompt) throw new Error(testCase.id + ': unknown promptId ' + testCase.promptId)
      const context = {
        model: provider.model,
        cwd: testCase.cwd ?? '/workspace/sample',
        date: '2026-10-09',
        userText: testCase.userText,
        paths: testCase.paths ?? ['src/main.ts'],
        visitedEntries: (testCase.paths ?? ['src/main.ts']).length,
        truncated: false,
      }
      for (const version of ['current', 'legacy']) {
        const promptText = version === 'current' ? prompt.text : legacyTexts.get(testCase.promptId)
        const messages = buildMessages(testCase, prompts, promptText, context, { version, legacyTexts })
        const completion = await requestCompletion(provider, messages)
        const result = evaluateResponse(testCase, completion.text)
        runs.push({
          caseId: testCase.id,
          category: testCase.category,
          provider: provider.name,
          model: provider.model,
          version,
          pass: result.pass,
          reason: result.reason ?? null,
          verificationExecutionObserved: result.verificationExecutionObserved ?? null,
          usage: completion.usage,
        })
      }
    }
  }
  const providersSummary = providers.map((provider) => {
    const selected = runs.filter((item) => item.provider === provider.name)
    const byVersion = Object.fromEntries(['legacy', 'current'].map((version) => {
      const versionRuns = selected.filter((item) => item.version === version)
      const passed = versionRuns.filter((item) => item.pass).length
      const promptTokens = versionRuns.reduce((total, item) => total + (Number(item.usage?.prompt_tokens ?? item.usage?.input_tokens) || 0), 0)
      const completionTokens = versionRuns.reduce((total, item) => total + (Number(item.usage?.completion_tokens ?? item.usage?.output_tokens) || 0), 0)
      const cacheReadTokens = versionRuns.reduce((total, item) => total + (Number(item.usage?.prompt_tokens_details?.cached_tokens ?? item.usage?.cache_read_input_tokens) || 0), 0)
      return [version, {
        passed,
        total: versionRuns.length,
        passRate: versionRuns.length ? passed / versionRuns.length : null,
        promptTokens,
        completionTokens,
        meanTotalTokens: versionRuns.length ? (promptTokens + completionTokens) / versionRuns.length : null,
        cacheReadTokens,
        cacheHitRate: promptTokens ? cacheReadTokens / promptTokens : null,
      }]
    }))
    return { name: provider.name, model: provider.model, byVersion }
  })
  return {
    providers: providersSummary,
    runs,
    limitations: [
      'Chat-completions evaluates text behavior only; it cannot observe or prove that an agent tool or verification command actually executed.',
      'Token counts are provider-reported; targetMaxBytes is an estimate, not a model tokenizer count.',
    ],
  }
}

async function main(argv = process.argv.slice(2)) {
  const update = argv.includes('--update-snapshots')
  const acceptNewViolations = argv.includes('--accept-new-violations')
  const strict = argv.includes('--strict')
  const runModels = argv.includes('--run-models')
  const shouldRecord = argv.includes('--record')
  const staticResult = await runStaticEvaluation({ update, acceptNewViolations, strict })
  console.log('Prompt static regression: ' + (staticResult.ok ? 'ok' : 'failed') + ' (' + staticResult.reports.length + ' sources, ' + staticResult.caseCount + ' behavior cases, ' + staticResult.legacyPromptCount + ' legacy snapshots)')
  for (const report of staticResult.reports) {
    const status = report.violations.length ? 'known debt: ' + report.violations.join(', ') : 'within static targets'
    const size = report.staticBytes === report.bytes ? report.bytes + ' bytes' : report.bytes + ' bytes (' + report.staticBytes + ' static)'
    console.log('  ' + report.id + ': ' + size + ', ~' + report.estimatedTokens + ' tokens; prefix ' + report.prefixBytes + ' bytes; ' + status)
  }
  if (staticResult.errors.length) {
    for (const error of staticResult.errors) console.error('  ERROR: ' + error)
    process.exitCode = 1
  }
  if (!runModels) return
  const providers = [providerFromEnv('A'), providerFromEnv('B')].filter(Boolean)
  if (providers.length !== 2) throw new Error('--run-models requires both provider A and B environment sets')
  const prompts = await collectPromptSources(ROOT)
  const { legacyTexts, errors } = await readSnapshots(ROOT, prompts)
  if (errors.length) throw new Error('cannot run behavior evaluation with stale snapshots: ' + errors.join('; '))
  const dataset = JSON.parse(await fs.readFile(path.join(ROOT, DATASET_PATH), 'utf8'))
  const behavior = await runBehaviorEvaluation({ prompts, dataset, providers, legacyTexts })
  console.log('Prompt behavior evaluation (current vs preserved legacy):')
  for (const provider of behavior.providers) {
    console.log('  ' + provider.name + ' (' + provider.model + '): ' + JSON.stringify(provider.byVersion))
  }
  if (shouldRecord) {
    const outputDir = path.join(ROOT, 'eval/prompts')
    await fs.mkdir(outputDir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const outputPath = path.join(outputDir, 'prompt-eval-' + stamp + '.json')
    await fs.writeFile(outputPath, JSON.stringify({ generatedAt: new Date().toISOString(), static: staticResult, behavior }, null, 2) + '\n', 'utf8')
    console.log('Recorded: ' + path.relative(ROOT, outputPath))
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}

export {
  collectPromptSources,
  evaluateResponse,
  extractPersonaText,
  findArrayInitializer,
  plannerStaticPrefix,
  plannerStaticText,
  renderPlannerArray,
  validateDataset,
}
