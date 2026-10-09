"use strict";
/**
 * Typed failures shared by subagent service and provider operations.
 *
 * @module @z/dsh-subagent
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
exports.SubagentError = void 0;
var dsh_llm_1 = require("@z/dsh-llm");
/** Typed failure for the subagent seam. */
var SubagentError = /** @class */ (function (_super) {
    __extends(SubagentError, _super);
    function SubagentError(message, code, options) {
        var _this = _super.call(this, message, code, options) || this;
        _this.name = 'SubagentError';
        return _this;
    }
    return SubagentError;
}(dsh_llm_1.HarnessError));
exports.SubagentError = SubagentError;
