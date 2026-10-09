"use strict";
/**
 * Shared timeout arithmetic, signal fusion, and classification. The library
 * only notifies through abort signals; each capability still owns the mechanism
 * that stops its work and translates timeout reasons into public outcomes.
 * @module @z/dsh-timeout
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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_TIMER_DELAY_MS = exports.TimeoutReason = void 0;
exports.clampTimeout = clampTimeout;
exports.deadline = deadline;
exports.idleWatchdog = idleWatchdog;
exports.timeoutOf = timeoutOf;
/**
 * Internal abort reason carrying a capability-owned code and elapsed deadline.
 * Providers translate it through {@link timeoutOf} before returning to callers.
 */
var TimeoutReason = /** @class */ (function (_super) {
    __extends(TimeoutReason, _super);
    /**
     * @param code Capability-owned timeout code (e.g. `BASH_TIMEOUT`).
     * @param timeoutMs The deadline that elapsed, in milliseconds.
     */
    function TimeoutReason(code, timeoutMs) {
        var _this = _super.call(this, "".concat(code, " after ").concat(timeoutMs, "ms")) || this;
        _this.code = code;
        _this.timeoutMs = timeoutMs;
        _this.name = 'TimeoutReason';
        return _this;
    }
    return TimeoutReason;
}(Error));
exports.TimeoutReason = TimeoutReason;
/** Largest delay Node schedules without clamping it to one millisecond. */
exports.MAX_TIMER_DELAY_MS = 2147483647;
function assertTimerDelay(timeoutMs, name) {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > exports.MAX_TIMER_DELAY_MS) {
        throw new Error("".concat(name, " must be a positive finite number no greater than ").concat(exports.MAX_TIMER_DELAY_MS));
    }
}
/**
 * Validate a caller's optional timeout hint, use the backend default, then cap
 * it. Supplied values must be positive and finite; zero is not a public
 * disable-timeout sentinel.
 *
 * @param requested The caller's optional hint; validated when present.
 * @param def The backend default applied when `requested` is absent.
 * @param max The backend upper bound the result is capped to.
 * @param name Field name used in the thrown message (so the caller sees which input was
 *   bad).
 * @returns The effective timeout in milliseconds: `min(requested ?? def, max)`.
 */
function clampTimeout(requested, def, max, name) {
    if (name === void 0) { name = 'timeoutMs'; }
    if (requested !== undefined && (!Number.isFinite(requested) || requested <= 0)) {
        throw new Error("".concat(name, " must be a positive finite number"));
    }
    return Math.min(requested !== null && requested !== void 0 ? requested : def, max);
}
/**
 * Fuse upstream cancellation with an identifiable timeout. `timeoutMs <= 0` is
 * the internal no-timer sentinel; the returned disposer clears an armed timer.
 * The signal only notifies, so callers must stop their own work.
 *
 * @param upstream The caller's cancellation signal, if any, fused into the result.
 * @param timeoutMs Deadline in milliseconds; `<= 0` means "no timeout" (arm no timer).
 * @param code Capability-owned code stamped onto the timeout's {@link TimeoutReason}.
 * @returns The fused {@link Deadline} (signal + timer cleanup).
 */
function deadline(upstream, timeoutMs, code) {
    var _a, _b;
    if (timeoutMs <= 0) {
        // No timeout (background work): forward only the upstream signal, or a never-aborting one
        // when there is no upstream.
        return _a = { signal: upstream !== null && upstream !== void 0 ? upstream : new AbortController().signal }, _a[Symbol.dispose] = function () { }, _a;
    }
    assertTimerDelay(timeoutMs, 'deadline timeoutMs');
    var timer = new AbortController();
    var id = setTimeout(function () { timer.abort(new TimeoutReason(code, timeoutMs)); }, timeoutMs);
    return _b = {
            // AbortSignal.any adopts the reason of whichever source aborts FIRST, so a
            // race resolves to a single cause: timeoutOf() reads TimeoutReason only
            // when the timeout won, and upstream-wins leaves an ordinary abort reason.
            signal: upstream !== undefined ? AbortSignal.any([upstream, timer.signal]) : timer.signal
        },
        _b[Symbol.dispose] = function () { clearTimeout(id); },
        _b;
}
/**
 * Create a rearmable idle watchdog for an async iterator. The timer exists only
 * while {@link IdleWatchdog.next} is outstanding, so consumer think time does
 * not count as provider idle time. The returned signal is stable for the whole
 * call and only notifies; the iterator must observe it to terminate its work.
 *
 * @param upstream - caller cancellation fused into the stable signal.
 * @param timeoutMs - positive finite idle interval in milliseconds.
 * @param code - capability-owned code carried by the timeout reason.
 * @returns a stable signal, guarded next operation, and timer disposer.
 */
function idleWatchdog(upstream, timeoutMs, code) {
    var _a;
    assertTimerDelay(timeoutMs, 'idleWatchdog timeoutMs');
    var timeout = new AbortController();
    var signal = upstream === undefined
        ? timeout.signal
        : AbortSignal.any([upstream, timeout.signal]);
    var timer;
    var outstanding = false;
    var disposed = false;
    var arm = function () {
        if (timer !== undefined)
            clearTimeout(timer);
        timer = setTimeout(function () {
            timeout.abort(new TimeoutReason(code, timeoutMs));
        }, timeoutMs);
    };
    return _a = {
            signal: signal,
            next: function (iterator) {
                return __awaiter(this, void 0, void 0, function () {
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0:
                                if (disposed)
                                    throw new Error('idleWatchdog is disposed');
                                if (outstanding)
                                    throw new Error('idleWatchdog next is already outstanding');
                                outstanding = true;
                                arm();
                                _a.label = 1;
                            case 1:
                                _a.trys.push([1, , 3, 4]);
                                return [4 /*yield*/, iterator.next()];
                            case 2: return [2 /*return*/, _a.sent()];
                            case 3:
                                clearTimeout(timer);
                                timer = undefined;
                                outstanding = false;
                                return [7 /*endfinally*/];
                            case 4: return [2 /*return*/];
                        }
                    });
                });
            },
            pulse: function () {
                if (disposed || !outstanding)
                    return;
                arm();
            }
        },
        _a[Symbol.dispose] = function () {
            if (disposed)
                return;
            disposed = true;
            if (timer !== undefined)
                clearTimeout(timer);
            timer = undefined;
        },
        _a;
}
/**
 * Recover a timeout reason from a reason-bearing object. Supplying `code`
 * distinguishes this deadline from a nested upstream deadline; a foreign code
 * follows the ordinary cancellation path.
 *
 * @param x An {@link AbortSignal} or any `{ reason }` carrier (e.g. a caught abort error).
 * @param code When provided, only a {@link TimeoutReason} with this exact `code` matches.
 * @returns The matching {@link TimeoutReason}, else `undefined`.
 */
function timeoutOf(x, code) {
    // AbortSignal.reason is typed `any`; pin it to `unknown` so no `any` leaks and
    // the instanceof narrows cleanly for both a signal and a bare reason carrier.
    var reason = x.reason;
    if (!(reason instanceof TimeoutReason))
        return undefined;
    return code === undefined || reason.code === code ? reason : undefined;
}
