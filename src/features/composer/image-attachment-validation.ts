import type { ComposerImageAttachment, ImageAttachmentLimits } from '../../shared/app-api'
import type { ModelOption } from '../../types'

export type ComposerImage = ComposerImageAttachment & {
  id: string
  width: number
  height: number
  previewUrl?: string
  loading?: boolean
  loadError?: string
}

export const DEFAULT_IMAGE_ATTACHMENT_LIMITS: ImageAttachmentLimits = {
  maxImageBytes: 20 * 1024 * 1024,
  maxImagesPerMessage: 20,
  maxMessageImageBytes: 200 * 1024 * 1024,
  maxImagePixels: 64_000_000,
  maxImageDimension: 8192,
  mediaTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
}

export function imageAttachmentProblems(
  images: readonly ComposerImage[],
  limits: ImageAttachmentLimits,
): Map<string, string> {
  const problems = new Map<string, string>()
  let totalBytes = 0
  images.forEach((image, index) => {
    if (image.loadError) problems.set(image.id, image.loadError)
    else if (image.loading) problems.set(image.id, '图片正在读取，请稍候')
    else if (!limits.mediaTypes.includes(image.mediaType)) problems.set(image.id, '图片格式不受支持')
    else if (!Number.isSafeInteger(image.bytes) || image.bytes <= 0) problems.set(image.id, '图片数据无效')
    else if (image.bytes > limits.maxImageBytes) problems.set(image.id, `单张图片不能超过 ${formatMegabytes(limits.maxImageBytes)}`)
    else if (!Number.isSafeInteger(image.width) || !Number.isSafeInteger(image.height) || image.width <= 0 || image.height <= 0) {
      problems.set(image.id, '图片尺寸无效')
    }
    else if (image.width > limits.maxImageDimension || image.height > limits.maxImageDimension) {
      problems.set(image.id, `图片宽高不能超过 ${limits.maxImageDimension} 像素`)
    } else if (image.width * image.height > limits.maxImagePixels) {
      problems.set(image.id, '图片分辨率超过允许范围')
    }

    if (index >= limits.maxImagesPerMessage) problems.set(image.id, `每条消息最多添加 ${limits.maxImagesPerMessage} 张图片`)
    totalBytes += Math.max(0, Number.isFinite(image.bytes) ? image.bytes : 0)
    if (totalBytes > limits.maxMessageImageBytes && !problems.has(image.id)) {
      problems.set(image.id, `图片总大小不能超过 ${formatMegabytes(limits.maxMessageImageBytes)}`)
    }
  })
  return problems
}

function formatMegabytes(bytes: number): string {
  const value = bytes / (1024 * 1024)
  return `${Number.isInteger(value) ? value : value.toFixed(1)} MB`
}

export function closestVisionModel(options: readonly ModelOption[], current: ModelOption | null): ModelOption | null {
  if (!current) return null
  const provider = current.id.split('/')[0]
  const modelId = current.id.split('/').slice(1).join('/').toLowerCase()
  const candidates = options.filter((candidate) => candidate.vision === true
    && candidate.id !== current.id
    && candidate.id.split('/')[0] === provider)
  if (!candidates.length) return null
  const commonPrefixLength = (left: string, right: string) => {
    let index = 0
    while (index < left.length && index < right.length && left[index] === right[index]) index += 1
    return index
  }
  return [...candidates].sort((left, right) => {
    const leftId = left.id.split('/').slice(1).join('/').toLowerCase()
    const rightId = right.id.split('/').slice(1).join('/').toLowerCase()
    const prefixDifference = commonPrefixLength(rightId, modelId) - commonPrefixLength(leftId, modelId)
    if (prefixDifference) return prefixDifference
    const currentContext = current.contextWindow ?? 0
    const contextDifference = Math.abs((left.contextWindow ?? currentContext) - currentContext)
      - Math.abs((right.contextWindow ?? currentContext) - currentContext)
    if (contextDifference) return contextDifference
    return left.id.localeCompare(right.id)
  })[0]
}

export function localizedImageAttachmentError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? '')
  const normalized = message.toUpperCase()
  if (normalized.includes('MODEL_DOES_NOT_SUPPORT_IMAGES')) return '当前模型不支持图片输入，请切换到视觉模型或移除图片。'
  if (normalized.includes('TOO_MANY_IMAGES')) return '图片数量超过限制，请移除部分图片后重试。'
  if (normalized.includes('IMAGES_TOO_LARGE')) return '图片总大小超过限制，请移除部分图片后重试。'
  if (normalized.includes('IMAGE_TOO_LARGE')) return '单张图片超过大小限制。'
  if (normalized.includes('IMAGE_TOO_MANY_PIXELS') || normalized.includes('IMAGE_DIMENSION_TOO_LARGE')) return '图片分辨率超过限制。'
  if (normalized.includes('UNSUPPORTED_IMAGE_TYPE') || normalized.includes('IMAGE_TYPE_MISMATCH')) return '图片格式无效，仅支持 PNG、JPEG、WebP 和 GIF。'
  if (normalized.includes('INVALID_IMAGE_BASE64') || normalized.includes('INVALID_IMAGE')) return '图片数据无效或文件已损坏。'
  return message || '处理图片附件失败。'
}
