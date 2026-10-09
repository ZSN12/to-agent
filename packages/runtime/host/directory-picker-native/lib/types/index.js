"use strict";
/**
 * Native backend of the directory-picker seam: registers `ctx.directoryPicker`
 * with the `native` capability, opening one native OS chooser on the host
 * display per pick (macOS `osascript`, Linux Zenity with a KDialog fallback;
 * Windows opens the modern `IFileOpenDialog` in a spawned child process — a
 * koffi-driven COM conversation on the child's main thread). Only viable when
 * the operator sits at the host's screen; remote deployments compose the
 * browse backend instead.
 * @module @z/dsh-host-directory-picker-native
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
exports.pickNativeDirectory = void 0;
var dsh_host_directory_picker_1 = require("@z/dsh-host-directory-picker");
var native_picker_ts_1 = require("./native-picker.ts");
var native_picker_ts_2 = require("./native-picker.ts");
Object.defineProperty(exports, "pickNativeDirectory", { enumerable: true, get: function () { return native_picker_ts_2.pickNativeDirectory; } });
/** The `ctx.directoryPicker` native implementation (stable capability object per service life). */
var NativeDirectoryPicker = /** @class */ (function (_super) {
    __extends(NativeDirectoryPicker, _super);
    function NativeDirectoryPicker() {
        var _this = _super !== null && _super.apply(this, arguments) || this;
        _this.nativeCapability = {
            kind: 'native',
            /* v8 ignore next -- pure forward to pickNativeDirectory (its spec owns behavior); invoking here opens a real chooser. */
            pick: function (signal) { return (0, native_picker_ts_1.pickNativeDirectory)(signal); },
        };
        return _this;
    }
    /**
     * The native interaction capability.
     * @returns the stable `native` capability object.
     */
    NativeDirectoryPicker.prototype.capability = function () {
        return this.nativeCapability;
    };
    return NativeDirectoryPicker;
}(dsh_host_directory_picker_1.DirectoryPicker));
exports.default = NativeDirectoryPicker;
