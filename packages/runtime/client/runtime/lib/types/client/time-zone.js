"use strict";
/** Browser-owned time-zone sampling for prompt RPC provenance. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolvedClientTimeZone = resolvedClientTimeZone;
/**
 * Resolve the current browser IANA zone for one outbound operation.
 * @returns The browser-provided canonical zone.
 * @throws when the runtime cannot provide a non-empty zone.
 */
function resolvedClientTimeZone() {
    var timeZone = new Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (typeof timeZone !== 'string' || timeZone.length === 0) {
        throw new Error('browser time zone is unavailable');
    }
    return timeZone;
}
