"use strict";
/**
 * Runtime registry for generated Typert reflection, Remote invocations, and
 * dependency-inverted lookup/Context providers. It performs no TypeScript
 * analysis or schema generation.
 * @module @z/dsh-typert-registry
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
exports.TypertRegistry = void 0;
exports.typertKey = typertKey;
exports.typertPackageKey = typertPackageKey;
exports.typertEndpoint = typertEndpoint;
var cordis_1 = require("@z/cordis");
var zod_1 = require("zod");
/**
 * Compose the global key of one generated schema.
 * @param packageName - contributing npm package.
 * @param name - schema export name.
 * @returns `<package>#<name>`.
 */
function typertKey(packageName, name) {
    return "".concat(packageName, "#").concat(name);
}
/**
 * Compose the identity of one package-face model.
 * @param packageName - contributing npm package.
 * @param face - independently compiled face.
 * @returns `<package>#<face>`.
 */
function typertPackageKey(packageName, face) {
    return "".concat(packageName, "#").concat(face);
}
/**
 * Compose the endpoint key used by local and Remote invocation registries.
 * @param descriptor - invocation whose namespace and method form the endpoint.
 * @returns `<namespace>/<method>`.
 */
function typertEndpoint(descriptor) {
    return "".concat(descriptor.namespace, "/").concat(descriptor.method);
}
var ChangeSource = /** @class */ (function () {
    function ChangeSource(report) {
        this.report = report;
        this.listeners = new Set();
    }
    ChangeSource.prototype.subscribe = function (ctx, listener) {
        var listeners = this.listeners;
        return ctx.effect(function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        listeners.add(listener);
                        return [4 /*yield*/, function () { listeners.delete(listener); }];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }, 'typert registry subscription');
    };
    ChangeSource.prototype.emit = function (change) {
        for (var _i = 0, _a = __spreadArray([], this.listeners, true); _i < _a.length; _i++) {
            var listener = _a[_i];
            try {
                listener(change);
            }
            catch (error) {
                this.report(change, error);
            }
        }
    };
    return ChangeSource;
}());
var DescriptorStore = /** @class */ (function () {
    function DescriptorStore(kind, report) {
        this.kind = kind;
        this.entries = new Map();
        this.ids = new Map();
        this.history = new Set();
        this.changes = new ChangeSource(report);
    }
    DescriptorStore.prototype.validate = function (descriptors) {
        var endpoints = new Set();
        var ids = new Set();
        for (var _i = 0, descriptors_1 = descriptors; _i < descriptors_1.length; _i++) {
            var descriptor = descriptors_1[_i];
            validateInvocation(descriptor);
            var endpoint = typertEndpoint(descriptor);
            if (endpoints.has(endpoint) || this.entries.has(endpoint)) {
                throw new Error("typert: ".concat(this.kind, " endpoint \"").concat(endpoint, "\" is already registered"));
            }
            if (ids.has(descriptor.id) || this.ids.has(descriptor.id)) {
                throw new Error("typert: ".concat(this.kind, " invocation id \"").concat(descriptor.id, "\" is already registered"));
            }
            endpoints.add(endpoint);
            ids.add(descriptor.id);
        }
    };
    DescriptorStore.prototype.commit = function (owner, descriptors) {
        for (var _i = 0, descriptors_2 = descriptors; _i < descriptors_2.length; _i++) {
            var descriptor = descriptors_2[_i];
            var entry = { descriptor: descriptor, owner: owner };
            var endpoint = typertEndpoint(descriptor);
            this.entries.set(endpoint, entry);
            this.ids.set(descriptor.id, entry);
            this.history.add(endpoint);
        }
        for (var _a = 0, descriptors_3 = descriptors; _a < descriptors_3.length; _a++) {
            var descriptor = descriptors_3[_a];
            this.changes.emit({ kind: this.kind, key: typertEndpoint(descriptor) });
        }
    };
    DescriptorStore.prototype.withdraw = function (owner, descriptors) {
        var removed = [];
        for (var _i = 0, descriptors_4 = descriptors; _i < descriptors_4.length; _i++) {
            var descriptor = descriptors_4[_i];
            var endpoint = typertEndpoint(descriptor);
            var entry = this.entries.get(endpoint);
            /* v8 ignore next -- duplicate registration is rejected, so no later owner can replace this entry before its effect disposes. */
            if ((entry === null || entry === void 0 ? void 0 : entry.owner) !== owner)
                continue;
            this.entries.delete(endpoint);
            /* v8 ignore next -- ids and endpoints are committed and withdrawn together under the same unique owner. */
            if (this.ids.get(descriptor.id) === entry)
                this.ids.delete(descriptor.id);
            removed.push(endpoint);
        }
        for (var _a = 0, removed_1 = removed; _a < removed_1.length; _a++) {
            var endpoint = removed_1[_a];
            this.changes.emit({ kind: this.kind, key: endpoint });
        }
    };
    DescriptorStore.prototype.get = function (endpoint) {
        var _a;
        return (_a = this.entries.get(endpoint)) === null || _a === void 0 ? void 0 : _a.descriptor;
    };
    DescriptorStore.prototype.hasSeen = function (endpoint) {
        return this.history.has(endpoint);
    };
    DescriptorStore.prototype.list = function () {
        return __spreadArray([], this.entries.values(), true).map(function (entry) { return entry.descriptor; });
    };
    DescriptorStore.prototype.subscribe = function (ctx, listener) {
        return this.changes.subscribe(ctx, listener);
    };
    return DescriptorStore;
}());
var RemoteStore = /** @class */ (function () {
    function RemoteStore(descriptors) {
        this.descriptors = descriptors;
        this.packages = new Map();
    }
    RemoteStore.prototype.view = function (ctx) {
        var _this = this;
        return {
            register: function (contribution) { return _this.register(ctx, contribution); },
            get: function (endpoint) { return _this.descriptors.get(endpoint); },
            list: function () { return _this.descriptors.list(); },
            subscribe: function (listener) { return _this.descriptors.subscribe(ctx, listener); },
        };
    };
    RemoteStore.prototype.register = function (ctx, contribution) {
        validateSegment('Remote package name', contribution.package);
        if (this.packages.has(contribution.package)) {
            throw new Error("typert: Remote package \"".concat(contribution.package, "\" is already registered"));
        }
        this.descriptors.validate(contribution.descriptors);
        var owner = {};
        var _a = this, packages = _a.packages, descriptors = _a.descriptors;
        return ctx.effect(function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        packages.set(contribution.package, owner);
                        descriptors.commit(owner, contribution.descriptors);
                        return [4 /*yield*/, function () {
                                /* v8 ignore else -- duplicate package registration is rejected, so this effect remains the package's unique owner. */
                                if (packages.get(contribution.package) === owner)
                                    packages.delete(contribution.package);
                                descriptors.withdraw(owner, contribution.descriptors);
                            }];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }, "typert.remotes.register(".concat(JSON.stringify(contribution.package), ")"));
    };
    return RemoteStore;
}());
var LookupStore = /** @class */ (function () {
    function LookupStore(report) {
        this.providers = new Map();
        this.resolvers = new Map();
        this.definitions = new Map();
        this.changes = new ChangeSource(report);
    }
    LookupStore.prototype.view = function (ctx) {
        var _this = this;
        return {
            register: function (key, provider) { return _this.register(ctx, key, provider); },
            configure: function (key, resolver) { return _this.configure(ctx, key, resolver); },
            get: function (key) { return _this.get(key); },
            definitions: function () { return __spreadArray([], _this.definitions.values(), true); },
            keys: function () { return __spreadArray([], _this.providers.keys(), true); },
            subscribe: function (listener) { return _this.changes.subscribe(ctx, listener); },
        };
    };
    LookupStore.prototype.get = function (key) {
        var _a, _b;
        var provider = (_a = this.providers.get(key)) === null || _a === void 0 ? void 0 : _a.provider;
        if (provider === undefined)
            return undefined;
        var resolver = (_b = this.resolvers.get(key)) === null || _b === void 0 ? void 0 : _b.provider;
        if (resolver === undefined)
            return provider;
        return {
            parameter: provider.parameter,
            wire: provider.wire,
            hostTypeSymbol: provider.hostTypeSymbol,
            wireTypeSymbol: provider.wireTypeSymbol,
            resolve: function (id) { return resolver.resolve(id); },
        };
    };
    LookupStore.prototype.configure = function (ctx, key, resolver) {
        var _this = this;
        validateSegment('lookup key', key);
        if (this.resolvers.has(key))
            throw new Error("typert: lookup \"".concat(key, "\" resolver is already configured"));
        var owner = {};
        // The map erases each merge-declared Wire type; restore it only at the
        // typed configure() boundary so strict function variance remains sound.
        var entry = {
            provider: { resolve: function (id) { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
                    return [2 /*return*/, resolver(id)];
                }); }); } },
            owner: owner,
        };
        var _a = this, resolvers = _a.resolvers, changes = _a.changes;
        return ctx.effect(function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        resolvers.set(key, entry);
                        changes.emit({ kind: 'lookup', key: key });
                        return [4 /*yield*/, function () {
                                /* v8 ignore next -- duplicate configuration is rejected, so this effect remains the key's unique owner. */
                                if (resolvers.get(key) !== entry)
                                    return;
                                resolvers.delete(key);
                                changes.emit({ kind: 'lookup', key: key });
                            }];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }, "typert.lookups.configure(".concat(JSON.stringify(key), ")"));
    };
    LookupStore.prototype.register = function (ctx, key, provider) {
        validateSegment('lookup key', key);
        validateSegment('lookup parameter', provider.parameter);
        validateWireName('lookup wire field', provider.wire);
        validateNonempty('lookup Host type symbol', provider.hostTypeSymbol);
        validateNonempty('lookup wire type symbol', provider.wireTypeSymbol);
        if (this.providers.has(key))
            throw new Error("typert: lookup \"".concat(key, "\" is already registered"));
        var definition = {
            key: key,
            parameter: provider.parameter,
            wire: provider.wire,
            hostTypeSymbol: provider.hostTypeSymbol,
            wireTypeSymbol: provider.wireTypeSymbol,
        };
        var known = this.definitions.get(key);
        if (known !== undefined && !lookupDefinitionEquals(known, definition)) {
            throw new Error("typert: lookup \"".concat(key, "\" changed its wire declaration during this registry lifetime"));
        }
        var owner = {};
        var entry = { provider: provider, owner: owner };
        var _a = this, definitions = _a.definitions, providers = _a.providers, changes = _a.changes;
        return ctx.effect(function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        definitions.set(key, definition);
                        providers.set(key, entry);
                        changes.emit({ kind: 'lookup', key: key });
                        return [4 /*yield*/, function () {
                                /* v8 ignore next -- duplicate registration is rejected, so this effect remains the key's unique owner. */
                                if (providers.get(key) !== entry)
                                    return;
                                providers.delete(key);
                                changes.emit({ kind: 'lookup', key: key });
                            }];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }, "typert.lookups.register(".concat(JSON.stringify(key), ")"));
    };
    return LookupStore;
}());
function lookupDefinitionEquals(left, right) {
    return left.parameter === right.parameter
        && left.wire === right.wire
        && left.hostTypeSymbol === right.hostTypeSymbol
        && left.wireTypeSymbol === right.wireTypeSymbol;
}
var ContextStore = /** @class */ (function () {
    function ContextStore(report) {
        this.hosts = new Map();
        this.hostResolvers = new Map();
        this.clients = new Map();
        this.changes = new ChangeSource(report);
    }
    ContextStore.prototype.view = function (ctx) {
        var _this = this;
        return {
            registerHost: function (key, provider) { return _this.registerHost(ctx, key, provider); },
            configureHost: function (key, resolver) { return _this.configureHost(ctx, key, resolver); },
            registerClient: function (key, binder) { return _this.registerClient(ctx, key, binder); },
            getHost: function (key) { return _this.getHost(key); },
            getClient: function (key) { var _a; return (_a = _this.clients.get(key)) === null || _a === void 0 ? void 0 : _a.provider; },
            subscribe: function (listener) { return _this.changes.subscribe(ctx, listener); },
        };
    };
    ContextStore.prototype.getHost = function (key) {
        var _a, _b;
        var provider = (_a = this.hosts.get(key)) === null || _a === void 0 ? void 0 : _a.provider;
        if (provider === undefined)
            return undefined;
        var resolver = (_b = this.hostResolvers.get(key)) === null || _b === void 0 ? void 0 : _b.provider;
        if (resolver === undefined)
            return provider;
        return {
            wire: provider.wire,
            wireTypeSymbol: provider.wireTypeSymbol,
            resolve: function (id) { return resolver.resolve(id); },
        };
    };
    ContextStore.prototype.configureHost = function (ctx, key, resolver) {
        var _this = this;
        validateSegment('Context key', key);
        if (this.hostResolvers.has(key))
            throw new Error("typert: host-context \"".concat(key, "\" resolver is already configured"));
        var entry = {
            provider: { resolve: function (id) { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
                    return [2 /*return*/, resolver(id)];
                }); }); } },
            owner: {},
        };
        var _a = this, hostResolvers = _a.hostResolvers, changes = _a.changes;
        return ctx.effect(function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        hostResolvers.set(key, entry);
                        changes.emit({ kind: 'host-context', key: key });
                        return [4 /*yield*/, function () {
                                /* v8 ignore next -- duplicate configuration is rejected, so this effect remains the key's unique owner. */
                                if (hostResolvers.get(key) !== entry)
                                    return;
                                hostResolvers.delete(key);
                                changes.emit({ kind: 'host-context', key: key });
                            }];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }, "typert.contexts.configureHost(".concat(JSON.stringify(key), ")"));
    };
    ContextStore.prototype.registerHost = function (ctx, key, provider) {
        validateSegment('Context key', key);
        validateWireName('Context wire field', provider.wire);
        validateNonempty('Context wire type symbol', provider.wireTypeSymbol);
        return this.registerProvider(ctx, this.hosts, 'host-context', key, provider);
    };
    ContextStore.prototype.registerClient = function (ctx, key, binder) {
        validateSegment('Context key', key);
        return this.registerProvider(ctx, this.clients, 'client-context', key, binder);
    };
    ContextStore.prototype.registerProvider = function (ctx, table, kind, key, provider) {
        if (table.has(key))
            throw new Error("typert: ".concat(kind, " provider \"").concat(key, "\" is already registered"));
        var entry = { provider: provider, owner: {} };
        var changes = this.changes;
        return ctx.effect(function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        table.set(key, entry);
                        changes.emit({ kind: kind, key: key });
                        return [4 /*yield*/, function () {
                                /* v8 ignore next -- duplicate registration is rejected, so this effect remains the key's unique owner. */
                                if (table.get(key) !== entry)
                                    return;
                                table.delete(key);
                                changes.emit({ kind: kind, key: key });
                            }];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }, "typert.contexts.register(".concat(JSON.stringify(key), ")"));
    };
    return ContextStore;
}());
/**
 * Registry of generated schemas, package reflection, invocations, and Remote
 * dependency providers.
 * @typert service typert
 */
var TypertRegistry = /** @class */ (function (_super) {
    __extends(TypertRegistry, _super);
    function TypertRegistry(ctx) {
        var _this = _super.call(this, ctx, 'typert') || this;
        _this.schemas = new Map();
        _this.packages = new Map();
        var report = function (change, error) {
            ctx.logger.warn("typert: ".concat(change.kind, " observer for \"").concat(change.key, "\" failed"));
            ctx.logger.warn(error);
        };
        _this.localStore = new DescriptorStore('local', report);
        _this.remoteStore = new RemoteStore(new DescriptorStore('remote', report));
        _this.lookupStore = new LookupStore(report);
        _this.contextStore = new ContextStore(report);
        return _this;
    }
    Object.defineProperty(TypertRegistry.prototype, "local", {
        /** Current-environment invocation definitions. */
        get: function () {
            var _this = this;
            var ctx = this.ctx;
            return {
                get: function (endpoint) { return _this.localStore.get(endpoint); },
                hasSeen: function (endpoint) { return _this.localStore.hasSeen(endpoint); },
                list: function () { return _this.localStore.list(); },
                subscribe: function (listener) { return _this.localStore.subscribe(ctx, listener); },
            };
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(TypertRegistry.prototype, "remotes", {
        /** Consumer-selected Remote definitions. */
        get: function () {
            return this.remoteStore.view(this.ctx);
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(TypertRegistry.prototype, "lookups", {
        /** Host object lookup providers. */
        get: function () {
            return this.lookupStore.view(this.ctx);
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(TypertRegistry.prototype, "contexts", {
        /** Host Context providers and Client Context binders. */
        get: function () {
            return this.contextStore.view(this.ctx);
        },
        enumerable: false,
        configurable: true
    });
    /**
     * Register one generated contribution atomically for the calling fiber.
     * Duplicate package-face identities, schemas, invocation ids, or endpoints
     * reject the whole batch.
     * @param contribution - generated schemas, reflection, and Host invocations.
     * @returns the exact effect disposer that removes this contribution.
     */
    TypertRegistry.prototype.register = function (contribution) {
        var packageRecord = this.validatePackage(contribution);
        var schemaRecords = this.validateSchemas(contribution);
        var invocations = contribution.invocations;
        this.localStore.validate(invocations);
        var owner = {};
        var _a = this, schemas = _a.schemas, packages = _a.packages, localStore = _a.localStore;
        return this.ctx.effect(function () {
            var _i, schemaRecords_1, record;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        packages.set(packageRecord.key, packageRecord);
                        for (_i = 0, schemaRecords_1 = schemaRecords; _i < schemaRecords_1.length; _i++) {
                            record = schemaRecords_1[_i];
                            schemas.set(record.key, record);
                        }
                        localStore.commit(owner, invocations);
                        return [4 /*yield*/, function () {
                                /* v8 ignore else -- duplicate package-face registration is rejected, so this effect remains its unique owner. */
                                if (packages.get(packageRecord.key) === packageRecord)
                                    packages.delete(packageRecord.key);
                                for (var _i = 0, schemaRecords_2 = schemaRecords; _i < schemaRecords_2.length; _i++) {
                                    var record = schemaRecords_2[_i];
                                    /* v8 ignore else -- duplicate schema registration is rejected, so this contribution remains each record's unique owner. */
                                    if (schemas.get(record.key) === record)
                                        schemas.delete(record.key);
                                }
                                localStore.withdraw(owner, invocations);
                            }];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }, 'typert.register()');
    };
    /**
     * Look up one schema by `<package>#<name>`.
     * @param key - global schema key.
     * @returns the live schema record, or `undefined` when absent.
     */
    TypertRegistry.prototype.get = function (key) {
        return this.schemas.get(key);
    };
    /**
     * Resolve one required schema.
     * @param key - global schema key.
     * @returns the live schema record.
     * @throws when the key is malformed, the package face is absent, or the schema is not contributed.
     */
    TypertRegistry.prototype.resolve = function (key) {
        var record = this.schemas.get(key);
        if (record !== undefined)
            return record;
        var hash = key.indexOf('#');
        if (hash <= 0 || hash === key.length - 1) {
            throw new Error("typert: invalid schema key \"".concat(key, "\" \u2014 expected \"<package>#<name>\""));
        }
        var packageName = key.slice(0, hash);
        if (__spreadArray([], this.packages.values(), true).some(function (candidate) { return candidate.package === packageName; })) {
            throw new Error("typert: cannot resolve \"".concat(key, "\" \u2014 package \"").concat(packageName, "\" is registered but contributes no schema named \"").concat(key.slice(hash + 1), "\""));
        }
        throw new Error("typert: cannot resolve \"".concat(key, "\" \u2014 package \"").concat(packageName, "\" has no registered contribution"));
    };
    /**
     * Enumerate live schemas in registration order.
     * @param filter - optional package and face restriction.
     * @returns matching schema records.
     */
    TypertRegistry.prototype.list = function (filter) {
        if (filter === void 0) { filter = {}; }
        return __spreadArray([], this.schemas.values(), true).filter(function (record) { return matches(record, filter); });
    };
    /**
     * Look up generated reflection for one package face.
     * @param packageName - exact npm package name.
     * @param face - face to query; defaults to the host runtime.
     * @returns the live package record, or `undefined` when absent.
     */
    TypertRegistry.prototype.getPackage = function (packageName, face) {
        if (face === void 0) { face = 'host'; }
        return this.packages.get(typertPackageKey(packageName, face));
    };
    /**
     * Enumerate generated package reflection in registration order.
     * @param filter - optional package and face restriction.
     * @returns matching package records.
     */
    TypertRegistry.prototype.listPackages = function (filter) {
        if (filter === void 0) { filter = {}; }
        return __spreadArray([], this.packages.values(), true).filter(function (record) { return matches(record, filter); });
    };
    /**
     * Project a live Zod schema to JSON Schema without caching the result.
     * @param key - global schema key.
     * @param params - Zod projection parameters.
     * @returns a fresh JSON Schema document.
     */
    TypertRegistry.prototype.toJSONSchema = function (key, params) {
        return zod_1.z.toJSONSchema(this.resolve(key).schema, params);
    };
    TypertRegistry.prototype.validatePackage = function (contribution) {
        validateSegment('package name', contribution.package);
        var face = contribution.face;
        if (face !== 'host' && face !== 'client') {
            throw new Error("typert: invalid face ".concat(JSON.stringify(face), " \u2014 expected \"host\" or \"client\""));
        }
        var key = typertPackageKey(contribution.package, contribution.face);
        if (this.packages.has(key)) {
            throw new Error("typert: package face \"".concat(key, "\" is already registered"));
        }
        return {
            package: contribution.package,
            face: face,
            key: key,
            model: contribution.model,
        };
    };
    TypertRegistry.prototype.validateSchemas = function (contribution) {
        var records = [];
        var batch = new Set();
        for (var _i = 0, _a = contribution.schemas; _i < _a.length; _i++) {
            var schema = _a[_i];
            validateSegment('schema name', schema.name);
            var key = typertKey(contribution.package, schema.name);
            if (batch.has(key) || this.schemas.has(key)) {
                throw new Error("typert: schema \"".concat(key, "\" is already registered"));
            }
            batch.add(key);
            records.push(__assign(__assign({}, schema), { package: contribution.package, face: contribution.face, key: key }));
        }
        return records;
    };
    return TypertRegistry;
}(cordis_1.Service));
exports.TypertRegistry = TypertRegistry;
function matches(record, filter) {
    return (filter.package === undefined || record.package === filter.package)
        && (filter.face === undefined || record.face === filter.face);
}
function validateInvocation(descriptor) {
    validateNonempty('invocation id', descriptor.id);
    validateSegment('invocation service key', descriptor.service);
    validateWireName('invocation namespace', descriptor.namespace);
    validateWireName('invocation method', descriptor.method);
    if (descriptor.implementation !== undefined) {
        validateWireName('invocation implementation method', descriptor.implementation);
    }
    validateCodec(descriptor.result, "".concat(descriptor.id, " result"));
    var wires = new Set();
    for (var _i = 0, _a = descriptor.parameters; _i < _a.length; _i++) {
        var parameter = _a[_i];
        validateWireName('parameter name', parameter.name);
        validateWireName('parameter wire field', parameter.wire);
        if (wires.has(parameter.wire)) {
            throw new Error("typert: invocation \"".concat(descriptor.id, "\" repeats wire field \"").concat(parameter.wire, "\""));
        }
        wires.add(parameter.wire);
        if (parameter.source === 'lookup') {
            if (parameter.acceptsUndefined !== undefined) {
                throw new Error("typert: invocation \"".concat(descriptor.id, "\" lookup parameter \"").concat(parameter.name, "\" cannot accept undefined"));
            }
            if (parameter.lookup === undefined) {
                throw new Error("typert: invocation \"".concat(descriptor.id, "\" lookup parameter \"").concat(parameter.name, "\" has no lookup key"));
            }
            validateSegment('lookup key', parameter.lookup);
        }
        else if (parameter.lookup !== undefined) {
            throw new Error("typert: invocation \"".concat(descriptor.id, "\" JSON parameter \"").concat(parameter.name, "\" declares a lookup key"));
        }
        validateCodec(parameter.codec, "".concat(descriptor.id, " parameter ").concat(parameter.name));
    }
    var cancellation = descriptor.cancellation;
    if (cancellation !== undefined && cancellation.parameter !== 'signal') {
        throw new Error("typert: invocation \"".concat(descriptor.id, "\" cancellation parameter must be \"signal\""));
    }
    if (descriptor.scope !== undefined) {
        if (descriptor.invocation.kind !== 'direct') {
            throw new Error("typert: invocation \"".concat(descriptor.id, "\" Context receiver cannot declare a direct scope projection"));
        }
        validateSegment('scope Context key', descriptor.scope.context);
        validateWireName('scope wire field', descriptor.scope.wire);
        var lookups = descriptor.parameters.filter(function (candidate) { return candidate.source === 'lookup'; });
        var parameter = lookups.length === 1 ? lookups[0] : undefined;
        if (parameter === undefined || parameter.wire !== descriptor.scope.wire
            || parameter.lookup !== descriptor.scope.context) {
            throw new Error("typert: invocation \"".concat(descriptor.id, "\" scope wire \"").concat(descriptor.scope.wire, "\" must select its only lookup parameter"));
        }
    }
    if (descriptor.invocation.kind === 'context') {
        validateSegment('Context key', descriptor.invocation.context);
        validateWireName('Context wire field', descriptor.invocation.wire);
        if (wires.has(descriptor.invocation.wire)) {
            throw new Error("typert: invocation \"".concat(descriptor.id, "\" repeats wire field \"").concat(descriptor.invocation.wire, "\""));
        }
        validateCodec(descriptor.invocation.codec, "".concat(descriptor.id, " Context"));
    }
}
function validateCodec(codec, subject) {
    if (codec.mode === 'src-json')
        return;
    validateNonempty("".concat(subject, " type symbol"), codec.typeSymbol);
    if (typeof codec.schema.parse !== 'function') {
        throw new Error("typert: ".concat(subject, " strict codec has no parse() method"));
    }
}
function validateWireName(subject, value) {
    if (value === '.' || value === '..' || !/^[A-Za-z0-9_$.-]+$/.test(value)) {
        throw new Error("typert: invalid ".concat(subject, " \"").concat(value, "\" \u2014 must contain only RPC endpoint segment characters"));
    }
}
function validateSegment(subject, value) {
    if (value.length === 0 || value.includes('#')) {
        throw new Error("typert: invalid ".concat(subject, " \"").concat(value, "\" \u2014 must be nonempty and must not contain \"#\""));
    }
}
function validateNonempty(subject, value) {
    if (value.length === 0)
        throw new Error("typert: invalid ".concat(subject, " \u2014 must be nonempty"));
}
exports.default = TypertRegistry;
