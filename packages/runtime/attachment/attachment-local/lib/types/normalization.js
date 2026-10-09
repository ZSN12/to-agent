"use strict";
/** Deterministic provider-independent image normalization. */
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
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.canPassThroughNormalization = canPassThroughNormalization;
exports.hasLowColourCount = hasLowColourCount;
exports.normalizeImage = normalizeImage;
var sharp_1 = require("sharp");
var dsh_attachment_1 = require("@z/dsh-attachment");
var encoding_ts_1 = require("./encoding.ts");
var image_ts_1 = require("./image.ts");
var NORMALIZATION_QUALITIES = [85, 80, 75];
var LOW_COLOUR_SAMPLE_EDGE = 128;
var LOW_COLOUR_LIMIT = 256;
var MIN_SCALE_STEP = 0.9;
/** Encode one prepared pipeline and report exact output facts. */
function encode(pipeline_1, mediaType_1, quality_1) {
    return __awaiter(this, arguments, void 0, function (pipeline, mediaType, quality, palette) {
        var encoded, _a, data, info;
        if (palette === void 0) { palette = true; }
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    encoded = mediaType === 'image/png'
                        ? pipeline.png({ compressionLevel: 9, palette: palette })
                        : mediaType === 'image/webp'
                            ? pipeline.webp({ quality: quality })
                            : pipeline.jpeg({ quality: quality });
                    return [4 /*yield*/, encoded.toBuffer({ resolveWithObject: true })];
                case 1:
                    _a = _b.sent(), data = _a.data, info = _a.info;
                    return [2 /*return*/, { data: new Uint8Array(data), mediaType: mediaType, width: info.width, height: info.height }];
            }
        });
    });
}
/**
 * Whether bytes already satisfy the normalization requirements.
 * @param detected - fully decoded source facts.
 * @param bytes - encoded source length.
 * @param policy - resolved normalization limits.
 * @returns whether the source can pass through byte-identically.
 */
function canPassThroughNormalization(detected, bytes, policy) {
    return detected.mediaType !== 'image/gif'
        && !detected.animated
        && !detected.carriesMetadata
        && detected.depth === 'uchar'
        && detected.space === 'srgb'
        && bytes <= policy.maxBytes
        && Math.max(detected.width, detected.height) <= policy.maxDimension;
}
/**
 * Classify a bounded pixel sample without assuming that a PNG source is a screenshot.
 * @param pipeline - oriented sRGB source pipeline before output resizing.
 * @returns whether the nearest-neighbour sample stays within the low-color threshold.
 */
function hasLowColourCount(pipeline) {
    return __awaiter(this, void 0, void 0, function () {
        var _a, data, info, colours, offset, red, green, blue, alpha;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, pipeline.clone().resize({
                        width: LOW_COLOUR_SAMPLE_EDGE,
                        height: LOW_COLOUR_SAMPLE_EDGE,
                        fit: 'inside',
                        withoutEnlargement: true,
                        kernel: sharp_1.default.kernel.nearest,
                        fastShrinkOnLoad: false,
                    }).raw().toBuffer({ resolveWithObject: true })];
                case 1:
                    _a = _b.sent(), data = _a.data, info = _a.info;
                    colours = new Set();
                    for (offset = 0; offset < data.length; offset += info.channels) {
                        red = data.readUInt8(offset);
                        green = data.readUInt8(offset + 1);
                        blue = data.readUInt8(offset + 2);
                        alpha = info.channels === 4 ? data.readUInt8(offset + 3) : 255;
                        colours.add(((red >> 3) << 15) | ((green >> 3) << 10) | ((blue >> 3) << 5) | (alpha >> 3));
                        if (colours.size > LOW_COLOUR_LIMIT)
                            return [2 /*return*/, false];
                    }
                    return [2 /*return*/, true];
            }
        });
    });
}
/** Assert that a normalized output is an 8-bit sRGB/sRGBA single-frame image with matching facts. */
function verifyNormalizedImage(image, expectedAlpha) {
    return __awaiter(this, void 0, void 0, function () {
        var detected;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, image_ts_1.detectImage)(image.data)];
                case 1:
                    detected = _a.sent();
                    if (detected.mediaType !== image.mediaType
                        || detected.width !== image.width
                        || detected.height !== image.height
                        || detected.animated
                        || detected.carriesMetadata
                        || detected.depth !== 'uchar'
                        || detected.space !== 'srgb'
                        || !(0, image_ts_1.encodedAlphaIsCompatible)(expectedAlpha, detected)) {
                        throw new dsh_attachment_1.AttachmentError('Image normalization did not produce a single-frame 8-bit sRGB image with matching metadata.', 'ATTACHMENT_WRITE_FAILED');
                    }
                    return [2 /*return*/, image];
            }
        });
    });
}
/** Build one fixed-size, oriented, metadata-free sRGB pipeline from submitted bytes. */
function preparedPipeline(data, width, height) {
    return (0, sharp_1.default)(data, { failOn: 'error', limitInputPixels: false })
        .rotate()
        .toColourspace('srgb')
        .resize({ width: width, height: height, fit: 'inside', withoutEnlargement: true });
}
/** Dimensions after the long edge is capped without changing aspect ratio. */
function initialDimensions(detected, maxDimension) {
    var scale = Math.min(1, maxDimension / Math.max(detected.width, detected.height));
    return {
        width: Math.max(1, Math.round(detected.width * scale)),
        height: Math.max(1, Math.round(detected.height * scale)),
    };
}
/** Lazy encoding order for one size, separated by sampled colour complexity and alpha. */
function encodingAttemptsAtSize(data, width, height, hasAlpha, lowColour) {
    var prepared = preparedPipeline(data, width, height);
    var webp = NORMALIZATION_QUALITIES.map(function (quality) { return (function () { return encode(prepared.clone(), 'image/webp', quality); }); });
    if (lowColour) {
        return __spreadArray([function () { return encode(prepared.clone(), 'image/png', undefined, !hasAlpha); }], webp, true);
    }
    if (hasAlpha)
        return webp;
    return NORMALIZATION_QUALITIES.map(function (quality) { return (function () { return encode(prepared.clone(), 'image/jpeg', quality); }); });
}
/**
 * Produce the persisted provider-independent normalized version of one fully decoded source.
 * The source is passed through only when it is already clean, single-frame, 8-bit sRGB/sRGBA,
 * and inside both normalization limits. Re-encoding never removes transparency. After the fixed
 * quality floor is reached, dimensions continue shrinking until the independent byte cap holds.
 * @param data - complete admitted source bytes.
 * @param detected - fully decoded source facts.
 * @param policy - resolved independent normalization limits.
 * @returns verified provider-independent normalized bytes and metadata.
 */
function normalizeImage(data, detected, policy) {
    return __awaiter(this, void 0, void 0, function () {
        var _a, width, height, classificationPipeline, lowColour, encoded, sizeScale, scale, nextWidth, nextHeight, error_1, source;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    if (canPassThroughNormalization(detected, data.byteLength, policy)) {
                        return [2 /*return*/, { data: data, mediaType: detected.mediaType, width: detected.width, height: detected.height }];
                    }
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 9, , 10]);
                    _a = initialDimensions(detected, policy.maxDimension), width = _a.width, height = _a.height;
                    classificationPipeline = (0, sharp_1.default)(data, { failOn: 'error', limitInputPixels: false })
                        .rotate()
                        .toColourspace('srgb');
                    return [4 /*yield*/, hasLowColourCount(classificationPipeline)];
                case 2:
                    lowColour = _b.sent();
                    _b.label = 3;
                case 3: return [4 /*yield*/, (0, encoding_ts_1.encodeFirstWithinLimit)(encodingAttemptsAtSize(data, width, height, detected.hasAlpha, lowColour), policy.maxBytes)];
                case 4:
                    encoded = _b.sent();
                    if (!!(0, encoding_ts_1.isExhaustedEncoding)(encoded)) return [3 /*break*/, 6];
                    return [4 /*yield*/, verifyNormalizedImage(encoded, detected.mediaType === 'image/gif' ? undefined : detected.hasAlpha)];
                case 5: return [2 /*return*/, _b.sent()];
                case 6:
                    if (width === 1 && height === 1)
                        return [3 /*break*/, 8];
                    sizeScale = Math.sqrt(policy.maxBytes / encoded.smallest.data.byteLength) * 0.95;
                    scale = Math.min(MIN_SCALE_STEP, sizeScale);
                    nextWidth = Math.max(1, Math.floor(width * scale));
                    nextHeight = Math.max(1, Math.floor(height * scale));
                    width = nextWidth;
                    height = nextHeight;
                    _b.label = 7;
                case 7: return [3 /*break*/, 3];
                case 8: return [3 /*break*/, 10];
                case 9:
                    error_1 = _b.sent();
                    if (error_1 instanceof dsh_attachment_1.AttachmentError)
                        throw error_1;
                    source = detected.mediaType === 'image/png' && detected.depth !== 'uchar'
                        ? "".concat(detected.depth === 'ushort' ? '16-bit' : detected.depth, " PNG")
                        : "".concat(detected.depth, " ").concat(detected.mediaType.slice('image/'.length).toUpperCase());
                    throw new dsh_attachment_1.AttachmentError("The ".concat(source, " could not be converted to the normalized 8-bit sRGB form."), 'ATTACHMENT_WRITE_FAILED', { cause: error_1 });
                case 10: throw new dsh_attachment_1.AttachmentError('Image cannot be encoded within the configured normalized-image byte cap.', 'IMAGE_TOO_LARGE');
            }
        });
    });
}
