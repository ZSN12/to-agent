import { MESSAGE_TITLE_MAX_LENGTH } from './config.mjs'

export const DEFAULT_THREAD_TITLE = '新对话'

const LEGACY_MESSAGE_TITLE_MAX_LENGTH = 200
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f\u200b\u200e\u200f\u202a-\u202e\u2060-\u206f\ufeff]/gu
const OUTPUT_DIRECTIVE = /^(?:请)?(?:用.{0,8}(?:回答|总结|概括)|(?:一句话|简短地|简短)回答|只(?:用)?一句话回答|直接回答|回答)[：:]\s*/u
const REQUEST_PREFIX = /^(?:请问|麻烦您|麻烦你|麻烦|请你|请帮我|帮我|你帮我|能否帮我|能不能帮我|可不可以帮我|可以帮我|我现在希望|我希望|我现在想|我想要|我想|你能不能|能不能|请)[\s，,、]*/u
const TASK_FILLER = /^(?:做一项|做一个|做一下|来一项|来一个|给我|帮忙)[\s，,、]*/u

function cleanMessage(text) {
  return String(text ?? '')
    .replace(CONTROL_CHARACTERS, '')
    .replace(/```[\s\S]*?```/gu, '代码')
    .replace(/\s+/gu, ' ')
    .trim()
}

function summarizeFirstSentence(text) {
  let candidate = cleanMessage(text)
  if (!candidate) return ''

  candidate = candidate.replace(/^[>#*\-\s]+/u, '').trim()
  candidate = candidate.replace(OUTPUT_DIRECTIVE, '').trim()
  for (let index = 0; index < 4; index += 1) {
    const next = candidate.replace(REQUEST_PREFIX, '').replace(TASK_FILLER, '').trim()
    if (next === candidate) break
    candidate = next
  }

  // A colon often introduces the actual topic after a response-format request.
  // If the first clause is only a short instruction, use the topic after it.
  const colonAt = candidate.search(/[：:]/u)
  if (colonAt > 0) {
    const before = candidate.slice(0, colonAt).trim()
    const after = candidate.slice(colonAt + 1).trim()
    if (after && before.length <= 8 && /^(?:回答|概括|总结|说明|分析|检查|处理|处理一下|用一句话)/u.test(before)) {
      candidate = after
    } else {
      candidate = before
    }
  }

  candidate = candidate.split(/[。！？!?；;，,\n]/u, 1)[0]?.trim() ?? ''
  candidate = candidate
    .replace(/^(?:请|帮我|麻烦|一下|做一项|做一个)[\s，,、]*/u, '')
    .replace(/[\s:：、，,。！？!?；;]+$/gu, '')
    .trim()
  return Array.from(candidate).slice(0, MESSAGE_TITLE_MAX_LENGTH).join('')
}

/** Derive a compact title from the first user's message (at most 10 characters). */
export function titleFromMessage(text) {
  return summarizeFirstSentence(text) || DEFAULT_THREAD_TITLE
}

/** Match titles written by older versions so they can be migrated as automatic titles. */
export function legacyTitleFromMessage(text) {
  const compact = String(text ?? '').replace(/\s+/gu, ' ').trim()
  if (!compact) return DEFAULT_THREAD_TITLE
  return compact.length > LEGACY_MESSAGE_TITLE_MAX_LENGTH
    ? `${compact.slice(0, LEGACY_MESSAGE_TITLE_MAX_LENGTH)}…`
    : compact
}
