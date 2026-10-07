import { analyzeUserIntent, USER_INTENTS } from './user-intent.mjs'
import { isCursorFamilyModelKey } from './cursor-model-route.mjs'

const FILE_PATH = /(?:^|[\s"'`(（])((?:\.{0,2}\/)?(?:[\p{L}\p{N}_@.-]+\/)*[\p{L}\p{N}_@.-]+\.[\p{L}\p{N}]{1,10})(?=$|[\s"'`,;，；。)）])/gu
const BATCH_READ = /(?:并行|批量|分别|同时).{0,12}(?:读取|查看|检查|分析|审阅|对比)|(?:读取|查看|检查|分析|审阅|对比).{0,12}(?:多个|多份|各个)文件/u

/**
 * Choose the primary session's tool presentation before its Host session is created.
 * DSH's standard preset remains the default; Code Mode is reserved for clearly
 * batch-shaped read-only requests where grouped/parallel tool calls have evidence
 * of reducing round trips. Host-bound sessions keep their original preset.
 */
export function resolvePrimaryAgentPreset(text, workMode = 'code', modelKey = null) {
  // DSH Web keeps Composer on the `standard` preset (read/grep/bash). TaskWeaver's
  // auto Code Mode (`run_code` only) confuses Cursor-trained models and adds rounds.
  if (isCursorFamilyModelKey(modelKey)) return 'standard'

  const intent = analyzeUserIntent(text, workMode)
  if (intent === USER_INTENTS.CODE_MUTATION || intent === USER_INTENTS.PLANNING) return 'standard'

  const uniquePaths = new Set([...String(text ?? '').matchAll(FILE_PATH)].map((match) => match[1]))
  if (uniquePaths.size >= 2 || BATCH_READ.test(String(text ?? ''))) return 'code'
  return 'standard'
}
