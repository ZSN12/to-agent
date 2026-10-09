"use strict";
/**
 * App-level desktop access policy: decide whether an action targeting a macOS
 * bundle id is allowed, denied, or deferred, by matching per-app rules and a
 * default. Mirrors Codex's computer-use allow/deny model.
 * @module @z/dsh-tool-desktop
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.classifyDesktopAccess = classifyDesktopAccess;
exports.resolveVerdict = resolveVerdict;
/**
 * Classify a target bundle id against the policy. Rules are matched in order;
 * the first matching bundle id decides. Apps with no matching rule fall back
 * to `policy.default`: an `allow` default allows directly, a `deny` default
 * defers to the approval waterfall (so an unmatched app is asked, not silently
 * denied). An explicit rule is always authoritative.
 * @param policy - the active access policy
 * @param bundleId - the macOS bundle id of the target app
 * @returns the access verdict: `allow`, `deny`, or `defer` (needs approval)
 */
function classifyDesktopAccess(policy, bundleId) {
    for (var _i = 0, _a = policy.rules; _i < _a.length; _i++) {
        var rule = _a[_i];
        if (rule.bundleId === bundleId)
            return rule.access;
    }
    return policy.default === 'allow' ? 'allow' : 'defer';
}
/**
 * Resolve a raw verdict against the current approval posture. A `deny` is
 * always final. `allow` becomes `allow` unless the caller chose to gate it.
 * `defer` forwards to the approval waterfall.
 * @param verdict - raw policy verdict
 * @param gateAllow - if true, even `allow` is deferred to the human (belt and
 * suspenders for persistent-approval configurations)
 * @returns the effective verdict after applying `gateAllow`
 */
function resolveVerdict(verdict, gateAllow) {
    if (verdict === 'deny')
        return 'deny';
    if (verdict === 'defer')
        return 'defer';
    return gateAllow ? 'defer' : 'allow';
}
