"use strict";
/** Durable attachment storage seam (`ctx.attachments`). @module @z/dsh-attachment */
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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AttachmentStore = exports.admitEncodedImages = exports.isImageAdmissionError = exports.AttachmentError = exports.ImageVariantId = exports.AttachmentId = void 0;
var cordis_1 = require("@z/cordis");
var error_ts_1 = require("./error.ts");
var brand_ts_1 = require("./brand.ts");
Object.defineProperty(exports, "AttachmentId", { enumerable: true, get: function () { return brand_ts_1.AttachmentId; } });
Object.defineProperty(exports, "ImageVariantId", { enumerable: true, get: function () { return brand_ts_1.ImageVariantId; } });
var error_ts_2 = require("./error.ts");
Object.defineProperty(exports, "AttachmentError", { enumerable: true, get: function () { return error_ts_2.AttachmentError; } });
Object.defineProperty(exports, "isImageAdmissionError", { enumerable: true, get: function () { return error_ts_2.isImageAdmissionError; } });
var admission_ts_1 = require("./admission.ts");
Object.defineProperty(exports, "admitEncodedImages", { enumerable: true, get: function () { return admission_ts_1.admitEncodedImages; } });
/** Immutable binary attachment service. Implementations validate bytes before publishing a reference. */
var AttachmentStore = /** @class */ (function (_super) {
    __extends(AttachmentStore, _super);
    function AttachmentStore(ctx) {
        return _super.call(this, ctx, 'attachments') || this;
    }
    /**
     * Validate one ordered image batch before committing any member.
     * Validation failures start no writes; storage failures return no partial
     * references, although already published content-addressed objects may stay
     * unreachable until a future retention policy collects them.
     * @param inputs - encoded images in their owning message order.
     * @returns durable references in the exact input order.
     */
    AttachmentStore.prototype.validateImageBatch = function (inputs) {
        var _a = this.imageLimits, maxImagesPerMessage = _a.maxImagesPerMessage, maxMessageImageBytes = _a.maxMessageImageBytes, mediaTypes = _a.mediaTypes;
        if (inputs.length > maxImagesPerMessage) {
            throw new error_ts_1.AttachmentError('Image batch exceeds the configured image-count limit.', 'TOO_MANY_IMAGES');
        }
        var totalBytes = inputs.reduce(function (sum, input) { return sum + input.data.byteLength; }, 0);
        if (totalBytes > maxMessageImageBytes) {
            throw new error_ts_1.AttachmentError('Image batch exceeds the configured aggregate image-byte limit.', 'IMAGES_TOO_LARGE');
        }
        for (var _i = 0, inputs_1 = inputs; _i < inputs_1.length; _i++) {
            var input = inputs_1[_i];
            if (!mediaTypes.includes(input.mediaType)) {
                throw new error_ts_1.AttachmentError("Image type ".concat(input.mediaType, " is not accepted by this deployment."), 'UNSUPPORTED_IMAGE_TYPE');
            }
        }
    };
    /**
     * Validate and durably commit one ordered image batch.
     * @param inputs - encoded images in owning-message order.
     * @returns durable normalized attachment references in the same order after every member succeeds.
     */
    AttachmentStore.prototype.saveImages = function (inputs) {
        return __awaiter(this, void 0, void 0, function () {
            var _i, inputs_2, input, refs, _a, inputs_3, input, _b, _c;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        this.validateImageBatch(inputs);
                        _i = 0, inputs_2 = inputs;
                        _d.label = 1;
                    case 1:
                        if (!(_i < inputs_2.length)) return [3 /*break*/, 4];
                        input = inputs_2[_i];
                        return [4 /*yield*/, this.validateImage(input)];
                    case 2:
                        _d.sent();
                        _d.label = 3;
                    case 3:
                        _i++;
                        return [3 /*break*/, 1];
                    case 4:
                        refs = [];
                        _a = 0, inputs_3 = inputs;
                        _d.label = 5;
                    case 5:
                        if (!(_a < inputs_3.length)) return [3 /*break*/, 8];
                        input = inputs_3[_a];
                        _c = (_b = refs).push;
                        return [4 /*yield*/, this.saveImage(input)];
                    case 6:
                        _c.apply(_b, [_d.sent()]);
                        _d.label = 7;
                    case 7:
                        _a++;
                        return [3 /*break*/, 5];
                    case 8: return [2 /*return*/, refs];
                }
            });
        });
    };
    /**
     * Generate or read one deterministic model-request version from the stored normalized image.
     * @param ref - durable provider-independent normalized attachment reference.
     * @param policy - exact route pixel and encoded-byte budget.
     * @param signal - optional cancellation.
     * @returns request bytes and the cache/upload identity covering every transform input.
     */
    AttachmentStore.prototype.readImageRequest = function (ref, policy, signal) {
        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
        void ref;
        void policy;
        return Promise.reject(new error_ts_1.AttachmentError('The mounted attachment provider cannot derive model-request images.', 'ATTACHMENT_PROJECTION_UNSUPPORTED'));
    };
    return AttachmentStore;
}(cordis_1.Service));
exports.AttachmentStore = AttachmentStore;
exports.default = AttachmentStore;
