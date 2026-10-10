/** Shared image preview used by composer attachments and tool results. */
export function AttachmentImagePreview({
  src,
  alt,
  className,
}: {
  src: string
  alt: string
  className?: string
}) {
  return <img src={src} alt={alt} className={className} loading="lazy" decoding="async" />
}
