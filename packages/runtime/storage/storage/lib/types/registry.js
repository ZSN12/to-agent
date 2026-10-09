"use strict";
/**
 * Named backend registry of the storage hub.
 * @module @z/dsh-storage/src/registry
 */
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
exports.BackendRegistry = void 0;
var error_ts_1 = require("./error.ts");
/**
 * Mutable name → backend table. Multiple backends stay mounted side by side;
 * which backend serves which consumer is the consumer's configuration
 * (e.g. the domain layer's route table), never a hub-global choice.
 */
var BackendRegistry = /** @class */ (function () {
    function BackendRegistry() {
        this.backends = new Map();
    }
    /**
     * Register a named backend. Registration is an effect: the returned
     * disposer removes the name. Disposal does NOT close the backend — the
     * owning plugin closes it after unregistering.
     * @param name - Backend name, e.g. `json` or `sqlite`.
     * @param backend - The backend instance.
     * @returns the disposer that unregisters the name.
     */
    BackendRegistry.prototype.register = function (name, backend) {
        var _this = this;
        if (this.backends.has(name)) {
            throw new error_ts_1.StorageError('duplicate-backend', "storage backend '".concat(name, "' is already registered"));
        }
        this.backends.set(name, backend);
        return function () {
            // Remove only this registration's contribution: after dispose + re-register,
            // a stale disposer firing again must not remove the successor.
            if (_this.backends.get(name) === backend) {
                _this.backends.delete(name);
            }
        };
    };
    /**
     * Resolve a backend by name.
     * @param name - Registered backend name.
     * @returns the backend.
     */
    BackendRegistry.prototype.get = function (name) {
        var backend = this.backends.get(name);
        if (!backend) {
            throw new error_ts_1.StorageError('backend-not-found', "storage backend '".concat(name, "' is not registered (registered: ").concat(__spreadArray([], this.backends.keys(), true).join(', ') || 'none', ")"));
        }
        return backend;
    };
    /**
     * Registered backend names, for diagnostics.
     * @returns a snapshot array of names.
     */
    BackendRegistry.prototype.names = function () {
        return __spreadArray([], this.backends.keys(), true);
    };
    return BackendRegistry;
}());
exports.BackendRegistry = BackendRegistry;
