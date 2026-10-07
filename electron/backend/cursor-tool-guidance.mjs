import { isOpenCodexModelKey } from './opencodex-health.mjs'

/**
 * Composer / Cursor routes are trained on Cursor IDE tools, not TaskWeaver's Z Host catalog.
 * MiMo and other providers already follow `standard` tool names; Cursor models often
 * hallucinate Shell / CallDynamicTool and spin until timeout.
 */
export const CURSOR_TOOL_GUIDANCE_TEXT = `<taskweaver_cursor_tools>
Z Host 工具：read、grep、glob、find、ls、bash、edit、write、run_code、mcp__*。勿用 Shell/Grep/Glob/CallDynamicTool/GetDynamicTools 等 Cursor 专用名。终端用 bash；读码用 read/grep（大文件 offset/limit），勿 cat。
</taskweaver_cursor_tools>`

export function shouldInjectCursorToolGuidance(modelKey) {
  return isOpenCodexModelKey(modelKey)
}
