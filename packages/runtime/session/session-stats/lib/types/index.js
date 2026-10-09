"use strict";
/**
 * Function plugin registering the `sessionStats` projection unit: whole-log
 * turn/step counts and LLM/tool/first-token/decode wall times served through
 * the session-projection seam (registry snapshot, change feed, and every
 * projection carrier), so clients render full-session figures that paging and
 * compaction cannot change. The plugin owns only the fold; delivery is the
 * seam's.
 *
 * @module @z/dsh-session-stats
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.inject = exports.name = void 0;
exports.apply = apply;
var projection_ts_1 = require("./projection.ts");
/** Cordis plugin name. */
exports.name = 'session-stats';
/** The projection registry is the plugin's whole purpose; without it the fiber stays pending. */
exports.inject = ['sessionProjections'];
/**
 * Register the `sessionStats` unit; the registration is an effect on this
 * plugin's fiber, so unloading removes the key.
 * @param ctx - registrant context carrying the projection registry.
 */
function apply(ctx) {
    ctx.sessionProjections.register(projection_ts_1.sessionStatsProjectionDefinition);
}
