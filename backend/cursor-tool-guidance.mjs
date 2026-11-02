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

/** WorkBuddy local proxy or relay routes. */
export function isWorkBuddyModelRoute(modelKey) {
  const key = String(modelKey ?? '').trim().toLowerCase()
  return key.startsWith('workbuddy/') || key.startsWith('workbuddy-ai/') || key.includes('workbuddy')
}

function workBuddyAppLabel(modelKey) {
  return String(modelKey ?? '').trim().toLowerCase().startsWith('workbuddy-ai/')
    ? 'WorkBuddy AI'
    : 'WorkBuddy'
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
 * @param {string} message
 * @param {string | null | undefined} modelKey
 */
export function humanizeBridgeTransportError(message, modelKey) {
  const text = String(message ?? '')

  if (/MCP error\s+-32602[\s\S]*No local executors available to process this request|No local executors available to process this request/i.test(text)) {
    return [
      '当前 MCP 请求没有可用的本地执行端（executor）；通常是运行环境未提供执行端，或执行端没有挂接到当前会话。这不代表工作区文件不可读，也不代表 TaskWeaver 的其他文件工具不可用。',
      '请检查当前会话实际提供的工具目录，以及承载该 MCP 的本地执行端连接；不要原样重复同一个 MCP 请求。',
      text,
    ].join(' ')
  }

  const isWbRoute = isWorkBuddyModelRoute(modelKey)
  const workBuddyApp = workBuddyAppLabel(modelKey)
  const isWbApisix401 = /401\s*Authorization\s*Required/i.test(text) && /apisix/i.test(text)
  const isWbAuthRequired = /Authentication required\. Please use \/login/i.test(text)
    || /invalid_token/i.test(text)
    || /WorkBuddy not logged in/i.test(text)
    || /auth file missing/i.test(text)

  if (isWbApisix401 || isWbAuthRequired || (isWbRoute && (/\b401\b/.test(text) || /unauthorized/i.test(text)))) {
    return [
      'WorkBuddy 授权凭据已过期或失效（上游网关返回 401 认证失败）。',
      `请打开「${workBuddyApp}」桌面客户端重新登录账号以自动刷新本地凭据，然后点击重试。`,
    ].join(' ')
  }

  if (isWbRoute && /ECONNREFUSED|fetch failed|ENOTFOUND|EAI_AGAIN/i.test(text)) {
    return [
      '无法连接本地 WorkBuddy 中转服务（通常监听在 127.0.0.1:10104 或 10105）。',
      `请确认「${workBuddyApp}」桌面客户端已启动，并检查对应的本地 Relay 服务状态。`,
      text.includes('ECONNREFUSED') ? '（底层原因：ECONNREFUSED 连接被拒绝）' : text,
    ].join(' ')
  }

  if (isWbRoute && (/\b429\b/.test(text) || /Too Many Requests/i.test(text))) {
    return [
      'WorkBuddy 上游服务请求频率受限（429 Too Many Requests）。',
      '请稍候片刻重试，或切换为其他可用模型。',
    ].join(' ')
  }

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
    return [
      `Composer 调用了本轮未向内置桥登记的 tools 名「${wire}」。`,
      `内置桥只会在本轮已登记的工具目录内映射裸名与 ${OCX_CLIENT_TOOL_PREFIX} 前缀名；手动添加前缀不会注册缺失工具。`,
      '请核对本轮实际工具目录、Agent preset、权限和 Z Host 工具注册状态，不要重复相同请求。',
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
