/**
 * TaskWeaver permission-mode vocabulary and conservative DSH approval bridge.
 *
 * DSH separates the Agent preset (which tools exist) from the per-session
 * permission preset (sandbox mode + approval policy). `code` and
 * `taskweaver-code` are therefore NOT permission boundaries. DSH's native
 * presets currently mean:
 *
 * - `workspace-write`: shell/filesystem writes are confined to the session
 *   workspace; a wider file operation must go through DSH's approval-backed
 *   sandbox escalation.
 * - `danger-full-access`: DSH's bash sandbox bypasses confinement and its
 *   filesystem sandbox delegates writes without a fence; approval policy is
 *   `never`. This is genuinely unrestricted local file/process access for the
 *   tools that are mounted, not a permission label only.
 *
 * DSH's documented sandbox is a file-effect boundary, not a network-egress
 * policy. Consequently, these mappings cannot promise that web access always
 * asks, or implement a separate risk classifier for otherwise permitted bash
 * commands. Until those capabilities exist, every actual DSH approval request
 * is surfaced to the user (including unexpected requests in `full` mode).
 * Never auto-approve an approval frame based on its incomplete reason text.
 */

export const DSH_APPROVAL_PROMPT_TIMEOUT_MS = 300_000

export const PERMISSION_MODES = Object.freeze(['ask', 'on-risk', 'full'])

const DSH_PERMISSION_PRESETS = Object.freeze({
  ask: 'workspace-write',
  // DSH has no native "ask only for classified risks" policy. Keep normal
  // workspace coding usable, while prompting for every DSH escalation.
  // This remains a conservative approximation, not a full semantic match.
  'on-risk': 'workspace-write',
  full: 'danger-full-access',
})

export function normalizePermissionMode(value) {
  return PERMISSION_MODES.includes(value) ? value : 'ask'
}

/** Agent/tool preset at `sessions.create`; permission is set independently. */
export function dshAgentPresetForPermissionMode(_mode) {
  return 'standard'
}


/**
 * Native DSH session permission preset to apply through the DSH `/permission`
 * command. This does not change the Agent preset/tool catalog.
 */
export function dshPermissionPresetForMode(value) {
  return DSH_PERMISSION_PRESETS[normalizePermissionMode(value)]
}

/**
 * DSH `approval/requested` means an actual approval gate (for example, a
 * sandbox escalation). Its reason is not a complete representation of the
 * command/tool arguments, so it must never be auto-approved by a heuristic.
 * @param {{ toolName?: string, reason?: string }} frame
 */
export function dshApprovalNeedsPrompt(mode, frame) {
  // Keep the args in the signature for diagnostics and forward compatibility;
  // absent/incomplete context is not grounds to grant an approval.
  void mode
  void frame
  return true
}

/**
 * @param {'ask'|'on-risk'|'full'} mode
 * @param {{ toolName?: string, reason?: string }} frame
 * @returns {'allow'|'prompt'|'deny'}
 */
export function resolveDshApprovalBridgeAction(mode, frame) {
  void mode
  void frame
  return 'prompt'
}
