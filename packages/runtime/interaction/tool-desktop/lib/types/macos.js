"use strict";
/**
 * macOS desktop backend: capture the screen and inject real input events
 * (cursor, mouse, keyboard) through `osascript -l JavaScript` (JXA + the
 * CoreGraphics/AppKit ObjC bridge) and `screencapture`. The whole OS boundary
 * is behind an injectable `RunCommand` so REAL-composition tests can stub only
 * this seam.
 * @module @z/dsh-tool-desktop
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
exports.macosDriver = macosDriver;
var node_buffer_1 = require("node:buffer");
var JS_PREFIX = 'ObjC.import("CoreGraphics");ObjC.import("AppKit");';
/** Turn a JXA expression that returns a JS string into an -e argument. */
function jxa(expression) {
    return "-l JavaScript -e '".concat(JS_PREFIX).concat(expression, "'");
}
/** Quote one value as a POSIX shell single-quoted word. */
function shellSingleQuote(value) {
    return "'".concat(value.replaceAll("'", "'\\''"), "'");
}
/** Common keys to macOS virtual keycodes (ANSI layout). */
var KEYCODES = {
    return: 36,
    enter: 76,
    tab: 48,
    space: 49,
    delete: 51,
    escape: 53,
    'left': 123,
    right: 124,
    down: 125,
    up: 126,
    home: 115,
    end: 119,
    pageup: 116,
    pagedown: 121,
    a: 0,
    b: 11,
    c: 8,
    d: 2,
    e: 14,
    f: 3,
    g: 5,
    h: 4,
    j: 38,
    k: 40,
    l: 37,
    m: 46,
    n: 45,
    o: 31,
    p: 35,
    q: 12,
    r: 15,
    s: 1,
    t: 17,
    u: 32,
    v: 9,
    w: 13,
    x: 7,
    y: 16,
    z: 6,
    '0': 29,
    '1': 18,
    '2': 19,
    '3': 20,
    '4': 21,
    '5': 23,
    '6': 22,
    '7': 26,
    '8': 28,
    '9': 25,
};
/** macOS CGEvent modifier-flag bits. */
function modifierFlags(mods) {
    var flags = 0;
    for (var _i = 0, mods_1 = mods; _i < mods_1.length; _i++) {
        var m = mods_1[_i];
        if (m === 'command')
            flags |= 0x100000;
        if (m === 'control')
            flags |= 0x40000;
        if (m === 'option')
            flags |= 0x80000;
        if (m === 'shift')
            flags |= 0x20000;
    }
    return flags;
}
/**
 * macOS driver shelling out to `osascript` and `screencapture`.
 * @param run - command runner (subprocess / ctx.shell), injected for testability
 * @returns a desktop driver over the OS boundary
 */
function macosDriver(run) {
    var _this = this;
    var screenshot = function (path) { return __awaiter(_this, void 0, void 0, function () {
        var size, _a, width, height;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: 
                // screencapture -x writes silently (no shutter sound) to the given path.
                return [4 /*yield*/, run("screencapture -x ".concat(shellSingleQuote(path)))
                    // Read the primary display size (in points) from CoreGraphics.
                ];
                case 1:
                    // screencapture -x writes silently (no shutter sound) to the given path.
                    _b.sent();
                    return [4 /*yield*/, run(jxa('const id=$.CGMainDisplayID();String($.CGDisplayPixelsWide(id))+","+String($.CGDisplayPixelsHigh(id));'))];
                case 2:
                    size = _b.sent();
                    _a = size.split(',').map(function (s) { return Math.round(Number(s)); }), width = _a[0], height = _a[1];
                    return [2 /*return*/, { path: path, width: width || 0, height: height || 0 }];
            }
        });
    }); };
    var cursorPosition = function () { return __awaiter(_this, void 0, void 0, function () {
        var out, parts, x, y, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, run(jxa('const e=$.CGEventCreate($());const l=$.CGEventGetLocation(e);String(l.x)+","+String(l.y);'))];
                case 1:
                    out = _b.sent();
                    parts = out.split(',');
                    x = Number(parts[0]);
                    y = Number(parts[1]);
                    if (!Number.isFinite(x) || !Number.isFinite(y))
                        return [2 /*return*/, null];
                    return [2 /*return*/, { x: x, y: y }];
                case 2:
                    _a = _b.sent();
                    return [2 /*return*/, null];
                case 3: return [2 /*return*/];
            }
        });
    }); };
    var frontmostBundleId = function () { return __awaiter(_this, void 0, void 0, function () {
        var out, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, run(
                        // oxlint-disable-next-line @stylistic/quotes
                        "-l JavaScript -e 'ObjC.import(\"AppKit\");const ws=$.NSWorkspace.sharedWorkspace;ws.frontmostApplication.bundleIdentifier.js;'")];
                case 1:
                    out = _b.sent();
                    return [2 /*return*/, out.trim() || null];
                case 2:
                    _a = _b.sent();
                    return [2 /*return*/, null];
                case 3: return [2 /*return*/];
            }
        });
    }); };
    var mouse = function (plan) { return __awaiter(_this, void 0, void 0, function () {
        var target, count, i, dy;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    target = plan.point;
                    if (!(plan.gesture === 'move' && target)) return [3 /*break*/, 2];
                    return [4 /*yield*/, run(jxa("const t=$.CGPointMake(".concat(target.x, ",").concat(target.y, ");const m=$.CGEventCreateMouseEvent($(),$.kCGEventMouseMoved,t,$.kCGMouseButtonLeft);$.CGEventPost($.kCGHIDEventTap,m);")))];
                case 1:
                    _b.sent();
                    return [2 /*return*/];
                case 2:
                    if (!((plan.gesture === 'click' || plan.gesture === 'double_click') && target)) return [3 /*break*/, 7];
                    count = plan.gesture === 'double_click' ? 2 : 1;
                    i = 0;
                    _b.label = 3;
                case 3:
                    if (!(i < count)) return [3 /*break*/, 6];
                    return [4 /*yield*/, run(jxa("const t=$.CGPointMake(".concat(target.x, ",").concat(target.y, ");const d=$.CGEventCreateMouseEvent($(),$.kCGEventLeftMouseDown,t,$.kCGMouseButtonLeft);const u=$.CGEventCreateMouseEvent($(),$.kCGEventLeftMouseUp,t,$.kCGMouseButtonLeft);$.CGEventPost($.kCGHIDEventTap,d);$.CGEventPost($.kCGHIDEventTap,u);")))];
                case 4:
                    _b.sent();
                    _b.label = 5;
                case 5:
                    i++;
                    return [3 /*break*/, 3];
                case 6: return [2 /*return*/];
                case 7:
                    if (!(plan.gesture === 'scroll')) return [3 /*break*/, 9];
                    dy = (_a = plan.deltaY) !== null && _a !== void 0 ? _a : 0;
                    return [4 /*yield*/, run(jxa("const e=$.CGEventCreateScrollWheelEvent($(),$.kCGScrollEventUnitLine,1,".concat(dy, ",0);$.CGEventPost($.kCGHIDEventTap,e);")))];
                case 8:
                    _b.sent();
                    return [2 /*return*/];
                case 9:
                    if (!(plan.gesture === 'drag' && target)) return [3 /*break*/, 11];
                    return [4 /*yield*/, run(jxa("const t=$.CGPointMake(".concat(target.x, ",").concat(target.y, ");const m=$.CGEventCreateMouseEvent($(),$.kCGEventLeftMouseDragged,t,$.kCGMouseButtonLeft);$.CGEventPost($.kCGHIDEventTap,m);")))];
                case 10:
                    _b.sent();
                    return [2 /*return*/];
                case 11: return [2 /*return*/];
            }
        });
    }); };
    var keyboard = function (plan) { return __awaiter(_this, void 0, void 0, function () {
        var encoded, keyCode, modFlags;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    if (!(plan.gesture === 'type' && plan.text !== undefined)) return [3 /*break*/, 2];
                    encoded = node_buffer_1.Buffer.from(plan.text, 'utf8').toString('base64');
                    return [4 /*yield*/, run(jxa("const d=$.NSData.alloc.initWithBase64EncodedStringOptions('".concat(encoded, "',0);const s=$.NSString.alloc.initWithDataEncoding(d,4);const e=$.CGEventCreateKeyboardEvent($(),0,true);$.CGEventKeyboardSetUnicodeString(e,s.length,s);$.CGEventPost($.kCGHIDEventTap,e);const u=$.CGEventCreateKeyboardEvent($(),0,false);$.CGEventPost($.kCGHIDEventTap,u);")))];
                case 1:
                    _b.sent();
                    return [2 /*return*/];
                case 2:
                    if (!((plan.gesture === 'key_combo' || plan.gesture === 'shortcut') && plan.key !== undefined)) return [3 /*break*/, 4];
                    keyCode = KEYCODES[plan.key.toLowerCase()];
                    if (keyCode === undefined) {
                        throw new Error("desktop: unsupported key \"".concat(plan.key, "\" for macOS key_combo"));
                    }
                    modFlags = modifierFlags((_a = plan.modifiers) !== null && _a !== void 0 ? _a : []);
                    return [4 /*yield*/, run(jxa("const d=$.CGEventCreateKeyboardEvent($(),".concat(keyCode, ",true);d.setIntegerValueField($.kCGKeyboardEventKeycode,").concat(keyCode, ");d.flags=").concat(modFlags, ";$.CGEventPost($.kCGHIDEventTap,d);const u=$.CGEventCreateKeyboardEvent($(),").concat(keyCode, ",false);u.setIntegerValueField($.kCGKeyboardEventKeycode,").concat(keyCode, ");u.flags=").concat(modFlags, ";$.CGEventPost($.kCGHIDEventTap,u);")))];
                case 3:
                    _b.sent();
                    return [2 /*return*/];
                case 4: return [2 /*return*/];
            }
        });
    }); };
    return { screenshot: screenshot, cursorPosition: cursorPosition, frontmostBundleId: frontmostBundleId, mouse: mouse, keyboard: keyboard };
}
