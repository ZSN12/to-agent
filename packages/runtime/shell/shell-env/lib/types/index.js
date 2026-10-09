"use strict";
/**
 * Tool-independent shell environment plugin: owns the `ctx.shellEnv` registry of
 * trusted, per-execution `DSH_*` variables consumed by the model-facing shell
 * tools (`dsh-tool-bash`, `dsh-tool-pwsh`). Built-in shell facts are owned by
 * the registry itself while plugins can register additional, enumerable facts
 * with effect-scoped disposal.
 *
 * @module @z/dsh-shell-env
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
exports.ShellEnvRegistry = exports.Config = exports.inject = exports.name = void 0;
exports.apply = apply;
var cordis_1 = require("@z/cordis");
var schemastery_1 = require("@z/schemastery");
var dsh_shell_1 = require("@z/dsh-shell");
var dsh_home_paths_1 = require("@z/dsh-home-paths");
exports.name = 'shell-env';
exports.inject = [];
/** Runtime configuration schema for the shell-env plugin. */
exports.Config = schemastery_1.default.object({
    dshHome: schemastery_1.default.string(),
});
var DSH_SHELL_KEY = "".concat(dsh_shell_1.DSH_ENV_PREFIX, "SHELL");
var DSH_SESSION_ID_KEY = "".concat(dsh_shell_1.DSH_ENV_PREFIX, "SESSION_ID");
var DSH_SESSION_JSONL_KEY = "".concat(dsh_shell_1.DSH_ENV_PREFIX, "SESSION_JSONL");
var RESERVED_BASH_ENV_KEYS = new Set([
    dsh_home_paths_1.DSH_HOME_ENV,
    DSH_SHELL_KEY,
    DSH_SESSION_ID_KEY,
]);
var BASH_ENV_KEY_SUFFIX = /^[A-Z][A-Z0-9_]*$/;
/**
 * Registry (`ctx.shellEnv`) for trusted, per-execution `DSH_*` variables.
 * The namespace is rebuilt for every model shell call: ambient `DSH_*` values
 * are discarded by the executor, then the registry's current snapshot is
 * injected. Built-in shell facts remain owned by the registry itself while
 * plugins can register additional, enumerable facts with effect-scoped
 * disposal.
 */
var ShellEnvRegistry = /** @class */ (function (_super) {
    __extends(ShellEnvRegistry, _super);
    /**
     * Create and install the `ctx.shellEnv` service.
     * @param ctx - Cordis context that owns the service and registrations.
     * @param config - home-directory configuration for the built-in variables.
     */
    function ShellEnvRegistry(ctx, config) {
        if (config === void 0) { config = {}; }
        var _this = _super.call(this, ctx, 'shellEnv') || this;
        _this.contributors = new Map();
        _this.keyOwners = new Map();
        _this.dshHome = (0, dsh_home_paths_1.resolveDshHome)(config.dshHome);
        return _this;
    }
    /**
     * Register one environment contributor. Names and keys are unique; built-in
     * keys are reserved. Registration is disposed with the calling plugin fiber.
     * @param contributor - declared key ownership and per-execution resolver.
     * @returns the disposer that unregisters the contribution.
     */
    ShellEnvRegistry.prototype.register = function (contributor) {
        var dispose = this.ctx.effect(function () {
            var variables, _i, variables_1, _a, key, variable, owner, _b, variables_2, key;
            var _this = this;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        if (contributor.name.trim().length === 0) {
                            throw new Error('bash env contributor name must be non-empty');
                        }
                        if (this.contributors.has(contributor.name)) {
                            throw new Error("bash env contributor \"".concat(contributor.name, "\" is already registered"));
                        }
                        variables = Object.entries(contributor.variables);
                        for (_i = 0, variables_1 = variables; _i < variables_1.length; _i++) {
                            _a = variables_1[_i], key = _a[0], variable = _a[1];
                            if (!key.startsWith(dsh_shell_1.DSH_ENV_PREFIX)
                                || !BASH_ENV_KEY_SUFFIX.test(key.slice(dsh_shell_1.DSH_ENV_PREFIX.length))) {
                                throw new Error("bash env contributor \"".concat(contributor.name, "\" declared invalid key \"").concat(key, "\""));
                            }
                            if (RESERVED_BASH_ENV_KEYS.has(key)) {
                                throw new Error("bash env contributor \"".concat(contributor.name, "\" cannot own reserved key \"").concat(key, "\""));
                            }
                            if (variable.description.trim().length === 0) {
                                throw new Error("bash env contributor \"".concat(contributor.name, "\" must describe \"").concat(key, "\""));
                            }
                            owner = this.keyOwners.get(key);
                            if (owner !== undefined) {
                                throw new Error("bash env key \"".concat(key, "\" is already owned by contributor \"").concat(owner, "\"; contributor \"").concat(contributor.name, "\" cannot also own it"));
                            }
                        }
                        this.contributors.set(contributor.name, contributor);
                        for (_b = 0, variables_2 = variables; _b < variables_2.length; _b++) {
                            key = variables_2[_b][0];
                            this.keyOwners.set(key, contributor.name);
                        }
                        return [4 /*yield*/, function () {
                                _this.contributors.delete(contributor.name);
                                for (var _i = 0, variables_3 = variables; _i < variables_3.length; _i++) {
                                    var key = variables_3[_i][0];
                                    _this.keyOwners.delete(key);
                                }
                            }];
                    case 1:
                        _c.sent();
                        return [2 /*return*/];
                }
            });
        }.bind(this), 'bashEnv.register()');
        return function () { return void dispose(); };
    };
    /**
     * Build the trusted `DSH_*` snapshot for one shell tool execution.
     * @param execution - the current tool execution.
     * @returns an immutable environment overlay containing built-ins and current contributions.
     */
    ShellEnvRegistry.prototype.collect = function (execution) {
        var _a;
        var values = (_a = {},
            _a[dsh_home_paths_1.DSH_HOME_ENV] = this.dshHome,
            _a[DSH_SHELL_KEY] = '1',
            _a);
        if (execution.agent !== undefined) {
            values[DSH_SESSION_ID_KEY] = execution.agent.session.header.id;
        }
        for (var _i = 0, _b = __spreadArray([], this.contributors.values(), true).sort(function (left, right) { return left.name.localeCompare(right.name); }); _i < _b.length; _i++) {
            var contributor = _b[_i];
            var resolved = contributor.resolve(execution);
            for (var _c = 0, _d = Object.entries(resolved); _c < _d.length; _c++) {
                var _e = _d[_c], rawKey = _e[0], value = _e[1];
                var key = rawKey;
                if (!Object.hasOwn(contributor.variables, key)) {
                    throw new Error("bash env contributor \"".concat(contributor.name, "\" returned undeclared key \"").concat(key, "\""));
                }
                if (typeof value !== 'string') {
                    throw new Error("bash env contributor \"".concat(contributor.name, "\" returned a non-string value for \"").concat(key, "\""));
                }
                values[key] = value;
            }
        }
        return Object.freeze(Object.fromEntries(Object.entries(values).sort(function (_a, _b) {
            var left = _a[0];
            var right = _b[0];
            return left.localeCompare(right);
        })));
    };
    // TODO(bash-env-list-builtins): Include registry-owned built-ins before diagnostics,
    // prompt, or UI code treats list() as an exhaustive environment catalog.
    /**
     * Enumerate plugin-contributed variables without executing their resolvers.
     * @returns declarations sorted by environment variable name.
     */
    ShellEnvRegistry.prototype.list = function () {
        return __spreadArray([], this.contributors.values(), true).flatMap(function (contributor) { return Object.entries(contributor.variables).map(function (_a) {
            var key = _a[0], variable = _a[1];
            return ({
                contributor: contributor.name,
                description: variable.description,
                key: key,
            });
        }); })
            .sort(function (left, right) { return left.key.localeCompare(right.key); });
    };
    return ShellEnvRegistry;
}(cordis_1.Service));
exports.ShellEnvRegistry = ShellEnvRegistry;
/**
 * Load the shell-env plugin: register the `ctx.shellEnv` service and the
 * shell-agnostic persistence contributor (`DSH_SESSION_JSONL`).
 * @param ctx - Cordis context that owns the service and registrations.
 * @param config - home-directory configuration for the built-in variables.
 */
function apply(ctx, config) {
    var _a;
    if (config === void 0) { config = {}; }
    var registry = new ShellEnvRegistry(ctx, config);
    registry.register({
        name: 'session-persistence',
        variables: (_a = {},
            _a[DSH_SESSION_JSONL_KEY] = {
                description: 'Absolute target path of the current session JSONL when the active persistence backend provides one.',
            },
            _a),
        resolve: function (execution) {
            var _a;
            var _b;
            var agent = execution.agent;
            if (agent === undefined)
                return {};
            var location = (_b = ctx.get('sessionPersistence')) === null || _b === void 0 ? void 0 : _b.locate(agent.session.header);
            return (location === null || location === void 0 ? void 0 : location.kind) === 'jsonl' ? (_a = {}, _a[DSH_SESSION_JSONL_KEY] = location.path, _a) : {};
        },
    });
}
