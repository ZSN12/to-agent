const EMPTY_ASSISTANT_FALLBACK = '（模型未返回文本）'
const MAX_LCS_ROWS = 4_000

function normalizedText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function lcsLength(left, right) {
  if (Math.max(left.length, right.length) > MAX_LCS_ROWS) return null
  let previous = new Uint32Array(right.length + 1)
  for (const leftValue of left) {
    const current = new Uint32Array(right.length + 1)
    for (let index = 1; index <= right.length; index++) {
      current[index] = leftValue === right[index - 1]
        ? previous[index - 1] + 1
        : Math.max(previous[index], current[index - 1])
    }
    previous = current
  }
  return previous[right.length]
}

function compareTextRows(left, right) {
  const commonInOrder = lcsLength(left, right)
  return {
    uiCount: left.length,
    hostCount: right.length,
    exactInOrder: commonInOrder,
    uiOnly: commonInOrder === null ? null : left.length - commonInOrder,
    hostOnly: commonInOrder === null ? null : right.length - commonInOrder,
    skippedReason: commonInOrder === null ? 'row-limit-exceeded' : null,
  }
}

function sumUsage(rows) {
  const keys = ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'costUsd']
  return Object.fromEntries(keys.map((key) => [key,
    rows.reduce((total, row) => total + (Number(row?.usage?.[key]) || 0), 0),
  ]))
}

function usageDelta(ui, host) {
  const uiTotals = sumUsage(ui)
  const hostTotals = sumUsage(host)
  return Object.fromEntries(Object.keys(uiTotals).map((key) => [key, {
    ui: uiTotals[key],
    host: hostTotals[key],
    delta: uiTotals[key] - hostTotals[key],
  }]))
}

/**
 * Report only structural signals that can explain why Host user content differs
 * from the UI's display text. Never return either text or a content-derived hash.
 */
export function inspectUserPromptEnvelope(uiText, hostText) {
  const ui = normalizedText(uiText)
  const host = normalizedText(hostText)
  const hostSuffix = ui && host.startsWith(ui) ? host.slice(ui.length) : ''
  return {
    uiHasFileReference: /@file:(?:"[^"]+"|'[^']+'|[^\s"']+)/u.test(ui),
    uiHasDirectoryReference: /@dir:(?:"[^"]+"|'[^']+'|[^\s"']+)/u.test(ui),
    hostHasWorkspaceContextEnvelope: host.includes('<taskweaver_workspace_context>'),
    hostSuffixHasWorkspaceContextEnvelope: hostSuffix.includes('<taskweaver_workspace_context>'),
    hostHasFilesystemSkillEnvelope: host.includes('<taskweaver_skill_instructions>'),
    hostStartsWithNativeSkillInvocation: /^\/[a-z0-9]+(?:-[a-z0-9]+)*\n/u.test(host),
    hostSuffixHasAutoVerifyGuidance: hostSuffix.includes('自主闭环要求'),
  }
}

/**
 * Compare the durable TaskWeaver UI transcript with the Host-derived transcript.
 * The result contains counts, numeric deltas and prompt-envelope booleans only;
 * no message content or hashes.
 */
export function compareConversationTranscripts(uiMessages, hostRows) {
  const ui = Array.isArray(uiMessages) ? uiMessages : []
  const host = Array.isArray(hostRows) ? hostRows : []
  const uiUsers = ui.filter((row) => row?.author === 'user')
  const hostUsers = host.filter((row) => row?.role === 'user')
  const uiAssistantCandidates = ui.filter((row) => ['orchestrator', 'agent'].includes(row?.author))
  const uiErrors = uiAssistantCandidates.filter((row) => normalizedText(row.text).startsWith('执行失败：'))
  const uiPlaceholders = uiAssistantCandidates.filter((row) => normalizedText(row.text) === EMPTY_ASSISTANT_FALLBACK)
  const uiAssistants = uiAssistantCandidates.filter((row) =>
    !uiErrors.includes(row) && !uiPlaceholders.includes(row))
  const hostAssistants = host.filter((row) => row?.role === 'assistant')
  const uiUserText = uiUsers.map((row) => normalizedText(row.text))
  const hostUserText = hostUsers.map((row) => normalizedText(row.text))
  const uiAssistantText = uiAssistants.map((row) => normalizedText(row.text))
  const hostAssistantText = hostAssistants.map((row) => normalizedText(row.text))
  const uiThinking = uiAssistants.map((row) => normalizedText(row.thinking)).filter(Boolean)
  const hostThinking = hostAssistants.map((row) => normalizedText(row.thinking)).filter(Boolean)

  return {
    ui: {
      messageCount: ui.length,
      userCount: uiUsers.length,
      assistantCount: uiAssistantCandidates.length,
      errorCount: uiErrors.length,
      emptyResponsePlaceholderCount: uiPlaceholders.length,
    },
    host: {
      transcriptRowCount: host.length,
      userCount: hostUsers.length,
      assistantCount: hostAssistants.length,
      compactionCount: host.filter((row) => row?.role === 'compaction').length,
    },
    users: compareTextRows(uiUserText, hostUserText),
    assistants: compareTextRows(uiAssistantText, hostAssistantText),
    thinking: compareTextRows(uiThinking, hostThinking),
    usage: usageDelta(uiAssistants, hostAssistants),
  }
}
