import path from 'node:path'

/**
 * @param {string | undefined} filename
 * @param {string} ext e.g. `.png`
 */
export function sanitizeClipboardAttachmentFilename(filename, ext) {
  const safeBase = path.basename(String(filename || '')).replace(/[^\w.\-]/g, '_')
  if (safeBase && /\.(png|jpe?g|webp)$/i.test(safeBase)) return safeBase
  return `pasted-image-${Date.now()}${ext}`
}

/**
 * @param {string} targetDir resolved directory
 * @param {string} targetPath resolved file path
 */
export function assertAttachmentInsideDir(targetDir, targetPath) {
  const rel = path.relative(path.resolve(targetDir), path.resolve(targetPath))
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('附件路径无效')
  }
}
