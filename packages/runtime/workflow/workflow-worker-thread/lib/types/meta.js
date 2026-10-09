"use strict";
/**
 * Meta validation checks caller-provided DATA against the {@link WorkflowMeta}
 * contract and rejects every violation by name. Meta arrives as schema-checked
 * JSON data, never evaluated script text; evaluating it on the host could run getters outside the
 * worker timeout that exists to isolate model-written code.
 * @module @z/dsh-workflow-worker-thread/meta
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
exports.validateMeta = validateMeta;
var dsh_workflow_1 = require("@z/dsh-workflow");
/** Collect shape violations for a meta value (plain JSON data by the seam contract). */
function validateMetaShape(meta) {
    var violations = [];
    if (typeof meta !== 'object' || meta === null || Array.isArray(meta)) {
        return { violations: ['meta must be an object'] };
    }
    var record = meta;
    var known = new Set(['name', 'description', 'whenToUse', 'phases']);
    for (var _i = 0, _a = Object.keys(record); _i < _a.length; _i++) {
        var key = _a[_i];
        if (!known.has(key))
            violations.push("meta.".concat(key, " is not a recognized field (name/description/whenToUse/phases)"));
    }
    if (typeof record.name !== 'string' || record.name.length === 0)
        violations.push('meta.name must be a non-empty string');
    if (typeof record.description !== 'string' || record.description.length === 0)
        violations.push('meta.description must be a non-empty string');
    if (record.whenToUse !== undefined && typeof record.whenToUse !== 'string')
        violations.push('meta.whenToUse must be a string');
    var phases = [];
    if (record.phases !== undefined) {
        if (!Array.isArray(record.phases)) {
            violations.push('meta.phases must be an array');
        }
        else {
            record.phases.forEach(function (phase, index) {
                if (typeof phase !== 'object' || phase === null || Array.isArray(phase)) {
                    violations.push("meta.phases[".concat(index, "] must be an object"));
                    return;
                }
                var entry = phase;
                for (var _i = 0, _a = Object.keys(entry); _i < _a.length; _i++) {
                    var key = _a[_i];
                    if (!['title', 'detail', 'provider', 'model'].includes(key))
                        violations.push("meta.phases[".concat(index, "].").concat(key, " is not a recognized field"));
                }
                if (typeof entry.title !== 'string' || entry.title.length === 0)
                    violations.push("meta.phases[".concat(index, "].title must be a non-empty string"));
                if (entry.detail !== undefined && typeof entry.detail !== 'string')
                    violations.push("meta.phases[".concat(index, "].detail must be a string"));
                if (entry.provider !== undefined && typeof entry.provider !== 'string')
                    violations.push("meta.phases[".concat(index, "].provider must be a string"));
                if (entry.model !== undefined && typeof entry.model !== 'string')
                    violations.push("meta.phases[".concat(index, "].model must be a string"));
                if (violations.length === 0) {
                    phases.push(__assign(__assign(__assign({ title: entry.title }, entry.detail !== undefined ? { detail: entry.detail } : {}), entry.provider !== undefined ? { provider: entry.provider } : {}), entry.model !== undefined ? { model: entry.model } : {}));
                }
            });
        }
    }
    if (violations.length > 0)
        return { violations: violations };
    return {
        violations: violations,
        meta: __assign(__assign({ name: record.name, description: record.description }, record.whenToUse !== undefined ? { whenToUse: record.whenToUse } : {}), record.phases !== undefined ? { phases: phases } : {}),
    };
}
/**
 * Validate a caller-provided meta value against the {@link WorkflowMeta}
 * contract. Throws `META_INVALID` naming every violation (unknown fields,
 * missing/mistyped `name`/`description`, malformed `phases`); the returned
 * meta is a NORMALIZED copy built from the validated fields, so the engine
 * never aliases the caller's object.
 * @param value - the meta data from the start request (plain JSON by the seam contract).
 * @returns the validated, normalized meta block.
 */
function validateMeta(value) {
    var _a = validateMetaShape(value), meta = _a.meta, violations = _a.violations;
    if (meta === undefined) {
        throw new dsh_workflow_1.WorkflowError("invalid meta: ".concat(violations.join('; ')), 'META_INVALID');
    }
    return meta;
}
