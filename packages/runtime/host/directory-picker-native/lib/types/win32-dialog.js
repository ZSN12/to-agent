"use strict";
/**
 * Main-thread driver for the Win32 folder dialog: spawns the dialog child
 * process (which blocks inside the modal `Show`), maps its message protocol
 * onto a promise, and services aborts by posting `WM_CLOSE` to the dialog
 * thread's windows until the child reports back. The real process/window
 * surface is injectable so every driver path is testable on any platform.
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
exports.DIALOG_TITLE = void 0;
exports.pickWin32Directory = pickWin32Directory;
var win32_dialog_host_ts_1 = require("./win32-dialog-host.ts");
/** The dialog title every host shows. */
exports.DIALOG_TITLE = 'Select Workspace Directory';
/** `WM_CLOSE` re-post cadence while an abort waits for the worker to unwind. */
var CLOSE_RETRY_MS = 150;
/** Abort-service attempts before force-terminating the worker. */
var CLOSE_MAX_ATTEMPTS = 20;
/** Fail loudly if the closed worker-to-driver union gains an unhandled member. */
/* v8 ignore start -- closed-union backstop; unreachable without a TypeScript contract violation */
function assertNever(value) {
    throw new TypeError("unknown win32 dialog worker message kind: ".concat(String(value)));
}
/* v8 ignore stop */
/**
 * Open the modern Win32 folder picker off the event loop.
 * @param signal - caller lifetime; abort closes the dialog and rejects.
 * @param internals - Worker/window hooks for deterministic tests.
 * @returns the selected path, or null when the user cancels.
 */
function pickWin32Directory(signal_1) {
    return __awaiter(this, arguments, void 0, function (signal, internals) {
        var spawnWorker, closeWindows, closeRetryMs, worker, dialogThreadId, closeTimer, settled;
        var _a, _b, _c;
        if (internals === void 0) { internals = {}; }
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    if (signal.aborted)
                        throw new Error('native directory picker aborted');
                    spawnWorker = (_a = internals.spawnWorker) !== null && _a !== void 0 ? _a : win32_dialog_host_ts_1.spawnDialogWorker;
                    closeWindows = (_b = internals.closeThreadWindows) !== null && _b !== void 0 ? _b : win32_dialog_host_ts_1.closeThreadWindows;
                    closeRetryMs = (_c = internals.closeRetryMs) !== null && _c !== void 0 ? _c : CLOSE_RETRY_MS;
                    worker = spawnWorker({ title: exports.DIALOG_TITLE });
                    settled = false;
                    return [4 /*yield*/, new Promise(function (resolve, reject) {
                            var settle = function (outcome) {
                                var _a;
                                if (settled)
                                    return;
                                settled = true;
                                if (closeTimer !== undefined)
                                    clearInterval(closeTimer);
                                signal.removeEventListener('abort', onAbort);
                                (_a = worker.unref) === null || _a === void 0 ? void 0 : _a.call(worker);
                                outcome();
                            };
                            var postClose = function () {
                                // Before `showing` there is no window to close; the budget below still
                                // runs so a child that never reports cannot dangle the pick. A
                                // rejected close attempt (EnumThreadWindows/PostMessageW refusing) is
                                // discarded: the interval retries it and kill is the backstop.
                                if (dialogThreadId !== undefined)
                                    void closeWindows(dialogThreadId).catch(function () { return undefined; });
                            };
                            // Sole caller: the once-registered abort listener, so no re-entry guard.
                            var serviceAbort = function () {
                                var attempts = 0;
                                // The `showing` notice precedes the blocking `Show`, so the very first
                                // WM_CLOSE can race the window's creation; re-post until the child
                                // reports back, then force-kill as a last resort. The budget is
                                // unconditional — an abort before `showing` (child hung in koffi or
                                // COM init) still ends in kill instead of a dangling promise.
                                closeTimer = setInterval(function () {
                                    attempts += 1;
                                    if (attempts > CLOSE_MAX_ATTEMPTS) {
                                        settle(function () {
                                            worker.kill();
                                            reject(new Error('native directory picker aborted (dialog unresponsive; worker killed)'));
                                        });
                                        return;
                                    }
                                    postClose();
                                }, closeRetryMs);
                                postClose();
                            };
                            var onAbort = function () {
                                serviceAbort();
                            };
                            signal.addEventListener('abort', onAbort, { once: true });
                            worker.on('message', function (message) {
                                switch (message.kind) {
                                    case 'showing':
                                        dialogThreadId = message.threadId;
                                        // An abort that raced ahead of this notice now has a window to hit.
                                        if (signal.aborted)
                                            postClose();
                                        return;
                                    case 'done':
                                        settle(function () {
                                            if (signal.aborted)
                                                reject(new Error('native directory picker aborted'));
                                            else
                                                resolve(message.path);
                                        });
                                        return;
                                    case 'error':
                                        settle(function () {
                                            reject(new Error("win32 folder dialog failed: ".concat(message.message)));
                                        });
                                        return;
                                    /* v8 ignore next 2 -- closed worker-owned union; a fourth kind becomes a compile error */
                                    default:
                                        assertNever(message);
                                }
                            });
                            worker.on('error', function (error) {
                                settle(function () {
                                    reject(error);
                                });
                            });
                            worker.on('exit', function () {
                                settle(function () {
                                    reject(new Error('win32 folder dialog worker exited before reporting a result'));
                                });
                            });
                        })];
                case 1: return [2 /*return*/, _d.sent()];
            }
        });
    });
}
