"use strict";
/**
 * Error vocabulary of the domain data form.
 * @module @z/dsh-storage-domain/src/error
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
exports.DomainError = void 0;
/**
 * Error thrown by the domain layer. The `code` is the stable contract
 * consumers may switch on; `message` is diagnostic prose. Backend failures
 * (`backend-not-found`, `version-mismatch`, …) pass through as
 * `StorageError` — the domain layer does not rewrap them.
 */
var DomainError = /** @class */ (function (_super) {
    __extends(DomainError, _super);
    /**
     * @param code - Stable discriminant for the failure class.
     * @param message - Human-readable diagnostic detail.
     * @param options - Standard error options plus the `invalid-record` location.
     */
    function DomainError(code, message, options) {
        var _this = _super.call(this, message, options) || this;
        _this.code = code;
        _this.name = 'DomainError';
        if (options === null || options === void 0 ? void 0 : options.detail)
            _this.detail = options.detail;
        return _this;
    }
    return DomainError;
}(Error));
exports.DomainError = DomainError;
