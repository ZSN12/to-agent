"use strict";
/** Runtime constructors and protocol constants for the goal domain. */
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
exports.GoalError = exports.GOAL_CHANGE_VERSION = void 0;
exports.GoalId = GoalId;
var dsh_llm_1 = require("@z/dsh-llm");
/** Version of the goal change embedded in a round-zero message source. */
exports.GOAL_CHANGE_VERSION = 1;
/**
 * Brand a string as a goal id.
 * @param id - raw goal identifier.
 * @returns the same string with the compile-time brand.
 */
function GoalId(id) {
    return id;
}
/** Error returned by the goal domain boundary. */
var GoalError = /** @class */ (function (_super) {
    __extends(GoalError, _super);
    /**
     * @param message - human-readable rejection reason.
     * @param code - stable machine-routable classification.
     */
    // Keep the constructor to narrow HarnessError's string code at this boundary.
    // oxlint-disable-next-line typescript/no-useless-constructor -- type-only narrowing
    function GoalError(message, code) {
        return _super.call(this, message, code) || this;
    }
    return GoalError;
}(dsh_llm_1.HarnessError));
exports.GoalError = GoalError;
