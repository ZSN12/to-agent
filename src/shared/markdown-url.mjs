/**
 * Keep Markdown links on the small set of protocols the desktop app can open
 * safely. Relative paths and active-content schemes are not navigation.
 * @param {string} raw
 */
export function normalizeMarkdownUrl(raw) {
  try {
    const url = new URL(raw.trim())
    if (!['http:', 'https:', 'mailto:'].includes(url.protocol)) return ''
    if (url.username || url.password) return ''
    return url.href
  } catch {
    return ''
  }
}
