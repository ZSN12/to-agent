import { analyzeUserIntent, USER_INTENTS } from './user-intent.mjs'
import { isCursorFamilyModelKey } from './cursor-model-route.mjs'

const FILE_PATH = /(?:^|[\s"'`(（])((?:\.{0,2}\/)?(?:[\p{L}\p{N}_@.-]+\/)*[\p{L}\p{N}_@.-]+\.[\p{L}\p{N}]{1,10})(?=$|[\s"'`,;，；。)）])/gu
const BATCH_READ = /(?:并行|批量|分别|同时).{0,12}(?:读取|查看|检查|分析|审阅|对比)|(?:读取|查看|检查|分析|审阅|对比).{0,12}(?:多个|多份|各个)文件/u

export const TASKWEAVER_PI_LITE_PRESET = 'taskweaver-pi-lite'

/**
 * Choose the primary session's tool presentation before its Host session is created.
 * DSH's native `standard` preset is the default for engineering work. Pi-lite
 * (short fixed system prompt, few tools) is used for conversation-only turns to
 * cut input tokens. Code Mode is reserved for batch-shaped read-only requests.
 * Host-bound sessions keep their original preset.
 */
export function resolvePrimaryAgentPreset(text, workMode = 'code', modelKey = null) {
  if (isCursorFamilyModelKey(modelKey) || /^\s*\//.test(String(text ?? ''))) return 'standard'

  const intent = analyzeUserIntent(text, workMode)
  if (intent === USER_INTENTS.CODE_MUTATION || intent === USER_INTENTS.PLANNING) return 'standard'

  const uniquePaths = new Set([...String(text ?? '').matchAll(FILE_PATH)].map((match) => match[1]))
  if (uniquePaths.size >= 2 || BATCH_READ.test(String(text ?? ''))) return 'code'

  if (intent === USER_INTENTS.CONVERSATION) return TASKWEAVER_PI_LITE_PRESET
  return 'standard'
}
