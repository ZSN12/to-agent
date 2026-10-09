"use strict";
/**
 * Fail-closed Win32 error type. Every backend API failure raises this with the
 * API name and the exact Win32 code; the original POC silently ignored every
 * failed call and would run children UNRESTRICTED (fail-open) — that is the
 * failure mode this class exists to prevent.
 * @module @z/dsh-sandbox-windows-acl/errors
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
exports.Win32Error = void 0;
var Win32Error = /** @class */ (function (_super) {
    __extends(Win32Error, _super);
    function Win32Error(api, win32Code, detail) {
        var _this = _super.call(this, "".concat(api, " failed (Win32 ").concat(win32Code, ")").concat(detail === undefined ? '' : ": ".concat(detail))) || this;
        _this.name = 'Win32Error';
        _this.api = api;
        _this.win32Code = win32Code;
        return _this;
    }
    return Win32Error;
}(Error));
exports.Win32Error = Win32Error;
