import { isCursorFamilyModelKey } from './cursor-model-route.mjs'

const BRIDGE_PROVIDER_PREFIXES = ['bridge-composer/', 'bridge-antigravity/']

/** Legacy `opencodex/*` provider and bare `cursor/*` routes (not built-in bridge). */
export function isDeprecatedOpenCodexChatRoute(modelKey) {
  const key = String(modelKey ?? '')
  if (key.startsWith('opencodex/')) return true
  return isCursorFamilyModelKey(key)
}

/** Cursor subscription traffic via built-in bridge or legacy ocx loopback routes. */
export function isCursorBridgeTransportRoute(modelKey) {
  const key = String(modelKey ?? '')
  if (BRIDGE_PROVIDER_PREFIXES.some((prefix) => key.startsWith(prefix))) return true
  return isDeprecatedOpenCodexChatRoute(modelKey)
}

/** OpenCodex advertises Z Host tools on Cursor wire as `ocx_client_<name>` (vendor fork aliases bare names). */
export const OCX_CLIENT_TOOL_PREFIX = 'ocx_client_'

export function hostToolToOcxClientWireName(hostToolName) {
  const bare = String(hostToolName ?? '').trim()
  if (!bare) return ''
  if (bare.startsWith(OCX_CLIENT_TOOL_PREFIX)) return bare
  return `${OCX_CLIENT_TOOL_PREFIX}${bare}`
}

/**
 * Composer / Cursor routes use OpenCodex; Z Host tool names match MiMo (read/grep/bash…).
 * Bundled ocx is patched to accept bare Host names — do not steer models toward Shell/CallDynamicTool.
 */
export const CURSOR_TOOL_GUIDANCE_TEXT = `<taskweaver_cursor_tools>
Composer 走 OpenCodex 时调用 Z Host 工具：read、grep、glob、bash、edit、write、run_code、mcp__*。文件工具优先直接调用，不要为了读文件包一层 run_code；只有确实需要执行程序时才用 bash。
只调用本轮工具列表中明示的工具；Cursor 内部工具（例如 get_creds）未向 Agent 开放，绝不可尝试读取或索取凭据。
参数名必须严格遵循工具 schema：read 优先用 file_path（兼容接受 path），可选 offset/limit；grep 用必填 pattern，可选 path/include；glob 用必填 pattern，可选 path；bash 用必填 command 和 description；edit 用 file_path、old_string、new_string；write 用 file_path、content。路径优先用工作区相对路径。工具返回参数校验错误时，按错误和 schema 修正字段后最多重试一次，不要原样重复调用。
对明确文件或符号的只读问题，优先在指定文件内定位；文件名已给出时不要先扫全仓。通常一次定向 grep 加一次有范围的 read 就足够，证据充分后停止，不重复检查相同范围。
勿用 Shell/Grep/Read/CallDynamicTool/GetDynamicTools 等替代工具名。
</taskweaver_cursor_tools>`

export function shouldInjectCursorToolGuidance(modelKey) {
  return isCursorBridgeTransportRoute(modelKey)
}

/**
 * @param {string} message
 * @param {string | null | undefined} modelKey
 */
export function humanizeBridgeTransportError(message, modelKey) {
  const text = String(message ?? '')
  if (!isCursorBridgeTransportRoute(modelKey)) return text

  const unknownTool = text.match(/unknown Responses tool:\s*([^\s]+)/i)
  if (unknownTool) {
    const wire = unknownTool[1]
    const bare = wire.startsWith('ocx_client_') ? wire.slice('ocx_client_'.length) : wire
    const knownHostTools = new Set(['read', 'read_image', 'grep', 'glob', 'bash', 'edit', 'write', 'run_code'])
    const isKnownTool = knownHostTools.has(bare) || bare.startsWith('mcp__')
    if (!isKnownTool) {
      return [
        `Composer 请求了本轮未登记的工具「${wire}」，它不在当前 Z Host 工具目录中。`,
        '只允许调用当前请求工具列表中明示的工具；不要猜测添加 ocx_client_ 前缀。Cursor 内部凭据工具不可用，也不要请求或读取凭据。',
        text,
      ].join(' ')
    }
    const suggested = wire.startsWith('ocx_client_') ? wire : `ocx_client_${bare}`
    return [
      `Composer 调用了本轮未向内置桥登记的 tools 名「${wire}」。`,
      `经内置桥接时请改用 ${suggested}，勿用 Cursor IDE 裸名（如 ${bare}）。`,
      '仍失败可新开对话，或换 MiMo 等非 Cursor 模型做读仓。',
      text,
    ].join(' ')
  }

  if (/^Connection error\.?$/i.test(text.trim()) || /\bConnection error\.?\b/i.test(text)) {
    return [
      'Composer 与 Cursor 订阅桥连接中断（长工具链、系统代理或会话超时较常见）。',
      '请拆小任务、检查网络与代理，或在「模型与来源」确认 bridge-composer 已登录后重试；也可换 MiMo 等非 Cursor 模型。',
      text.trim(),
    ].join(' ')
  }

  if (/incomplete frame|frame_incomplete|upstream stream ended|adapter_eof|Cursor turn was aborted/i.test(text)) {
    return [
      'Cursor 上游流异常结束（经内置 Composer 桥）。请重试或换非 Cursor 模型。',
      text,
    ].join(' ')
  }

  if (!/ECONNREFUSED|fetch failed|ENOTFOUND|EAI_AGAIN/i.test(text)) return text
  return [
    '无法连接内置 Composer 桥（Cursor 订阅经 TaskWeaver 内置传输转发，不是 Z Host 工具层故障）。',
    '请在「模型与来源」确认 bridge-composer 已登录，并完全退出后重试 TaskWeaver。',
    '官方直连模型（如小米 MiMo）不经过该桥，因此可正常使用。',
    text.includes('ECONNREFUSED') || /fetch failed/i.test(text) ? `底层：${text}` : text,
  ].join(' ')
}
