"use strict";
/**
 * Desktop orchestration: turn a model-facing action into a policy-checked,
 * approval-gated, humanized series of injected OS events. The motion planning
 * is pure; the approver (policy + approval waterfall) and the driver (OS) are
 * injected seams, so tests stub only those two boundaries.
 * @module @z/dsh-tool-desktop
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
exports.createDesktopService = createDesktopService;
var motion_ts_1 = require("./motion.ts");
require("./session-events.ts");
/**
 * Build the desktop service over a driver, an approver, and a seeded RNG for
 * reproducible humanized motion. Every action first resolves the frontmost
 * bundle id, asks the approver (on behalf of `agent`), and only on approval
 * drives the OS.
 * @param driver - the OS backend
 * @param approver - resolves policy + approval for a target action
 * @param agent - the agent on whose behalf actions are approved and audited
 * @param durationMs - default humanized move duration
 * @param seed - RNG seed for reproducible paths
 * @returns the desktop service bound to `agent`
 */
function createDesktopService(driver, approver, agent, durationMs, seed) {
    var _this = this;
    if (durationMs === void 0) { durationMs = 400; }
    if (seed === void 0) { seed = 1; }
    var rng = (0, motion_ts_1.mulberry32)(seed);
    var audit = function (kind, bundleId, outcome) {
        agent.session.append('desktop/action', __assign(__assign({ kind: kind }, bundleId !== null ? { bundleId: bundleId } : {}), { outcome: outcome }));
    };
    var authorize = function (bundleId, action) { return __awaiter(_this, void 0, void 0, function () {
        var decision;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, approver(agent, bundleId, action)];
                case 1:
                    decision = _a.sent();
                    if (!decision.ok)
                        return [2 /*return*/, decision];
                    return [2 /*return*/, { ok: true }];
            }
        });
    }); };
    var move = function (target) { return __awaiter(_this, void 0, void 0, function () {
        var bundleId, auth, start, path, _loop_1, _i, path_1, step;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, driver.frontmostBundleId()];
                case 1:
                    bundleId = _a.sent();
                    return [4 /*yield*/, authorize(bundleId, 'move')];
                case 2:
                    auth = _a.sent();
                    if (!auth.ok) {
                        audit('move', bundleId, 'denied');
                        return [2 /*return*/, { kind: 'denied', reason: auth.reason }];
                    }
                    return [4 /*yield*/, driver.cursorPosition()];
                case 3:
                    start = _a.sent();
                    path = start
                        ? (0, motion_ts_1.planHumanizedMove)(start, target, durationMs, rng)
                        : [__assign(__assign({}, target), { delayMs: 0 })];
                    _loop_1 = function (step) {
                        return __generator(this, function (_b) {
                            switch (_b.label) {
                                case 0:
                                    if (!(step.delayMs > 0)) return [3 /*break*/, 2];
                                    return [4 /*yield*/, new Promise(function (r) { return setTimeout(r, step.delayMs); })];
                                case 1:
                                    _b.sent();
                                    _b.label = 2;
                                case 2: return [4 /*yield*/, driver.mouse({ gesture: 'move', point: { x: step.x, y: step.y } })];
                                case 3:
                                    _b.sent();
                                    return [2 /*return*/];
                            }
                        });
                    };
                    _i = 0, path_1 = path;
                    _a.label = 4;
                case 4:
                    if (!(_i < path_1.length)) return [3 /*break*/, 7];
                    step = path_1[_i];
                    return [5 /*yield**/, _loop_1(step)];
                case 5:
                    _a.sent();
                    _a.label = 6;
                case 6:
                    _i++;
                    return [3 /*break*/, 4];
                case 7:
                    audit('move', bundleId, 'applied');
                    return [2 /*return*/, { kind: 'ok' }];
            }
        });
    }); };
    var click = function (point_1) {
        var args_1 = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            args_1[_i - 1] = arguments[_i];
        }
        return __awaiter(_this, __spreadArray([point_1], args_1, true), void 0, function (point, double) {
            var kind, bundleId, auth;
            if (double === void 0) { double = false; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        kind = double ? 'double_click' : 'click';
                        return [4 /*yield*/, driver.frontmostBundleId()];
                    case 1:
                        bundleId = _a.sent();
                        return [4 /*yield*/, authorize(bundleId, kind)];
                    case 2:
                        auth = _a.sent();
                        if (!auth.ok) {
                            audit(kind, bundleId, 'denied');
                            return [2 /*return*/, { kind: 'denied', reason: auth.reason }];
                        }
                        return [4 /*yield*/, move(point)];
                    case 3:
                        _a.sent();
                        return [4 /*yield*/, driver.mouse({ gesture: kind, point: point })];
                    case 4:
                        _a.sent();
                        audit(kind, bundleId, 'applied');
                        return [2 /*return*/, { kind: 'ok' }];
                }
            });
        });
    };
    var scroll = function (deltaY) { return __awaiter(_this, void 0, void 0, function () {
        var bundleId, auth;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, driver.frontmostBundleId()];
                case 1:
                    bundleId = _a.sent();
                    return [4 /*yield*/, authorize(bundleId, 'scroll')];
                case 2:
                    auth = _a.sent();
                    if (!auth.ok) {
                        audit('scroll', bundleId, 'denied');
                        return [2 /*return*/, { kind: 'denied', reason: auth.reason }];
                    }
                    return [4 /*yield*/, driver.mouse({ gesture: 'scroll', deltaY: deltaY })];
                case 3:
                    _a.sent();
                    audit('scroll', bundleId, 'applied');
                    return [2 /*return*/, { kind: 'ok' }];
            }
        });
    }); };
    var type = function (text) { return __awaiter(_this, void 0, void 0, function () {
        var bundleId, auth;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, driver.frontmostBundleId()];
                case 1:
                    bundleId = _a.sent();
                    return [4 /*yield*/, authorize(bundleId, 'type')];
                case 2:
                    auth = _a.sent();
                    if (!auth.ok) {
                        audit('type', bundleId, 'denied');
                        return [2 /*return*/, { kind: 'denied', reason: auth.reason }];
                    }
                    return [4 /*yield*/, driver.keyboard({ gesture: 'type', text: text })];
                case 3:
                    _a.sent();
                    audit('type', bundleId, 'applied');
                    return [2 /*return*/, { kind: 'ok' }];
            }
        });
    }); };
    var keyCombo = function (key, modifiers) { return __awaiter(_this, void 0, void 0, function () {
        var bundleId, auth;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, driver.frontmostBundleId()];
                case 1:
                    bundleId = _a.sent();
                    return [4 /*yield*/, authorize(bundleId, 'key_combo')];
                case 2:
                    auth = _a.sent();
                    if (!auth.ok) {
                        audit('key_combo', bundleId, 'denied');
                        return [2 /*return*/, { kind: 'denied', reason: auth.reason }];
                    }
                    return [4 /*yield*/, driver.keyboard(__assign({ gesture: 'key_combo', key: key }, modifiers !== undefined ? { modifiers: modifiers } : {}))];
                case 3:
                    _a.sent();
                    audit('key_combo', bundleId, 'applied');
                    return [2 /*return*/, { kind: 'ok' }];
            }
        });
    }); };
    var screenshot = function (path) { return __awaiter(_this, void 0, void 0, function () {
        var bundleId, auth, plan;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, driver.frontmostBundleId()];
                case 1:
                    bundleId = _a.sent();
                    return [4 /*yield*/, authorize(bundleId, 'screenshot')];
                case 2:
                    auth = _a.sent();
                    if (!auth.ok) {
                        audit('screenshot', bundleId, 'denied');
                        throw new Error(auth.reason);
                    }
                    return [4 /*yield*/, driver.screenshot(path)];
                case 3:
                    plan = _a.sent();
                    audit('screenshot', bundleId, 'applied');
                    return [2 /*return*/, plan];
            }
        });
    }); };
    return {
        screenshot: screenshot,
        cursorPosition: function () { return driver.cursorPosition(); },
        frontmostBundleId: function () { return driver.frontmostBundleId(); },
        move: move,
        click: click,
        scroll: scroll,
        type: type,
        keyCombo: keyCombo,
    };
}
