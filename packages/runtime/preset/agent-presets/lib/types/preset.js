"use strict";
/** Agent-preset vocabulary shared by discovery, mounting, and consumers. */
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
exports.PresetMountError = exports.UnknownPresetError = exports.PRESET_ID = void 0;
/**
 * Ids a preset directory may use.
 *
 * The id becomes a path segment, so this is a containment boundary rather than
 * a style rule: `..`, a separator, or an absolute-looking name would place the
 * composition outside the root the deployment authorised. Discovery shares it:
 * a directory whose name no copy could ever claim is not a preset slot.
 */
exports.PRESET_ID = /^[a-z0-9][a-z0-9-]*$/;
/**
 * No configured root supplies the requested preset.
 *
 * Separate from a mount failure because the two mean different things to a
 * caller: an unknown id is a bad request, while an unusable composition is a
 * broken preset the deployment must fix.
 */
var UnknownPresetError = /** @class */ (function (_super) {
    __extends(UnknownPresetError, _super);
    function UnknownPresetError(
    /** The id that was requested. */
    presetId, 
    /** Ids the roster does supply, for the caller to offer instead. */
    available) {
        var _this = _super.call(this, "agent-presets: preset \"".concat(presetId, "\" not found (available: ").concat(available.join(', ') || 'none', ")")) || this;
        _this.presetId = presetId;
        _this.available = available;
        return _this;
    }
    return UnknownPresetError;
}(Error));
exports.UnknownPresetError = UnknownPresetError;
/** A preset exists but its composition cannot be installed. */
var PresetMountError = /** @class */ (function (_super) {
    __extends(PresetMountError, _super);
    function PresetMountError(
    /** The preset whose composition failed. */
    presetId, 
    /** Why it failed, without this package's own message prefix. */
    reason, options) {
        var _this = _super.call(this, "agent-presets: preset \"".concat(presetId, "\" failed to mount: ").concat(reason), options) || this;
        _this.presetId = presetId;
        _this.reason = reason;
        return _this;
    }
    return PresetMountError;
}(Error));
exports.PresetMountError = PresetMountError;
