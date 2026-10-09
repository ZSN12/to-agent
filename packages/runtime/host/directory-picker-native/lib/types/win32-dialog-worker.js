"use strict";
/**
 * Child-process entry for the Win32 folder dialog: blocks THIS process
 * inside the modal `Show` so the host event loop stays live, reporting over
 * the IPC channel. Spawned as a child process (not a worker thread) so the
 * dialog is the process's first window and Windows activates it without a
 * manual foreground call. Protocol: `{kind:'showing',threadId}` right
 * before the blocking call (the driver's abort lever needs the native
 * thread id), then exactly one of `{kind:'done',path}` or
 * `{kind:'error',message}`.
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
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
var win32_dialog_bindings_ts_1 = require("./win32-dialog-bindings.ts");
var win32_dialog_logic_ts_1 = require("./win32-dialog-logic.ts");
var title = (_a = process.env.DSH_DIALOG_TITLE) !== null && _a !== void 0 ? _a : '';
if (title === '')
    throw new Error('win32-dialog-worker: DSH_DIALOG_TITLE is required');
if (process.send === undefined)
    throw new Error('win32-dialog-worker must run as a child process with an IPC channel');
// node's internal `send` reads `this.connected`, so bind the receiver.
var send = process.send.bind(process);
var post = function (message) {
    // Flush before closing the channel; the process exits when the loop drains.
    /* v8 ignore next 3 -- disconnect needs a live IPC channel the unit lane must not sever (built-worker.e2e.ts owns the real close path). */
    send(message, function () { if (process.connected)
        process.disconnect(); });
};
// A settled driver (or a dead parent) must not orphan a dialog still on screen.
/* v8 ignore next 3 -- the handler exits(0), which would kill the unit lane; built-worker.e2e.ts owns the real disconnect lifecycle. */
process.on('disconnect', function () { return process.exit(0); });
// No top-level await: the built worker ships as CJS, which cannot carry TLA.
void (function () { return __awaiter(void 0, void 0, void 0, function () {
    var bindings, path, error_1, message;
    var _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _b.trys.push([0, 2, , 3]);
                return [4 /*yield*/, (0, win32_dialog_bindings_ts_1.loadWin32DialogBindings)()];
            case 1:
                bindings = _b.sent();
                path = (0, win32_dialog_logic_ts_1.runFolderDialog)(bindings, title, function (threadId) {
                    post({ kind: 'showing', threadId: threadId });
                });
                post({ kind: 'done', path: path });
                return [3 /*break*/, 3];
            case 2:
                error_1 = _b.sent();
                message = error_1 instanceof Error ? ((_a = error_1.stack) !== null && _a !== void 0 ? _a : error_1.message) : String(error_1);
                post({ kind: 'error', message: message });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); })();
