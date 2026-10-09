"use strict";
/**
 * Agent-scoped dispatch and prompt assembly helpers. The fused dispatcher
 * {@link agentEvents} couples the agent subject to its scope carrier, so the
 * scope key and the payload's `agent` cannot diverge; repeat dispatchers (the
 * loop driver) build it once in the agent's constructor and reuse it.
 * @module @z/dsh-agent/dispatch
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
exports.agentCarrier = agentCarrier;
exports.agentEvents = agentEvents;
exports.emitAgentEvent = emitAgentEvent;
exports.assembleContextFor = assembleContextFor;
var dsh_scope_1 = require("@z/dsh-scope");
/**
 * Build the fused scope carrier for one agent subject.
 *
 * The carrier is a stateless routing object. {@link agentEvents} accepts an
 * existing carrier, so callers that dispatch repeatedly for the same agent
 * (the loop driver) build it once in the agent's constructor and reuse it,
 * keeping hot-path dispatches allocation-free.
 * @param agent - the subject agent and scope key.
 * @returns the carrier passed as the event dispatcher `this` value.
 */
function agentCarrier(agent) {
    return (0, dsh_scope_1.scopeTarget)(agent, agent);
}
/**
 * Build a dispatcher that couples the agent subject to its scope carrier.
 * @param ctx - the context to dispatch through (any context of the app).
 * @param agent - the subject agent; also the scope-carrier key.
 * @param carrier - the scope carrier to dispatch through; defaults to
 * {@link agentCarrier} for the agent. Pass a constructor-built carrier to
 * avoid rebuilding it for every dispatch.
 * @returns the fused dispatcher.
 */
function agentEvents(ctx, agent, carrier) {
    if (carrier === void 0) { carrier = agentCarrier(agent); }
    // The ordinary dispatch methods forward through Cordis' variadic mixins. The
    // fused (carrier, name, payload, ...rest) tuple is provably a valid argument
    // list for the matching thisArg overload, but TypeScript cannot relate the
    // generic Tail<K> spread back to that overload's conditional parameter
    // tuple — hence one contained, shape-preserving cast per method.
    var fused = function (payload) {
        // The dispatcher owns the subject injection; callers pass PayloadRest, so
        // the fused record is exactly the declared payload. The spread comes
        // first, so a structurally acceptable payload that happens to carry an
        // `agent` field can never override the injected subject.
        return (__assign(__assign({}, payload), { agent: agent }));
    };
    return {
        emit: function (name, payload) {
            // Cordis emit invokes callbacks through Array.map: one synchronous throw
            // starves later listeners, and returned promises are discarded. Agent
            // notifications are non-vetoing, so resolve the same filtered callback
            // set ourselves and contain both failure modes independently.
            var args = [carrier, name, fused(payload)];
            var callbacks = ctx.events.dispatch('emit', args);
            for (var _i = 0, callbacks_1 = callbacks; _i < callbacks_1.length; _i++) {
                var callback = callbacks_1[_i];
                try {
                    var returned = callback.apply(void 0, args);
                    void Promise.resolve(returned).catch(function (error) {
                        ctx.logger.warn("agent event \"".concat(name, "\" listener rejected: ").concat(String(error)));
                    });
                }
                catch (error) {
                    ctx.logger.warn("agent event \"".concat(name, "\" listener threw: ").concat(String(error)));
                }
            }
        },
        serial: function (name, payload) {
            return __awaiter(this, void 0, void 0, function () {
                var serial;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            serial = ctx.serial;
                            return [4 /*yield*/, serial(carrier, name, fused(payload))];
                        case 1: return [2 /*return*/, _a.sent()];
                    }
                });
            });
        },
        waterfall: function (name, payload) {
            var rest = [];
            for (var _i = 2; _i < arguments.length; _i++) {
                rest[_i - 2] = arguments[_i];
            }
            // oxlint-disable-next-line typescript/unbound-method -- the events mixin accessor returns a pre-bound function
            var waterfall = ctx.waterfall;
            return waterfall.apply(void 0, __spreadArray([carrier, name, fused(payload)], rest, false));
        },
    };
}
/**
 * Emit one contained agent notification without allocating a retained dispatcher.
 * @param ctx - the context to dispatch through.
 * @param agent - the subject agent and scope key.
 * @param name - the agent-subject event to emit.
 * @param payload - the event's payload fields; `agent` is injected.
 */
function emitAgentEvent(ctx, agent, name, payload) {
    agentEvents(ctx, agent).emit(name, payload);
}
/**
 * Build the prompt assembly context with agent and scope set together, so
 * agent-scoped prompt and tool contributions cannot be silently omitted.
 * @param agent - the agent the assembly is for.
 * @param signal - the current turn's explicit control signal, when assembly belongs to a turn.
 * @returns the context to pass to `assemble()`.
 */
function assembleContextFor(agent, signal) {
    return __assign({ agent: agent, scope: agent }, signal === undefined ? {} : { signal: signal });
}
