"use strict";
/**
 * Service Definition for the `ctx.directoryPicker` capability seam: how the web-GUI host lets an operator
 * select a workspace directory. Backends differ in interaction shape, not
 * just mechanism, so the service exposes a discriminated capability instead
 * of one method set: a `native` backend opens one OS chooser on the
 * host's display, while a `browse` backend serves listing/creation primitives
 * for an in-app browser (and thereby works for remote clients no OS dialog
 * can reach). Consumers switch on `capability().kind`; the union is
 * merge-extensible, and the documented default for an unknown kind is to
 * hide the picking affordance rather than fail.
 * @module @z/dsh-host-directory-picker
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
exports.DirectoryPicker = exports.DirectoryPickerError = void 0;
var cordis_1 = require("@z/cordis");
/** Typed failure thrown by browse primitives so consumers can map business codes without string matching. */
var DirectoryPickerError = /** @class */ (function (_super) {
    __extends(DirectoryPickerError, _super);
    /**
     * @param code - closed business code of the failure.
     * @param path - the absolute path the failure is about.
     * @param message - operator-facing description.
     */
    function DirectoryPickerError(code, path, message) {
        var _this = _super.call(this, message) || this;
        _this.code = code;
        _this.path = path;
        _this.name = 'DirectoryPickerError';
        return _this;
    }
    return DirectoryPickerError;
}(Error));
exports.DirectoryPickerError = DirectoryPickerError;
/**
 * Abstract directory-picking service. Subclass, implement `capability()`, and
 * load the subclass as a plugin — it registers as `ctx.directoryPicker` (one
 * implementation per context; loading a second throws, cordis' standard
 * duplicate-service behavior). The capability object must be stable for the
 * service lifetime: consumers may capture it across calls.
 */
var DirectoryPicker = /** @class */ (function (_super) {
    __extends(DirectoryPicker, _super);
    function DirectoryPicker(ctx) {
        return _super.call(this, ctx, 'directoryPicker') || this;
    }
    return DirectoryPicker;
}(cordis_1.Service));
exports.DirectoryPicker = DirectoryPicker;
exports.default = DirectoryPicker;
