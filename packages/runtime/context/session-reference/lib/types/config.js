"use strict";
/** Configuration and stable diagnostics for session references. */
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
exports.SessionReferenceError = exports.DEFAULT_MAX_REFERENCE_BYTES = exports.DEFAULT_CANDIDATE_LIMIT = exports.MAX_REFERENCES = void 0;
/** Hard maximum references accepted by one message. */
exports.MAX_REFERENCES = 3;
/** Default number of discovery candidates returned to a host. */
exports.DEFAULT_CANDIDATE_LIMIT = 50;
/** Default UTF-8 budget for one rendered reference JSON object. */
exports.DEFAULT_MAX_REFERENCE_BYTES = 65536;
/** Typed session-reference failure suitable for host protocol error mapping. */
var SessionReferenceError = /** @class */ (function (_super) {
    __extends(SessionReferenceError, _super);
    /** @param message Human-readable diagnosis. @param code Stable routing code. @param options Optional cause. */
    function SessionReferenceError(message, code, options) {
        var _this = _super.call(this, message, options) || this;
        _this.code = code;
        _this.name = 'SessionReferenceError';
        return _this;
    }
    return SessionReferenceError;
}(Error));
exports.SessionReferenceError = SessionReferenceError;
