"use strict";
/**
 * Filesystem Service Definition for one execution world. Backends own stable target
 * identity, process paths and file URIs, containment, text reads, decoding,
 * binary rejection, and atomic mutations. Read windows and
 * observed-state policy stay in consumer and policy plugins; `editText`
 * remains here so version check, literal match, and rewrite share one critical
 * section.
 * @module @z/dsh-fs
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
exports.FileSystem = exports.FsVersion = exports.FsTargetKey = exports.FsError = void 0;
var cordis_1 = require("@z/cordis");
var types_ts_1 = require("./types.ts");
Object.defineProperty(exports, "FsError", { enumerable: true, get: function () { return types_ts_1.FsError; } });
Object.defineProperty(exports, "FsTargetKey", { enumerable: true, get: function () { return types_ts_1.FsTargetKey; } });
Object.defineProperty(exports, "FsVersion", { enumerable: true, get: function () { return types_ts_1.FsVersion; } });
/**
 * Abstract filesystem provider. Targets must preserve identity across aliases;
 * reads expose regular UTF-8 text or typed errors, listings are stable and
 * content-free, and mutations are atomic. Optional guards add stale protection
 * without changing the unguarded provider contract.
 */
var FileSystem = /** @class */ (function (_super) {
    __extends(FileSystem, _super);
    function FileSystem(ctx) {
        return _super.call(this, ctx, 'fs') || this;
    }
    Object.defineProperty(FileSystem.prototype, "sandboxMode", {
        /**
         * The sandbox mode this backend enforces on mutations BY DEFAULT, or
         * `undefined` when it does not confine at all — the capability fact the tool
         * layer reads to advertise the escalation fields honestly (mirrors
         * `ShellExecutor.sandboxMode`). The base class and the bare local backend
         * report `undefined`; a sandboxing backend (`@z/dsh-fs-sandbox`)
         * overrides it with the deployment default. A session override may make the
         * effective mode narrower or wider, so strict escalation widening is checked
         * per call rather than encoded in this default-relative fact.
         * @returns the configured default mode of a sandboxing backend; `undefined`
         *   for a backend that never confines.
         */
        get: function () {
            return undefined;
        },
        enumerable: false,
        configurable: true
    });
    return FileSystem;
}(cordis_1.Service));
exports.FileSystem = FileSystem;
exports.default = FileSystem;
