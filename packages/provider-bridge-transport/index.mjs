/**
 * TaskWeaver in-process bridge transport (Cursor backend for Node smoke / Host).
 */
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { loadCreateCursorAdapter, ensureNodeTypescriptLoader } from './cursor-adapter-loader.mjs'

function bridgeError(code, message) {
  const err = new Error(message)
  err.code = code
  return err
}

function isMockMode() {
  const v = process.env.BRIDGE_SMOKE_MOCK
  return v === '1' || v === 'true'
}

function mockStream() {
  return {
    kind: 'cursor',
    async *stream() {
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text: 'bridge-smoke-ok' }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: 'bridge-smoke-ok' } }
      yield { type: 'usage', usage: { inputTokens: 1, outputTokens: 3, totalTokens: 4 } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    },
  }
}

function resolveOpenCodexRoot() {
  const fromEnv = process.env.TASKWEAVER_OPENCODEX_ROOT?.trim()
  if (fromEnv) return path.resolve(fromEnv)
  const here = path.dirname(fileURLToPath(import.meta.url))
  return path.join(path.resolve(here, '..', '..'), 'vendor', 'opencodex')
}

function isRealBunBinary(candidate) {
  try {
    return existsSync(candidate) && statSync(candidate).size >= 1_000_000
  } catch {
    return false
  }
}

function resolveBunBinary() {
  const openCodexRoot = resolveOpenCodexRoot()
  const binaryNames = ['bun.exe', 'bun']
  const candidates = [
    process.env.OPENCODEX_BUN_PATH?.trim(),
    process.env.OCX_BUN_RUNTIME_PATH?.trim(),
  ].filter(Boolean)
  const runtimeRoot = process.env.TASKWEAVER_Z_RUNTIME?.trim()
  if (runtimeRoot) {
    for (const name of binaryNames) {
      candidates.push(path.join(runtimeRoot, 'runtime-packages', 'bun', 'bin', name))
      candidates.push(path.join(runtimeRoot, 'node_modules', 'bun', 'bin', name))
    }
  }
  try {
    const require = createRequire(pathToFileURL(path.join(openCodexRoot, 'package.json')).href)
    const bunPackage = path.dirname(require.resolve('bun/package.json'))
    for (const name of binaryNames) candidates.push(path.join(bunPackage, 'bin', name))
  } catch {
    /* bundled runtime is optional in source checkouts */
  }

  const binary = candidates.find(isRealBunBinary)
  if (binary) return binary
  throw bridgeError(
    'BRIDGE_CURSOR_BUN_RUNTIME_MISSING',
    'Cursor OAuth bridge requires the OpenCodex bundled Bun runtime.',
  )
}

function openCodexOAuthTokenProgram(provider) {
  const oauthModule = path.join(resolveOpenCodexRoot(), 'src', 'oauth', 'index.ts')
  const moduleUrl = pathToFileURL(oauthModule).href
  return [
    "const {writeSync}=await import('node:fs')",
    'try {',
    `  const {getValidAccessToken}=await import(${JSON.stringify(moduleUrl)})`,
    `  const token=await getValidAccessToken(${JSON.stringify(provider)})`,
    "  if(typeof token!=='string'||!token)throw new Error('empty-token')",
    "  writeSync(3,Buffer.from('T:'+token))",
    '} catch (error) {',
    "  const kind=error?.name==='OAuthLoginRequiredError'?'missing':error?.name==='OAuthAccountPausedError'?'paused':'unavailable'",
    "  writeSync(3,Buffer.from('E:'+kind))",
    '  process.exitCode=2',
    '}',
  ].join('\n')
}

function acquireOpenCodexAccessToken(provider, signal) {
  const bun = resolveBunBinary()
  const source = openCodexOAuthTokenProgram(provider)
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? bridgeError('BRIDGE_CURSOR_STREAM_ERROR', 'Cursor OAuth request was aborted.'))
      return
    }
    const child = spawn(bun, ['-e', source], {
      cwd: resolveOpenCodexRoot(),
      env: process.env,
      stdio: ['ignore', 'ignore', 'ignore', 'pipe'],
    })
    const tokenChunks = []
    let receivedBytes = 0
    let settled = false
    let timedOut = false
    const finish = (fn, value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      fn(value)
    }
    const abort = () => {
      child.kill()
      finish(reject, signal.reason ?? bridgeError('BRIDGE_CURSOR_STREAM_ERROR', 'Cursor OAuth request was aborted.'))
    }
    const timer = setTimeout(() => {
      timedOut = true
      child.kill()
    }, 60_000)
    timer.unref?.()
    signal?.addEventListener('abort', abort, { once: true })
    child.stdio[3].on('data', chunk => {
      receivedBytes += chunk.length
      if (receivedBytes > 64 * 1024) {
        child.kill()
        finish(reject, bridgeError('BRIDGE_CURSOR_STREAM_ERROR', 'Cursor OAuth token helper returned an invalid response.'))
        return
      }
      tokenChunks.push(chunk)
    })
    child.once('error', () => {
      finish(reject, bridgeError('BRIDGE_CURSOR_BUN_RUNTIME_MISSING', 'Cursor OAuth helper could not start.'))
    })
    child.once('close', code => {
      if (settled) return
      if (timedOut) {
        finish(reject, bridgeError('BRIDGE_CURSOR_STREAM_ERROR', 'Cursor OAuth lookup timed out.'))
        return
      }
      const payload = Buffer.concat(tokenChunks).toString('utf8')
      if (code === 0 && payload.startsWith('T:') && payload.length > 2) {
        finish(resolve, payload.slice(2))
        return
      }
      const reason = payload === 'E:missing'
        ? 'BRIDGE_CURSOR_CREDENTIAL_MISSING'
        : payload === 'E:paused'
          ? 'BRIDGE_CURSOR_ACCOUNT_PAUSED'
          : 'BRIDGE_CURSOR_STREAM_ERROR'
      const message = reason === 'BRIDGE_CURSOR_CREDENTIAL_MISSING'
        ? 'Cursor bridge requires configured Cursor OAuth (Host/OpenCodex); no active credential is available.'
        : reason === 'BRIDGE_CURSOR_ACCOUNT_PAUSED'
          ? 'The active Cursor OAuth account is paused.'
          : 'OpenCodex could not resolve the active Cursor OAuth credential.'
      finish(reject, bridgeError(reason, message))
    })
  })
}

function messageTimestamp() {
  return Date.now()
}

function blocksToUserContent(blocks) {
  const parts = []
  for (const block of blocks ?? []) {
    if (block?.type === 'text' && typeof block.text === 'string') {
      parts.push({ type: 'text', text: block.text })
    } else if (block?.type === 'image' && block.attachment?.uri) {
      parts.push({ type: 'image', imageUrl: block.attachment.uri })
    }
  }
  if (parts.length === 0) return ''
  if (parts.length === 1 && parts[0].type === 'text') return parts[0].text
  return parts
}

function toolResultToOcxContent(block) {
  const inner = block?.content ?? []
  const text = inner
    .filter((p) => p?.type === 'text' && typeof p.text === 'string')
    .map((p) => p.text)
    .join('\n')
  if (text) return text
  const withImage = blocksToUserContent(inner)
  return withImage === '' ? '' : withImage
}

function findToolName(messages, toolCallId) {
  const id = String(toolCallId ?? '')
  for (const message of messages ?? []) {
    if (message?.role !== 'assistant') continue
    for (const block of message.content ?? []) {
      if (block?.type === 'tool-call' && String(block.id) === id) return block.name ?? ''
    }
  }
  return ''
}

/**
 * Map Harness GenerateOptions messages into OpenCodex wire messages (no flattening).
 */
export function harnessMessagesToOcxContext(messages, system) {
  const systemPrompt = []
  if (typeof system === 'string' && system.trim()) systemPrompt.push(system.trim())

  const ocxMessages = []
  for (const message of messages ?? []) {
    if (message?.role === 'system') {
      const folded = blocksToUserContent(message.content)
      if (typeof folded === 'string' && folded.trim()) systemPrompt.push(folded.trim())
      else if (Array.isArray(folded)) {
        const t = folded.filter((p) => p.type === 'text').map((p) => p.text).join('\n').trim()
        if (t) systemPrompt.push(t)
      }
      continue
    }

    if (message?.role === 'user') {
      const toolResults = (message.content ?? []).filter((b) => b?.type === 'tool-result')
      const rest = (message.content ?? []).filter((b) => b?.type !== 'tool-result')
      if (rest.length > 0) {
        ocxMessages.push({
          role: 'user',
          content: blocksToUserContent(rest),
          timestamp: messageTimestamp(),
        })
      }
      for (const tr of toolResults) {
        ocxMessages.push({
          role: 'toolResult',
          toolCallId: String(tr.toolCallId ?? ''),
          toolName: findToolName(messages, tr.toolCallId),
          content: toolResultToOcxContent(tr),
          isError: tr.isError === true,
          timestamp: messageTimestamp(),
        })
      }
      continue
    }

    if (message?.role === 'assistant') {
      const content = []
      for (const block of message.content ?? []) {
        if (block?.type === 'text' && typeof block.text === 'string') {
          content.push({ type: 'text', text: block.text })
        } else if (block?.type === 'reasoning' && typeof block.text === 'string') {
          content.push({ type: 'thinking', thinking: block.text })
        } else if (block?.type === 'tool-call') {
          let args = {}
          try {
            args = JSON.parse(block.arguments ?? '{}')
          } catch {
            args = {}
          }
          content.push({
            type: 'toolCall',
            id: String(block.id ?? ''),
            name: block.name ?? '',
            arguments: args,
          })
        }
      }
      ocxMessages.push({
        role: 'assistant',
        content,
        timestamp: messageTimestamp(),
      })
    }
  }

  return { systemPrompt, messages: ocxMessages }
}

export function harnessToolsToOcx(tools) {
  if (!Array.isArray(tools) || tools.length === 0) return undefined
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description ?? '',
    parameters: tool.parameters ?? { type: 'object', properties: {} },
  }))
}

export function resolveCursorReasoningOption(options, profile) {
  const modelId = options?.model
  const entry = profile?.models?.find((m) => m.id === modelId)
  const effort = options?.reasoningEffort
  const map = entry?.thinkingLevelMap
  if (effort != null && map && typeof map === 'object' && effort in map) {
    const mapped = map[effort]
    if (mapped === null) return undefined
    if (typeof mapped === 'string' && mapped.trim()) return mapped.trim()
  }
  if (typeof effort === 'string' && effort.trim()) return effort.trim()
  if (typeof entry?.defaultThinkingLevel === 'string' && entry.defaultThinkingLevel.trim()) {
    return entry.defaultThinkingLevel.trim()
  }
  return undefined
}

function finishReasonFromStop(stopReason, sawToolCalls) {
  const raw = typeof stopReason === 'string' ? stopReason.toLowerCase() : ''
  if (raw.includes('tool')) return { kind: 'tool-calls' }
  if (raw.includes('length') || raw.includes('max')) return { kind: 'max-tokens' }
  if (sawToolCalls) return { kind: 'tool-calls' }
  return { kind: 'stop' }
}

/**
 * Incremental Cursor adapter events → TaskWeaver StreamChunk mapping.
 */
export function createAdapterEventChunkMapper() {
  let nextIndex = 0
  const open = new Map()
  let activeToolKey = null
  let sawToolCalls = false

  function startChunks(blockType, key = blockType) {
    if (open.has(key)) return []
    const index = nextIndex++
    open.set(key, { index, blockType, textBuf: '', argsBuf: '' })
    return [{ type: 'block-start', index, blockType }]
  }

  function closeBlock(key) {
    const st = open.get(key)
    if (!st) return []
    open.delete(key)
    if (st.blockType === 'text') {
      return [{
        type: 'block-end',
        index: st.index,
        block: { type: 'text', text: st.textBuf ?? '' },
      }]
    }
    if (st.blockType === 'reasoning') {
      return [{
        type: 'block-end',
        index: st.index,
        block: { type: 'reasoning', text: st.textBuf ?? '' },
      }]
    }
    if (st.blockType === 'tool-call') {
      return [{
        type: 'block-end',
        index: st.index,
        block: {
          type: 'tool-call',
          id: st.id ?? '',
          name: st.name ?? '',
          arguments: st.argsBuf ?? '{}',
        },
      }]
    }
    return []
  }

  function closeAll() {
    const out = []
    for (const key of [...open.keys()]) out.push(...closeBlock(key))
    return out
  }

  function mapUsage(usage) {
    if (!usage) return []
    const inputTokens = usage.inputTokens ?? usage.input_tokens ?? 0
    const outputTokens = usage.outputTokens ?? usage.output_tokens ?? 0
    return [{
      type: 'usage',
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
      },
    }]
  }

  return {
    push(event) {
      const out = []
      if (event.type === 'text_delta') {
        out.push(...startChunks('text', 'text'))
        const st = open.get('text')
        const piece = event.text ?? ''
        st.textBuf += piece
        out.push({ type: 'text-delta', index: st.index, text: piece })
      } else if (event.type === 'thinking_delta') {
        out.push(...startChunks('reasoning', 'reasoning'))
        const st = open.get('reasoning')
        const piece = event.thinking ?? ''
        st.textBuf += piece
        out.push({ type: 'reasoning-delta', index: st.index, text: piece })
      } else if (event.type === 'tool_call_start') {
        sawToolCalls = true
        const key = `tool:${event.id}`
        activeToolKey = key
        const index = nextIndex++
        open.set(key, {
          index,
          blockType: 'tool-call',
          id: event.id,
          name: event.name,
          argsBuf: '',
        })
        out.push({ type: 'block-start', index, blockType: 'tool-call' })
      } else if (event.type === 'tool_call_delta') {
        const key = activeToolKey ?? [...open.keys()].find((k) => k.startsWith('tool:'))
        if (!key || !open.has(key)) return out
        const st = open.get(key)
        const piece = event.arguments ?? ''
        st.argsBuf += piece
        out.push({
          type: 'tool-call-delta',
          index: st.index,
          id: st.id ?? '',
          name: st.name,
          argumentsDelta: piece,
        })
      } else if (event.type === 'tool_call_end') {
        const key = activeToolKey ?? [...open.keys()].find((k) => k.startsWith('tool:'))
        if (key) {
          out.push(...closeBlock(key))
          if (activeToolKey === key) activeToolKey = null
        }
      } else if (event.type === 'done') {
        out.push(...closeAll())
        out.push(...mapUsage(event.usage))
        out.push({ type: 'finish', reason: finishReasonFromStop(event.stopReason, sawToolCalls) })
      } else if (event.type === 'error') {
        throw bridgeError('BRIDGE_CURSOR_STREAM_ERROR', event.message || 'cursor bridge error')
      }
      return out
    },
    flush() {
      return closeAll()
    },
  }
}

async function acquireCursorProviderApiKey(signal) {
  // Let OpenCodex resolve its existing OPENCODEX_HOME (or ~/.opencodex default).
  // DSH_HOME is a separate profile and must not redirect OAuth storage.
  return acquireOpenCodexAccessToken('cursor', signal)
}

async function createCursorTranslatorBudget() {
  ensureNodeTypescriptLoader()
  const modulePath = path.join(resolveOpenCodexRoot(), 'src', 'lib', 'translator-budget.ts')
  const mod = await import(pathToFileURL(modulePath).href)
  if (typeof mod.createTranslatorBudget !== 'function') {
    throw bridgeError('BRIDGE_CURSOR_ADAPTER_UNAVAILABLE', 'OpenCodex translator budget API is unavailable.')
  }
  return mod.createTranslatorBudget()
}

export function buildCursorParsedRequest(context) {
  const { systemPrompt, messages } = harnessMessagesToOcxContext(
    context.options.messages,
    context.options.system,
  )
  const tools = harnessToolsToOcx(context.options.tools)
  const reasoning = resolveCursorReasoningOption(context.options, context.profile)
  const options = {
    ...(context.options.maxTokens != null ? { maxOutputTokens: context.options.maxTokens } : {}),
    ...(context.options.temperature != null ? { temperature: context.options.temperature } : {}),
    ...(reasoning ? { reasoning } : {}),
  }
  return {
    modelId: context.options.model,
    context: {
      ...(systemPrompt.length ? { systemPrompt } : {}),
      messages,
      ...(tools ? { tools } : {}),
    },
    stream: true,
    options,
  }
}

export function createCursorBackend() {
  if (isMockMode()) return mockStream()

  return {
    kind: 'cursor',
    async *stream(context) {
      let createCursorAdapter
      try {
        createCursorAdapter = await loadCreateCursorAdapter()
      } catch (error) {
        const code = error?.code === 'BRIDGE_CURSOR_TSX_MISSING' || error?.code === 'BRIDGE_CURSOR_ADAPTER_UNAVAILABLE'
          ? error.code
          : 'BRIDGE_CURSOR_ADAPTER_UNAVAILABLE'
        throw bridgeError(
          code,
          error instanceof Error ? error.message : 'Cursor adapter could not be loaded in Node',
        )
      }

      let apiKey
      try {
        apiKey = await acquireCursorProviderApiKey(context.options.signal)
      } catch (error) {
        const name = error?.constructor?.name ?? ''
        const msg = error instanceof Error ? error.message : String(error)
        if (['BRIDGE_CURSOR_CREDENTIAL_MISSING', 'BRIDGE_CURSOR_ACCOUNT_PAUSED', 'BRIDGE_CURSOR_BUN_RUNTIME_MISSING'].includes(error?.code)) {
          throw error
        }
        if (/OAuthLoginRequired|missing credential|cursor_missing_credential/i.test(`${name} ${msg}`)) {
          throw bridgeError(
            'BRIDGE_CURSOR_CREDENTIAL_MISSING',
            'Cursor bridge requires configured Cursor OAuth (Host/opencodex); not available in this environment.',
          )
        }
        throw bridgeError('BRIDGE_CURSOR_STREAM_ERROR', msg)
      }

      const provider = {
        name: 'cursor',
        adapter: 'cursor',
        baseUrl: 'https://api2.cursor.sh',
        authMode: 'oauth',
        apiKey,
      }
      const adapter = createCursorAdapter(provider)
      const parsed = buildCursorParsedRequest(context)
      const mapper = createAdapterEventChunkMapper()
      const translatorBudget = await createCursorTranslatorBudget()

      const pending = []
      let turnError = null
      let turnSettled = false
      let wake = null

      const notify = () => {
        if (wake) {
          const w = wake
          wake = null
          w()
        }
      }

      const onAdapterEvent = (event) => {
        try {
          for (const chunk of mapper.push(event)) pending.push(chunk)
        } catch (error) {
          turnError = error
        }
        notify()
      }

      const turnPromise = adapter.runTurn(
        parsed,
        {
          headers: new Headers(),
          translatorBudget,
          abortSignal: context.options.signal,
        },
        onAdapterEvent,
      )

      turnPromise
        .then(() => {
          for (const chunk of mapper.flush()) pending.push(chunk)
        })
        .catch((error) => {
          turnError = error
        })
        .finally(() => {
          turnSettled = true
          notify()
        })

      try {
        while (!turnSettled || pending.length > 0) {
          while (pending.length > 0) yield pending.shift()
          if (turnSettled) break
          await new Promise((resolve) => { wake = resolve })
        }
        if (turnError) {
          const msg = turnError instanceof Error ? turnError.message : String(turnError)
          if (
            turnError?.code === 'BRIDGE_CURSOR_STREAM_ERROR'
            || turnError?.code === 'BRIDGE_CURSOR_CREDENTIAL_MISSING'
            || turnError?.code === 'BRIDGE_CURSOR_ACCOUNT_PAUSED'
          ) {
            throw turnError
          }
          if (/missing credential|cursor_missing_credential/i.test(msg)) {
            throw bridgeError(
              'BRIDGE_CURSOR_CREDENTIAL_MISSING',
              'Cursor bridge requires configured Cursor OAuth (Host/opencodex); not available in this environment.',
            )
          }
          throw bridgeError('BRIDGE_CURSOR_STREAM_ERROR', msg)
        }
      } finally {
        translatorBudget.dispose()
      }
    },
  }
}

function mockStreamForKind(kind) {
  return {
    kind,
    async *stream() {
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text: `bridge-smoke-ok-${kind}` }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: `bridge-smoke-ok-${kind}` } }
      yield { type: 'usage', usage: { inputTokens: 1, outputTokens: 3, totalTokens: 4 } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    },
  }
}

function resolveRelayBaseUrl(profile) {
  const raw = profile?.relayBaseURL?.trim()
  if (!raw) return null
  return raw.replace(/\/+$/, '')
}

function openAiMessagesFromHarness(messages, system) {
  const out = []
  if (typeof system === 'string' && system.trim()) out.push({ role: 'system', content: system.trim() })
  for (const message of messages ?? []) {
    if (message?.role === 'user') {
      const content = blocksToUserContent(message.content)
      out.push({ role: 'user', content })
    } else if (message?.role === 'assistant') {
      const text = (message.content ?? [])
        .filter((b) => b?.type === 'text')
        .map((b) => b.text)
        .join('')
      if (text) out.push({ role: 'assistant', content: text })
    }
  }
  return out
}

async function* streamOpenAiCompatRelay(context) {
  const base = resolveRelayBaseUrl(context.profile)
  if (!base) {
    throw bridgeError('BRIDGE_RELAY_MISCONFIGURED', 'openai-compat-relay requires profile.relayBaseURL')
  }
  const apiKey = process.env.TASKWEAVER_BRIDGE_RELAY_API_KEY?.trim() || ''
  const url = `${base}/v1/chat/completions`
  const body = {
    model: context.options.model,
    messages: openAiMessagesFromHarness(context.options.messages, context.options.system),
    stream: true,
    ...(context.options.maxTokens != null ? { max_tokens: context.options.maxTokens } : {}),
    ...(context.options.temperature != null ? { temperature: context.options.temperature } : {}),
  }
  const headers = { 'Content-Type': 'application/json', Accept: 'text/event-stream' }
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: context.options.signal,
  })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw bridgeError('BRIDGE_RELAY_HTTP_ERROR', `relay ${response.status}: ${text.slice(0, 400)}`)
  }
  if (!response.body) throw bridgeError('BRIDGE_RELAY_HTTP_ERROR', 'relay response missing body')

  let index = 0
  let started = false
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const payload = trimmed.slice(5).trim()
      if (!payload || payload === '[DONE]') continue
      let parsed
      try {
        parsed = JSON.parse(payload)
      } catch {
        continue
      }
      const delta = parsed?.choices?.[0]?.delta?.content
      if (typeof delta === 'string' && delta.length) {
        if (!started) {
          started = true
          yield { type: 'block-start', index, blockType: 'text' }
        }
        yield { type: 'text-delta', index, text: delta }
      }
    }
  }
  if (started) {
    yield { type: 'block-end', index, block: { type: 'text', text: '' } }
  }
  yield { type: 'usage', usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 } }
  yield { type: 'finish', reason: { kind: 'stop' } }
}

export function createOpenAiCompatRelayBackend() {
  if (isMockMode()) return mockStreamForKind('openai-compat-relay')
  return { kind: 'openai-compat-relay', stream: streamOpenAiCompatRelay }
}

async function loadCreateGoogleAdapter() {
  ensureNodeTypescriptLoader()
  const googleModule = path.join(resolveOpenCodexRoot(), 'src', 'adapters', 'google.ts')
  const mod = await import(pathToFileURL(googleModule).href)
  if (typeof mod.createGoogleAdapter !== 'function') {
    throw bridgeError('BRIDGE_ANTIGRAVITY_ADAPTER_UNAVAILABLE', 'OpenCodex google adapter missing')
  }
  return mod.createGoogleAdapter
}

async function acquireAntigravityProvider(context) {
  const token = await acquireOpenCodexAccessToken('google-antigravity', context.options.signal)
  const baseUrl = context.profile?.baseUrl?.trim()
  const project = context.profile?.project?.trim()
  if (!baseUrl || !project) {
    throw bridgeError(
      'BRIDGE_ANTIGRAVITY_MISCONFIGURED',
      'google-antigravity bridge requires baseUrl and project on the provider profile (refresh内置模型桥).',
    )
  }
  return {
    name: 'google-antigravity',
    adapter: 'google',
    googleMode: 'cloud-code-assist',
    baseUrl,
    project,
    authMode: 'oauth',
    apiKey: token,
  }
}

export function createGoogleAntigravityBackend() {
  if (isMockMode()) return mockStreamForKind('google-antigravity')

  return {
    kind: 'google-antigravity',
    async *stream(context) {
      const createGoogleAdapter = await loadCreateGoogleAdapter()
      const provider = await acquireAntigravityProvider(context)
      const adapter = createGoogleAdapter(provider)
      const parsed = buildCursorParsedRequest(context)
      parsed.modelId = context.options.model
      const request = await adapter.buildRequest(parsed, {
        headers: new Headers(),
        translatorBudget: {},
        abortSignal: context.options.signal,
      })
      const mapper = createAdapterEventChunkMapper()
      const response = await fetch(request.url, {
        method: request.method,
        headers: request.headers,
        body: request.body,
        signal: context.options.signal,
      })
      if (!response.ok) {
        const text = await response.text().catch(() => '')
        throw bridgeError('BRIDGE_ANTIGRAVITY_HTTP_ERROR', `antigravity ${response.status}: ${text.slice(0, 400)}`)
      }
      const budget = {}
      for await (const event of adapter.parseStream(response, budget)) {
        for (const chunk of mapper.push(event)) yield chunk
      }
      for (const chunk of mapper.flush()) yield chunk
    },
  }
}

export function installBridgeTransportBackends({ registerBridgeBackend }) {
  registerBridgeBackend(createCursorBackend())
  registerBridgeBackend(createGoogleAntigravityBackend())
  registerBridgeBackend(createOpenAiCompatRelayBackend())
}
