"use strict";
/**
 * Live Typert Remote dispatch over Cordis Services and registered providers.
 * Transport, request correlation, and response envelopes belong to Connection.
 * @module @z/dsh-api-gateway
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
exports.TypertGatewayService = exports.TypertGatewayError = void 0;
var cordis_1 = require("@z/cordis");
var dsh_typert_protocol_1 = require("@z/dsh-typert-protocol");
var NEVER_ABORTED_SIGNAL = new AbortController().signal;
/** Dispatch failure produced outside the invoked business method. */
var TypertGatewayError = /** @class */ (function (_super) {
    __extends(TypertGatewayError, _super);
    /**
     * Construct a Gateway failure without embedding boundary values in its message.
     * @param code - stable failure category.
     * @param endpoint - canonical Remote endpoint.
     * @param message - correction-oriented diagnostic without sensitive values.
     * @param options - optional field and contained cause.
     */
    function TypertGatewayError(code, endpoint, message, options) {
        if (options === void 0) { options = {}; }
        var _this = _super.call(this, "typert gateway: ".concat(endpoint, ": ").concat(message), options.cause === undefined ? undefined : { cause: options.cause }) || this;
        _this.name = 'TypertGatewayError';
        _this.code = code;
        _this.endpoint = endpoint;
        _this.field = options.field;
        return _this;
    }
    return TypertGatewayError;
}(Error));
exports.TypertGatewayError = TypertGatewayError;
/** Business invocation lost its carrier cancellation race. */
var RemoteInvocationCancelled = /** @class */ (function (_super) {
    __extends(RemoteInvocationCancelled, _super);
    /**
     * @param endpoint - canonical Remote endpoint.
     * @param cause - business rejection observed after carrier cancellation.
     */
    function RemoteInvocationCancelled(endpoint, cause) {
        var _this = _super.call(this, "Remote invocation \"".concat(endpoint, "\" was aborted"), { cause: cause }) || this;
        _this.name = 'RemoteInvocationCancelled';
        return _this;
    }
    return RemoteInvocationCancelled;
}(Error));
/**
 * Resolve strict generated definitions or conservative SRC markers against
 * current Cordis Services and Typert providers.
 * @typert service typertGateway
 */
var TypertGatewayService = /** @class */ (function (_super) {
    __extends(TypertGatewayService, _super);
    /**
     * Register the Gateway against the active Typert registry.
     * @param ctx - owning Host Context with Typert registry access.
     */
    function TypertGatewayService(ctx) {
        var _this = _super.call(this, ctx, 'typertGateway') || this;
        ctx.on('internal/service', function () {
            _this.srcClaims = undefined;
        });
        ctx.inject(['connection'], function (connectionCtx) {
            connectionCtx.connection.rpc.intercept('/api', function (endpoint) { return _this.claimsEndpoint(endpoint); }, function (endpoint, payload, signal) { return _this.dispatchRpc(endpoint, payload, signal); }, { authority: 'trusted-host' });
        });
        return _this;
    }
    TypertGatewayService.prototype.claimsEndpoint = function (endpoint) {
        var _a;
        var segments = endpoint.split('/');
        if (segments.length !== 2 || segments[0] === '' || segments[1] === '')
            return false;
        if (this.ctx.typert.local.get(endpoint) !== undefined || this.ctx.typert.local.hasSeen(endpoint))
            return true;
        (_a = this.srcClaims) !== null && _a !== void 0 ? _a : (this.srcClaims = this.collectSrcClaims());
        return this.srcClaims.has(endpoint);
    };
    TypertGatewayService.prototype.collectSrcClaims = function () {
        var _a;
        var claims = new Set();
        for (var _i = 0, _b = Object.entries(this.ctx.reflect.props); _i < _b.length; _i++) {
            var _c = _b[_i], serviceKey = _c[0], definition = _c[1];
            if (definition.type !== 'service')
                continue;
            var receiver = this.ctx.get(serviceKey);
            if (!isObject(receiver))
                continue;
            var original = originalOf(receiver);
            var binding = Reflect.get(original, 'typertRemote');
            if (!isObject(binding) || typeof Reflect.get(binding, 'namespace') !== 'string')
                continue;
            var namespace = Reflect.get(binding, 'namespace');
            for (var _d = 0, _e = (0, dsh_typert_protocol_1.remoteMethods)(original); _d < _e.length; _d++) {
                var candidate = _e[_d];
                claims.add(endpointOf(namespace, (_a = candidate.exportName) !== null && _a !== void 0 ? _a : candidate.method));
            }
        }
        return claims;
    };
    /**
     * Invoke one live Remote method through strict generated reflection or SRC markers.
     * @param request - decoded endpoint and exact named wire arguments.
     * @returns the validated business result.
     * @throws {@link TypertGatewayError} for dispatch, provider, or boundary failures; lookup-policy and business errors retain identity.
     */
    TypertGatewayService.prototype.invoke = function (request) {
        return __awaiter(this, void 0, void 0, function () {
            var endpoint, descriptor, receiverContext, receiver, args, implementation, method, result, error_1;
            var _this = this;
            var _a, _b, _c;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        endpoint = endpointOf(request.namespace, request.method);
                        descriptor = this.resolveDescriptor(request.namespace, request.method, endpoint);
                        assertExactArguments(request.args, descriptor, endpoint);
                        return [4 /*yield*/, this.resolveReceiverContext(descriptor, request.args, endpoint)];
                    case 1:
                        receiverContext = _d.sent();
                        receiver = receiverContext.get(descriptor.service);
                        if (!isObject(receiver)) {
                            throw new TypertGatewayError('service-unavailable', endpoint, "active Service ".concat(JSON.stringify(descriptor.service), " is unavailable"));
                        }
                        validateBinding(receiver, descriptor.service, descriptor.namespace, endpoint);
                        return [4 /*yield*/, Promise.all(descriptor.parameters.map(function (parameter) {
                                return _this.resolveParameter(parameter, request.args, endpoint);
                            }))];
                    case 2:
                        args = _d.sent();
                        if (descriptor.cancellation !== undefined)
                            args.push((_a = request.signal) !== null && _a !== void 0 ? _a : NEVER_ABORTED_SIGNAL);
                        implementation = (_b = descriptor.implementation) !== null && _b !== void 0 ? _b : descriptor.method;
                        method = Reflect.get(receiver, implementation);
                        if (typeof method !== 'function') {
                            throw new TypertGatewayError('method-unavailable', endpoint, "active Service ".concat(JSON.stringify(descriptor.service), " has no callable method ").concat(JSON.stringify(implementation)));
                        }
                        _d.label = 3;
                    case 3:
                        _d.trys.push([3, 5, , 6]);
                        return [4 /*yield*/, Reflect.apply(method, receiver, args)];
                    case 4:
                        result = (_d.sent());
                        return [3 /*break*/, 6];
                    case 5:
                        error_1 = _d.sent();
                        if (((_c = request.signal) === null || _c === void 0 ? void 0 : _c.aborted) === true)
                            throw new RemoteInvocationCancelled(endpoint, error_1);
                        throw error_1;
                    case 6:
                        // A weak descriptor declares no return type, so nothing returned is a void
                        // result and rides the wire as an absent value field. A strict descriptor
                        // keeps its schema: there, undefined has to be a declared result.
                        if (result === undefined && descriptor.result.mode !== 'strict')
                            return [2 /*return*/, result];
                        return [2 /*return*/, decode(descriptor.result, result, 'result-invalid', endpoint, 'result')];
                }
            });
        });
    };
    TypertGatewayService.prototype.dispatchRpc = function (endpoint, payload, signal) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.invokeRpc(endpoint, payload, signal)];
            });
        });
    };
    TypertGatewayService.prototype.invokeRpc = function (endpoint, payload, signal) {
        return __awaiter(this, void 0, void 0, function () {
            var segments, _a, namespace, method, value, error_2;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 2, , 3]);
                        segments = endpoint.split('/');
                        if (segments.length !== 2 || segments[0] === '' || segments[1] === '') {
                            throw new Error("invalid Remote endpoint ".concat(JSON.stringify(endpoint)));
                        }
                        _a = segments, namespace = _a[0], method = _a[1];
                        if (!isObject(payload)
                            || !isPlainObject(payload)
                            || Reflect.ownKeys(payload).length !== 1
                            || !Object.hasOwn(payload, 'args')
                            || !isObject(payload.args)
                            || !isPlainObject(payload.args)) {
                            throw new Error('Remote payload must contain exactly one plain-object args field');
                        }
                        return [4 /*yield*/, this.invoke({
                                namespace: namespace,
                                method: method,
                                args: payload.args,
                                signal: signal,
                            })
                            // A void or explicitly absent business result carries no `value` field;
                            // JSON has no `undefined`, and the envelope's optional slot is the one
                            // representation of absence that both args and results already use.
                        ];
                    case 1:
                        value = _b.sent();
                        // A void or explicitly absent business result carries no `value` field;
                        // JSON has no `undefined`, and the envelope's optional slot is the one
                        // representation of absence that both args and results already use.
                        return [2 /*return*/, { ok: true, value: value }];
                    case 2:
                        error_2 = _b.sent();
                        return [2 /*return*/, rpcFailure(error_2)];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    TypertGatewayService.prototype.resolveDescriptor = function (namespace, method, endpoint) {
        var strict = this.ctx.typert.local.get(endpoint);
        if (strict !== undefined)
            return strict;
        if (this.ctx.typert.local.hasSeen(endpoint)) {
            throw new TypertGatewayError('definition-unavailable', endpoint, 'its strict definition was withdrawn and SRC fallback is forbidden');
        }
        return this.resolveSrcDescriptor(namespace, method, endpoint);
    };
    TypertGatewayService.prototype.resolveSrcDescriptor = function (namespace, method, endpoint) {
        var candidates = [];
        for (var _i = 0, _a = Object.entries(this.ctx.reflect.props); _i < _a.length; _i++) {
            var _b = _a[_i], serviceKey = _b[0], definition = _b[1];
            if (definition.type !== 'service')
                continue;
            var receiver = this.ctx.get(serviceKey);
            if (!isObject(receiver))
                continue;
            var original = originalOf(receiver);
            var value = Reflect.get(original, 'typertRemote');
            if (value === undefined)
                continue;
            var binding = readBinding(value, original, serviceKey, endpoint);
            if (binding.namespace !== namespace)
                continue;
            var marker = (0, dsh_typert_protocol_1.remoteMethods)(original).find(function (candidate) { var _a; return ((_a = candidate.exportName) !== null && _a !== void 0 ? _a : candidate.method) === method; });
            if (marker === undefined)
                continue;
            candidates.push(this.srcDescriptor(binding, marker, method, endpoint));
        }
        if (candidates.length === 0) {
            throw new TypertGatewayError('invocation-unavailable', endpoint, 'no active Remote method exports this endpoint');
        }
        if (candidates.length > 1) {
            throw new TypertGatewayError('ambiguous-endpoint', endpoint, "multiple active Services export this endpoint: ".concat(candidates.map(function (candidate) { return candidate.service; }).sort().join(', ')));
        }
        return candidates[0];
    };
    TypertGatewayService.prototype.srcDescriptor = function (binding, marker, method, endpoint) {
        var names = methodParameterNames(binding.service, marker.method, endpoint);
        var signalIndex = names.indexOf('signal');
        if (signalIndex >= 0 && signalIndex !== names.length - 1) {
            throw new TypertGatewayError('signature-invalid', endpoint, 'SRC cancellation parameter signal must be the final parameter', { field: 'signal' });
        }
        var cancellation = signalIndex >= 0
            ? { parameter: 'signal' }
            : undefined;
        var businessNames = cancellation === undefined ? names : names.slice(0, -1);
        var parameters = [];
        var wires = new Set();
        var _loop_1 = function (name_1) {
            var matches = this_1.ctx.typert.lookups.definitions()
                .filter(function (definition) { return definition.parameter === name_1; });
            if (matches.length > 1) {
                throw new TypertGatewayError('signature-invalid', endpoint, "parameter ".concat(JSON.stringify(name_1), " matches multiple lookup providers"), { field: name_1 });
            }
            var match = matches[0];
            var parameter = match === undefined
                ? { name: name_1, wire: name_1, source: 'json', codec: { mode: 'src-json' } }
                : {
                    name: name_1,
                    wire: match.wire,
                    source: 'lookup',
                    lookup: match.key,
                    codec: { mode: 'src-json' },
                };
            if (wires.has(parameter.wire)) {
                throw new TypertGatewayError('signature-invalid', endpoint, "multiple parameters use wire field ".concat(JSON.stringify(parameter.wire)), { field: parameter.wire });
            }
            wires.add(parameter.wire);
            parameters.push(parameter);
        };
        var this_1 = this;
        for (var _i = 0, businessNames_1 = businessNames; _i < businessNames_1.length; _i++) {
            var name_1 = businessNames_1[_i];
            _loop_1(name_1);
        }
        var receiver = { kind: 'direct' };
        if (marker.invocation.kind === 'context') {
            var provider = this.ctx.typert.contexts.getHost(marker.invocation.context);
            if (provider === undefined) {
                throw new TypertGatewayError('context-unavailable', endpoint, "Context provider ".concat(JSON.stringify(marker.invocation.context), " is unavailable"));
            }
            if (wires.has(provider.wire)) {
                throw new TypertGatewayError('signature-invalid', endpoint, "Context identity conflicts with wire field ".concat(JSON.stringify(provider.wire)), { field: provider.wire });
            }
            receiver = {
                kind: 'context',
                context: marker.invocation.context,
                wire: provider.wire,
                codec: { mode: 'src-json' },
            };
        }
        return __assign(__assign(__assign(__assign({ id: "src:".concat(binding.serviceKey, "#").concat(endpoint), service: binding.serviceKey, namespace: binding.namespace, method: method }, (marker.method === method ? {} : { implementation: marker.method })), { invocation: receiver, parameters: parameters }), (cancellation === undefined ? {} : { cancellation: cancellation })), { result: { mode: 'src-json' } });
    };
    TypertGatewayService.prototype.resolveReceiverContext = function (descriptor, args, endpoint) {
        return __awaiter(this, void 0, void 0, function () {
            var invocation, provider, identity, context, cause_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (descriptor.invocation.kind === 'direct')
                            return [2 /*return*/, this.ctx];
                        invocation = descriptor.invocation;
                        provider = this.ctx.typert.contexts.getHost(invocation.context);
                        if (provider === undefined) {
                            throw new TypertGatewayError('context-unavailable', endpoint, "Context provider ".concat(JSON.stringify(invocation.context), " is unavailable"));
                        }
                        if (provider.wire !== invocation.wire
                            || (invocation.codec.mode === 'strict' && provider.wireTypeSymbol !== invocation.codec.typeSymbol)) {
                            throw new TypertGatewayError('provider-mismatch', endpoint, "Context provider ".concat(JSON.stringify(invocation.context), " does not match its strict definition"), { field: invocation.wire });
                        }
                        identity = decode(invocation.codec, args[invocation.wire], 'input-invalid', endpoint, invocation.wire);
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, provider.resolve(identity)];
                    case 2:
                        context = _a.sent();
                        return [3 /*break*/, 4];
                    case 3:
                        cause_1 = _a.sent();
                        if (cause_1 instanceof dsh_typert_protocol_1.TypertLookupFailure)
                            throw cause_1;
                        throw new TypertGatewayError('context-failed', endpoint, "Context provider ".concat(JSON.stringify(invocation.context), " failed"), { cause: cause_1, field: invocation.wire });
                    case 4:
                        if (context === undefined) {
                            throw new TypertGatewayError('context-not-found', endpoint, "Context provider ".concat(JSON.stringify(invocation.context), " did not resolve the requested identity"), { field: invocation.wire });
                        }
                        return [2 /*return*/, context];
                }
            });
        });
    };
    TypertGatewayService.prototype.resolveParameter = function (parameter, args, endpoint) {
        return __awaiter(this, void 0, void 0, function () {
            var value, key, provider, resolved, cause_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        // An absent field reached assertExactArguments' allowance, so this parameter
                        // takes undefined; a present-but-undefined field is not JSON-safe input and
                        // still fails decode. Lookup ids are never omissible, so absence here only
                        // ever belongs to a json parameter.
                        if (!Object.hasOwn(args, parameter.wire))
                            return [2 /*return*/, undefined];
                        value = decode(parameter.codec, args[parameter.wire], 'input-invalid', endpoint, parameter.wire);
                        if (parameter.source === 'json')
                            return [2 /*return*/, value];
                        key = parameter.lookup;
                        /* v8 ignore next -- registry validation rejects strict descriptors without a key, and SRC derivation always supplies one. */
                        if (key === undefined) {
                            throw new TypertGatewayError('lookup-unavailable', endpoint, "lookup parameter ".concat(JSON.stringify(parameter.name), " has no provider key"), { field: parameter.wire });
                        }
                        provider = this.ctx.typert.lookups.get(key);
                        if (provider === undefined) {
                            throw new TypertGatewayError('lookup-unavailable', endpoint, "lookup provider ".concat(JSON.stringify(key), " is unavailable"), { field: parameter.wire });
                        }
                        if (provider.wire !== parameter.wire
                            || (parameter.codec.mode === 'strict' && provider.wireTypeSymbol !== parameter.codec.typeSymbol)) {
                            throw new TypertGatewayError('provider-mismatch', endpoint, "lookup provider ".concat(JSON.stringify(key), " does not match its strict definition"), { field: parameter.wire });
                        }
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, provider.resolve(value)];
                    case 2:
                        resolved = _a.sent();
                        return [3 /*break*/, 4];
                    case 3:
                        cause_2 = _a.sent();
                        if (cause_2 instanceof dsh_typert_protocol_1.TypertLookupFailure)
                            throw cause_2;
                        throw new TypertGatewayError('lookup-failed', endpoint, "lookup provider ".concat(JSON.stringify(key), " failed"), { cause: cause_2, field: parameter.wire });
                    case 4:
                        if (resolved === undefined) {
                            throw new TypertGatewayError('lookup-not-found', endpoint, "lookup provider ".concat(JSON.stringify(key), " did not resolve the requested identity"), { field: parameter.wire });
                        }
                        return [2 /*return*/, resolved];
                }
            });
        });
    };
    TypertGatewayService.inject = ['typert'];
    return TypertGatewayService;
}(cordis_1.Service));
exports.TypertGatewayService = TypertGatewayService;
function rpcFailure(error) {
    if (error instanceof RemoteInvocationCancelled) {
        return {
            ok: false,
            error: { code: 'cancelled', message: error.message, details: {} },
        };
    }
    if (error instanceof dsh_typert_protocol_1.TypertLookupFailure) {
        return { ok: false, error: error.failure };
    }
    return {
        ok: false,
        error: {
            code: 'internal',
            message: error instanceof Error ? error.message : String(error),
            details: {},
        },
    };
}
function endpointOf(namespace, method) {
    return "".concat(namespace, "/").concat(method);
}
function validateBinding(receiver, serviceKey, namespace, endpoint) {
    var original = originalOf(receiver);
    var value = Reflect.get(original, 'typertRemote');
    if (value === undefined) {
        throw new TypertGatewayError('binding-invalid', endpoint, "Service ".concat(JSON.stringify(serviceKey), " has no visible typertRemote binding"));
    }
    return {
        binding: readBinding(value, original, serviceKey, endpoint, namespace),
        original: original,
    };
}
function readBinding(value, original, serviceKey, endpoint, namespace) {
    if (!isObject(value)
        || Reflect.get(value, 'service') !== original
        || Reflect.get(value, 'serviceKey') !== serviceKey
        || typeof Reflect.get(value, 'namespace') !== 'string'
        || (namespace !== undefined && Reflect.get(value, 'namespace') !== namespace)) {
        throw new TypertGatewayError('binding-invalid', endpoint, "Service ".concat(JSON.stringify(serviceKey), " has an inconsistent typertRemote binding"));
    }
    return value;
}
function originalOf(receiver) {
    var original = Reflect.get(receiver, cordis_1.symbols.original);
    return isObject(original) ? original : receiver;
}
function methodParameterNames(service, method, endpoint) {
    var prototype = Object.getPrototypeOf(service);
    var implementation;
    while (prototype !== null) {
        var descriptor = Object.getOwnPropertyDescriptor(prototype, method);
        if (descriptor !== undefined) {
            if ('value' in descriptor && typeof descriptor.value === 'function') {
                implementation = descriptor.value;
            }
            break;
        }
        prototype = Object.getPrototypeOf(prototype);
    }
    if (implementation === undefined) {
        throw new TypertGatewayError('method-unavailable', endpoint, "Remote marker has no prototype method ".concat(JSON.stringify(method)));
    }
    var source = Function.prototype.toString.call(implementation);
    var open = source.indexOf('(');
    var close = source.indexOf(')', open + 1);
    /* v8 ignore next -- standard public class-method syntax always contains a parenthesized parameter list. */
    if (open < 0 || close < 0)
        return invalidSignature(endpoint, method);
    var body = source.slice(open + 1, close).trim();
    if (body.length === 0)
        return [];
    var parts = body.split(',').map(function (part) { return part.trim(); });
    var names = new Set();
    for (var _i = 0, parts_1 = parts; _i < parts_1.length; _i++) {
        var part = parts_1[_i];
        if (!/^[$A-Z_a-z][$\w]*$/u.test(part) || names.has(part))
            return invalidSignature(endpoint, method);
        names.add(part);
    }
    return __spreadArray([], names, true);
}
function invalidSignature(endpoint, method) {
    throw new TypertGatewayError('signature-invalid', endpoint, "SRC method ".concat(JSON.stringify(method), " must use unique identifier parameters without destructuring, defaults, or rest"));
}
function assertExactArguments(args, descriptor, endpoint) {
    if (!isPlainObject(args)) {
        throw new TypertGatewayError('arguments-invalid', endpoint, 'args must be a plain object');
    }
    var expected = new Set(descriptor.parameters.map(function (parameter) { return parameter.wire; }));
    if (descriptor.invocation.kind === 'context')
        expected.add(descriptor.invocation.wire);
    var actual = Reflect.ownKeys(args);
    var extra = actual.filter(function (key) { return typeof key !== 'string' || !expected.has(key); });
    // A JSON field may be omitted when the strict descriptor declares absence,
    // and always under SRC: a weak descriptor reads parameter names from the
    // JavaScript signature and cannot see which are optional, so LIB is where an
    // omitted required argument is caught. Lookup ids are never omissible.
    var acceptsMissing = new Set(descriptor.parameters
        .filter(function (parameter) { return parameter.source === 'json'
        && (parameter.acceptsUndefined === true || parameter.codec.mode === 'src-json'); })
        .map(function (parameter) { return parameter.wire; }));
    var missing = __spreadArray([], expected, true).filter(function (key) { return !Object.hasOwn(args, key) && !acceptsMissing.has(key); });
    if (extra.length === 0 && missing.length === 0)
        return;
    var clauses = [];
    if (missing.length > 0)
        clauses.push("missing ".concat(missing.map(function (key) { return JSON.stringify(key); }).join(', ')));
    if (extra.length > 0)
        clauses.push("unexpected ".concat(extra.map(function (key) { return JSON.stringify(String(key)); }).join(', ')));
    throw new TypertGatewayError('arguments-invalid', endpoint, "args fields do not match the descriptor: ".concat(clauses.join('; ')));
}
function decode(codec, value, code, endpoint, field) {
    try {
        if (codec.mode === 'strict') {
            value = codec.schema.parse(value);
            if (value === undefined)
                return value;
        }
        assertJsonValue(value, new Set());
        return value;
    }
    catch (cause) {
        throw new TypertGatewayError(code, endpoint, code === 'input-invalid'
            ? "wire field ".concat(JSON.stringify(field), " failed boundary validation")
            : 'business result failed boundary validation', { cause: cause, field: field });
    }
}
function assertJsonValue(value, ancestors) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean')
        return;
    if (typeof value === 'number') {
        if (Number.isFinite(value))
            return;
        throw new TypeError('non-finite number is not JSON-safe');
    }
    if (!isObject(value))
        throw new TypeError("".concat(typeof value, " is not JSON-safe"));
    if (ancestors.has(value))
        throw new TypeError('cyclic value is not JSON-safe');
    ancestors.add(value);
    try {
        if (Array.isArray(value)) {
            if (Object.getOwnPropertySymbols(value).length > 0 || Object.keys(value).length !== value.length) {
                throw new TypeError('sparse or decorated array is not JSON-safe');
            }
            for (var index = 0; index < value.length; index += 1) {
                if (!Object.hasOwn(value, index))
                    throw new TypeError('sparse array is not JSON-safe');
                assertJsonValue(value[index], ancestors);
            }
            return;
        }
        if (!isPlainObject(value))
            throw new TypeError('non-plain object is not JSON-safe');
        if (Object.getOwnPropertySymbols(value).length > 0)
            throw new TypeError('symbol property is not JSON-safe');
        for (var _i = 0, _a = Reflect.ownKeys(value); _i < _a.length; _i++) {
            var key = _a[_i];
            var descriptor = Object.getOwnPropertyDescriptor(value, key);
            /* v8 ignore next -- ownKeys() just returned this key; only a hostile same-process Proxy can delete it between operations. */
            if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
                throw new TypeError('non-data property is not JSON-safe');
            }
            assertJsonValue(descriptor.value, ancestors);
        }
    }
    finally {
        ancestors.delete(value);
    }
}
function isPlainObject(value) {
    if (Array.isArray(value))
        return false;
    var prototype = Object.getPrototypeOf(value);
    return prototype === null || prototype === Object.prototype;
}
function isObject(value) {
    return (typeof value === 'object' && value !== null) || typeof value === 'function';
}
exports.default = TypertGatewayService;
