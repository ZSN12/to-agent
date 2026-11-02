import { createHash, randomUUID } from 'node:crypto'

const MAX_SSE_FRAME_BYTES = 16 * 1024 * 1024
const MAX_THOUGHT_SIGNATURE_BYTES = 64 * 1024
const THOUGHT_SIGNATURE_BYPASS = 'skip_thought_signature_validator'
const USER_AGENT = 'antigravity/ide/2.5.5 (os_type=windows; arch=amd64; aidev_client; auth_method=oauth)'
const GEMINI_SCHEMA_TYPES = new Set(['string', 'integer', 'number', 'boolean', 'array', 'object'])
const GEMINI_SCHEMA_KEYS = new Set([
  'type', 'nullable', 'description', 'format', 'enum', 'const', 'properties', 'items', 'required', 'anyOf',
])
const MAX_GEMINI_SCHEMA_DEPTH = 24
const MAX_GEMINI_SCHEMA_NODES = 1_024
const DEFAULT_ANTIGRAVITY_EFFORT_WIRE_IDS = Object.freeze({
  'gemini-3.8-flash': Object.freeze({
    low: 'gemini-3.8-flash-low',
    medium: 'gemini-3.8-flash-medium',
    high: 'gemini-3.8-flash-high',
  }),
  'gemini-3.1-pro': Object.freeze({
    low: 'gemini-3.1-pro-low',
    high: 'gemini-pro-agent',
  }),
})
const DEFAULT_ANTIGRAVITY_EFFORTS = Object.freeze({
  'gemini-3.8-flash': 'medium',
  'gemini-3.1-pro': 'high',
})

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function asText(content) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter(part => part?.type === 'text' && typeof part.text === 'string')
    .map(part => part.text)
    .join('\n')
}

function isLikelyRealThoughtSignature(value) {
  if (typeof value !== 'string' || value.length < 16 || value === THOUGHT_SIGNATURE_BYPASS) return false
  if (Buffer.byteLength(value, 'utf8') > MAX_THOUGHT_SIGNATURE_BYTES) return false
  if (/^(fc|ctc|tsc|call|msg|rs|resp|reasoning|item|ws|toolu|tool|func|function)[-_]/i.test(value)) return false
  return /^[A-Za-z0-9+/_=-]+$/.test(value)
}

function thoughtSignatureFromPart(part) {
  const extra = isRecord(part.extra_content) ? part.extra_content.google : undefined
  const value = part.thoughtSignature ?? part.thought_signature
    ?? (isRecord(extra) ? extra.thought_signature : undefined)
  return isLikelyRealThoughtSignature(value) ? value : undefined
}

function applyThoughtSignatureFallback(contents, modelId) {
  const wireModel = String(modelId ?? '').split(':').at(-1).split('/').at(-1)
  if (!/^gemini[-.\d]/i.test(wireModel)) return
  for (const content of contents) {
    if (content?.role !== 'model' || !Array.isArray(content.parts)) continue
    for (const part of content.parts) {
      if (!isRecord(part.functionCall)) continue
      if (!thoughtSignatureFromPart(part)) part.thoughtSignature = THOUGHT_SIGNATURE_BYPASS
      break
    }
  }
}

function dataUrlPart(url) {
  if (typeof url !== 'string') return null
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/]+=*)$/i.exec(url)
  return match ? { inline_data: { mime_type: match[1], data: match[2] } } : null
}

function userParts(content) {
  if (typeof content === 'string') return [{ text: content || '(empty)' }]
  if (!Array.isArray(content)) return [{ text: '(empty)' }]
  const parts = []
  for (const part of content) {
    if (part?.type === 'image') {
      parts.push(dataUrlPart(part.imageUrl) ?? { text: '[image input unavailable to Antigravity]' })
    } else if (part?.type === 'document' && typeof part.data === 'string') {
      parts.push({ inline_data: { mime_type: part.mediaType || 'application/octet-stream', data: part.data } })
    } else if (part?.type === 'text' && typeof part.text === 'string' && part.text.length > 0) {
      parts.push({ text: part.text })
    }
  }
  return parts.length ? parts : [{ text: '(empty)' }]
}

function wireToolName(tool) {
  return tool?.namespace ? `${tool.namespace}__${tool.name}` : String(tool?.name ?? '')
}

function collectGeminiSchemaDefinitions(value, definitions) {
  if (!isRecord(value)) return
  for (const key of ['$defs', 'definitions']) {
    if (!isRecord(value[key])) continue
    for (const [name, schema] of Object.entries(value[key])) {
      if (!definitions.has(name)) definitions.set(name, schema)
    }
  }
}

function resolveGeminiSchemaRef(ref, definitions) {
  const match = /^#\/(?:\$defs|definitions)\/(.+)$/.exec(ref)
  if (!match) return undefined
  try {
    const name = decodeURIComponent(match[1].replace(/~1/g, '/').replace(/~0/g, '~'))
    return definitions.get(name)
  } catch {
    return undefined
  }
}

function normalizeGeminiSchemaType(value, output, preserveNullType) {
  const candidates = Array.isArray(value) ? value : [value]
  let hasNull = false
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue
    const type = candidate.toLowerCase()
    if (type === 'null') {
      hasNull = true
    } else if (GEMINI_SCHEMA_TYPES.has(type) && output.type === undefined) {
      // Gemini's protobuf Schema.type is a single enum, not a JSON Schema type array.
      // Keep the first supported branch and represent nullability with its dedicated field.
      output.type = type
    }
  }
  if (!hasNull) return
  if (output.type !== undefined) output.nullable = true
  else if (preserveNullType) output.type = 'null'
  else output.nullable = true
}

function normalizeGeminiAnyOf(value, definitions, depth, state) {
  if (!Array.isArray(value) || value.length === 0) return {}
  const schemas = value.map(schema => sanitizeGeminiSchemaNode(schema, definitions, depth + 1, state, true))
  const nonNull = schemas.filter(schema => schema.type !== 'null')
  const nullOnly = schemas.filter(schema => schema.type === 'null')
  if (nonNull.length === 1 && nullOnly.length > 0
    && nullOnly.every(schema => Object.keys(schema).every(key => key === 'type'))) {
    return { ...nonNull[0], nullable: true }
  }

  const type = schemas[0]?.type
  const sameType = schemas.every(schema => schema.type === type)
  const enumOnly = schemas.every(schema => {
    const allowed = type === undefined ? new Set(['enum']) : new Set(['type', 'enum'])
    return Array.isArray(schema.enum) && Object.keys(schema).every(key => allowed.has(key))
  })
  if (sameType && enumOnly && type !== 'null') {
    const values = [...new Set(schemas.flatMap(schema => schema.enum).filter(item => typeof item === 'string'))]
    if (values.length) return { ...(typeof type === 'string' ? { type } : {}), enum: values }
  }
  // The Gemini Schema wire format cannot represent arbitrary unions. Widen this node while
  // retaining its parent's surrounding object/array structure.
  return {}
}

function sanitizeGeminiSchemaNode(value, definitions, depth, state, preserveNullType = false) {
  if (state.remainingNodes <= 0 || depth >= MAX_GEMINI_SCHEMA_DEPTH || !isRecord(value)) return {}
  state.remainingNodes -= 1

  if (typeof value.$ref === 'string') {
    const target = resolveGeminiSchemaRef(value.$ref, definitions)
    if (isRecord(target) && !state.activeRefs.has(value.$ref)) {
      state.activeRefs.add(value.$ref)
      try {
        const merged = {}
        for (const key of GEMINI_SCHEMA_KEYS) {
          if (Object.hasOwn(target, key)) merged[key] = target[key]
          if (Object.hasOwn(value, key)) merged[key] = value[key]
        }
        return sanitizeGeminiSchemaNode(merged, definitions, depth, state, preserveNullType)
      } finally {
        state.activeRefs.delete(value.$ref)
      }
    }
  }

  const schema = {}
  normalizeGeminiSchemaType(value.type, schema, preserveNullType)
  if (typeof value.nullable === 'boolean') schema.nullable = value.nullable
  if (typeof value.description === 'string') schema.description = value.description
  if (typeof value.format === 'string') schema.format = value.format

  const enumInput = value.enum ?? (typeof value.const === 'string' ? [value.const] : undefined)
  if (Array.isArray(enumInput)) {
    const values = [...new Set(enumInput.filter(item => typeof item === 'string'))]
    if (values.length) schema.enum = values
  }

  if (isRecord(value.properties)) {
    const properties = {}
    for (const [name, child] of Object.entries(value.properties)) {
      if (state.remainingNodes <= 0) break
      Object.defineProperty(properties, name, {
        value: sanitizeGeminiSchemaNode(child, definitions, depth + 1, state),
        enumerable: true,
        configurable: true,
        writable: true,
      })
    }
    schema.properties = properties
  }

  if (schema.type === 'array' && isRecord(value.items)) {
    schema.items = sanitizeGeminiSchemaNode(value.items, definitions, depth + 1, state)
  }
  if (schema.type === 'array' && !Object.hasOwn(schema, 'items')) schema.items = { type: 'string' }

  if (Array.isArray(value.required) && isRecord(schema.properties)) {
    const required = [...new Set(value.required.filter(name => typeof name === 'string' && Object.hasOwn(schema.properties, name)))]
    if (required.length) schema.required = required
  }

  if (Object.hasOwn(value, 'anyOf')) {
    Object.assign(schema, normalizeGeminiAnyOf(value.anyOf, definitions, depth, state))
  }

  // The explicit allowlist ensures MCP metadata and unsupported JSON Schema keywords never reach
  // Cloud Code Assist as unknown protobuf fields.
  for (const key of Object.keys(schema)) {
    if (!GEMINI_SCHEMA_KEYS.has(key)) delete schema[key]
  }
  return schema
}

function sanitizeGeminiToolSchema(value) {
  const definitions = new Map()
  collectGeminiSchemaDefinitions(value, definitions)
  const state = { remainingNodes: MAX_GEMINI_SCHEMA_NODES, activeRefs: new Set() }
  const schema = sanitizeGeminiSchemaNode(value, definitions, 0, state)
  schema.type = 'object'
  if (!isRecord(schema.properties)) schema.properties = {}
  return schema
}

function normalizeAntigravityModelId(value) {
  return String(value ?? '').trim().replace(/^google-antigravity\//, '')
}

function normalizeAntigravityEffort(value) {
  if (typeof value !== 'string') return undefined
  const effort = value.trim().toLowerCase()
  if (effort === 'minimal') return 'low'
  if (effort === 'low' || effort === 'medium' || effort === 'high') return effort
  if (effort === 'max' || effort === 'xhigh' || effort === 'ultra') return 'high'
  return undefined
}

export function resolveAntigravityModelRoute(parsed, profile) {
  const modelId = normalizeAntigravityModelId(parsed?.modelId)
  const model = Array.isArray(profile?.models)
    ? profile.models.find(row => normalizeAntigravityModelId(row?.id) === modelId)
    : undefined
  const catalogEfforts = isRecord(model?.antigravityEffortWireModelIds)
    ? Object.fromEntries(Object.entries(model.antigravityEffortWireModelIds)
      .filter(([effort, wireId]) => ['low', 'medium', 'high'].includes(effort)
        && typeof wireId === 'string' && wireId.trim())
      .map(([effort, wireId]) => [effort, wireId.trim()]))
    : undefined
  const effortWireIds = catalogEfforts && Object.keys(catalogEfforts).length
    ? catalogEfforts
    : DEFAULT_ANTIGRAVITY_EFFORT_WIRE_IDS[modelId]

  if (effortWireIds) {
    const requestedEffort = normalizeAntigravityEffort(parsed?.options?.reasoning)
      ?? normalizeAntigravityEffort(model?.defaultThinkingLevel)
      ?? normalizeAntigravityEffort(DEFAULT_ANTIGRAVITY_EFFORTS[modelId])
    const preference = requestedEffort === 'low'
      ? ['low', 'medium', 'high']
      : requestedEffort === 'medium'
        ? ['medium', 'high', 'low']
        : ['high', 'medium', 'low']
    const effort = preference.find(candidate => typeof effortWireIds[candidate] === 'string')
    const wireModelId = effort ? effortWireIds[effort] : undefined
    if (wireModelId) {
      // Some CCA model families encode reasoning in the model suffix itself. For those
      // wire IDs, sending thinkingLevel as well can contradict the selected tier.
      const suffixCarriesEffort = wireModelId === `${modelId}-${effort}`
      return {
        modelId: wireModelId,
        reasoning: suffixCarriesEffort ? undefined : effort,
      }
    }
  }

  const wireModelId = typeof model?.wireModelId === 'string' && model.wireModelId.trim()
    ? model.wireModelId.trim()
    : modelId
  const suffixCarriesEffort = ['low', 'medium', 'high'].some(effort => wireModelId === `${modelId}-${effort}`)
  return {
    modelId: wireModelId,
    reasoning: suffixCarriesEffort ? undefined : parsed?.options?.reasoning,
  }
}

function sessionId(parsed) {
  const thread = parsed?._clientThreadId?.trim()
  if (thread) {
    const digest = createHash('sha256').update(`codex-thread:${thread}`).digest()
    return `-${(digest.readBigUInt64BE(0) & 0x7fffffffffffffffn).toString()}`
  }
  const firstUser = parsed?.context?.messages?.find(message => message?.role === 'user')
  const text = asText(firstUser?.content)
  if (!text) return `-${Math.floor(Math.random() * 9e18)}`
  const digest = createHash('sha256').update(text, 'utf8').digest()
  return `-${(digest.readBigUInt64BE(0) & 0x7fffffffffffffffn).toString()}`
}

function buildGeminiRequest(parsed) {
  const messages = parsed?.context?.messages ?? []
  const tools = Array.isArray(parsed?.context?.tools) ? parsed.context.tools : []
  const toolsByName = new Map(tools.map(tool => [tool.name, wireToolName(tool)]))
  const toolNamesById = new Map()
  const contents = []

  for (const message of messages) {
    if (message?.role === 'user' || message?.role === 'developer') {
      contents.push({ role: 'user', parts: userParts(message.content) })
      continue
    }
    if (message?.role === 'assistant') {
      const parts = []
      for (const item of message.content ?? []) {
        if (item?.type === 'text' && typeof item.text === 'string' && item.text.length > 0) {
          parts.push({ text: item.text })
        } else if (item?.type === 'toolCall') {
          const name = toolsByName.get(item.name) ?? String(item.name ?? '')
          if (!name) continue
          const id = String(item.id ?? '')
          const call = { name, args: item.arguments ?? {} }
          if (id) call.id = id
          const signature = item.thoughtSignatureModelId === parsed.modelId
            && isLikelyRealThoughtSignature(item.thoughtSignature)
            ? item.thoughtSignature
            : undefined
          parts.push({ functionCall: call, ...(signature ? { thoughtSignature: signature } : {}) })
          if (id) toolNamesById.set(id, name)
        }
      }
      if (parts.length) contents.push({ role: 'model', parts })
      continue
    }
    if (message?.role === 'toolResult') {
      const id = String(message.toolCallId ?? '')
      const name = toolNamesById.get(id)
        ?? toolsByName.get(message.toolName)
        ?? String(message.toolName ?? '')
      if (!name) {
        contents.push({ role: 'user', parts: [{ text: asText(message.content) || '(empty tool output)' }] })
        continue
      }
      contents.push({
        role: 'user',
        parts: [{
          functionResponse: {
            name,
            ...(id ? { id } : {}),
            response: { result: asText(message.content) || '(empty tool output)' },
          },
        }],
      })
    }
  }

  if (contents.length === 0 || contents.at(-1)?.role === 'model') {
    contents.push({ role: 'user', parts: [{ text: '(continue)' }] })
  }
  applyThoughtSignatureFallback(contents, parsed.modelId)

  const body = { contents }
  const systemText = Array.isArray(parsed?.context?.systemPrompt)
    ? parsed.context.systemPrompt.filter(value => typeof value === 'string' && value.trim()).join('\n\n')
    : ''
  if (systemText) body.systemInstruction = { parts: [{ text: systemText }] }

  if (tools.length) {
    body.tools = [{
      functionDeclarations: tools.map(tool => ({
        name: wireToolName(tool),
        description: tool.description ?? '',
        parameters: sanitizeGeminiToolSchema(tool.parameters ?? { type: 'object', properties: {} }),
      })),
    }]
    const choice = parsed?.options?.toolChoice
    if (choice === 'none') body.toolConfig = { functionCallingConfig: { mode: 'NONE' } }
    else if (choice === 'required') body.toolConfig = { functionCallingConfig: { mode: 'ANY' } }
    else if (typeof choice === 'string' && choice !== 'auto') {
      const target = tools.find(tool => tool.name === choice)
      if (target) {
        body.toolConfig = {
          functionCallingConfig: { mode: 'ANY', allowedFunctionNames: [wireToolName(target)] },
        }
      }
    }
  }

  const generationConfig = {}
  const options = parsed?.options ?? {}
  if (Number.isFinite(options.maxOutputTokens) && options.maxOutputTokens > 0) {
    generationConfig.maxOutputTokens = Math.floor(options.maxOutputTokens)
  }
  if (Number.isFinite(options.temperature)) generationConfig.temperature = options.temperature
  if (['minimal', 'low', 'medium', 'high'].includes(options.reasoning)) {
    generationConfig.thinkingConfig = {
      thinkingLevel: options.reasoning,
      includeThoughts: true,
    }
  }
  if (Object.keys(generationConfig).length) body.generationConfig = generationConfig
  return body
}

function parseUsage(value) {
  if (!isRecord(value)) return undefined
  const promptTokens = Number.isFinite(value.promptTokenCount) ? value.promptTokenCount : 0
  const cacheReadTokens = Number.isFinite(value.cachedContentTokenCount) ? value.cachedContentTokenCount : 0
  // Gemini's promptTokenCount includes cached tokens. TaskWeaver tracks cached
  // reads separately, so keep inputTokens as the uncached portion.
  const inputTokens = Math.max(0, promptTokens - cacheReadTokens)
  const candidateTokens = Number.isFinite(value.candidatesTokenCount) ? value.candidatesTokenCount : 0
  const thoughtTokens = Number.isFinite(value.thoughtsTokenCount) ? value.thoughtsTokenCount : 0
  // candidatesTokenCount excludes thinking, but thoughts are billed as output.
  // Report them inside outputTokens (as OpenAI-style usage does) and keep the
  // reasoning share as a breakdown.
  return {
    inputTokens,
    outputTokens: candidateTokens + thoughtTokens,
    cacheReadTokens,
    ...(Number.isFinite(value.thoughtsTokenCount) ? { reasoningOutputTokens: thoughtTokens } : {}),
  }
}

function errorEvent(message) {
  return { type: 'error', message: String(message || 'Antigravity stream failed') }
}

function decodeFrame(lines, state) {
  const data = lines
    .filter(line => line.startsWith('data:'))
    .map(line => line.slice(5).replace(/^ /, ''))
    .join('\n')
    .trim()
  if (!data) return []
  if (data === '[DONE]') {
    state.terminal = true
    return []
  }

  let chunk
  try {
    chunk = JSON.parse(data)
  } catch {
    state.failed = true
    return [errorEvent('Antigravity returned a malformed SSE data frame')]
  }
  if (!isRecord(chunk)) return []
  if (isRecord(chunk.error)) {
    state.failed = true
    return [errorEvent(chunk.error.message || 'Antigravity returned an upstream error')]
  }

  const root = isRecord(chunk.response) ? chunk.response : chunk
  if (root.usageMetadata !== undefined) {
    state.usage = parseUsage(root.usageMetadata)
    state.terminal = true
  }
  if (root.candidates === undefined || root.candidates === null) return []
  if (!Array.isArray(root.candidates)) {
    state.failed = true
    return [errorEvent('Antigravity response candidates were invalid')]
  }
  const candidate = root.candidates[0]
  if (!isRecord(candidate)) return []
  if (typeof candidate.finishReason === 'string' && candidate.finishReason) {
    state.finishReason = candidate.finishReason
    state.terminal = true
  }

  const parts = candidate.content?.parts
  if (parts === undefined || parts === null) return []
  if (!Array.isArray(parts)) {
    state.failed = true
    return [errorEvent('Antigravity response content parts were invalid')]
  }
  const events = []
  for (const part of parts) {
    if (!isRecord(part)) {
      state.failed = true
      return [errorEvent('Antigravity response contained an invalid content part')]
    }
    const partThoughtSignature = thoughtSignatureFromPart(part)
    if (part.thought === true && partThoughtSignature) state.pendingThoughtSignature = partThoughtSignature
    if (typeof part.text === 'string' && part.text.length > 0) {
      events.push(part.thought === true
        ? { type: 'thinking_delta', thinking: part.text }
        : { type: 'text_delta', text: part.text })
    }
    if (isRecord(part.functionCall)) {
      if (typeof part.functionCall.name !== 'string' || !part.functionCall.name.trim()) {
        state.failed = true
        return [errorEvent('Antigravity returned a function call without a valid name')]
      }
      const id = typeof part.functionCall.id === 'string' && part.functionCall.id
        ? part.functionCall.id
        : `call_${randomUUID().replaceAll('-', '').slice(0, 16)}`
      const thoughtSignature = partThoughtSignature ?? state.pendingThoughtSignature
      state.pendingThoughtSignature = undefined
      events.push(
        {
          type: 'tool_call_start',
          id,
          name: part.functionCall.name,
          ...(thoughtSignature ? { thoughtSignature } : {}),
        },
        { type: 'tool_call_delta', arguments: JSON.stringify(part.functionCall.args ?? {}) },
        { type: 'tool_call_end' },
      )
    }
    if (isRecord(part.inlineData) && typeof part.inlineData.data === 'string') {
      events.push({
        type: 'text_delta',
        text: '[Antigravity returned image data that this bridge cannot display.]',
      })
    }
  }
  return events
}

function stopReason(finishReason) {
  if (finishReason === 'MAX_TOKENS') return 'max_tokens'
  if (['SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII'].includes(finishReason)) {
    return 'content_filter'
  }
  return undefined
}

export function createGoogleAdapter(provider) {
  return {
    async buildRequest(parsed) {
      const token = provider.apiKey?.trim()
      if (!token) throw new Error('Google Antigravity OAuth token is missing.')
      const base = provider.baseUrl?.trim().replace(/\/+$/, '')
      if (!base) throw new Error('Google Antigravity requires a base URL.')
      if (!provider.project) throw new Error('Google Antigravity project was not discovered.')

      const model = String(parsed.modelId ?? '').trim()
      if (!model) throw new Error('Google Antigravity model id is missing.')
      const headers = { 'Content-Type': 'application/json' }
      if (provider.headers && typeof provider.headers === 'object') Object.assign(headers, provider.headers)
      headers['User-Agent'] = process.env.GOOGLE_ANTIGRAVITY_USER_AGENT?.trim() || USER_AGENT
      headers.Authorization = `Bearer ${token}`

      const request = { ...buildGeminiRequest(parsed), sessionId: sessionId(parsed) }
      const envelope = {
        model,
        userAgent: 'antigravity',
        requestType: 'agent',
        project: provider.project,
        requestId: `agent-${randomUUID()}`,
        request,
      }
      return {
        url: `${base}/v1internal:${parsed.stream === false ? 'generateContent' : 'streamGenerateContent'}${parsed.stream === false ? '' : '?alt=sse'}`,
        method: 'POST',
        headers,
        body: JSON.stringify(envelope),
      }
    },

    async *parseStream(response) {
      if (!response.body) {
        yield errorEvent('Antigravity response had no body')
        return
      }
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      const state = { terminal: false, failed: false, finishReason: undefined, usage: undefined, pendingThoughtSignature: undefined }
      let lineParts = []
      let lineBytes = 0
      let frame = []
      let frameBytes = 0
      let readerFinished = false
      let readError

      const consumeLine = (line, bytes) => {
        if (line.trim() === '') {
          const events = decodeFrame(frame, state)
          frame = []
          frameBytes = 0
          return events
        }
        frame.push(line.replace(/\r$/, ''))
        frameBytes += bytes + 1
        if (frameBytes > MAX_SSE_FRAME_BYTES) {
          state.failed = true
          return [errorEvent('Antigravity SSE frame exceeded the 16 MiB limit')]
        }
        return []
      }

      function* consumeText(text) {
        // Search only this decoded fragment. Keep unfinished line fragments
        // separate so a long line is never split or byte-counted repeatedly.
        let start = 0
        while (start < text.length && !state.failed) {
          const newline = text.indexOf('\n', start)
          const end = newline === -1 ? text.length : newline
          const part = text.slice(start, end)
          if (part) {
            lineParts.push(part)
            lineBytes += Buffer.byteLength(part, 'utf8')
          }
          if (newline === -1) break
          const line = lineParts.join('')
          const bytes = lineBytes
          lineParts = []
          lineBytes = 0
          yield* consumeLine(line, bytes)
          start = newline + 1
        }
        if (!state.failed && frameBytes + lineBytes > MAX_SSE_FRAME_BYTES) {
          state.failed = true
          yield errorEvent('Antigravity SSE frame exceeded the 16 MiB limit')
        }
      }

      try {
        while (!state.failed) {
          const { done, value } = await reader.read()
          if (done) {
            readerFinished = true
            break
          }
          yield* consumeText(decoder.decode(value, { stream: true }))
        }
        if (!state.failed) yield* consumeText(decoder.decode())
        if (!state.failed && lineParts.length) yield* consumeLine(lineParts.join(''), lineBytes)
        if (!state.failed && frame.length) {
          for (const event of decodeFrame(frame, state)) yield event
          frame = []
        }
        if (state.failed) return
        if (!state.terminal) {
          yield errorEvent('Antigravity stream ended without a terminal signal; the response may be truncated')
          return
        }
        yield {
          type: 'done',
          usage: state.usage,
          ...(stopReason(state.finishReason) ? { stopReason: stopReason(state.finishReason) } : {}),
        }
      } catch (error) {
        readError = error
        throw error
      } finally {
        if (!readerFinished) {
          try { await reader.cancel(readError) } catch { /* reader already closed */ }
        }
        try { reader.releaseLock() } catch { /* reader may already be released */ }
      }
    },
  }
}
