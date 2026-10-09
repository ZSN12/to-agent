"use strict";
/**
 * Bounded per-session write batching for the shared persistence coordinator.
 * @module @z/dsh-session-persistence/write-behind
 */
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
exports.SessionWriteBehind = void 0;
/**
 * Owns one live session's pending events, fixed batching deadline, active write,
 * failure retention, and explicit quiescence barrier.
 */
var SessionWriteBehind = /** @class */ (function () {
    /**
     * @param options - fixed scheduling policy and durable batch sink.
     */
    function SessionWriteBehind(options) {
        this.options = options;
        this.pending = [];
        this.deadlineExpired = false;
        this.automaticPaused = false;
    }
    Object.defineProperty(SessionWriteBehind.prototype, "hasWork", {
        /** Whether this controller owns queued events or an active durable write. */
        get: function () {
            return this.pending.length > 0 || this.active !== undefined;
        },
        enumerable: false,
        configurable: true
    });
    /**
     * Copy one event into the persistence-owned queue and start a fixed deadline
     * when the automatic path is idle.
     * @param event - frozen live event to retain independently of its producer.
     */
    SessionWriteBehind.prototype.enqueue = function (event) {
        var wasEmpty = this.pending.length === 0;
        this.pending.push(structuredClone(event));
        if (this.barrier !== undefined)
            return;
        if (this.automaticPaused) {
            this.automaticPaused = false;
            this.deadlineExpired = false;
            this.armTimer();
        }
        else if (wasEmpty) {
            this.armTimer();
        }
    };
    /**
     * Cancel the batching wait and durably drain through a quiescent point.
     * Concurrent callers join the same barrier.
     * @returns a promise that rejects if the barrier's durable retry fails.
     */
    SessionWriteBehind.prototype.flush = function () {
        if (this.barrier !== undefined)
            return this.barrier;
        this.cancelTimer();
        this.deadlineExpired = false;
        this.automaticPaused = false;
        var barrier = Promise.withResolvers();
        this.barrier = barrier.promise;
        void this.drainBarrier(barrier.resolve, barrier.reject);
        return barrier.promise;
    };
    /** Cancel the current automatic deadline without draining retained work. */
    SessionWriteBehind.prototype.cancelAutomaticWait = function () {
        this.cancelTimer();
        this.deadlineExpired = false;
    };
    /** Start the one fixed window for the current pending prefix. */
    SessionWriteBehind.prototype.armTimer = function () {
        var _this = this;
        this.timer = setTimeout(function () { _this.onDeadline(); }, this.options.maxDelayMs);
    };
    /** Cancel any pending automatic deadline. */
    SessionWriteBehind.prototype.cancelTimer = function () {
        if (this.timer === undefined)
            return;
        clearTimeout(this.timer);
        this.timer = undefined;
    };
    /** Start a background write now, or remember that an active write used the budget. */
    SessionWriteBehind.prototype.onDeadline = function () {
        this.timer = undefined;
        if (this.active !== undefined) {
            this.deadlineExpired = true;
            return;
        }
        this.startBackground();
    };
    /** Start one detached write whose failure is reported and retained. */
    SessionWriteBehind.prototype.startBackground = function () {
        var _this = this;
        var active = this.startWrite(true);
        void active.then(function () { _this.continueAutomatic(); }, function () { });
    };
    /** Continue immediately after an over-budget active write, otherwise keep its timer. */
    SessionWriteBehind.prototype.continueAutomatic = function () {
        if (this.barrier !== undefined || this.pending.length === 0)
            return;
        if (this.deadlineExpired) {
            this.deadlineExpired = false;
            this.startBackground();
        }
    };
    /** Await overlapping work, drain to quiescence, and settle the shared barrier. */
    SessionWriteBehind.prototype.drainBarrier = function (resolve, reject) {
        return __awaiter(this, void 0, void 0, function () {
            var overlapping, error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 5, , 6]);
                        overlapping = this.active;
                        if (!(overlapping !== undefined)) return [3 /*break*/, 2];
                        return [4 /*yield*/, Promise.allSettled([overlapping])];
                    case 1:
                        _a.sent();
                        this.automaticPaused = false;
                        _a.label = 2;
                    case 2:
                        if (!(this.pending.length > 0)) return [3 /*break*/, 4];
                        return [4 /*yield*/, this.startWrite(false)];
                    case 3:
                        _a.sent();
                        return [3 /*break*/, 2];
                    case 4: return [3 /*break*/, 6];
                    case 5:
                        error_1 = _a.sent();
                        this.barrier = undefined;
                        reject(error_1);
                        return [2 /*return*/];
                    case 6:
                        // Close admission to this barrier in the same job that observes the empty
                        // queue, before resolving callers. A later enqueue therefore starts its own
                        // automatic window instead of being stranded behind a settled barrier.
                        this.barrier = undefined;
                        resolve();
                        return [2 /*return*/];
                }
            });
        });
    };
    /** Start one stable pending prefix, retaining it in order if durability fails. */
    SessionWriteBehind.prototype.startWrite = function (background) {
        var _this = this;
        var batch = this.pending.splice(0);
        this.cancelTimer();
        this.deadlineExpired = false;
        var operation = Promise.resolve().then(function () { return _this.options.write(batch); });
        var active = operation
            .catch(function (error) {
            _this.pending = batch.concat(_this.pending);
            _this.cancelTimer();
            _this.deadlineExpired = false;
            _this.automaticPaused = true;
            if (background)
                _this.options.reportBackgroundFailure(error);
            throw error;
        })
            .finally(function () {
            _this.active = undefined;
        });
        this.active = active;
        return active;
    };
    return SessionWriteBehind;
}());
exports.SessionWriteBehind = SessionWriteBehind;
