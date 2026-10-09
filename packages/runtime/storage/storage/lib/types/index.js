"use strict";
/**
 * Storage hub (`ctx.storage`): a named backend registry plus mounted
 * data-form facilities. The hub itself performs no IO — backends own media,
 * data forms (the domain layer first) own semantics.
 * @module @z/dsh-storage
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.Storage = exports.UNIT_NAME_RE = exports.StorageError = exports.BackendRegistry = void 0;
exports.storageBackendServiceKey = storageBackendServiceKey;
var cordis_1 = require("@z/cordis");
var error_ts_1 = require("./error.ts");
var registry_ts_1 = require("./registry.ts");
var registry_ts_2 = require("./registry.ts");
Object.defineProperty(exports, "BackendRegistry", { enumerable: true, get: function () { return registry_ts_2.BackendRegistry; } });
var error_ts_2 = require("./error.ts");
Object.defineProperty(exports, "StorageError", { enumerable: true, get: function () { return error_ts_2.StorageError; } });
var backend_ts_1 = require("./backend.ts");
Object.defineProperty(exports, "UNIT_NAME_RE", { enumerable: true, get: function () { return backend_ts_1.UNIT_NAME_RE; } });
/**
 * Derive the Cordis lifecycle service that one named backend plugin provides.
 * Domain-form providers inject these keys so activation cannot race backend
 * registration even though callers continue resolving backends through the
 * storage registry.
 * @param name - Backend registry name.
 * @returns the corresponding lifecycle-only service key.
 */
function storageBackendServiceKey(name) {
    return "storage.backend.".concat(name);
}
/**
 * The storage hub service. Backends register under `backend`; data forms
 * mount under their `StorageForms` key and are reached as `ctx.storage.<form>`.
 */
var Storage = /** @class */ (function (_super) {
    __extends(Storage, _super);
    function Storage(ctx) {
        var _this = _super.call(this, ctx, 'storage') || this;
        /** Named backend table; multiple backends stay mounted side by side. */
        _this.backend = new registry_ts_1.BackendRegistry();
        _this.forms = new Map();
        return _this;
    }
    /**
     * Mount a data-form facility on the hub. Mounting is an effect: the
     * returned disposer unmounts the form.
     * @param form - Form key declared in {@link StorageForms}.
     * @param facility - The facility instance to expose.
     * @returns the disposer that unmounts the form.
     */
    Storage.prototype.mount = function (form, facility) {
        var _this = this;
        if (this.forms.has(form)) {
            throw new error_ts_1.StorageError('duplicate-mount', "storage form '".concat(String(form), "' is already mounted"));
        }
        this.forms.set(form, facility);
        return function () {
            // Same stale-disposer guard as BackendRegistry.register.
            if (_this.forms.get(form) === facility) {
                _this.forms.delete(form);
            }
        };
    };
    /**
     * Resolve a mounted data form.
     * @param form - Form key declared in {@link StorageForms}.
     * @returns the mounted facility.
     */
    Storage.prototype.form = function (form) {
        if (!this.forms.has(form)) {
            throw new error_ts_1.StorageError('form-not-mounted', "storage form '".concat(String(form), "' is not mounted"));
        }
        return this.forms.get(form);
    };
    Object.defineProperty(Storage.prototype, "domain", {
        /** Domain data form; present once the domain layer plugin is loaded. */
        get: function () {
            return this.form('domain');
        },
        enumerable: false,
        configurable: true
    });
    return Storage;
}(cordis_1.Service));
exports.Storage = Storage;
// Service packages default-export their service class and nothing else
// plugin-shaped (packages/AGENTS.md): mixing a default export with a
// function-plugin `apply` makes the Loader drop the plugin namespace.
exports.default = Storage;
