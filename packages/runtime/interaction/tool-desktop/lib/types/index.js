"use strict";
/**
 * Model-facing macOS desktop-control tools over a driver + approval seam:
 * `desktop_screenshot`, `desktop_mouse`, `desktop_keyboard`. Every action is
 * scoped to the frontmost app's bundle id, gated by an app-level access policy
 * and the `approval/request` waterfall, and (for cursor moves) humanized with a
 * seeded bezier path. Enforcement stays with the approval service; these tools
 * only propose and interpret.
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.Config = exports.inject = exports.name = void 0;
exports.apply = apply;
var schemastery_1 = require("@z/schemastery");
var dsh_tools_1 = require("@z/dsh-tools");
var macos_ts_1 = require("./macos.ts");
var desktop_ts_1 = require("./desktop.ts");
var approval_ts_1 = require("./approval.ts");
exports.name = 'tool-desktop';
exports.inject = ['tools', 'approval', 'shell'];
/** Runtime configuration schema for the desktop tool plugin. */
exports.Config = schemastery_1.default.object({
    policy: schemastery_1.default.object({
        rules: schemastery_1.default.array(schemastery_1.default.object({
            bundleId: schemastery_1.default.string(),
            access: schemastery_1.default.union([schemastery_1.default.const('allow'), schemastery_1.default.const('deny')]),
        })),
        default: schemastery_1.default.union([schemastery_1.default.const('allow'), schemastery_1.default.const('deny')]).default('deny'),
    }),
    gateAllow: schemastery_1.default.boolean().default(false),
    persistApproval: schemastery_1.default.boolean().default(false),
    moveDurationMs: schemastery_1.default.number().default(400),
});
/** Map a desktop outcome to a model-safe result object. */
function outcomeResult(outcome) {
    if (outcome.kind === 'denied')
        return { ok: false, reason: outcome.reason };
    return { ok: true };
}
/** Build the per-call desktop service bound to the current agent. */
function serviceFor(ctx, config, agent, run, cache) {
    var driver = (0, macos_ts_1.macosDriver)(run);
    var approver = (0, approval_ts_1.createApprover)(__assign(__assign({ policy: config.policy, approval: ctx.approval }, config.gateAllow === true ? { gateAllow: true } : {}), config.persistApproval === true ? { persist: true } : {}), cache);
    return (0, desktop_ts_1.createDesktopService)(driver, approver, agent, config.moveDurationMs);
}
/** A runnable command backed by the shell capability. */
function shellRunner(ctx) {
    var _this = this;
    return function (script) { return __awaiter(_this, void 0, void 0, function () {
        var result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, ctx.shell.run(ctx.shell.resolve({
                        command: script,
                        workdir: process.cwd(),
                        timeoutMs: 15000,
                        stdoutMaxBytes: 64 * 1024,
                    }))];
                case 1:
                    result = _a.sent();
                    return [2 /*return*/, result.stdout.text];
            }
        });
    }); };
}
function apply(ctx, config) {
    var run = shellRunner(ctx);
    var cache = new approval_ts_1.PersistentGrantCache();
    ctx.tools.register((0, dsh_tools_1.defineTool)({
        name: 'desktop_screenshot',
        description: 'Capture the primary display and report where the PNG was written. Use before clicking so you can see the screen.',
        parameters: {
            path: {
                type: 'string',
                description: 'Absolute path to write the PNG to, e.g. a workspace file you can read_image.',
                required: true,
            },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    path: { type: 'string' },
                    width: { type: 'number' },
                    height: { type: 'number' },
                },
            },
            render: function (_args, value) { return [{ type: 'text', text: JSON.stringify(value) }]; },
        },
        execute: function (args, exec) {
            return __awaiter(this, void 0, void 0, function () {
                var service, shot;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            if (!exec.agent)
                                throw new Error('desktop_screenshot requires an agent context');
                            service = serviceFor(ctx, config, exec.agent, run, cache);
                            return [4 /*yield*/, service.screenshot(args.path)];
                        case 1:
                            shot = _a.sent();
                            return [2 /*return*/, { path: shot.path, width: shot.width, height: shot.height }];
                    }
                });
            });
        },
    }));
    ctx.tools.register((0, dsh_tools_1.defineTool)({
        name: 'desktop_mouse',
        description: 'Move, click, or scroll the macOS cursor. Moves are humanized (a slight curve with ease-in-out).',
        parameters: {
            action: {
                type: 'string',
                required: true,
                description: 'One of: move, click, double_click, scroll.',
            },
            x: { type: 'number', description: 'Target x (display pixels). Required for move/click/double_click.' },
            y: { type: 'number', description: 'Target y (display pixels). Required for move/click/double_click.' },
            delta_y: { type: 'number', description: 'Vertical scroll ticks (negative = down). Required for scroll.' },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    ok: { type: 'boolean' },
                    reason: { type: 'string' },
                },
            },
            render: function (_args, value) { return [{ type: 'text', text: JSON.stringify(value) }]; },
        },
        execute: function (args, exec) {
            return __awaiter(this, void 0, void 0, function () {
                var service, outcome, _a, _b;
                return __generator(this, function (_c) {
                    switch (_c.label) {
                        case 0:
                            if (!exec.agent)
                                throw new Error('desktop_mouse requires an agent context');
                            service = serviceFor(ctx, config, exec.agent, run, cache);
                            if (!(args.action === 'move' || args.action === 'click' || args.action === 'double_click')) return [3 /*break*/, 5];
                            if (args.x === undefined || args.y === undefined) {
                                throw new Error("desktop_mouse ".concat(args.action, " requires x and y"));
                            }
                            if (!(args.action === 'move')) return [3 /*break*/, 2];
                            return [4 /*yield*/, service.move({ x: args.x, y: args.y })];
                        case 1:
                            _a = _c.sent();
                            return [3 /*break*/, 4];
                        case 2: return [4 /*yield*/, service.click({ x: args.x, y: args.y }, args.action === 'double_click')];
                        case 3:
                            _a = _c.sent();
                            _c.label = 4;
                        case 4:
                            outcome = _a;
                            return [2 /*return*/, outcomeResult(outcome)];
                        case 5:
                            if (!(args.action === 'scroll')) return [3 /*break*/, 7];
                            if (args.delta_y === undefined)
                                throw new Error('desktop_mouse scroll requires delta_y');
                            _b = outcomeResult;
                            return [4 /*yield*/, service.scroll(args.delta_y)];
                        case 6: return [2 /*return*/, _b.apply(void 0, [_c.sent()])];
                        case 7: throw new Error("desktop_mouse: unknown action ".concat(args.action));
                    }
                });
            });
        },
    }));
    ctx.tools.register((0, dsh_tools_1.defineTool)({
        name: 'desktop_keyboard',
        description: 'Type text or send a key combo (with optional modifiers) at the focused field.',
        parameters: {
            action: {
                type: 'string',
                required: true,
                description: 'One of: type, key_combo.',
            },
            text: { type: 'string', description: 'Text to type (required for type).' },
            key: {
                type: 'string',
                description: 'Key for a combo (required for key_combo). Common keys: return, tab, escape, arrow keys, a-z, 0-9.',
            },
            modifiers: {
                type: 'array',
                items: { type: 'string', enum: ['command', 'control', 'option', 'shift'] },
                description: 'Modifier keys held during a key_combo.',
            },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    ok: { type: 'boolean' },
                    reason: { type: 'string' },
                },
            },
            render: function (_args, value) { return [{ type: 'text', text: JSON.stringify(value) }]; },
        },
        execute: function (args, exec) {
            return __awaiter(this, void 0, void 0, function () {
                var service, _a, _b;
                return __generator(this, function (_c) {
                    switch (_c.label) {
                        case 0:
                            if (!exec.agent)
                                throw new Error('desktop_keyboard requires an agent context');
                            service = serviceFor(ctx, config, exec.agent, run, cache);
                            if (!(args.action === 'type')) return [3 /*break*/, 2];
                            if (args.text === undefined)
                                throw new Error('desktop_keyboard type requires text');
                            _a = outcomeResult;
                            return [4 /*yield*/, service.type(args.text)];
                        case 1: return [2 /*return*/, _a.apply(void 0, [_c.sent()])];
                        case 2:
                            if (!(args.action === 'key_combo')) return [3 /*break*/, 4];
                            if (args.key === undefined)
                                throw new Error('desktop_keyboard key_combo requires key');
                            _b = outcomeResult;
                            return [4 /*yield*/, service.keyCombo(args.key, args.modifiers)];
                        case 3: return [2 /*return*/, _b.apply(void 0, [_c.sent()])];
                        case 4: throw new Error("desktop_keyboard: unknown action ".concat(args.action));
                    }
                });
            });
        },
    }));
}
