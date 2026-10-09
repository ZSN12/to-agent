"use strict";
/**
 * A per-agent persona as a composable row.
 *
 * `dsh-system-prompt` owns the global persona as its own config, and registers
 * that section unconditionally — so this row is **scope-only**. Mounted inside
 * an agent preset it shadows the deployment persona for that one session,
 * exactly like the per-child persona `dsh-subagent` installs; mounted globally
 * it collides with the registry's own registration and fails loud.
 *
 * That constraint is the reason the row exists. An agent preset cannot mount
 * the prompt registry itself, so without a row of its own a preset could
 * change an agent's tools but never its identity.
 * @module @z/dsh-persona
 */
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Config = exports.inject = exports.name = exports.PERSONA_SECTION = exports.PERSONA_ORDER = void 0;
exports.apply = apply;
var schemastery_1 = require("@z/schemastery");
// Imported rather than restated: the registry declares the slot this row
// replaces, and two hardcoded copies would drift into a preset whose persona
// silently lands beside the deployment's instead of shadowing it.
var dsh_system_prompt_1 = require("@z/dsh-system-prompt");
Object.defineProperty(exports, "PERSONA_ORDER", { enumerable: true, get: function () { return dsh_system_prompt_1.PERSONA_ORDER; } });
Object.defineProperty(exports, "PERSONA_SECTION", { enumerable: true, get: function () { return dsh_system_prompt_1.PERSONA_SECTION; } });
/** Cordis plugin name. */
exports.name = 'persona';
/** The prompt registry this row contributes to. */
exports.inject = ['systemPrompt'];
/** Runtime schema for the persona row. */
exports.Config = schemastery_1.default.object({
    text: schemastery_1.default.string().required(),
    complete: schemastery_1.default.boolean().default(false),
    includeRuntimeContext: schemastery_1.default.boolean().default(true),
});
/**
 * Register the persona section for the mounting context's scope.
 * @param ctx - an agent scope context; an unscoped context collides with the
 * prompt registry's own persona registration and rejects.
 * @param config - the persona text and complete-prompt policy.
 */
function apply(ctx, config) {
    var _a;
    ctx.effect(function () { return ctx.systemPrompt.section(__assign({ name: dsh_system_prompt_1.PERSONA_SECTION, order: dsh_system_prompt_1.PERSONA_ORDER, text: config.text }, (config.complete ? { complete: true } : {}))); }, 'persona.section()');
    if (!((_a = config.includeRuntimeContext) !== null && _a !== void 0 ? _a : true))
        ctx.systemPrompt.suppressRuntimeContext();
}
