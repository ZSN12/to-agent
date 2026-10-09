"use strict";
/**
 * Browser-safe, zero-dependency loopback classification shared by the `/api`
 * Host fence and the package's `ctx.connection` state. The predicate stays
 * package-internal; client plugins consume the derived state through Cordis.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.isLoopbackHostname = isLoopbackHostname;
/**
 * Whether a normalized URL hostname names the local loopback authority.
 * @param hostname - WHATWG URL hostname (IPv6 literals retain brackets).
 * @returns true for localhost, IPv6 loopback, or any IPv4 address in 127/8.
 */
function isLoopbackHostname(hostname) {
    if (hostname === 'localhost' || hostname === '[::1]')
        return true;
    var parts = hostname.split('.');
    return parts.length === 4
        && parts[0] === '127'
        && parts.every(function (part) { return /^\d{1,3}$/.test(part) && Number(part) <= 255; });
}
