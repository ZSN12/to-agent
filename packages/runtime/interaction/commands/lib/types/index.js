"use strict";
/**
 * Plugin-owned human-command registry shared by interactive UI adapters.
 * @module @z/dsh-commands
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
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
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
exports.CommandRuntime = exports.name = exports.CommandId = void 0;
exports.parseCommand = parseCommand;
var dsh_attachment_1 = require("@z/dsh-attachment");
var dsh_scope_1 = require("@z/dsh-scope");
var dsh_typert_protocol_1 = require("@z/dsh-typert-protocol");
var brand_ts_1 = require("./brand.ts");
var brand_ts_2 = require("./brand.ts");
Object.defineProperty(exports, "CommandId", { enumerable: true, get: function () { return brand_ts_2.CommandId; } });
exports.name = 'commands';
var COMMAND_NAME = /^[a-z][a-z0-9_-]*$/u;
/** Shared frozen attachments value for image-free invocations. */
var NO_ATTACHMENTS = Object.freeze([]);
/** All command registrations owned by one global or scoped layer. */
var CommandLayer = /** @class */ (function () {
    /**
     * Create one command layer with diagnostics specific to its ownership scope.
     * @param scope - the scoped owner, or `undefined` for global registrations.
     */
    function CommandLayer(scope) {
        this.commands = new dsh_scope_1.NamedEntries(function (name) { return new Error(scope === undefined
            ? "command \"".concat(name, "\" is already registered (for a per-agent variant, mount a command-injected plugin under that agent's `agent.ctx`)")
            : "command \"".concat(name, "\" is already registered in this scope")); });
    }
    /** @returns whether this layer owns no command registrations. */
    CommandLayer.prototype.isEmpty = function () {
        return this.commands.isEmpty();
    };
    return CommandLayer;
}());
/**
 * Parse an exact slash command without normalizing its trailing input.
 *
 * @param line - Complete candidate command line.
 * @returns The parsed command, or `undefined` when the line is not a command.
 */
function parseCommand(line) {
    var match = /^\/([a-z][a-z0-9_-]*)(?=$|[\t\n\r ])/u.exec(line);
    if (match === null)
        return undefined;
    var name = match[1];
    /* v8 ignore next -- the first capture is required whenever the regular expression matches */
    if (name === undefined)
        return undefined;
    return Object.freeze({ name: name, rawInput: line.slice(match[0].length) });
}
/** Convert arbitrary abort reasons to one stable rejected Error. */
function abortError(signal) {
    if (signal.reason instanceof Error)
        return signal.reason;
    return new Error(typeof signal.reason === 'string' ? signal.reason : 'command aborted');
}
/** The signal's normalized abort error when it is already aborted. */
function cancellationOf(signal) {
    return signal.aborted ? abortError(signal) : undefined;
}
/** Render arbitrary thrown values without trusting their string coercion. */
function renderThrown(value) {
    try {
        return String(value);
    }
    catch (_a) {
        return '<unrenderable thrown value>';
    }
}
/** Stop awaiting an uncooperative handler once its owning UI request aborts. */
function withAbort(promise, signal) {
    if (signal.aborted)
        return Promise.reject(abortError(signal));
    return new Promise(function (resolve, reject) {
        var onAbort = function () {
            signal.removeEventListener('abort', onAbort);
            reject(abortError(signal));
        };
        signal.addEventListener('abort', onAbort, { once: true });
        promise.then(function (value) {
            signal.removeEventListener('abort', onAbort);
            resolve(value);
        }, function (error) {
            signal.removeEventListener('abort', onAbort);
            reject(error instanceof Error
                ? error
                : new Error("command handler rejected with a non-Error value: ".concat(renderThrown(error)), { cause: error }));
        });
    });
}
/** Reject invalid command metadata before it can reach a UI protocol. */
function normalizeDefinition(definition) {
    if (!COMMAND_NAME.test(definition.name)) {
        throw new TypeError("command name \"".concat(definition.name, "\" must match ").concat(String(COMMAND_NAME)));
    }
    if (typeof definition.description !== 'string') {
        throw new TypeError("command \"".concat(definition.name, "\" description must be a string"));
    }
    if (definition.description.trim().length === 0) {
        throw new TypeError("command \"".concat(definition.name, "\" description must not be empty"));
    }
    if (typeof definition.handler !== 'function') {
        throw new TypeError("command \"".concat(definition.name, "\" handler must be a function"));
    }
    var rawInput = definition.input;
    var input;
    if (rawInput !== undefined) {
        if (typeof rawInput !== 'object' || rawInput === null || !('hint' in rawInput)
            || typeof rawInput.hint !== 'string') {
            throw new TypeError("command \"".concat(definition.name, "\" input hint must be a string"));
        }
        if (rawInput.hint.trim().length === 0) {
            throw new TypeError("command \"".concat(definition.name, "\" input hint must not be empty"));
        }
        if ('images' in rawInput && rawInput.images !== undefined && typeof rawInput.images !== 'boolean') {
            throw new TypeError("command \"".concat(definition.name, "\" input images flag must be a boolean"));
        }
        input = Object.freeze(__assign({ hint: rawInput.hint }, ('images' in rawInput && rawInput.images === true) ? { images: true } : {}));
    }
    var normalized = Object.freeze(__assign(__assign(__assign({ name: definition.name, description: definition.description }, input === undefined ? {} : { input: input }), definition.recordInput === undefined ? {} : { recordInput: definition.recordInput }), { handler: definition.handler }));
    var descriptor = Object.freeze(__assign({ name: normalized.name, description: normalized.description }, normalized.input === undefined ? {} : { input: normalized.input }));
    return { definition: normalized, descriptor: descriptor };
}
/** Validate and detach an untrusted handler result at the registry boundary. */
function normalizeResult(command, value) {
    if (typeof value !== 'object' || value === null || !('kind' in value)) {
        throw new TypeError("command \"".concat(command, "\" handler must return a CommandResult"));
    }
    var result = value;
    if (result.kind === 'success') {
        if (result.text !== undefined && typeof result.text !== 'string') {
            throw new TypeError("command \"".concat(command, "\" success text must be a string when supplied"));
        }
        if (result.sourceEventSeq !== undefined
            && (!Number.isSafeInteger(result.sourceEventSeq) || result.sourceEventSeq < 0)) {
            throw new TypeError("command \"".concat(command, "\" success sourceEventSeq must be a non-negative safe integer when supplied"));
        }
        return Object.freeze(__assign(__assign({ kind: 'success' }, result.text === undefined ? {} : { text: result.text }), result.sourceEventSeq === undefined ? {} : { sourceEventSeq: result.sourceEventSeq }));
    }
    if (result.kind === 'error') {
        if (typeof result.text !== 'string' || result.text.trim().length === 0) {
            throw new TypeError("command \"".concat(command, "\" error text must be a non-empty string"));
        }
        return Object.freeze({ kind: 'error', text: result.text });
    }
    throw new TypeError("command \"".concat(command, "\" returned unknown result kind \"").concat(String(result.kind), "\""));
}
/**
 * Human-command registry. Plain-context definitions are global; definitions
 * registered through a command-injected child of an agent context shadow
 * globals for that agent.
 */
var CommandRuntime = function () {
    var _a;
    var _classSuper = dsh_typert_protocol_1.TypertRemoteService;
    var _instanceExtraInitializers = [];
    var _list_decorators;
    var _execute_decorators;
    return _a = /** @class */ (function (_super) {
            __extends(CommandRuntime, _super);
            function CommandRuntime(ctx) {
                var _this = _super.call(this, ctx, 'commands') || this;
                _this.layers = (__runInitializers(_this, _instanceExtraInitializers), new dsh_scope_1.ScopedLayers(function (scope) { return new CommandLayer(scope); }, function () { _this.notifyChange(); }));
                /** Monotonic per-instance counter behind {@link mintCommandId}. */
                _this.commandSeq = 0;
                /** Instance token keeping minted ids unique across process restarts over one resumed log. */
                _this.instanceToken = crypto.randomUUID().slice(0, 8);
                return _this;
            }
            /**
             * Register a global or calling-agent-scoped command.
             * @param definition - discovery metadata and direct UI handler.
             * @returns the exact effect disposer that unregisters this definition.
             */
            CommandRuntime.prototype.register = function (definition) {
                var registered = normalizeDefinition(definition);
                return this.layers.effect(this.ctx, function (layer) { return layer.commands.insert(registered.definition.name, registered); }, { label: 'commands.register()' });
            };
            /**
             * List the effective immutable command descriptors for one agent.
             * @param agent - exact receiving agent and scoped-layer key.
             * @returns name-sorted descriptors after scoped shadowing.
             */
            CommandRuntime.prototype.list = function (agent) {
                return Object.freeze(__spreadArray([], this.view(agent).values(), true).map(function (command) { return command.descriptor; })
                    // Names are unique in the effective view, so equality is impossible.
                    .sort(function (left, right) { return left.name < right.name ? -1 : 1; }));
            };
            /**
             * Resolve one effective command definition.
             * @param agent - exact receiving agent and scoped-layer key.
             * @param name - command name without a slash.
             * @returns the scoped shadow or global definition.
             */
            CommandRuntime.prototype.find = function (agent, name) {
                var _b;
                return (_b = this.view(agent).get(name)) === null || _b === void 0 ? void 0 : _b.definition;
            };
            /**
             * Parse and execute a known command without sending it to the model.
             *
             * A resolved command's lifecycle is logged: `command/run` is appended
             * before the handler is invoked and `command/done` after settlement (a
             * thrown or aborted handler settles as `kind: 'error'`). Both are direct
             * log-only appends — no turn wraps them, and persistence drains them at
             * ordinary checkpoints. Admission misses (syntax or unknown name) log
             * nothing — they never entered a handler. A `command/run` append failure
             * fails the execution loud; a `command/done` append failure on the
             * handler-failure path is contained so the handler's own error stays the
             * reported failure.
             *
             * Image admission is enforced here, not in the composer: images sent to a
             * command that does not declare `input.images`, an absent attachment store,
             * and an exceeded attachment limit each settle as an error result before
             * the handler runs, and a rejected batch publishes no durable object.
             *
             * @param agent - exact receiving agent.
             * @param line - complete slash-command line.
             * @param images - base64-encoded composer images accompanying the line, in
             *   submission order; empty for a plain invocation.
             * @param signal - cancellation signal owned by the UI request.
             * @returns the settled execution (result + lifecycle pairing id), or
             *   `undefined` when syntax or name does not resolve.
             */
            CommandRuntime.prototype.execute = function (agent, line, images, signal) {
                return __awaiter(this, void 0, void 0, function () {
                    var parsed, command, commandId, settle, attachments, store, refs, error_1, cancelledDuringAdmission, invocation, result, output, _b, _c, error_2;
                    var _this = this;
                    var _d;
                    return __generator(this, function (_e) {
                        switch (_e.label) {
                            case 0:
                                parsed = parseCommand(line);
                                if (parsed === undefined)
                                    return [2 /*return*/, undefined];
                                command = this.view(agent).get(parsed.name);
                                if (command === undefined)
                                    return [2 /*return*/, undefined];
                                if (signal.aborted)
                                    throw abortError(signal);
                                commandId = this.mintCommandId();
                                this.appendLifecycle(agent.session, 'command/run', __assign(__assign({ commandId: commandId, name: parsed.name }, command.definition.recordInput === false ? {} : { args: parsed.rawInput }), { source: { kind: 'user' } }));
                                settle = function (result) {
                                    _this.appendLifecycle(agent.session, 'command/done', __assign(__assign({ commandId: commandId, kind: result.kind }, result.text === undefined ? {} : { text: result.text }), result.kind === 'success' && result.sourceEventSeq !== undefined
                                        ? { sourceEventSeq: result.sourceEventSeq }
                                        : {}));
                                    return Object.freeze({ commandId: commandId, result: Object.freeze(result) });
                                };
                                attachments = NO_ATTACHMENTS;
                                if (!(images.length > 0)) return [3 /*break*/, 5];
                                if (((_d = command.definition.input) === null || _d === void 0 ? void 0 : _d.images) !== true) {
                                    return [2 /*return*/, settle({ kind: 'error', text: "/".concat(parsed.name, " does not accept image attachments") })];
                                }
                                store = this.ctx.get('attachments');
                                if (store === undefined) {
                                    return [2 /*return*/, settle({ kind: 'error', text: "/".concat(parsed.name, ": image attachments are unavailable because no attachment store is composed") })];
                                }
                                _e.label = 1;
                            case 1:
                                _e.trys.push([1, 3, , 4]);
                                return [4 /*yield*/, (0, dsh_attachment_1.admitEncodedImages)(store, images)];
                            case 2:
                                refs = _e.sent();
                                attachments = Object.freeze(refs.map(function (ref) { return Object.freeze({ type: 'image', attachment: ref }); }));
                                return [3 /*break*/, 4];
                            case 3:
                                error_1 = _e.sent();
                                if (error_1 instanceof dsh_attachment_1.AttachmentError) {
                                    return [2 /*return*/, settle({ kind: 'error', text: error_1.message })];
                                }
                                this.settleThrown(agent.session, parsed.name, commandId, error_1);
                                throw error_1;
                            case 4:
                                cancelledDuringAdmission = cancellationOf(signal);
                                if (cancelledDuringAdmission !== undefined) {
                                    this.settleThrown(agent.session, parsed.name, commandId, cancelledDuringAdmission);
                                    throw cancelledDuringAdmission;
                                }
                                _e.label = 5;
                            case 5:
                                invocation = Object.freeze({ commandId: commandId, agent: agent, rawInput: parsed.rawInput, attachments: attachments, signal: signal });
                                _e.label = 6;
                            case 6:
                                _e.trys.push([6, 8, , 9]);
                                output = command.definition.handler(invocation);
                                _b = normalizeResult;
                                _c = [parsed.name];
                                return [4 /*yield*/, withAbort(Promise.resolve(output), signal)];
                            case 7:
                                result = _b.apply(void 0, _c.concat([_e.sent()]));
                                return [3 /*break*/, 9];
                            case 8:
                                error_2 = _e.sent();
                                this.settleThrown(agent.session, parsed.name, commandId, error_2);
                                throw error_2;
                            case 9: return [2 /*return*/, settle(result)];
                        }
                    });
                });
            };
            /** Contained `command/done` error append for a thrown handler or admission failure. */
            CommandRuntime.prototype.settleThrown = function (session, command, commandId, error) {
                try {
                    this.appendLifecycle(session, 'command/done', {
                        commandId: commandId,
                        kind: 'error',
                        text: error instanceof Error ? error.message : renderThrown(error),
                    });
                }
                catch (appendError) {
                    this.ctx.logger.warn("command \"".concat(command, "\": command/done append failed: ").concat(renderThrown(appendError)));
                }
            };
            /** Mint the next pairing id (monotonic; instance-token-prefixed so a resumed log never repeats one). */
            CommandRuntime.prototype.mintCommandId = function () {
                this.commandSeq += 1;
                return (0, brand_ts_1.CommandId)("cmd-".concat(this.instanceToken, "-").concat(this.commandSeq));
            };
            /**
             * Append one log-only lifecycle event directly: no turn is opened for it and
             * no flush is forced — persistence observes the eager `session/event` path
             * and drains at ordinary checkpoints and teardown, like every other
             * standalone plugin event.
             */
            CommandRuntime.prototype.appendLifecycle = function (session, type, data) {
                // Both admitted types are log-only (non-surface), but TypeScript does not
                // reduce Session.append's conditional rest parameter through a generic
                // type parameter. Preserve the proven two-argument call shape.
                var appendLogOnly = session.append.bind(session);
                return appendLogOnly(type, data);
            };
            /** Resolve global definitions followed by exact scoped shadows. */
            CommandRuntime.prototype.view = function (agent) {
                return this.layers.merge(agent, function (layer) { return layer.commands; });
            };
            /** Notify every registry observer without making UI refresh load-bearing. */
            CommandRuntime.prototype.notifyChange = function () {
                var _this = this;
                // Cordis emit uses Array.map: one synchronous throw starves later listeners,
                // and returned promises are discarded. Registry notifications are
                // non-vetoing, so contain each callback independently.
                for (var _i = 0, _b = this.ctx.events.dispatch('emit', ['commands/change']); _i < _b.length; _i++) {
                    var callback = _b[_i];
                    try {
                        var returned = callback();
                        void Promise.resolve(returned).catch(function (error) {
                            _this.ctx.logger.warn("commands/change listener rejected: ".concat(renderThrown(error)));
                        });
                    }
                    catch (error) {
                        this.ctx.logger.warn("commands/change listener threw: ".concat(renderThrown(error)));
                    }
                }
            };
            return CommandRuntime;
        }(_classSuper)),
        (function () {
            var _b;
            var _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create((_b = _classSuper[Symbol.metadata]) !== null && _b !== void 0 ? _b : null) : void 0;
            _list_decorators = [dsh_typert_protocol_1.Remote];
            _execute_decorators = [dsh_typert_protocol_1.Remote];
            __esDecorate(_a, null, _list_decorators, { kind: "method", name: "list", static: false, private: false, access: { has: function (obj) { return "list" in obj; }, get: function (obj) { return obj.list; } }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(_a, null, _execute_decorators, { kind: "method", name: "execute", static: false, private: false, access: { has: function (obj) { return "execute" in obj; }, get: function (obj) { return obj.execute; } }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
}();
exports.CommandRuntime = CommandRuntime;
exports.default = CommandRuntime;
