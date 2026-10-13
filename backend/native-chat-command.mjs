/** Only standalone built-in commands bypass task/context/planner preparation.
 * Multiline skill gestures and ordinary text must remain ordinary prompts. */
export function nativeChatCommand(text) {
  if (typeof text !== 'string') return null
  const line = text.trim()
  if (/^\/compact(?:[ \t]+[^\r\n]*)?$/i.test(line)) {
    return `/compact${line.slice('/compact'.length)}`
  }
  if (/^\/plan(?:[ \t].*)?$/i.test(line)) {
    if (/^\/plan[ \t]+off$/i.test(line)) return '/plan off'
    if (/^\/plan[ \t]+off[ \t].+/i.test(line)) return null
    const rest = line.match(/^\/plan(?:[ \t]+(.*))?$/i)?.[1]
    if (!rest?.trim()) return '/plan'
    return `/plan ${rest.trim()}`
  }
  return null
}
