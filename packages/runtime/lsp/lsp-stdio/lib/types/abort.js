"use strict";
/**
 * Shared cancellation helpers for the local LSP provider's host-I/O, queue, and protocol phases.
 * @module @z/dsh-lsp-stdio/abort
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.abortError = abortError;
exports.throwIfAborted = throwIfAborted;
exports.abortable = abortable;
var dsh_timeout_1 = require("@z/dsh-timeout");
/**
 * Build an abort Error carrying the signal's reason and preserving timeout classification.
 * @param signal - the aborted signal whose reason to surface.
 * @returns the timeout reason if present, else the Error reason, else a generic aborted Error.
 */
function abortError(signal) {
    var timeout = (0, dsh_timeout_1.timeoutOf)(signal);
    if (timeout !== undefined)
        return timeout;
    var reason = signal.reason;
    if (reason instanceof Error)
        return reason;
    return new Error('LSP query aborted');
}
/**
 * Throw the signal's classified abort error when it has already fired.
 * @param signal - the optional query cancellation signal.
 */
function throwIfAborted(signal) {
    if (signal === null || signal === void 0 ? void 0 : signal.aborted)
        throw abortError(signal);
}
/**
 * Await work while allowing a query signal to abandon its wait; the underlying work keeps its own
 * handlers and continues to its owner-defined quiescence boundary.
 * @param work - the owned asynchronous work.
 * @param signal - optional query cancellation.
 * @returns the work result, or a rejection carrying the classified abort reason.
 */
function abortable(work, signal) {
    if (signal === undefined)
        return work;
    if (signal.aborted)
        return Promise.reject(abortError(signal));
    var canceled = Promise.withResolvers();
    var onAbort = function () { canceled.reject(abortError(signal)); };
    signal.addEventListener('abort', onAbort, { once: true });
    var normalized = work.catch(function (error) {
        /* v8 ignore next -- owned LSP promises reject with Error; coercion defends the generic helper. */
        throw error instanceof Error ? error : new Error(String(error));
    });
    return Promise.race([normalized, canceled.promise])
        .finally(function () { signal.removeEventListener('abort', onAbort); });
}
