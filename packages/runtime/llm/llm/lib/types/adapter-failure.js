"use strict";
/**
 * Normalization for values thrown by a final LLM adapter boundary.
 *
 * @module @z/dsh-llm/adapter-failure
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
exports.normalizeLlmFailure = normalizeLlmFailure;
var error_ts_1 = require("./error.ts");
/**
 * Detach serializable provider facts from a value thrown by an adapter.
 * @param value - arbitrary value thrown during adapter dispatch or iteration.
 * @returns immutable provider-neutral facts suitable for a terminal finish chunk.
 * @internal
 */
function normalizeLlmFailure(value) {
    var error = value instanceof Error
        ? value
        : new error_ts_1.HarnessError(thrownMessage(value), 'UNKNOWN', { cause: value });
    // Cross-package copies preserve own data but not class identity. Trust the
    // carried facts only when both own properties agree after validation.
    var carried = ownFailureSnapshot(error);
    if (carried !== undefined && carried.code === ownErrorCode(error))
        return carried;
    return Object.freeze({
        message: errorMessage(error),
        code: harnessErrorCode(error),
    });
}
/** Render a non-Error throw without letting hostile coercion escape normalization. */
function thrownMessage(value) {
    try {
        var message = String(value);
        return message.length > 0 ? message : 'LLM adapter failed';
    }
    catch (_hostileThrownValue) {
        return 'LLM adapter failed';
    }
}
/** Read a foreign error's own data-backed `code` without invoking accessors. */
function ownErrorCode(error) {
    try {
        var descriptor = Object.getOwnPropertyDescriptor(error, 'code');
        return descriptor !== undefined && 'value' in descriptor ? descriptor.value : undefined;
    }
    catch (_sdkPropertyTrap) {
        return undefined;
    }
}
/** Snapshot an own data property without invoking an SDK-defined accessor. */
function ownFailureSnapshot(error) {
    try {
        var descriptor = Object.getOwnPropertyDescriptor(error, 'failure');
        return descriptor !== undefined && 'value' in descriptor
            ? failureSnapshot(descriptor.value)
            : undefined;
    }
    catch (_sdkPropertyTrap) {
        return undefined;
    }
}
/** Validate and detach an arbitrary serializable failure payload. */
function failureSnapshot(value) {
    if (typeof value !== 'object' || value === null)
        return undefined;
    try {
        var candidate = value;
        var message = candidate.message;
        var code = candidate.code;
        var status_1 = candidate.status;
        var providerRetryAfterMs = candidate.providerRetryAfterMs;
        var requestId = candidate.requestId;
        if (typeof message !== 'string' || message.length === 0
            || typeof code !== 'string' || code.length === 0
            || (status_1 !== undefined && (!Number.isInteger(status_1) || status_1 < 100 || status_1 > 599))
            || (providerRetryAfterMs !== undefined
                && (!Number.isFinite(providerRetryAfterMs) || providerRetryAfterMs <= 0))
            || (requestId !== undefined && (typeof requestId !== 'string' || requestId.length === 0)))
            return undefined;
        return Object.freeze(__assign(__assign(__assign({ message: message, code: code }, status_1 === undefined ? {} : { status: status_1 }), providerRetryAfterMs === undefined ? {} : { providerRetryAfterMs: providerRetryAfterMs }), requestId === undefined ? {} : { requestId: requestId }));
    }
    catch (_sdkFailureGetter) {
        return undefined;
    }
}
/** Read an SDK error message without letting an accessor replace the primary failure. */
function errorMessage(error) {
    try {
        var message = error.message;
        if (typeof message === 'string' && message.length > 0)
            return message;
    }
    catch (_sdkMessageGetter) {
        // The fallback below preserves a serializable failure beside the original Error.
    }
    return 'LLM adapter failed';
}
/** Trust only Harness-owned codes; third-party SDK codes are not our taxonomy. */
function harnessErrorCode(error) {
    return error instanceof error_ts_1.HarnessError ? error.code : 'UNKNOWN';
}
