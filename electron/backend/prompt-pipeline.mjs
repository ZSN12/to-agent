/**
 * Compose ordered prompt layers around the user's text under a UTF-8 byte budget.
 *
 * The budget applies to injected layers, not the user's original text. Optional
 * layers are removed from lowest priority to highest priority; original input
 * order breaks ties. This lets callers rank guidance such as verify < cursor
 * guidance < mode < context while keeping the assembly deterministic.
 *
 * Token counts are estimates only (`ceil(UTF-8 bytes / 4)`), since actual token
 * counts depend on the selected model's tokenizer.
 *
 * @param {{
 *   userText: string,
 *   prefixLayers?: Array<{ id: string, text: string, required?: boolean, priority?: number }>,
 *   suffixLayers?: Array<{ id: string, text: string, required?: boolean, priority?: number }>,
 *   maxInjectedBytes?: number,
 * }} input
 * @returns {{
 *   prompt: string,
 *   injectedBytes: number,
 *   layerBytes: Record<string, number>,
 *   droppedLayers: string[],
 *   diagnostics: {
 *     budgetBytes: number,
 *     userBytes: number,
 *     injectedBytes: number,
 *     promptBytes: number,
 *     estimatedTokens: number,
 *     injectedEstimatedTokens: number,
 *     remainingBudgetBytes: number,
 *     utilization: number,
 *   },
 * }}
 */

export const DEFAULT_PROMPT_BUDGET_BYTES = 32 * 1024

function estimateTokens(utf8Bytes) {
  return Math.ceil(utf8Bytes / 4)
}

export function composePromptPipeline(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('input must be an object')
  }

  const {
    userText,
    prefixLayers = [],
    suffixLayers = [],
    maxInjectedBytes = DEFAULT_PROMPT_BUDGET_BYTES,
  } = input
  if (typeof userText !== 'string') throw new TypeError('userText must be a string')
  if (!Array.isArray(prefixLayers)) throw new TypeError('prefixLayers must be an array')
  if (!Array.isArray(suffixLayers)) throw new TypeError('suffixLayers must be an array')
  if (!Number.isSafeInteger(maxInjectedBytes) || maxInjectedBytes < 0) {
    throw new TypeError('maxInjectedBytes must be a non-negative safe integer')
  }

  const ids = new Set()
  let order = 0
  const normalizeLayers = (layers, side) => layers.map((layer, index) => {
    if (!layer || typeof layer !== 'object' || Array.isArray(layer)) {
      throw new TypeError(`${side}Layers[${index}] must be an object`)
    }

    const unknownKeys = Object.keys(layer).filter((key) => !['id', 'text', 'required', 'priority'].includes(key))
    if (unknownKeys.length) {
      throw new TypeError(`${side}Layers[${index}] has unsupported field: ${unknownKeys[0]}`)
    }
    if (typeof layer.id !== 'string' || !layer.id.trim()) {
      throw new TypeError(`${side}Layers[${index}].id must be a non-empty string`)
    }
    if (ids.has(layer.id)) throw new TypeError(`duplicate prompt layer id: ${layer.id}`)
    ids.add(layer.id)
    if (typeof layer.text !== 'string') {
      throw new TypeError(`${side}Layers[${index}].text must be a string`)
    }
    if (layer.required !== undefined && typeof layer.required !== 'boolean') {
      throw new TypeError(`${side}Layers[${index}].required must be a boolean`)
    }
    if (layer.priority !== undefined && (typeof layer.priority !== 'number' || !Number.isFinite(layer.priority))) {
      throw new TypeError(`${side}Layers[${index}].priority must be a finite number`)
    }

    return {
      id: layer.id,
      text: layer.text,
      bytes: Buffer.byteLength(layer.text, 'utf8'),
      required: layer.required ?? true,
      priority: layer.priority ?? 0,
      order: order++,
      side,
    }
  })

  const prefix = normalizeLayers(prefixLayers, 'prefix')
  const suffix = normalizeLayers(suffixLayers, 'suffix')
  const allLayers = [...prefix, ...suffix]
  let injectedBytes = allLayers.reduce((total, layer) => total + layer.bytes, 0)
  if (!Number.isSafeInteger(injectedBytes)) throw new RangeError('total injected byte count exceeds the safe integer range')

  const retainedIds = new Set(allLayers.map((layer) => layer.id))
  const optionalLayers = allLayers
    .filter((layer) => !layer.required)
    .sort((left, right) => left.priority - right.priority || left.order - right.order)
  const droppedLayers = []

  for (const layer of optionalLayers) {
    if (injectedBytes <= maxInjectedBytes) break
    retainedIds.delete(layer.id)
    injectedBytes -= layer.bytes
    droppedLayers.push(layer.id)
  }

  if (injectedBytes > maxInjectedBytes) {
    throw new RangeError(
      `required prompt layers need ${injectedBytes} UTF-8 bytes, exceeding maxInjectedBytes (${maxInjectedBytes})`,
    )
  }

  const retainedPrefix = prefix.filter((layer) => retainedIds.has(layer.id))
  const retainedSuffix = suffix.filter((layer) => retainedIds.has(layer.id))
  const retainedLayers = [...retainedPrefix, ...retainedSuffix]
  const layerBytes = Object.fromEntries(retainedLayers.map(({ id, bytes }) => [id, bytes]))
  const prompt = retainedPrefix.map((layer) => layer.text).join('')
    + userText
    + retainedSuffix.map((layer) => layer.text).join('')

  const userBytes = Buffer.byteLength(userText, 'utf8')
  const promptBytes = Buffer.byteLength(prompt, 'utf8')
  const diagnostics = {
    budgetBytes: maxInjectedBytes,
    userBytes,
    injectedBytes,
    promptBytes,
    estimatedTokens: estimateTokens(promptBytes),
    injectedEstimatedTokens: estimateTokens(injectedBytes),
    remainingBudgetBytes: maxInjectedBytes - injectedBytes,
    utilization: maxInjectedBytes === 0 ? 0 : Number((injectedBytes / maxInjectedBytes).toFixed(4)),
  }

  return { prompt, injectedBytes, layerBytes, droppedLayers, diagnostics }
}
