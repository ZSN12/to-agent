"use strict";
/**
 * Harness error base with a stable machine-routable code and chained cause.
 * Package errors extend it so tool results and replay can retain failure class.
 * @module @z/dsh-llm/error
 */
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var __makeTemplateObject = (this && this.__makeTemplateObject) || function (cooked, raw) {
    if (Object.defineProperty) { Object.defineProperty(cooked, "raw", { value: raw }); } else { cooked.raw = raw; }
    return cooked;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.INVALID_CREDENTIAL_CODE = exports.EMPTY_RESPONSE_CODE = exports.QUOTA_EXCEEDED_CODE = exports.CONTEXT_WINDOW_EXCEEDED_CODE = exports.HarnessError = void 0;
exports.isContextWindowExceededError = isContextWindowExceededError;
exports.isQuotaExceededError = isQuotaExceededError;
exports.errorChain = errorChain;
exports.isHarnessError = isHarnessError;
/**
 * Base class for all harness errors. Carries a `code` (stable, programmatic —
 * e.g. `NO_ADAPTER`, `INVALID_ARGS`, `INVARIANT`) distinct from the
 * human-readable `message`, and supports `cause` chaining via the standard
 * `ErrorOptions`. `name` defaults to the subclass constructor name.
 */
var HarnessError = /** @class */ (function (_super) {
    __extends(HarnessError, _super);
    function HarnessError(message, code, options) {
        var _newTarget = this.constructor;
        var _this = _super.call(this, message, options) || this;
        _this.code = code;
        _this.name = _newTarget.name;
        return _this;
    }
    return HarnessError;
}(Error));
exports.HarnessError = HarnessError;
/** Canonical provider-neutral code for a model request rejected because its context window was exceeded. */
exports.CONTEXT_WINDOW_EXCEEDED_CODE = 'CONTEXT_WINDOW_EXCEEDED';
/** Canonical provider-neutral code for an exhausted account quota or balance. */
exports.QUOTA_EXCEEDED_CODE = 'QUOTA';
/**
 * Canonical provider-neutral code for a response that completed normally but
 * carried no content blocks at all. Providers occasionally emit a degenerate
 * completion (a terminal stop with zero output); adapters classify it as this
 * failure instead of yielding an empty assistant message, because an empty
 * message silently ends the turn with nothing for the user or the loop to act
 * on. The attempt produced nothing durable, so retry policy treats it as safe
 * to repeat.
 */
exports.EMPTY_RESPONSE_CODE = 'EMPTY_RESPONSE';
/**
 * Canonical provider-neutral code for a credential that was supplied but
 * cannot be used — malformed rather than absent. Distinct from
 * `MISSING_CREDENTIAL` because the fix differs: correct the stored value
 * rather than supply one. Deliberately outside the default retryable set —
 * a malformed credential fails identically on every attempt.
 */
exports.INVALID_CREDENTIAL_CODE = 'INVALID_CREDENTIAL';
/** Structured codes and plain phrases that explicitly name a context bound being exceeded. */
var STRUCTURED_CONTEXT_OVERFLOW = new RegExp(String.raw(templateObject_1 || (templateObject_1 = __makeTemplateObject(["(?:^|[^a-z0-9])context[s_-](?:length|window)[s_-]"], ["(?:^|[^a-z0-9])context[\\s_-](?:length|window)[\\s_-]"]))) + String.raw(templateObject_2 || (templateObject_2 = __makeTemplateObject(["(?:exceed(?:ed|s)?|overflow(?:ed)?|limit[s_-]exceeded)(?:$|[^a-z0-9])"], ["(?:exceed(?:ed|s)?|overflow(?:ed)?|limit[\\s_-]exceeded)(?:$|[^a-z0-9])"]))), 'i');
/** Request-size wording that ties "too large" directly to model context capacity. */
var TOO_LARGE_FOR_CONTEXT = new RegExp(String.raw(templateObject_3 || (templateObject_3 = __makeTemplateObject(["\b(?:request|prompt|input|messages?)s+(?:iss+|ares+)?"], ["\\b(?:request|prompt|input|messages?)\\s+(?:is\\s+|are\\s+)?"]))) + String.raw(templateObject_4 || (templateObject_4 = __makeTemplateObject(["toos+(?:large|long)s+fors+(?:(?:this|the)s+)?"], ["too\\s+(?:large|long)\\s+for\\s+(?:(?:this|the)\\s+)?"])))
    + String.raw(templateObject_5 || (templateObject_5 = __makeTemplateObject(["(?:model(?:'s)?s+)?context(?:s+window)?\b"], ["(?:model(?:'s)?\\s+)?context(?:\\s+window)?\\b"]))), 'i');
/** "Exceeds" wording is safe only when its object is explicitly the model context. */
var EXCEEDS_MODEL_CONTEXT = new RegExp(String.raw(templateObject_6 || (templateObject_6 = __makeTemplateObject(["\b(?:input|prompt|request|messages?)\b.{0,40}"], ["\\b(?:input|prompt|request|messages?)\\b.{0,40}"]))) + String.raw(templateObject_7 || (templateObject_7 = __makeTemplateObject(["\b(?:exceed(?:s|ed)?|overflows?|iss+largers+than)\b.{0,40}"], ["\\b(?:exceed(?:s|ed)?|overflows?|is\\s+larger\\s+than)\\b.{0,40}"])))
    + String.raw(templateObject_8 || (templateObject_8 = __makeTemplateObject(["\b(?:thes+)?(?:model(?:'s)?s+)?context(?:s+(?:length|window))?\b"], ["\\b(?:the\\s+)?(?:model(?:'s)?\\s+)?context(?:\\s+(?:length|window))?\\b"]))), 'i');
/**
 * Recognize the context-overflow wording used by OpenAI-compatible providers
 * and library adapters. Adapters pass all available provider code, type, and
 * message text so both thrown and in-band delivery styles share one classifier.
 * @param detail - provider error code/type/message text joined into one string.
 * @returns true when the detail identifies a request exceeding the model context window.
 */
function isContextWindowExceededError(detail) {
    return STRUCTURED_CONTEXT_OVERFLOW.test(detail)
        || /\b(?:maximum|max)(?:\s+(?:allowed|supported))?\s+context\s+(?:length|window)\b/i.test(detail)
        || TOO_LARGE_FOR_CONTEXT.test(detail)
        || /\b(?:input|prompt|request)\s+(?:is\s+)?too\s+(?:long|large)\s+for\s+(?:this|the)\s+model\b/i.test(detail)
        || EXCEEDS_MODEL_CONTEXT.test(detail);
}
/**
 * Recognize provider wording that identifies an exhausted account quota rather
 * than a transient request-rate limit.
 * @param detail - provider error code/type/message text joined into one string.
 * @returns true only for terminal quota, balance, credit, budget, or usage-limit wording.
 */
function isQuotaExceededError(detail) {
    return /\binsufficient[\s_-]+(?:quota|balance|credits?)\b/i.test(detail)
        || /\b(?:quota|usage[\s_-]+limit)[\s_-]+(?:exceeded|exhausted|reached)\b/i.test(detail)
        || /\bexceed(?:ed|s)?[\s_-]+(?:(?:your|the)[\s_-]+)?(?:current[\s_-]+)?quota\b/i.test(detail)
        || /\b(?:balance|credits?)[\s_-]+(?:exhausted|depleted)\b/i.test(detail)
        || /\bout[\s_-]+of[\s_-]+(?:credits?|budget)\b/i.test(detail);
}
/**
 * Render a thrown value with its full `cause` chain and AggregateError
 * members, so transport wrappers like undici's `TypeError: fetch failed`
 * surface the underlying failure instead of masking it. Plain structured
 * failures render their own data-backed `message`. Diagnostic-surface
 * rendering only (messages, notices, logs) — never parse the result; route on
 * {@link HarnessError.code}.
 * @param value - the caught value (`unknown` in catch clauses).
 * @returns the outermost message first, each cause appended with `: ` (skipped
 * when it repeats the wrapper message verbatim), and AggregateError members
 * bracketed and `; `-joined.
 */
function errorChain(value) {
    // Tracks the active recursion path (entries removed on exit), so only true
    // cycles are flagged and a diamond-shared cause still renders in full.
    var path = new Set();
    var render = function (current) {
        if (path.has(current))
            return '<circular cause>';
        path.add(current);
        try {
            if (!(current instanceof Error)) {
                if (typeof current === 'object' && current !== null) {
                    var descriptor = Object.getOwnPropertyDescriptor(current, 'message');
                    if (descriptor !== undefined && 'value' in descriptor && typeof descriptor.value === 'string') {
                        return descriptor.value;
                    }
                }
                return String(current);
            }
            var message = current.message === '' ? current.name : current.message;
            var members = current instanceof AggregateError && current.errors.length > 0
                ? " [".concat(current.errors.map(render).join('; '), "]")
                : '';
            var causeText = current.cause === undefined || current.cause === null
                ? ''
                : render(current.cause);
            // Wrappers like `new HarnessError(String(value), code, { cause: value })`
            // repeat their cause verbatim; rendering it again would only add noise.
            var cause = causeText === '' || causeText === message ? '' : ": ".concat(causeText);
            return "".concat(message).concat(members).concat(cause);
        }
        catch (_a) {
            // Only hostile coercion or hostile accessors (a throwing toString /
            // Symbol.toPrimitive on a non-Error, or a throwing message/name/cause/
            // errors getter on an Error subclass): this renderer feeds UI notices
            // and logs, so nothing may escape. Inner frames catch their own throws,
            // so only the hostile node collapses, not the whole chain.
            return '<unrenderable value>';
        }
        finally {
            path.delete(current);
        }
    };
    return render(value);
}
/**
 * Narrow an arbitrary thrown value to a HarnessError (for `instanceof` at runtime boundaries).
 * @param value - the caught value (`unknown` in catch clauses).
 * @returns true only for real instances; duck-typed or cross-realm errors do not narrow.
 */
function isHarnessError(value) {
    return value instanceof HarnessError;
}
var templateObject_1, templateObject_2, templateObject_3, templateObject_4, templateObject_5, templateObject_6, templateObject_7, templateObject_8;
