/**
 * Compose prompt layers under a UTF-8 byte budget.
 *
 * `layerBytes` contains the byte length of each retained layer, keyed by
 * layer id. `droppedLayers` contains ids in the order they were removed:
 * lowest priority first, with original order used to break ties.
 *
 * @param {{
 *   userText: string,
 *   prefixLayers?: Array<{ id: string, text: string, required?: boolean, priority?: number }>,
 *   suffixLayers?: Array<{ id: string, text: string, required?: boolean, priority?: number }>,
 *   maxInjectedBytes: number,
 * }} input
 * @returns {{ prompt: string, injectedBytes: number, layerBytes: Record<string, number>, droppedLayers: string[] }}
 */
export function composePromptPipeline(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('input must be an object')
  }

  const { userText, prefixLayers = [], suffixLayers = [], maxInjectedBytes } = input
  if (typeof userText !== 'string') throw new TypeError('userText must be a string')
  if (!Array.isArray(prefixLayers)) throw new TypeError('prefixLayers must be an array')
  if (!Array.isArray(suffixLayers)) throw new TypeError('suffixLayers must be an array')
  if (!Number.isSafeInteger(maxInjectedBytes) || maxInjectedBytes < 0) {
    throw new TypeError('maxInjectedBytes must be a non-negative safe integer')
  }

  const ids = new Set()
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
      index,
    }
  })

  const prefix = normalizeLayers(prefixLayers, 'prefix')
  const suffix = normalizeLayers(suffixLayers, 'suffix')
  const allLayers = [...prefix, ...suffix]
  let injectedBytes = allLayers.reduce((total, layer) => total + layer.bytes, 0)
  if (!Number.isSafeInteger(injectedBytes)) throw new RangeError('total injected byte count exceeds the safe integer range')

  const retainedSuffix = new Set(suffix.map((layer) => layer.id))
  const optionalSuffix = suffix
    .filter((layer) => !layer.required)
    .sort((left, right) => left.priority - right.priority || left.index - right.index)
  const droppedLayers = []

  for (const layer of optionalSuffix) {
    if (injectedBytes <= maxInjectedBytes) break
    retainedSuffix.delete(layer.id)
    injectedBytes -= layer.bytes
    droppedLayers.push(layer.id)
  }

  if (injectedBytes > maxInjectedBytes) {
    throw new RangeError(
      `required prompt layers need ${injectedBytes} UTF-8 bytes, exceeding maxInjectedBytes (${maxInjectedBytes})`,
    )
  }

  const retainedLayers = [...prefix, ...suffix.filter((layer) => retainedSuffix.has(layer.id))]
  const layerBytes = Object.fromEntries(retainedLayers.map(({ id, bytes }) => [id, bytes]))
  const prompt = prefix.map((layer) => layer.text).join('')
    + userText
    + suffix.filter((layer) => retainedSuffix.has(layer.id)).map((layer) => layer.text).join('')

  return { prompt, injectedBytes, layerBytes, droppedLayers }
}
