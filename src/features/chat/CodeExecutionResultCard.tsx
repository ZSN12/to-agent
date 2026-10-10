import { AttachmentImagePreview } from './AttachmentImagePreview'
import {
  boundCodeOutput,
  codeOutputImageDataUrl,
  CODE_OUTPUT_MAX_CHARS,
  CODE_OUTPUT_MAX_IMAGES,
} from './codeOutputPresentation'
import type { CodeOutputImage } from './codeOutputPresentation'

/** Bounded presentation of a code-mode result; image bytes are fetched on demand by the caller. */
export function CodeExecutionResultCard({
  output,
  images = [],
  imageCount = images.length,
  imagesLoading = false,
}: {
  output?: string
  images?: readonly CodeOutputImage[]
  imageCount?: number
  imagesLoading?: boolean
}) {
  const bounded = boundCodeOutput(output)
  const visibleImages = images.slice(0, CODE_OUTPUT_MAX_IMAGES).flatMap((image) => {
    const src = codeOutputImageDataUrl(image)
    return src ? [{ image, src }] : []
  })
  const totalImages = Math.max(images.length, imageCount)
  const moreImages = Math.max(0, totalImages - CODE_OUTPUT_MAX_IMAGES)

  if (!bounded.text && totalImages === 0) return null

  return (
    <section className="code-execution-result" data-testid="code-execution-result" aria-label="代码执行结果">
      {bounded.text && (
        <>
          <pre className="tool-trace-output code-execution-result-text">{bounded.text}</pre>
          {bounded.truncated && (
            <div className="code-execution-result-truncated" role="note">
              输出超过上限，仅显示前 {CODE_OUTPUT_MAX_CHARS} 个字符
            </div>
          )}
        </>
      )}
      {totalImages > 0 && (
        <div className="code-execution-result-images" aria-label={`返回了 ${totalImages} 张图片`}>
          {visibleImages.map(({ image, src }, index) => (
            <figure className="code-execution-result-image" key={`${image.name ?? 'image'}-${index}`}>
              <AttachmentImagePreview src={src} alt={image.name || `代码执行返回的图片 ${index + 1}`} />
              {(image.name || image.width || image.height) && (
                <figcaption>
                  {image.name || '返回图片'}
                  {image.width && image.height ? ` · ${image.width}×${image.height}` : ''}
                </figcaption>
              )}
            </figure>
          ))}
          {imagesLoading && <span className="code-execution-result-more" role="status">正在读取图片预览…</span>}
          {!imagesLoading && visibleImages.length === 0 && (
            <span className="code-execution-result-more" role="note">图片预览暂不可用</span>
          )}
          {moreImages > 0 && <span className="code-execution-result-more">还有 {moreImages} 张图片未显示</span>}
        </div>
      )}
    </section>
  )
}
