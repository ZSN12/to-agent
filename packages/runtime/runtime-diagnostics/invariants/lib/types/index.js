"use strict";
/**
 * Configurable registry for package-owned runtime invariant contributions.
 * Every workspace package registers checks from a `./invariant` companion;
 * ordinary package entrypoints stay independent of diagnostics.
 *
 * @module @z/dsh-invariants
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.InvariantRegistry = exports.InvariantError = void 0;
var cordis_1 = require("@z/cordis");
var schemastery_1 = require("@z/schemastery");
/** Thrown when a package-owned runtime invariant is violated. */
var InvariantError = /** @class */ (function (_super) {
    __extends(InvariantError, _super);
    /**
     * Construct a package-attributed invariant failure.
     * @param packageName - full npm package name that registered the check.
     * @param message - violated contract, without the standard error prefix.
     */
    function InvariantError(packageName, message) {
        var _this = _super.call(this, "invariant violated by \"".concat(packageName, "\": ").concat(message)) || this;
        /** Stable machine-readable invariant failure code. */
        _this.code = 'INVARIANT';
        _this.name = 'InvariantError';
        _this.packageName = packageName;
        return _this;
    }
    return InvariantError;
}(Error));
exports.InvariantError = InvariantError;
/** Compile and validate one package-filter list. */
function compilePatterns(field, values) {
    var seen = new Set();
    return values.map(function (value) {
        if (value.length === 0 || value.trim() !== value) {
            throw new Error("invariants: ".concat(field, " entries must be non-blank and have no surrounding whitespace"));
        }
        if (seen.has(value)) {
            throw new Error("invariants: ".concat(field, " contains duplicate regex ").concat(JSON.stringify(value)));
        }
        seen.add(value);
        try {
            return new RegExp(value);
        }
        catch (cause) {
            throw new Error("invariants: ".concat(field, " contains invalid regex ").concat(JSON.stringify(value)), { cause: cause });
        }
    });
}
/** Package-owned invariant registry with global and regex-based selection. */
var InvariantRegistry = /** @class */ (function (_super) {
    __extends(InvariantRegistry, _super);
    /**
     * Create and install the invariant registry.
     * @param ctx - Cordis context that owns the service.
     * @param config - global enablement and package-name regex filters.
     */
    function InvariantRegistry(ctx, config) {
        if (config === void 0) { config = {}; }
        var _a, _b, _c;
        var _this = _super.call(this, ctx, 'invariants') || this;
        _this.registrations = new Set();
        _this.ownerCtx = ctx;
        _this.enabled = (_a = config.enabled) !== null && _a !== void 0 ? _a : true;
        _this.packageAllowlist = compilePatterns('package_allowlist', (_b = config.package_allowlist) !== null && _b !== void 0 ? _b : []);
        _this.packageBlocklist = compilePatterns('package_blocklist', (_c = config.package_blocklist) !== null && _c !== void 0 ? _c : []);
        return _this;
    }
    /** Return whether one full package name passes the configured filters. */
    InvariantRegistry.prototype.selected = function (packageName) {
        if (!this.enabled)
            return false;
        if (this.packageAllowlist.length > 0
            && !this.packageAllowlist.some(function (pattern) { return pattern.test(packageName); }))
            return false;
        return !this.packageBlocklist.some(function (pattern) { return pattern.test(packageName); });
    };
    /**
     * Register one package's invariant installer. The package name is reserved
     * even when filtering disables its checks. Enabled installers run in a child
     * fiber; failure disposes that fiber and releases the reservation.
     * @param packageName - full npm package name that owns the contribution.
     * @param installer - listener or startup-check installer for the child context.
     * @returns an effect-scoped disposer for the registration.
     */
    InvariantRegistry.prototype.register = function (packageName, installer) {
        var _this = this;
        if (packageName.length === 0 || packageName.trim() !== packageName || /\s/.test(packageName)) {
            throw new Error('invariants: packageName must be non-blank and contain no whitespace');
        }
        if (this.registrations.has(packageName)) {
            throw new Error("invariants: package \"".concat(packageName, "\" is already registered"));
        }
        // Service method tracing binds `this.ctx` to the caller. This explicit
        // origin keeps registrations and their child fibers owned by the service;
        // companion disposal is covered independently by the returned disposer.
        var ctx = this.ownerCtx;
        var registrations = this.registrations;
        registrations.add(packageName);
        var registration;
        try {
            registration = ctx.effect(function () { return __awaiter(_this, void 0, void 0, function () {
                var installInvariant, child_1, error_1, error_2;
                var _this = this;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            if (!this.selected(packageName)) {
                                return [2 /*return*/, function () {
                                        registrations.delete(packageName);
                                    }];
                            }
                            installInvariant = function (childCtx) { return (installer(childCtx, function (message) {
                                throw new InvariantError(packageName, message);
                            })); };
                            _a.label = 1;
                        case 1:
                            _a.trys.push([1, 7, , 8]);
                            child_1 = ctx.plugin(installer.inject === undefined
                                ? installInvariant
                                : Object.assign(installInvariant, { inject: installer.inject }));
                            _a.label = 2;
                        case 2:
                            _a.trys.push([2, 4, , 6]);
                            return [4 /*yield*/, child_1];
                        case 3:
                            _a.sent();
                            return [3 /*break*/, 6];
                        case 4:
                            error_1 = _a.sent();
                            return [4 /*yield*/, child_1.dispose()];
                        case 5:
                            _a.sent();
                            throw error_1;
                        case 6: return [2 /*return*/, function () { return __awaiter(_this, void 0, void 0, function () {
                                return __generator(this, function (_a) {
                                    switch (_a.label) {
                                        case 0:
                                            _a.trys.push([0, , 2, 3]);
                                            return [4 /*yield*/, child_1.dispose()];
                                        case 1:
                                            _a.sent();
                                            return [3 /*break*/, 3];
                                        case 2:
                                            registrations.delete(packageName);
                                            return [7 /*endfinally*/];
                                        case 3: return [2 /*return*/];
                                    }
                                });
                            }); }];
                        case 7:
                            error_2 = _a.sent();
                            registrations.delete(packageName);
                            throw error_2;
                        case 8: return [2 /*return*/];
                    }
                });
            }); }, "invariants.register(".concat(JSON.stringify(packageName), ")"));
        }
        catch (error) {
            registrations.delete(packageName);
            throw error;
        }
        // Cordis attaches setup thenability and async teardown to this callable;
        // the service contract intentionally exposes only the conventional disposer.
        // oxlint-disable-next-line typescript/no-misused-promises -- the extra runtime shape stays private.
        return registration;
    };
    InvariantRegistry.Config = schemastery_1.default.object({
        enabled: schemastery_1.default.boolean().default(true),
        package_allowlist: schemastery_1.default.array(schemastery_1.default.string()).default([]),
        package_blocklist: schemastery_1.default.array(schemastery_1.default.string()).default([]),
    });
    return InvariantRegistry;
}(cordis_1.Service));
exports.InvariantRegistry = InvariantRegistry;
exports.default = InvariantRegistry;
