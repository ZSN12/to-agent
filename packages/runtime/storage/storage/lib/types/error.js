"use strict";
/**
 * Error vocabulary for the storage hub and its backends.
 * @module @z/dsh-storage/src/error
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
exports.StorageError = void 0;
/**
 * Error thrown by the hub and by backend implementations. The `code` is the
 * stable contract consumers may switch on; `message` is diagnostic prose.
 */
var StorageError = /** @class */ (function (_super) {
    __extends(StorageError, _super);
    /**
     * @param code - Stable discriminant for the failure class.
     * @param message - Human-readable diagnostic detail.
     * @param options - Standard error options (`cause`).
     */
    function StorageError(code, message, options) {
        var _this = _super.call(this, message, options) || this;
        _this.code = code;
        _this.name = 'StorageError';
        return _this;
    }
    return StorageError;
}(Error));
exports.StorageError = StorageError;
