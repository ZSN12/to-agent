"use strict";
/** Package-owned durable retry-event invariants. @module @z/dsh-llm-retry/invariant */
Object.defineProperty(exports, "__esModule", { value: true });
exports.apply = exports.inject = exports.name = void 0;
var dsh_timeout_1 = require("@z/dsh-timeout");
var history_ts_1 = require("./history.ts");
var PACKAGE_NAME = '@z/dsh-llm-retry';
/** Cordis companion plugin name. */
exports.name = 'llm-retry-invariant';
/** Service required before the companion can reserve package ownership. */
exports.inject = ['invariants'];
/** Validate the complete provider-neutral failure payload at the durable boundary. */
function validateFailure(value, fail) {
    if (typeof value !== 'object' || value === null) {
        fail('llm/retry failure must be an object');
    }
    var failure = value;
    if (typeof failure.message !== 'string' || failure.message.length === 0) {
        fail('llm/retry failure.message must be a non-empty string');
    }
    if (typeof failure.code !== 'string' || failure.code.length === 0) {
        fail('llm/retry failure.code must be a non-empty string');
    }
    if (failure.status !== undefined
        && (!Number.isInteger(failure.status) || failure.status < 100 || failure.status > 599)) {
        fail('llm/retry failure.status must be an integer from 100 through 599 when present');
    }
    if (failure.providerRetryAfterMs !== undefined
        && (!Number.isFinite(failure.providerRetryAfterMs) || failure.providerRetryAfterMs <= 0)) {
        fail('llm/retry failure.providerRetryAfterMs must be a positive finite number when present');
    }
    if (failure.requestId !== undefined
        && (typeof failure.requestId !== 'string' || failure.requestId.length === 0)) {
        fail('llm/retry failure.requestId must be a non-empty string when present');
    }
}
/** Validate one retry record against the currently open request step. */
function validateRetry(history, event, fail) {
    var _a;
    var _b = event.data, retryId = _b.retryId, turn = _b.turn, step = _b.step, provider = _b.provider, mode = _b.mode, policyKey = _b.policyKey, retry = _b.retry, delayMs = _b.delayMs;
    if (typeof retryId !== 'string' || retryId.length === 0) {
        fail('llm/retry retryId must be a non-empty string');
    }
    var failure = event.data.failure;
    validateFailure(failure, fail);
    if (!Number.isSafeInteger(retry) || retry < 1) {
        fail('llm/retry retry must be a positive safe integer');
    }
    if (typeof provider !== 'string' || provider.length === 0) {
        fail('llm/retry provider must be a non-empty string');
    }
    if (typeof policyKey !== 'string' || policyKey.length === 0) {
        fail('llm/retry policyKey must be a non-empty string');
    }
    switch (mode) {
        case 'normal': {
            var maxRetries = event.data.maxRetries;
            if (!Number.isSafeInteger(maxRetries) || maxRetries < 1 || retry > maxRetries) {
                fail("llm/retry retry ".concat(retry, " must not exceed a positive safe maxRetries ").concat(maxRetries));
            }
            break;
        }
        case 'always':
            if ('maxRetries' in event.data)
                fail('llm/retry always mode must omit maxRetries');
            break;
        default:
            fail("llm/retry mode must be normal or always, got ".concat(String(mode)));
    }
    if (typeof delayMs !== 'number' || !Number.isFinite(delayMs)
        || delayMs < 0 || delayMs > dsh_timeout_1.MAX_TIMER_DELAY_MS) {
        fail("llm/retry delayMs must be a finite number within 0..".concat(dsh_timeout_1.MAX_TIMER_DELAY_MS));
    }
    var turnBoundary = history.findLast(function (prior) {
        return prior.type === 'turn/start' || prior.type === 'turn/end';
    });
    if ((turnBoundary === null || turnBoundary === void 0 ? void 0 : turnBoundary.type) !== 'turn/start') {
        fail('llm/retry must be appended inside an open turn');
    }
    if (turn !== turnBoundary.data.turn) {
        fail("llm/retry names turn ".concat(turn, ", but the open turn is ").concat(turnBoundary.data.turn));
    }
    var stepBoundary = history.findLast(function (prior) {
        return prior.type === 'step/start' || prior.type === 'step/end';
    });
    if ((stepBoundary === null || stepBoundary === void 0 ? void 0 : stepBoundary.type) !== 'step/start') {
        fail('llm/retry must be appended inside an open step');
    }
    if (step !== stepBoundary.data.step || turn !== stepBoundary.data.turn) {
        fail("llm/retry names turn ".concat(turn, "/step ").concat(step, ", but the open step is ").concat(stepBoundary.data.turn, "/").concat(stepBoundary.data.step));
    }
    var routedProvider = (0, history_ts_1.providerForOpenStep)(history, turn, step);
    if (routedProvider !== provider) {
        fail("llm/retry provider ".concat(provider, " does not match the failed request provider ").concat(String(routedProvider)));
    }
    var priorPolicyRetry = history.findLast(function (prior) {
        return prior.type === 'llm/retry'
            && prior.data.turn === turn
            && prior.data.step === step
            && prior.data.provider === provider
            && prior.data.policyKey === policyKey;
    });
    var expectedRetry = ((_a = priorPolicyRetry === null || priorPolicyRetry === void 0 ? void 0 : priorPolicyRetry.data.retry) !== null && _a !== void 0 ? _a : 0) + 1;
    if (retry !== expectedRetry) {
        fail("llm/retry retry ".concat(retry, " must equal provider policy retry ").concat(expectedRetry));
    }
    if (priorPolicyRetry !== undefined && priorPolicyRetry.data.retryId !== retryId) {
        fail('llm/retry must preserve retryId across one provider-policy chain');
    }
    if (priorPolicyRetry === undefined && history.some(function (prior) {
        return (prior.type === 'llm/retry' || prior.type === 'llm/retry-started')
            && prior.data.retryId === retryId;
    })) {
        fail("llm/retry retryId ".concat(JSON.stringify(retryId), " is already owned by another chain"));
    }
}
/** Validate one wait-complete transition against its scheduled attempt. */
function validateStarted(history, event, fail) {
    var _a = event.data, retryId = _a.retryId, turn = _a.turn, step = _a.step, retry = _a.retry;
    if (typeof retryId !== 'string' || retryId.length === 0) {
        fail('llm/retry-started retryId must be a non-empty string');
    }
    var scheduled = history.findLast(function (prior) {
        return prior.type === 'llm/retry' && prior.data.retryId === retryId && prior.data.retry === retry;
    });
    if (scheduled === undefined)
        fail('llm/retry-started pairs no prior scheduled attempt');
    if (scheduled.data.turn !== turn || scheduled.data.step !== step) {
        fail('llm/retry-started turn/step must match its scheduled attempt');
    }
    if (history.some(function (prior) { return prior.type === 'llm/retry-started'
        && prior.data.retryId === retryId && prior.data.retry === retry; })) {
        fail('llm/retry-started repeats one scheduled attempt');
    }
}
/** Validate every retry record already present in one loaded session. */
function validateSession(session, fail) {
    for (var _i = 0, _a = session.events.entries(); _i < _a.length; _i++) {
        var _b = _a[_i], index = _b[0], event_1 = _b[1];
        if (event_1.type === 'llm/retry')
            validateRetry(session.events.slice(0, index), event_1, fail);
        else if (event_1.type === 'llm/retry-started')
            validateStarted(session.events.slice(0, index), event_1, fail);
    }
}
/** Install validation for loaded and newly appended retry records. */
var install = Object.assign(function (ctx, fail) {
    for (var _i = 0, _a = ctx.sessions.list(); _i < _a.length; _i++) {
        var session = _a[_i];
        validateSession(session, fail);
    }
    ctx.on('session/created', function (session) { validateSession(session, fail); }, { global: true });
    ctx.on('internal/dispatch', function (_mode, eventName, args) {
        if (eventName !== 'session/event')
            return;
        var _a = args, session = _a[0], event = _a[1];
        if (event.type === 'llm/retry')
            validateRetry(session.events, event, fail);
        else if (event.type === 'llm/retry-started')
            validateStarted(session.events, event, fail);
    }, { global: true });
}, { inject: ['sessions'] });
/**
 * Register the LLM retry invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
var apply = function (ctx) {
    return Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
};
exports.apply = apply;
