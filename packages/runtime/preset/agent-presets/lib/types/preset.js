/** Agent-preset vocabulary shared by discovery, mounting, and consumers. */
/**
 * Ids a preset directory may use.
 *
 * The id becomes a path segment, so this is a containment boundary rather than
 * a style rule: `..`, a separator, or an absolute-looking name would place the
 * composition outside the root the deployment authorised. Discovery shares it:
 * a directory whose name no copy could ever claim is not a preset slot.
 */
export const PRESET_ID = /^[a-z0-9][a-z0-9-]*$/;
/**
 * Stable TaskWeaver preset ids and the one-release aliases for their former
 * names. Resolution canonicalizes aliases while discovery only exposes the
 * new ids, so picker choices and newly persisted sessions use one vocabulary.
 */
export const LEGACY_AGENT_PRESET_ALIASES = Object.freeze({
    standard: 'tw-default',
    code: 'tw-code',
    'taskweaver-code': 'tw-taskweaver-code',
    'taskweaver-readonly': 'tw-taskweaver-readonly',
    'taskweaver-planner': 'tw-taskweaver-planner',
    'taskweaver-pi-lite': 'tw-taskweaver-pi-lite',
});
const REVERSE_LEGACY_AGENT_PRESET_ALIASES = new Map(Object.entries(LEGACY_AGENT_PRESET_ALIASES).map(([legacy, canonical]) => [canonical, legacy]));
/** Return a canonical preset id while preserving custom ids. */
export function canonicalAgentPresetId(id) {
    return LEGACY_AGENT_PRESET_ALIASES[id] ?? id;
}
/** Return the former id for canonical presets that had a compatibility alias. */
export function legacyAgentPresetId(id) {
    return REVERSE_LEGACY_AGENT_PRESET_ALIASES.get(id);
}
/**
 * No configured root supplies the requested preset.
 *
 * Separate from a mount failure because the two mean different things to a
 * caller: an unknown id is a bad request, while an unusable composition is a
 * broken preset the deployment must fix.
 */
export class UnknownPresetError extends Error {
    presetId;
    available;
    constructor(
    /** The id that was requested. */
    presetId, 
    /** Ids the roster does supply, for the caller to offer instead. */
    available) {
        super(`agent-presets: preset "${presetId}" not found (available: ${available.join(', ') || 'none'})`);
        this.presetId = presetId;
        this.available = available;
    }
}
/** A preset exists but its composition cannot be installed. */
export class PresetMountError extends Error {
    presetId;
    reason;
    constructor(
    /** The preset whose composition failed. */
    presetId, 
    /** Why it failed, without this package's own message prefix. */
    reason, options) {
        super(`agent-presets: preset "${presetId}" failed to mount: ${reason}`, options);
        this.presetId = presetId;
        this.reason = reason;
    }
}
//# sourceMappingURL=preset.js.map