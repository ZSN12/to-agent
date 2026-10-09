"use strict";
/** Public configuration and typed failures for the combined session-query service. */
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
exports.SessionQueryError = exports.SESSION_QUERY_DEFAULT_PERSISTED_INSPECT_CONCURRENCY = exports.SESSION_QUERY_READ_WINDOW_MAX = void 0;
var dsh_llm_1 = require("@z/dsh-llm");
/** Default maximum `before`/`after` raw-event window. */
exports.SESSION_QUERY_READ_WINDOW_MAX = 50;
/** Default maximum number of concurrent persisted-log inspections in one batch read. */
exports.SESSION_QUERY_DEFAULT_PERSISTED_INSPECT_CONCURRENCY = 4;
/** Typed session-query failure whose `code` is one closed taxonomy member. */
var SessionQueryError = /** @class */ (function (_super) {
    __extends(SessionQueryError, _super);
    // The base stores the value; this signature narrows its open string code.
    // oxlint-disable-next-line typescript/no-useless-constructor
    function SessionQueryError(message, code, options) {
        return _super.call(this, message, code, options) || this;
    }
    return SessionQueryError;
}(dsh_llm_1.HarnessError));
exports.SessionQueryError = SessionQueryError;
