"use strict";
/**
 * Domain data form (`ctx.storage.domain`): schema-validated, change-emitting
 * KV domains over storage backends. The single implementation of the domain
 * layer — consumers depend on this package and never touch backends directly.
 * Plugin `Config` is schemastery; record schemas inside domain specs are zod
 * (see `src/spec.ts` for the split rationale).
 * @module @z/dsh-storage-domain
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
exports.DomainFacility = exports.Config = exports.inject = exports.name = exports.descriptorOf = exports.domainTable = exports.defineDomain = exports.DomainError = void 0;
exports.apply = apply;
var schemastery_1 = require("@z/schemastery");
var dsh_storage_1 = require("@z/dsh-storage");
var error_ts_1 = require("./error.ts");
var spec_ts_1 = require("./spec.ts");
var domain_ts_1 = require("./domain.ts");
var error_ts_2 = require("./error.ts");
Object.defineProperty(exports, "DomainError", { enumerable: true, get: function () { return error_ts_2.DomainError; } });
var spec_ts_2 = require("./spec.ts");
Object.defineProperty(exports, "defineDomain", { enumerable: true, get: function () { return spec_ts_2.defineDomain; } });
Object.defineProperty(exports, "domainTable", { enumerable: true, get: function () { return spec_ts_2.domainTable; } });
Object.defineProperty(exports, "descriptorOf", { enumerable: true, get: function () { return spec_ts_2.descriptorOf; } });
/** Cordis plugin name. */
exports.name = 'storage-domain';
/** The storage hub must be present before the form can mount. */
exports.inject = ['storage'];
exports.Config = schemastery_1.default.object({
    backend: schemastery_1.default.string().required(),
    routes: schemastery_1.default.dict(schemastery_1.default.string()).default({}),
});
/**
 * The mounted domain facility. Opens declared domains over routed backends;
 * one facility instance owns the open-domain table and enforces single-open
 * per domain name.
 */
var DomainFacility = /** @class */ (function () {
    /**
     * @param ctx - Context of the domain plugin; open-domain effects and change
     * events attach here.
     * @param config - Validated plugin config.
     */
    function DomainFacility(ctx, config) {
        this.ctx = ctx;
        this.config = config;
        this.domains = new Map();
        /** Names reserved by an in-flight or completed open, so concurrent opens of one name fail loud. */
        this.reserved = new Set();
    }
    /**
     * Open one declared domain. Steps, each failing the whole call: reject a
     * name that is already open (`already-open`); resolve the backend route
     * (`backend-not-found` passes through from the hub); require its `kv` facet
     * (`facet-unsupported`); open the unit projected from the spec (backend
     * `version-mismatch`/`malformed-medium` pass through); load and validate
     * every stored record against the spec's zod schemas (`invalid-record`
     * with the offending table and key); construct the domain.
     *
     * Lifecycle: the CALLER owns the returned handle and closes it via
     * `Domain.close()` (typically as its own `ctx.effect` disposer) — the
     * facility does not tie the domain to any consumer fiber. Domains still
     * open when the facility unmounts are closed by the plugin disposer.
     * @param spec - The domain declaration, typically from `defineDomain`.
     * @returns the opened domain handle, typed by the spec.
     */
    DomainFacility.prototype.open = function (spec) {
        return __awaiter(this, void 0, void 0, function () {
            var backendName, backend, unit, snapshot_1, tables, _loop_1, _i, _a, _b, table, tableSpec, globalSpec_1, globalValue, domain, error_1, error_2;
            var _this = this;
            var _c, _d, _e;
            return __generator(this, function (_f) {
                switch (_f.label) {
                    case 0:
                        if (this.reserved.has(spec.name)) {
                            throw new error_ts_1.DomainError('already-open', "domain '".concat(spec.name, "' is already open"));
                        }
                        this.reserved.add(spec.name);
                        _f.label = 1;
                    case 1:
                        _f.trys.push([1, 8, , 9]);
                        backendName = (_d = (_c = this.config.routes) === null || _c === void 0 ? void 0 : _c[spec.name]) !== null && _d !== void 0 ? _d : this.config.backend;
                        backend = this.ctx.storage.backend.get(backendName);
                        if (!backend.kv) {
                            throw new error_ts_1.DomainError('facet-unsupported', "backend '".concat(backendName, "' routed for domain '").concat(spec.name, "' has no kv facet"));
                        }
                        return [4 /*yield*/, backend.kv.open((0, spec_ts_1.descriptorOf)(spec))];
                    case 2:
                        unit = _f.sent();
                        _f.label = 3;
                    case 3:
                        _f.trys.push([3, 5, , 7]);
                        return [4 /*yield*/, unit.loadAll()];
                    case 4:
                        snapshot_1 = _f.sent();
                        tables = new Map();
                        _loop_1 = function (table, tableSpec) {
                            var records = new Map();
                            var _loop_2 = function (key, raw) {
                                records.set(key, parseRecord(spec.name, table, key, function () { return tableSpec.valueSchema.parse(raw); }));
                            };
                            for (var _g = 0, _h = Object.entries((_e = snapshot_1.tables[table]) !== null && _e !== void 0 ? _e : {}); _g < _h.length; _g++) {
                                var _j = _h[_g], key = _j[0], raw = _j[1];
                                _loop_2(key, raw);
                            }
                            tables.set(table, records);
                        };
                        for (_i = 0, _a = Object.entries(spec.tables); _i < _a.length; _i++) {
                            _b = _a[_i], table = _b[0], tableSpec = _b[1];
                            _loop_1(table, tableSpec);
                        }
                        globalSpec_1 = spec.global;
                        globalValue = globalSpec_1 === undefined
                            ? undefined
                            : snapshot_1.global === null
                                ? globalSpec_1.initial
                                : parseRecord(spec.name, '', '', function () { return globalSpec_1.schema.parse(snapshot_1.global); });
                        domain = new domain_ts_1.DomainImpl(this.ctx, spec, unit, tables, globalValue, function () {
                            _this.domains.delete(spec.name);
                            _this.reserved.delete(spec.name);
                        });
                        this.domains.set(spec.name, domain);
                        // The single type-erasure point: DomainImpl is the untyped runtime,
                        // Domain<S> the spec-typed view; the unknown hop is required because
                        // S's conditional global-handle type stays unresolved here.
                        return [2 /*return*/, domain];
                    case 5:
                        error_1 = _f.sent();
                        return [4 /*yield*/, unit.close()];
                    case 6:
                        _f.sent();
                        throw error_1;
                    case 7: return [3 /*break*/, 9];
                    case 8:
                        error_2 = _f.sent();
                        // Any failure means the domain never registered (nothing can throw
                        // after it), so releasing the name reservation is unconditional.
                        this.reserved.delete(spec.name);
                        throw error_2;
                    case 9: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Look up an open domain by name, untyped. Diagnostic surface (the package
     * invariant cross-checks change events against live domain state); typed
     * consumers hold the handle returned by {@link open}.
     * @param name - Domain name.
     * @returns the open domain runtime, or `undefined` when not open.
     */
    DomainFacility.prototype.get = function (name) {
        return this.domains.get(name);
    };
    /**
     * Close every domain still open on this facility. The unmount path for
     * consumers that never called `Domain.close()` themselves; closing is
     * idempotent, so double-closing an already-closed domain is harmless.
     * @returns resolution after every unit is released.
     */
    DomainFacility.prototype.closeAll = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, Promise.all(__spreadArray([], this.domains.values(), true).map(function (domain) { return domain.close(); }))];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    return DomainFacility;
}());
exports.DomainFacility = DomainFacility;
/** Run one zod parse, translating failure to `invalid-record` with its location. */
function parseRecord(domain, table, key, parse) {
    try {
        return parse();
    }
    catch (error) {
        var slot = table === '' ? 'global' : "record '".concat(key, "' in table '").concat(table, "'");
        throw new error_ts_1.DomainError('invalid-record', "domain '".concat(domain, "': stored ").concat(slot, " does not match its schema"), { detail: { table: table, key: key }, cause: error });
    }
}
/**
 * Mount the domain data form on the storage hub.
 * @param ctx - Plugin context.
 * @param config - Validated plugin config.
 * @returns resolution after an already-available backend set activates the form.
 */
function apply(ctx, config) {
    var _this = this;
    var _a;
    var backendServices = __spreadArray([], new Set(__spreadArray([
        config.backend
    ], Object.values((_a = config.routes) !== null && _a !== void 0 ? _a : {}), true)), true).map(dsh_storage_1.storageBackendServiceKey);
    var fiber = ctx.inject(backendServices, function (domainCtx) {
        var facility = new DomainFacility(domainCtx, config);
        domainCtx.effect(function () {
            var unmount = domainCtx.storage.mount('domain', facility);
            return function () { return __awaiter(_this, void 0, void 0, function () {
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: 
                        // Close leftovers before unmounting: draining writes still emit
                        // domain/changed, whose invariant resolves the facility through the hub.
                        return [4 /*yield*/, facility.closeAll()];
                        case 1:
                            // Close leftovers before unmounting: draining writes still emit
                            // domain/changed, whose invariant resolves the facility through the hub.
                            _a.sent();
                            unmount();
                            return [2 /*return*/];
                    }
                });
            }); };
        });
        domainCtx.provide('storageDomain', facility);
    });
    return Promise.resolve(fiber).then(function () { });
}
