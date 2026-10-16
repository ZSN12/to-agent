/**
 * Resolve the preset for a newly created primary conversation.
 *
 * The preset is locked when the Host session is created, so an intent guess
 * based on the first message can permanently remove tools from later turns.
 * Keep the full default tool catalog unless the user explicitly chooses a
 * different preset at the session boundary.
 */
export function resolvePrimaryAgentPreset() {
  return 'tw-default'
}
