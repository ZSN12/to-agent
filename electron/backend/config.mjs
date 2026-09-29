/**
 * 集中化配置常量 - 避免代码中的魔法数字
 *
 * 本文件定义了系统各模块使用的超时、重试、限制等配置项。
 * 统一管理便于调整和维护。
 */

// ==================== Z Host event stream (chat bridge) ====================
export const Z_INITIAL_RECONNECT_DELAY_MS = 1000
export const Z_MAX_RECONNECT_DELAY_MS = 30000
export const Z_MAX_RECONNECT_ATTEMPTS = 5
export const Z_APPROVAL_PROMPT_TIMEOUT_MS = 300000 // 5 分钟
export const Z_APPROVAL_PROMPT_GRACE_PERIOD_MS = 5000
export const Z_EVENT_CHANNEL_OPEN_TIMEOUT_MS = 60000

/** @deprecated TaskWeaver-side aliases */
export const DSH_INITIAL_RECONNECT_DELAY_MS = Z_INITIAL_RECONNECT_DELAY_MS
export const DSH_MAX_RECONNECT_DELAY_MS = Z_MAX_RECONNECT_DELAY_MS
export const DSH_MAX_RECONNECT_ATTEMPTS = Z_MAX_RECONNECT_ATTEMPTS
export const DSH_APPROVAL_PROMPT_TIMEOUT_MS = Z_APPROVAL_PROMPT_TIMEOUT_MS
export const DSH_APPROVAL_PROMPT_GRACE_PERIOD_MS = Z_APPROVAL_PROMPT_GRACE_PERIOD_MS
export const DSH_EVENT_CHANNEL_OPEN_TIMEOUT_MS = Z_EVENT_CHANNEL_OPEN_TIMEOUT_MS

// ==================== Web Search Service ====================
export const WEB_SEARCH_DUCKDUCKGO_TIMEOUT_MS = 12000
export const WEB_SEARCH_TAVILY_TIMEOUT_MS = 15000
export const WEB_SEARCH_SERPER_TIMEOUT_MS = 15000
export const WEB_SEARCH_GENERIC_TIMEOUT_MS = 15000
export const WEB_SEARCH_MAX_RESULTS = 20
export const WEB_SEARCH_DEFAULT_RESULTS = 5
export const WEB_SEARCH_ERROR_MESSAGE_MAX_LENGTH = 150

// ==================== Custom Provider Service ====================
export const CUSTOM_PROVIDER_DEFAULT_CONTEXT_WINDOW = 128000
export const CUSTOM_PROVIDER_DEFAULT_MAX_TOKENS = 8192

// ==================== MCP Service ====================
export const MCP_RESULT_TEXT_MAX_LENGTH = 100000
export const MCP_SERVER_ID_REGEX = /^[a-z][a-z0-9_-]{0,39}$/
export const MCP_TOOL_NAME_REGEX = /^[A-Za-z0-9_-]{1,80}$/
export const MCP_ENV_KEY_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/

// ==================== Subtask Retry ====================
export const SUBTASK_MAX_RETRY_LIMIT = 3
export const SUBTASK_DEFAULT_MAX_RETRIES = 1

// ==================== Register IPC ====================
export const IPC_PLANNER_FALLBACK_HINT_MAX_LENGTH = 200
export const IPC_ERROR_MESSAGE_MAX_LENGTH = 500
export const LOG_ID_MAX_LENGTH = 100
export const MESSAGE_TITLE_MAX_LENGTH = 200
export const TOOL_NAME_MAX_LENGTH = 100
export const TASK_ID_MAX_LENGTH = 100
export const TOOL_INPUT_SUMMARY_MAX_LENGTH = 500
export const TOOL_RESULT_SUMMARY_MAX_LENGTH = 1000
export const MAX_OUTPUT_LOGS = 100

// ==================== Performance Calculation ====================
export const MILLISECONDS_PER_SECOND = 1000

// ==================== 默认配置对象 ====================
export const CONFIG = {
  zHost: {
    reconnect: {
      initialDelayMs: Z_INITIAL_RECONNECT_DELAY_MS,
      maxDelayMs: Z_MAX_RECONNECT_DELAY_MS,
      maxAttempts: Z_MAX_RECONNECT_ATTEMPTS,
    },
    approval: {
      timeoutMs: Z_APPROVAL_PROMPT_TIMEOUT_MS,
      gracePeriodMs: Z_APPROVAL_PROMPT_GRACE_PERIOD_MS,
    },
    eventChannelOpenTimeoutMs: Z_EVENT_CHANNEL_OPEN_TIMEOUT_MS,
  },
  webSearch: {
    timeout: {
      duckduckgo: WEB_SEARCH_DUCKDUCKGO_TIMEOUT_MS,
      tavily: WEB_SEARCH_TAVILY_TIMEOUT_MS,
      serper: WEB_SEARCH_SERPER_TIMEOUT_MS,
      generic: WEB_SEARCH_GENERIC_TIMEOUT_MS,
    },
    maxResults: WEB_SEARCH_MAX_RESULTS,
    defaultResults: WEB_SEARCH_DEFAULT_RESULTS,
    errorMessageMaxLength: WEB_SEARCH_ERROR_MESSAGE_MAX_LENGTH,
  },
  customProvider: {
    defaultContextWindow: CUSTOM_PROVIDER_DEFAULT_CONTEXT_WINDOW,
    defaultMaxTokens: CUSTOM_PROVIDER_DEFAULT_MAX_TOKENS,
  },
  mcp: {
    resultTextMaxLength: MCP_RESULT_TEXT_MAX_LENGTH,
    regex: {
      serverId: MCP_SERVER_ID_REGEX,
      toolName: MCP_TOOL_NAME_REGEX,
      envKey: MCP_ENV_KEY_REGEX,
    },
  },
  subtask: {
    maxRetryLimit: SUBTASK_MAX_RETRY_LIMIT,
    defaultMaxRetries: SUBTASK_DEFAULT_MAX_RETRIES,
  },
  ipc: {
    plannerFallbackHintMaxLength: IPC_PLANNER_FALLBACK_HINT_MAX_LENGTH,
    errorMessageMaxLength: IPC_ERROR_MESSAGE_MAX_LENGTH,
  },
  performance: {
    millisecondsPerSecond: MILLISECONDS_PER_SECOND,
  },
}
