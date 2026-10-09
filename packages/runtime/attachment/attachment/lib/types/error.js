"use strict";
/** Attachment failure class. @module @z/dsh-attachment/error */
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
exports.AttachmentError = void 0;
exports.isImageAdmissionError = isImageAdmissionError;
var IMAGE_ADMISSION_ERROR_CODES = [
    'TOO_MANY_IMAGES',
    'IMAGES_TOO_LARGE',
    'UNSUPPORTED_IMAGE_TYPE',
    'INVALID_IMAGE_BASE64',
    'INVALID_IMAGE',
    'IMAGE_TYPE_MISMATCH',
    'IMAGE_TOO_LARGE',
    'IMAGE_TOO_MANY_PIXELS',
    'IMAGE_DIMENSION_TOO_LARGE',
];
/** Runtime membership for structurally compatible errors crossing package boundaries. */
var IMAGE_ADMISSION_ERROR_CODE_SET = new Set(IMAGE_ADMISSION_ERROR_CODES);
/**
 * Stable failures suitable for host RPC error mapping.
 *
 * Deliberately re-implements the `HarnessError` shape instead of extending it:
 * the base lives in `@z/dsh-llm`, which itself depends on this
 * package (`ImageBlock` references `ImageAttachmentRef`), so sharing the base
 * would create a dependency cycle. Consumers route on `code`, never on the
 * prototype chain, so the shapes stay interchangeable at the wire boundary.
 */
var AttachmentError = /** @class */ (function (_super) {
    __extends(AttachmentError, _super);
    /**
     * @param message - human-readable failure description without raw bytes or host paths.
     * @param code - stable machine-routing code.
     * @param options - optional chained cause.
     */
    function AttachmentError(message, code, options) {
        var _this = _super.call(this, message, options) || this;
        _this.name = 'AttachmentError';
        _this.code = code;
        return _this;
    }
    return AttachmentError;
}(Error));
exports.AttachmentError = AttachmentError;
/**
 * Distinguish caller-correctable image admission failures from storage faults.
 * @param error - failure raised while validating or persisting an image batch.
 * @returns whether the caller can correct the proposed image content or batch.
 */
function isImageAdmissionError(error) {
    return error instanceof Error
        && 'code' in error
        && typeof error.code === 'string'
        && IMAGE_ADMISSION_ERROR_CODE_SET.has(error.code);
}
