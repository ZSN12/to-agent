/** Presentation limits and safe image URL conversion for code execution results. */

export const CODE_OUTPUT_MAX_CHARS = 4_000
export const CODE_OUTPUT_MAX_IMAGES = 4
export const CODE_OUTPUT_MAX_IMAGE_BYTES = 4 * 1024 * 1024

const IMAGE_MEDIA_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/

export interface CodeOutputImage {
  mediaType: string
  data: string
  bytes?: number
  name?: string
  width?: number
  height?: number
}

export interface BoundedCodeOutput {
  text: string
  truncated: boolean
}

/** Keep execution output readable while preventing an unbounded result card. */
export function boundCodeOutput(value: unknown, maxChars = CODE_OUTPUT_MAX_CHARS): BoundedCodeOutput {
  if (typeof value !== 'string' || value.length === 0) return { text: '', truncated: false }
  const limit = Number.isSafeInteger(maxChars) && maxChars > 0 ? maxChars : CODE_OUTPUT_MAX_CHARS
  if (value.length <= limit) return { text: value, truncated: false }

  // Do not leave an unmatched high surrogate as the last visible code unit.
  let end = limit
  const last = value.charCodeAt(end - 1)
  if (last >= 0xd800 && last <= 0xdbff) end--
  return { text: value.slice(0, end), truncated: true }
}

/** Accept only verified image MIME types and canonical base64 from the Host attachment API. */
export function codeOutputImageDataUrl(image: CodeOutputImage): string | null {
  if (!IMAGE_MEDIA_TYPES.has(image.mediaType)
    || image.data.length === 0
    || image.data.length > 4 * Math.ceil(CODE_OUTPUT_MAX_IMAGE_BYTES / 3)
    || image.data.length % 4 !== 0
    || !BASE64.test(image.data)) {
    return null
  }
  const padding = image.data.endsWith('==') ? 2 : image.data.endsWith('=') ? 1 : 0
  const decodedBytes = image.data.length / 4 * 3 - padding
  if (decodedBytes <= 0 || decodedBytes > CODE_OUTPUT_MAX_IMAGE_BYTES
    || (image.bytes !== undefined && image.bytes !== decodedBytes)) return null
  return `data:${image.mediaType};base64,${image.data}`
}
