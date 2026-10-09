"use strict";
/**
 * koffi-backed Win32 bindings for the folder dialog: the COM vtable calls
 * behind {@link Win32DialogBindings} plus the cross-thread window closer the
 * driver uses to service aborts. The module loads on every platform; koffi
 * itself is imported lazily inside each function, so non-Windows processes
 * never load it — the same containment as the repo's other `win32.ts`
 * modules.
 *
 * The COM surface used here (IModalWindow/IFileDialog/IFileOpenDialog and
 * IShellItem vtable order, the GUIDs, `FOS_*` and `SIGDN_FILESYSPATH`) is
 * frozen Windows ABI since Vista; slots are offsets into the vtable at the
 * object's first pointer.
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
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadWin32DialogBindings = loadWin32DialogBindings;
exports.closeThreadWindows = closeThreadWindows;
/**
 * Read a NUL-terminated UTF-16 string at a native address. koffi's
 * `_Out_ void **` out-params surface a raw address, and
 * `koffi.decode(addr, 'str16')` would dereference it as a pointer — crash
 * on real Windows — so view the memory directly instead.
 */
function readUtf16(koffi, address) {
    var bytes = Buffer.from(koffi.view(address, 32768));
    var end = 0;
    while (end + 1 < bytes.length && bytes[end] !== 0)
        end += 2;
    return bytes.toString('utf16le', 0, end);
}
var COINIT_APARTMENTTHREADED = 0x2;
var CLSCTX_INPROC_SERVER = 0x1;
var SIGDN_FILESYSPATH = 0x80058000 | 0;
/**
 * Thread DPI awareness contexts, best first: per-monitor-v2 (Windows 10
 * 1703+), per-monitor (1607+), then system-aware. `SetThreadDpiAwarenessContext`
 * returns NULL for an unsupported context instead of throwing, so the caller
 * cascades to the best one the host accepts; DPI stays a cosmetic
 * best-effort — an unsupported host still gets the modern dialog.
 */
var DPI_AWARENESS_CONTEXTS = [-4, -3, -2];
var WM_CLOSE = 0x10;
/** IFileOpenDialog vtable slots (IUnknown 0-2, IModalWindow 3, IFileDialog 4+). */
var SLOT_RELEASE = 2;
var SLOT_SHOW = 3;
var SLOT_SET_OPTIONS = 9;
var SLOT_SET_TITLE = 17;
var SLOT_GET_RESULT = 20;
/** IShellItem vtable slot for `GetDisplayName`. */
var SLOT_GET_DISPLAY_NAME = 5;
/**
 * Encode a canonical GUID string as its 16 little-endian bytes.
 * @param text - the `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` form.
 * @returns the in-memory GUID bytes CoCreateInstance expects.
 */
function guidBytes(text) {
    var match = /^([0-9a-f]{8})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{12})$/i.exec(text);
    var bytes = Buffer.alloc(16);
    bytes.writeUInt32LE(parseInt(match[1], 16), 0);
    bytes.writeUInt16LE(parseInt(match[2], 16), 4);
    bytes.writeUInt16LE(parseInt(match[3], 16), 6);
    Buffer.from(match[4] + match[5], 'hex').copy(bytes, 8);
    return bytes;
}
var CLSID_FILE_OPEN_DIALOG = guidBytes('dc1c5a9c-e88a-4dde-a5a1-60f82a20aef7');
var IID_IFILE_OPEN_DIALOG = guidBytes('d57c7288-d4ad-4768-be02-9d969532d960');
/**
 * Load koffi and expose the dialog bindings for this thread.
 * @returns the bindings {@link runFolderDialog} sequences against.
 */
function loadWin32DialogBindings() {
    return __awaiter(this, void 0, void 0, function () {
        var koffi, ole32, user32, kernel32, pointerSize, coInitializeEx, coUninitialize, coCreateInstance, coTaskMemFree, getCurrentThreadId, protoShow, protoSetOptions, protoSetTitle, protoGetResult, protoGetDisplayName, protoRelease, method;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require('koffi'); })];
                case 1:
                    koffi = (_a.sent()).default;
                    ole32 = koffi.load('ole32.dll');
                    user32 = koffi.load('user32.dll');
                    kernel32 = koffi.load('kernel32.dll');
                    pointerSize = koffi.sizeof('void *');
                    coInitializeEx = ole32.func('__stdcall', 'CoInitializeEx', 'int32', ['void *', 'uint32']);
                    coUninitialize = ole32.func('__stdcall', 'CoUninitialize', 'void', []);
                    coCreateInstance = ole32.func('__stdcall', 'CoCreateInstance', 'int32', ['void *', 'void *', 'uint32', 'void *', 'void *']);
                    coTaskMemFree = ole32.func('__stdcall', 'CoTaskMemFree', 'void', ['void *']);
                    getCurrentThreadId = kernel32.func('__stdcall', 'GetCurrentThreadId', 'uint32', []);
                    protoShow = koffi.proto('int32 __stdcall DshDialogShow(void *self, void *owner)');
                    protoSetOptions = koffi.proto('int32 __stdcall DshDialogSetOptions(void *self, uint32 options)');
                    protoSetTitle = koffi.proto('int32 __stdcall DshDialogSetTitle(void *self, str16 title)');
                    protoGetResult = koffi.proto('int32 __stdcall DshDialogGetResult(void *self, _Out_ void **item)');
                    protoGetDisplayName = koffi.proto('int32 __stdcall DshItemGetDisplayName(void *self, int32 form, _Out_ void **name)');
                    protoRelease = koffi.proto('uint32 __stdcall DshComRelease(void *self)');
                    method = function (self, slot, proto) {
                        var vtable = koffi.decode(self, 'void *');
                        var fn = koffi.decode(vtable, slot * pointerSize, 'void *');
                        return function () {
                            var args = [];
                            for (var _i = 0; _i < arguments.length; _i++) {
                                args[_i] = arguments[_i];
                            }
                            return koffi.call.apply(koffi, __spreadArray([fn, proto, self], args, false));
                        };
                    };
                    return [2 /*return*/, {
                            setThreadDpiAwareness: function () {
                                var setContext;
                                try {
                                    setContext = user32.func('__stdcall', 'SetThreadDpiAwarenessContext', 'void *', ['intptr']);
                                }
                                catch (_a) {
                                    // Symbol absent (pre-1607 Windows): no per-thread DPI control exists.
                                    // Proceed anyway — the cost is a blurry dialog above 100 % scaling on
                                    // museum hosts, and the modern picker still beats dropping to the
                                    // legacy 5.1 tree over a cosmetic concern.
                                    return;
                                }
                                for (var _i = 0, DPI_AWARENESS_CONTEXTS_1 = DPI_AWARENESS_CONTEXTS; _i < DPI_AWARENESS_CONTEXTS_1.length; _i++) {
                                    var context = DPI_AWARENESS_CONTEXTS_1[_i];
                                    if (setContext(context) !== null)
                                        return;
                                }
                                // Unreachable in practice (SYSTEM_AWARE is accepted wherever the symbol
                                // exists); if a host ever refuses everything, the dialog still works —
                                // just without a DPI opt-in.
                            },
                            coInitializeSta: function () { return coInitializeEx(null, COINIT_APARTMENTTHREADED); },
                            coUninitialize: function () {
                                coUninitialize();
                            },
                            currentThreadId: function () { return getCurrentThreadId(); },
                            createFolderDialog: function () {
                                var out = Buffer.alloc(pointerSize);
                                var created = coCreateInstance(CLSID_FILE_OPEN_DIALOG, null, CLSCTX_INPROC_SERVER, IID_IFILE_OPEN_DIALOG, out);
                                if (created < 0)
                                    throw new Error("CoCreateInstance(FileOpenDialog) failed: HRESULT 0x".concat((created >>> 0).toString(16)));
                                var dialog = koffi.decode(out, 'void *');
                                return {
                                    setOptions: function (options) { return method(dialog, SLOT_SET_OPTIONS, protoSetOptions)(options); },
                                    setTitle: function (title) { return method(dialog, SLOT_SET_TITLE, protoSetTitle)(title); },
                                    show: function () { return method(dialog, SLOT_SHOW, protoShow)(null); },
                                    resultPath: function () {
                                        var itemOut = [null];
                                        var gotItem = method(dialog, SLOT_GET_RESULT, protoGetResult)(itemOut);
                                        if (gotItem < 0)
                                            return { hr: gotItem };
                                        var item = itemOut[0];
                                        try {
                                            var nameOut = [null];
                                            var gotName = method(item, SLOT_GET_DISPLAY_NAME, protoGetDisplayName)(SIGDN_FILESYSPATH, nameOut);
                                            if (gotName < 0)
                                                return { hr: gotName };
                                            var path = readUtf16(koffi, nameOut[0]);
                                            coTaskMemFree(nameOut[0]);
                                            return { hr: gotName, path: path };
                                        }
                                        finally {
                                            method(item, SLOT_RELEASE, protoRelease)();
                                        }
                                    },
                                    release: function () {
                                        method(dialog, SLOT_RELEASE, protoRelease)();
                                    },
                                };
                            },
                        }];
            }
        });
    });
}
/**
 * Post `WM_CLOSE` to every window of a native thread — the driver's abort
 * lever against the worker blocked inside `Show`, after which `Show` returns
 * `HRESULT_CANCELLED` and the worker unwinds normally.
 * @param threadId - the dialog thread's native id (from the `showing` notice).
 */
function closeThreadWindows(threadId) {
    return __awaiter(this, void 0, void 0, function () {
        var koffi, user32, enumThreadWindows, postMessageW, protoEnumProc, callback;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require('koffi'); })];
                case 1:
                    koffi = (_a.sent()).default;
                    user32 = koffi.load('user32.dll');
                    enumThreadWindows = user32.func('__stdcall', 'EnumThreadWindows', 'int', ['uint32', 'void *', 'intptr']);
                    postMessageW = user32.func('__stdcall', 'PostMessageW', 'int', ['void *', 'uint32', 'uintptr', 'intptr']);
                    protoEnumProc = koffi.proto('int __stdcall DshEnumThreadWndProc(void *hwnd, intptr lparam)');
                    callback = koffi.register(function (hwnd) {
                        postMessageW(hwnd, WM_CLOSE, 0, 0);
                        return 1;
                    }, koffi.pointer(protoEnumProc));
                    try {
                        enumThreadWindows(threadId, callback, 0);
                    }
                    finally {
                        koffi.unregister(callback);
                    }
                    return [2 /*return*/];
            }
        });
    });
}
