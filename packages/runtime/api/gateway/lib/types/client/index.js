"use strict";
/**
 * Client projection of generated Typert Remote descriptors. Contributions
 * install traced `remote.<namespace>` services; no JavaScript Proxy
 * participates in method lookup, invocation, or type exposure.
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
exports.inject = void 0;
exports.apply = apply;
var cordis_1 = require("@z/cordis");
/** Required Client services: the Typert registry and the existing Connection carrier. */
exports.inject = ['typert', 'connection'];
/**
 * Install the typed Client Remote service.
 * @param ctx - Client Cordis root.
 */
function apply(ctx) {
    new ClientRemoteService(ctx);
}
var ClientRemoteService = /** @class */ (function (_super) {
    __extends(ClientRemoteService, _super);
    function ClientRemoteService(ctx) {
        var _this = _super.call(this, ctx, 'remote') || this;
        _this.namespaces = new Map();
        _this.subscriptions = new Map();
        _this.mutations = Promise.resolve();
        _this.ownerCtx = ctx;
        ctx.effect(function () { return function () { _this.subscriptions.clear(); }; }, 'api-gateway.client.subscriptions');
        return _this;
    }
    ClientRemoteService.prototype.$mount = function (contribution) {
        return __awaiter(this, void 0, void 0, function () {
            var callerCtx, owned;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        callerCtx = this.ctx;
                        owned = callerCtx.effect(function () { return __awaiter(_this, void 0, void 0, function () {
                            var dispose;
                            var _this = this;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, this.enqueue(function () { return _this.mountContribution(callerCtx, contribution); })];
                                    case 1:
                                        dispose = _a.sent();
                                        return [2 /*return*/, function () { return _this.enqueue(dispose); }];
                                }
                            });
                        }); }, "api-gateway.client.$mount(".concat(JSON.stringify(contribution.package), ")"));
                        return [4 /*yield*/, owned];
                    case 1:
                        _a.sent();
                        return [2 /*return*/, function () { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, owned()];
                                    case 1:
                                        _a.sent();
                                        return [2 /*return*/];
                                }
                            }); }); }];
                }
            });
        });
    };
    ClientRemoteService.prototype.$on = function (event, listener) {
        var _this = this;
        // The table is keyed by the runtime event name, so the argument list this
        // signature pins per event cannot survive in it; `$deliver` restores it
        // from the frame the Host emitted for that same name.
        var subscription = { listener: listener };
        var owned = this.ctx.effect(function () {
            var listeners = _this.listeners(event);
            listeners.push(subscription);
            return function () {
                var at = listeners.indexOf(subscription);
                /* v8 ignore next -- listener */
                if (at >= 0)
                    listeners.splice(at, 1);
            };
        }, "api-gateway.client.$on(".concat(JSON.stringify(event), ")"));
        return function () { void owned(); };
    };
    /**
     * Deliver one forwarded event in registration order, isolating a listener
     * that fails either synchronously or by rejecting a returned promise; see
     * {@link TypertClientRemote.$dispatch} for the caller contract.
     */
    ClientRemoteService.prototype.$dispatch = function (event, args) {
        var listeners = this.subscriptions.get(event);
        if (listeners === undefined)
            return;
        // Snapshot: a listener may subscribe or dispose during delivery, and this
        // round's recipients are the ones registered when the frame arrived.
        for (var _i = 0, _a = __spreadArray([], listeners, true); _i < _a.length; _i++) {
            var listener = _a[_i].listener;
            var report = function (error) {
                console.error("client api: Remote event ".concat(JSON.stringify(event), " listener threw:"), error);
            };
            try {
                /* oxlint-disable-next-line typescript/no-confusing-void-expression --
                 * The declared return is void, so nobody awaits an async listener; the
                 * runtime value is still a promise, and reading it is the only way to
                 * keep its rejection inside this containment instead of surfacing as an
                 * unhandled one. */
                var settled = listener.apply(void 0, args);
                if (settled instanceof Promise)
                    settled.catch(report);
            }
            catch (error) {
                report(error);
            }
        }
    };
    /** Subscriptions for one event name; empty arrays are retained, bounded by the Host's selection. */
    ClientRemoteService.prototype.listeners = function (event) {
        var listeners = this.subscriptions.get(event);
        if (listeners === undefined) {
            listeners = [];
            this.subscriptions.set(event, listeners);
        }
        return listeners;
    };
    ClientRemoteService.prototype.enqueue = function (operation) {
        var result = this.mutations.then(operation, operation);
        this.mutations = result.then(function () { return undefined; }, function () { return undefined; });
        return result;
    };
    ClientRemoteService.prototype.mountContribution = function (callerCtx, contribution) {
        return __awaiter(this, void 0, void 0, function () {
            var disposeRemote, groups, _i, _a, descriptor, group, installed, _b, groups_1, _c, namespace, descriptors, _d, _e, error_1, _f, _g, dispose;
            var _this = this;
            return __generator(this, function (_h) {
                switch (_h.label) {
                    case 0:
                        this.validateContribution(contribution);
                        disposeRemote = callerCtx.typert.remotes.register(contribution);
                        groups = new Map();
                        for (_i = 0, _a = contribution.descriptors; _i < _a.length; _i++) {
                            descriptor = _a[_i];
                            group = groups.get(descriptor.namespace);
                            if (group === undefined)
                                groups.set(descriptor.namespace, [descriptor]);
                            else
                                group.push(descriptor);
                        }
                        installed = [];
                        _h.label = 1;
                    case 1:
                        _h.trys.push([1, 6, , 12]);
                        _b = 0, groups_1 = groups;
                        _h.label = 2;
                    case 2:
                        if (!(_b < groups_1.length)) return [3 /*break*/, 5];
                        _c = groups_1[_b], namespace = _c[0], descriptors = _c[1];
                        _e = (_d = installed).push;
                        return [4 /*yield*/, this.installNamespace(namespace, descriptors)];
                    case 3:
                        _e.apply(_d, [_h.sent()]);
                        _h.label = 4;
                    case 4:
                        _b++;
                        return [3 /*break*/, 2];
                    case 5: return [3 /*break*/, 12];
                    case 6:
                        error_1 = _h.sent();
                        _f = 0, _g = installed.reverse();
                        _h.label = 7;
                    case 7:
                        if (!(_f < _g.length)) return [3 /*break*/, 10];
                        dispose = _g[_f];
                        return [4 /*yield*/, dispose()];
                    case 8:
                        _h.sent();
                        _h.label = 9;
                    case 9:
                        _f++;
                        return [3 /*break*/, 7];
                    case 10: return [4 /*yield*/, disposeRemote()];
                    case 11:
                        _h.sent();
                        throw error_1;
                    case 12: return [2 /*return*/, function () { return __awaiter(_this, void 0, void 0, function () {
                            var _i, _a, dispose;
                            return __generator(this, function (_b) {
                                switch (_b.label) {
                                    case 0:
                                        _i = 0, _a = installed.reverse();
                                        _b.label = 1;
                                    case 1:
                                        if (!(_i < _a.length)) return [3 /*break*/, 4];
                                        dispose = _a[_i];
                                        return [4 /*yield*/, dispose()];
                                    case 2:
                                        _b.sent();
                                        _b.label = 3;
                                    case 3:
                                        _i++;
                                        return [3 /*break*/, 1];
                                    case 4: return [4 /*yield*/, disposeRemote()];
                                    case 5:
                                        _b.sent();
                                        return [2 /*return*/];
                                }
                            });
                        }); }];
                }
            });
        });
    };
    ClientRemoteService.prototype.validateContribution = function (contribution) {
        var _this = this;
        var _a, _b, _c;
        var direct = new Map();
        var scoped = new Map();
        var add = function (table, descriptor, kind) {
            var _a, _b;
            var methods = (_a = table.get(descriptor.namespace)) !== null && _a !== void 0 ? _a : new Set();
            if (methods.has(descriptor.method)) {
                throw new Error("client api: contribution repeats ".concat(kind, " method ").concat(endpointOf(descriptor)));
            }
            methods.add(descriptor.method);
            table.set(descriptor.namespace, methods);
            var namespace = (_b = _this.namespaces.get(descriptor.namespace)) === null || _b === void 0 ? void 0 : _b.service;
            if ((namespace === null || namespace === void 0 ? void 0 : namespace.has(kind, descriptor.method)) === true) {
                throw new Error("client api: ".concat(kind, " method ").concat(endpointOf(descriptor), " is already mounted"));
            }
        };
        for (var _i = 0, _d = contribution.descriptors; _i < _d.length; _i++) {
            var descriptor = _d[_i];
            requireStrictDescriptor(descriptor);
            if (descriptor.invocation.kind === 'direct')
                add(direct, descriptor, 'direct');
            if (scopedProjection(descriptor) !== undefined)
                add(scoped, descriptor, 'scoped');
        }
        var namespaces = new Set(__spreadArray(__spreadArray([], direct.keys(), true), scoped.keys(), true));
        for (var _e = 0, namespaces_1 = namespaces; _e < namespaces_1.length; _e++) {
            var namespace = namespaces_1[_e];
            var service = (_a = this.namespaces.get(namespace)) === null || _a === void 0 ? void 0 : _a.service;
            if (service === undefined) {
                if (namespace in this) {
                    throw new Error("client api: namespace ".concat(JSON.stringify(namespace), " conflicts with the Remote service"));
                }
                var serviceKey = remoteServiceKey(namespace);
                var property = this.ownerCtx.reflect.props[serviceKey];
                if ((property === null || property === void 0 ? void 0 : property.type) === 'accessor' || this.ownerCtx.get(serviceKey) !== undefined) {
                    throw new Error("client api: namespace ".concat(JSON.stringify(namespace), " conflicts with an existing Remote namespace"));
                }
            }
            for (var _f = 0, _g = new Set(__spreadArray(__spreadArray([], ((_b = direct.get(namespace)) !== null && _b !== void 0 ? _b : []), true), ((_c = scoped.get(namespace)) !== null && _c !== void 0 ? _c : []), true)); _f < _g.length; _f++) {
                var method = _g[_f];
                if (service === undefined)
                    RemoteNamespaceService.assertMethodAvailable(namespace, method);
                else
                    service.assertMethodAvailable(method);
            }
        }
    };
    /**
     * Mount one namespace's descriptor group with no visibility gap: a fresh
     * namespace installs its whole group synchronously inside its fiber's
     * apply, so a plugin parked on the namespace service never observes it
     * without the methods the same contribution carries; an existing namespace
     * takes the group in one synchronous step.
     * @param name - Remote namespace.
     * @param descriptors - Every contribution descriptor naming that namespace.
     * @returns disposer unmounting the group and the namespace once empty.
     */
    ClientRemoteService.prototype.installNamespace = function (name, descriptors) {
        return __awaiter(this, void 0, void 0, function () {
            var namespace, installed, handle;
            var _a;
            var _this = this;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        namespace = this.namespaces.get(name);
                        if (!(namespace === undefined)) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.createNamespace(name, descriptors)];
                    case 1:
                        (_a = _b.sent(), namespace = _a.namespace, installed = _a.installed);
                        return [3 /*break*/, 3];
                    case 2:
                        installed = installMethods(namespace.service, descriptors);
                        _b.label = 3;
                    case 3:
                        handle = namespace;
                        return [2 /*return*/, function () { return __awaiter(_this, void 0, void 0, function () {
                                var _i, _a, method;
                                return __generator(this, function (_b) {
                                    switch (_b.label) {
                                        case 0:
                                            for (_i = 0, _a = __spreadArray([], installed, true).reverse(); _i < _a.length; _i++) {
                                                method = _a[_i];
                                                /* v8 ignore next -- Cordis effect disposers are idempotent and invoke this cleanup at most once. */
                                                if (!method.token.active)
                                                    continue;
                                                method.token.active = false;
                                                method.token.abort.abort();
                                                if (method.scoped)
                                                    handle.service.remove('scoped', method.descriptor.method, method.token);
                                                if (method.direct)
                                                    handle.service.remove('direct', method.descriptor.method, method.token);
                                            }
                                            return [4 /*yield*/, this.disposeNamespace(name, handle)];
                                        case 1:
                                            _b.sent();
                                            return [2 /*return*/];
                                    }
                                });
                            }); }];
                }
            });
        });
    };
    ClientRemoteService.prototype.createNamespace = function (name, descriptors) {
        return __awaiter(this, void 0, void 0, function () {
            var service, installed, fiber, error_2, namespace;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        fiber = this.ownerCtx.plugin({
                            name: remoteServiceKey(name),
                            apply: function (ctx) {
                                service = new RemoteNamespaceService(ctx, name, function (direct, scoped, caller, args) { return _this.invokeMethod(direct, scoped, caller, args); });
                                // Same synchronous window as the service registration: a dependent the
                                // new service unparks runs only after the methods exist.
                                installed = installMethods(service, descriptors);
                            },
                        });
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 5]);
                        return [4 /*yield*/, fiber];
                    case 2:
                        _a.sent();
                        return [3 /*break*/, 5];
                    case 3:
                        error_2 = _a.sent();
                        return [4 /*yield*/, fiber.dispose()];
                    case 4:
                        _a.sent();
                        throw error_2;
                    case 5:
                        /* v8 ignore next 3 -- a settled namespace fiber synchronously constructs its Service and installs the group. */
                        if (service === undefined || installed === undefined) {
                            throw new Error("client api: namespace ".concat(JSON.stringify(name), " did not start"));
                        }
                        namespace = { service: service, dispose: fiber.dispose };
                        this.namespaces.set(name, namespace);
                        return [2 /*return*/, { namespace: namespace, installed: installed }];
                }
            });
        });
    };
    ClientRemoteService.prototype.disposeNamespace = function (name, namespace) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!namespace.service.empty || this.namespaces.get(name) !== namespace)
                            return [2 /*return*/];
                        this.namespaces.delete(name);
                        return [4 /*yield*/, namespace.dispose()];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    ClientRemoteService.prototype.invokeMethod = function (direct, scoped, callerCtx, values) {
        if (scoped !== undefined) {
            var binder = this.ownerCtx.typert.contexts.getClient(scoped.projection.context);
            var identity = binder === null || binder === void 0 ? void 0 : binder.identity(callerCtx);
            if (identity !== undefined) {
                return this.invoke(scoped.descriptor, scoped.projection, scoped.token, callerCtx, values, { value: identity });
            }
        }
        if (direct !== undefined) {
            return this.invoke(direct.descriptor, undefined, direct.token, callerCtx, values);
        }
        if (scoped !== undefined) {
            return this.invoke(scoped.descriptor, scoped.projection, scoped.token, callerCtx, values);
        }
        throw new Error('client api: Remote method is no longer mounted');
    };
    ClientRemoteService.prototype.invoke = function (descriptor, projection, token, callerCtx, values, boundIdentity) {
        return __awaiter(this, void 0, void 0, function () {
            var endpoint, expected, hasCallerSignal, contract, args, binder, identity, valueIndex, connection, callerSignal, signal, result, error_3;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        endpoint = endpointOf(descriptor);
                        if (!token.active)
                            return [2 /*return*/, withdrawn(endpoint)];
                        expected = descriptor.parameters.length - ((projection === null || projection === void 0 ? void 0 : projection.parameterIndex) === undefined ? 0 : 1);
                        hasCallerSignal = descriptor.cancellation !== undefined && values.length === expected + 1;
                        if (values.length !== expected && !hasCallerSignal) {
                            contract = descriptor.cancellation === undefined
                                ? "".concat(String(expected), " argument(s)")
                                : "".concat(String(expected), " business argument(s) plus an optional AbortSignal");
                            throw new Error("client api: ".concat(endpoint, " expected ").concat(contract, ", got ").concat(String(values.length)));
                        }
                        args = Object.create(null);
                        if (projection !== undefined) {
                            binder = boundIdentity === undefined
                                ? this.ownerCtx.typert.contexts.getClient(projection.context)
                                : undefined;
                            if (boundIdentity === undefined && binder === undefined) {
                                throw new Error("client api: ".concat(endpoint, " has no Client Context binder for ").concat(JSON.stringify(projection.context)));
                            }
                            identity = boundIdentity === undefined
                                ? binder === null || binder === void 0 ? void 0 : binder.identity(callerCtx)
                                : boundIdentity.value;
                            if (identity === undefined) {
                                throw new Error("client api: ".concat(endpoint, " requires a ").concat(JSON.stringify(projection.context), " Context"));
                            }
                            args[projection.wire] = parse(projection.codec, identity, endpoint, projection.wire);
                        }
                        valueIndex = 0;
                        descriptor.parameters.forEach(function (parameter, parameterIndex) {
                            if (parameterIndex === (projection === null || projection === void 0 ? void 0 : projection.parameterIndex))
                                return;
                            var value = parse(parameter.codec, values[valueIndex], endpoint, parameter.wire);
                            if (value !== undefined)
                                args[parameter.wire] = value;
                            valueIndex += 1;
                        });
                        connection = this.ownerCtx.get('connection');
                        if (connection === undefined)
                            throw new Error("client api: ".concat(endpoint, " has no active Connection"));
                        callerSignal = hasCallerSignal ? values[expected] : undefined;
                        signal = callerSignal === undefined
                            ? token.abort.signal
                            : AbortSignal.any([token.abort.signal, callerSignal]);
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, connection.rpc.call('/api', endpoint, { args: args }, signal)];
                    case 2:
                        result = _a.sent();
                        if (!mountActive(token))
                            return [2 /*return*/, withdrawn(endpoint)];
                        if (!result.ok)
                            return [2 /*return*/, { ok: false, error: result.error }];
                        return [2 /*return*/, { ok: true, value: parse(descriptor.result, result.value, endpoint, 'result') }];
                    case 3:
                        error_3 = _a.sent();
                        // Carrier throws (offline, abort, a rejected result payload) are outcomes
                        // of the call, not assembly faults, so they join the same error branch.
                        return [2 /*return*/, carrierFailure(endpoint, error_3)];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    return ClientRemoteService;
}(cordis_1.Service));
var RemoteNamespaceService = /** @class */ (function (_super) {
    __extends(RemoteNamespaceService, _super);
    function RemoteNamespaceService(ctx, name, invokeRemote) {
        var _this = _super.call(this, ctx, remoteServiceKey(name)) || this;
        _this.invokeRemote = invokeRemote;
        _this.methods = new Map();
        _this.namespace = name;
        return _this;
    }
    RemoteNamespaceService.assertMethodAvailable = function (namespace, method) {
        if (REMOTE_NAMESPACE_FIELDS.has(method) || method in RemoteNamespaceService.prototype) {
            throw new Error("client api: method ".concat(JSON.stringify("".concat(namespace, "/").concat(method)), " conflicts with its namespace service"));
        }
    };
    RemoteNamespaceService.prototype.assertMethodAvailable = function (method) {
        RemoteNamespaceService.assertMethodAvailable(this.namespace, method);
        if (method in this && !this.methods.has(method)) {
            throw new Error("client api: method ".concat(JSON.stringify("".concat(this.namespace, "/").concat(method)), " conflicts with its namespace service"));
        }
    };
    Object.defineProperty(RemoteNamespaceService.prototype, "empty", {
        get: function () {
            return this.methods.size === 0;
        },
        enumerable: false,
        configurable: true
    });
    RemoteNamespaceService.prototype.has = function (kind, method) {
        var _a;
        return ((_a = this.methods.get(method)) === null || _a === void 0 ? void 0 : _a[kind]) !== undefined;
    };
    RemoteNamespaceService.prototype.installDirect = function (descriptor, token) {
        this.install(descriptor.method, 'direct', { descriptor: descriptor, token: token });
    };
    RemoteNamespaceService.prototype.installScoped = function (descriptor, projection, token) {
        this.install(descriptor.method, 'scoped', { descriptor: descriptor, projection: projection, token: token });
    };
    RemoteNamespaceService.prototype.install = function (method, kind, value) {
        this.assertMethodAvailable(method);
        var record = this.methods.get(method);
        var fresh = record === undefined;
        record !== null && record !== void 0 ? record : (record = {});
        if (fresh) {
            Object.defineProperty(this, method, {
                configurable: true,
                enumerable: true,
                get: function () {
                    var _this = this;
                    var callerCtx = this.ctx;
                    var current = this.methods.get(method);
                    var direct = current === null || current === void 0 ? void 0 : current.direct;
                    var scoped = current === null || current === void 0 ? void 0 : current.scoped;
                    return function () {
                        var args = [];
                        for (var _i = 0; _i < arguments.length; _i++) {
                            args[_i] = arguments[_i];
                        }
                        return _this.invokeRemote(direct, scoped, callerCtx, args);
                    };
                },
            });
            this.methods.set(method, record);
        }
        if (kind === 'direct')
            record.direct = value;
        else
            record.scoped = value;
    };
    RemoteNamespaceService.prototype.remove = function (kind, method, token) {
        var record = this.methods.get(method);
        var current = record === null || record === void 0 ? void 0 : record[kind];
        /* v8 ignore next -- duplicate live variants are rejected before installation, so no newer token can replace this one. */
        if (record === undefined || (current === null || current === void 0 ? void 0 : current.token) !== token)
            return;
        if (kind === 'direct')
            delete record.direct;
        else
            delete record.scoped;
        if (record.direct !== undefined || record.scoped !== undefined)
            return;
        this.methods.delete(method);
        Reflect.deleteProperty(this, method);
    };
    return RemoteNamespaceService;
}(cordis_1.Service));
/**
 * Install one descriptor group on a namespace service, unwinding the partial
 * group when a descriptor is refused.
 * @param service - Namespace service taking the methods.
 * @param descriptors - Descriptor group of one contribution.
 * @returns per-descriptor records for the group disposer.
 */
function installMethods(service, descriptors) {
    var installed = [];
    try {
        for (var _i = 0, descriptors_1 = descriptors; _i < descriptors_1.length; _i++) {
            var descriptor = descriptors_1[_i];
            var method = {
                descriptor: descriptor,
                token: { active: true, abort: new AbortController() },
                direct: false,
                scoped: false,
            };
            installed.push(method);
            if (descriptor.invocation.kind === 'direct') {
                service.installDirect(descriptor, method.token);
                method.direct = true;
            }
            var projection = scopedProjection(descriptor);
            if (projection !== undefined) {
                service.installScoped(descriptor, projection, method.token);
                method.scoped = true;
            }
        }
    }
    catch (error) {
        for (var _a = 0, _b = __spreadArray([], installed, true).reverse(); _a < _b.length; _a++) {
            var method = _b[_a];
            method.token.active = false;
            method.token.abort.abort();
            if (method.scoped)
                service.remove('scoped', method.descriptor.method, method.token);
            if (method.direct)
                service.remove('direct', method.descriptor.method, method.token);
        }
        throw error;
    }
    return installed;
}
var REMOTE_NAMESPACE_FIELDS = new Set(['ctx', 'empty', 'invokeRemote', 'methods', 'name', 'namespace']);
function remoteServiceKey(namespace) {
    return "remote.".concat(namespace);
}
function endpointOf(descriptor) {
    return "".concat(descriptor.namespace, "/").concat(descriptor.method);
}
function mountActive(token) {
    return token.active;
}
function scopedProjection(descriptor) {
    if (descriptor.invocation.kind === 'context') {
        return {
            context: descriptor.invocation.context,
            wire: descriptor.invocation.wire,
            codec: descriptor.invocation.codec,
        };
    }
    if (descriptor.scope === undefined)
        return undefined;
    var lookupParameters = descriptor.parameters
        .map(function (parameter, index) { return ({ parameter: parameter, index: index }); })
        .filter(function (candidate) { return candidate.parameter.source === 'lookup'; });
    var selected = lookupParameters.length === 1 ? lookupParameters[0] : undefined;
    if (selected === undefined
        || selected.parameter.wire !== descriptor.scope.wire
        || selected.parameter.lookup !== descriptor.scope.context) {
        throw new Error("client api: generated Remote ".concat(endpointOf(descriptor), " scope must select its only lookup parameter"));
    }
    return {
        context: descriptor.scope.context,
        wire: descriptor.scope.wire,
        codec: selected.parameter.codec,
        parameterIndex: selected.index,
    };
}
function requireStrictDescriptor(descriptor) {
    var endpoint = endpointOf(descriptor);
    requireStrictCodec(descriptor.result, endpoint, 'result');
    for (var _i = 0, _a = descriptor.parameters; _i < _a.length; _i++) {
        var parameter = _a[_i];
        requireStrictCodec(parameter.codec, endpoint, parameter.wire);
    }
    if (descriptor.invocation.kind === 'context') {
        requireStrictCodec(descriptor.invocation.codec, endpoint, descriptor.invocation.wire);
    }
}
function requireStrictCodec(codec, endpoint, field) {
    if (codec.mode !== 'strict') {
        throw new Error("client api: generated Remote ".concat(endpoint, " field ").concat(JSON.stringify(field), " has no strict codec"));
    }
}
function parse(codec, value, endpoint, field) {
    if (codec.mode !== 'strict') {
        throw new Error("client api: generated Remote ".concat(endpoint, " field ").concat(JSON.stringify(field), " has no strict codec"));
    }
    try {
        return codec.schema.parse(value);
    }
    catch (cause) {
        throw new Error("client api: ".concat(endpoint, " rejected ").concat(JSON.stringify(field)), { cause: cause });
    }
}
/** The namespace retired before or during the call, so no request outcome exists. */
function withdrawn(endpoint) {
    return internalFailure("client api: Remote method ".concat(endpoint, " is no longer mounted"));
}
function carrierFailure(endpoint, error) {
    return internalFailure("client api: ".concat(endpoint, " failed: ").concat(error instanceof Error ? error.message : String(error)));
}
function internalFailure(message) {
    return { ok: false, error: { code: 'internal', message: message, details: {} } };
}
