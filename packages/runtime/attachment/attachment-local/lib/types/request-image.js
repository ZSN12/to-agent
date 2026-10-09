"use strict";
/** Deterministic cached image versions for model requests. */
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
exports.REQUEST_IMAGE_QUALITIES = exports.REQUEST_IMAGE_TRANSFORM_VERSION = void 0;
exports.requestImageDimensions = requestImageDimensions;
exports.requestImageVariantId = requestImageVariantId;
exports.readRequestImageFile = readRequestImageFile;
var node_crypto_1 = require("node:crypto");
var promises_1 = require("node:fs/promises");
var node_path_1 = require("node:path");
var sharp_1 = require("sharp");
var dsh_attachment_1 = require("@z/dsh-attachment");
var normalization_ts_1 = require("./normalization.ts");
var encoding_ts_1 = require("./encoding.ts");
var image_ts_1 = require("./image.ts");
/** Transform version included in every cache and upload-index identity. */
exports.REQUEST_IMAGE_TRANSFORM_VERSION = 'request-image-v4';
/** DeepSeek request versions normally fit at these two preferred qualities. */
exports.REQUEST_IMAGE_QUALITIES = [85, 80];
function digest(value) {
    return (0, node_crypto_1.createHash)('sha256').update(value).digest('hex');
}
/**
 * Compute aspect-preserving integer dimensions within a hard total-pixel budget.
 * @param width - positive source width.
 * @param height - positive source height.
 * @param maxPixels - positive width-times-height cap.
 * @returns inward-rounded dimensions; small images are not enlarged.
 */
function requestImageDimensions(width, height, maxPixels) {
    var scale = Math.min(1, Math.sqrt(maxPixels / (width * height)));
    if (scale === 1)
        return { width: width, height: height };
    if (width >= height) {
        var projectedWidth_1 = Math.max(1, Math.floor(width * scale));
        var projectedHeight_1 = Math.max(1, Math.round(projectedWidth_1 * height / width));
        while (projectedWidth_1 * projectedHeight_1 > maxPixels && projectedWidth_1 > 1) {
            projectedWidth_1 -= 1;
            projectedHeight_1 = Math.max(1, Math.round(projectedWidth_1 * height / width));
        }
        return { width: projectedWidth_1, height: projectedHeight_1 };
    }
    var projectedHeight = Math.max(1, Math.floor(height * scale));
    var projectedWidth = Math.max(1, Math.round(projectedHeight * width / height));
    while (projectedWidth * projectedHeight > maxPixels && projectedHeight > 1) {
        projectedHeight -= 1;
        projectedWidth = Math.max(1, Math.round(projectedHeight * width / height));
    }
    return { width: projectedWidth, height: projectedHeight };
}
function checkedInteger(value, name) {
    if (!Number.isSafeInteger(value) || value <= 0) {
        throw new dsh_attachment_1.AttachmentError("".concat(name, " must be a positive integer."), 'INVALID_ATTACHMENT_REF');
    }
    return value;
}
function validatePolicy(policy) {
    checkedInteger(policy.maxPixels, 'Image request maxPixels');
    checkedInteger(policy.maxBytes, 'Image request maxBytes');
}
function descriptor(attachment, policy) {
    return JSON.stringify({
        transformVersion: exports.REQUEST_IMAGE_TRANSFORM_VERSION,
        attachmentId: attachment.attachmentId,
        routePixelBudget: policy.maxPixels,
        encodedByteBudget: policy.maxBytes,
        encoding: {
            png: { compressionLevel: 9, palette: 'opaque-only' },
            webpQualities: exports.REQUEST_IMAGE_QUALITIES,
            jpegQualities: exports.REQUEST_IMAGE_QUALITIES,
            order: ['low-colour:png-webp', 'alpha:webp', 'opaque:jpeg'],
            colourspace: 'srgb',
        },
    });
}
/**
 * Complete deterministic identity for one attachment and route-owned request policy.
 * @param attachment - provider-independent durable normalized attachment reference.
 * @param policy - route-owned pixel and byte policy.
 * @returns branded digest over every request transform input.
 */
function requestImageVariantId(attachment, policy) {
    return (0, dsh_attachment_1.ImageVariantId)("sha256:".concat(digest(descriptor(attachment, policy))));
}
function pipeline(attachment, width, height) {
    return sourcePipeline(attachment)
        .resize({ width: width, height: height, fit: 'inside', withoutEnlargement: true });
}
function sourcePipeline(attachment) {
    return (0, sharp_1.default)(attachment.data, { failOn: 'error', limitInputPixels: false }).toColourspace('srgb');
}
function encoded(image_1, mediaType_1, quality_1) {
    return __awaiter(this, arguments, void 0, function (image, mediaType, quality, palette) {
        var output, _a, data, info;
        if (palette === void 0) { palette = true; }
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    output = mediaType === 'image/png'
                        ? image.png({ compressionLevel: 9, palette: palette })
                        : mediaType === 'image/webp'
                            ? image.webp({ quality: quality })
                            : image.jpeg({ quality: quality });
                    return [4 /*yield*/, output.toBuffer({ resolveWithObject: true })];
                case 1:
                    _a = _b.sent(), data = _a.data, info = _a.info;
                    return [2 /*return*/, { data: new Uint8Array(data), mediaType: mediaType, width: info.width, height: info.height }];
            }
        });
    });
}
function encodingAttempts(attachment, width, height, hasAlpha, lowColour) {
    var prepared = pipeline(attachment, width, height);
    var webp = exports.REQUEST_IMAGE_QUALITIES.map(function (quality) { return (function () { return encoded(prepared.clone(), 'image/webp', quality); }); });
    if (lowColour)
        return __spreadArray([function () { return encoded(prepared.clone(), 'image/png', undefined, !hasAlpha); }], webp, true);
    if (hasAlpha)
        return webp;
    return exports.REQUEST_IMAGE_QUALITIES.map(function (quality) { return (function () { return encoded(prepared.clone(), 'image/jpeg', quality); }); });
}
function createRequestImage(attachment, policy, hasAlpha) {
    return __awaiter(this, void 0, void 0, function () {
        var dimensions, lowColour, encodedVersion, scale;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    dimensions = requestImageDimensions(attachment.ref.width, attachment.ref.height, policy.maxPixels);
                    if (dimensions.width === attachment.ref.width
                        && dimensions.height === attachment.ref.height
                        && attachment.data.byteLength <= policy.maxBytes) {
                        return [2 /*return*/, {
                                data: attachment.data,
                                mediaType: attachment.ref.mediaType,
                                width: attachment.ref.width,
                                height: attachment.ref.height,
                            }];
                    }
                    return [4 /*yield*/, (0, normalization_ts_1.hasLowColourCount)(sourcePipeline(attachment))];
                case 1:
                    lowColour = _a.sent();
                    _a.label = 2;
                case 2: return [4 /*yield*/, (0, encoding_ts_1.encodeFirstWithinLimit)(encodingAttempts(attachment, dimensions.width, dimensions.height, hasAlpha, lowColour), policy.maxBytes)];
                case 3:
                    encodedVersion = _a.sent();
                    if (!(0, encoding_ts_1.isExhaustedEncoding)(encodedVersion))
                        return [2 /*return*/, encodedVersion];
                    if (dimensions.width === 1 && dimensions.height === 1)
                        return [3 /*break*/, 5];
                    scale = Math.min(0.9, Math.sqrt(policy.maxBytes / encodedVersion.smallest.data.byteLength) * 0.95);
                    dimensions = {
                        width: Math.max(1, Math.floor(dimensions.width * scale)),
                        height: Math.max(1, Math.floor(dimensions.height * scale)),
                    };
                    _a.label = 4;
                case 4: return [3 /*break*/, 2];
                case 5: throw new dsh_attachment_1.AttachmentError('Image cannot be encoded within the model-request byte budget.', 'IMAGE_TOO_LARGE');
            }
        });
    });
}
function cachePath(root, hash) {
    return (0, node_path_1.join)(root, 'request-images', hash.slice(0, 2), hash);
}
function readCached(path, attachment, policy, expectedAlpha, signal) {
    return __awaiter(this, void 0, void 0, function () {
        var data, _a, detected, maximum, error_1;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 3, , 4]);
                    _a = Uint8Array.bind;
                    return [4 /*yield*/, (0, promises_1.readFile)(path, { signal: signal })];
                case 1:
                    data = new (_a.apply(Uint8Array, [void 0, _b.sent()]))();
                    return [4 /*yield*/, (0, image_ts_1.probeImage)(data)];
                case 2:
                    detected = _b.sent();
                    maximum = requestImageDimensions(attachment.ref.width, attachment.ref.height, policy.maxPixels);
                    if (data.byteLength > policy.maxBytes || detected.depth !== 'uchar' || detected.space !== 'srgb'
                        || detected.width > maximum.width || detected.height > maximum.height
                        || !(0, image_ts_1.encodedAlphaIsCompatible)(expectedAlpha, detected))
                        return [2 /*return*/, undefined];
                    return [2 /*return*/, { data: data, mediaType: detected.mediaType, width: detected.width, height: detected.height, hasAlpha: detected.hasAlpha }];
                case 3:
                    error_1 = _b.sent();
                    if ((error_1 === null || error_1 === void 0 ? void 0 : error_1.code) === 'ENOENT')
                        return [2 /*return*/, undefined];
                    signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                    return [2 /*return*/, undefined];
                case 4: return [2 /*return*/];
            }
        });
    });
}
function verifyRequestImage(image, expectedAlpha) {
    return __awaiter(this, void 0, void 0, function () {
        var detected;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, image_ts_1.detectImage)(image.data)];
                case 1:
                    detected = _a.sent();
                    if (detected.depth !== 'uchar' || detected.space !== 'srgb'
                        || detected.width !== image.width || detected.height !== image.height
                        || detected.mediaType !== image.mediaType || !(0, image_ts_1.encodedAlphaIsCompatible)(expectedAlpha, detected)) {
                        throw new dsh_attachment_1.AttachmentError('Encoded model-request image does not match its verified 8-bit sRGB metadata.', 'ATTACHMENT_WRITE_FAILED');
                    }
                    return [2 /*return*/, __assign(__assign({}, image), { hasAlpha: detected.hasAlpha })];
            }
        });
    });
}
function writeCached(path, data) {
    return __awaiter(this, void 0, void 0, function () {
        var temporary;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, promises_1.mkdir)((0, node_path_1.dirname)(path), { recursive: true, mode: 448 })];
                case 1:
                    _a.sent();
                    temporary = "".concat(path, ".").concat((0, node_crypto_1.randomUUID)(), ".tmp");
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, , 5, 7]);
                    return [4 /*yield*/, (0, promises_1.writeFile)(temporary, data, { mode: 384, flag: 'wx' })];
                case 3:
                    _a.sent();
                    return [4 /*yield*/, (0, promises_1.rename)(temporary, path)];
                case 4:
                    _a.sent();
                    return [3 /*break*/, 7];
                case 5: return [4 /*yield*/, (0, promises_1.rm)(temporary, { force: true })];
                case 6:
                    _a.sent();
                    return [7 /*endfinally*/];
                case 7: return [2 /*return*/];
            }
        });
    });
}
/**
 * Generate or reuse one request image below the local attachment root.
 * @param root - absolute versioned attachment storage root.
 * @param attachment - verified normalized attachment bytes and reference.
 * @param policy - exact route request-image policy.
 * @param signal - optional cancellation for cache I/O and image transformation.
 * @returns verified request bytes and deterministic variant identity.
 */
function readRequestImageFile(root, attachment, policy, signal) {
    return __awaiter(this, void 0, void 0, function () {
        var source, variantId, hash, path, cached, created, _a, version, _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                    validatePolicy(policy);
                    return [4 /*yield*/, (0, image_ts_1.probeImage)(attachment.data)];
                case 1:
                    source = _d.sent();
                    variantId = requestImageVariantId(attachment.ref, policy);
                    hash = String(variantId).slice('sha256:'.length);
                    path = cachePath(root, hash);
                    return [4 /*yield*/, readCached(path, attachment, policy, source.hasAlpha, signal)];
                case 2:
                    cached = _d.sent();
                    if (!(cached !== null && cached !== void 0)) return [3 /*break*/, 3];
                    _a = cached;
                    return [3 /*break*/, 5];
                case 3: return [4 /*yield*/, createRequestImage(attachment, policy, source.hasAlpha)];
                case 4:
                    _a = _d.sent();
                    _d.label = 5;
                case 5:
                    created = _a;
                    if (!(cached !== null && cached !== void 0)) return [3 /*break*/, 6];
                    _b = cached;
                    return [3 /*break*/, 10];
                case 6:
                    if (!(created.data === attachment.data)) return [3 /*break*/, 7];
                    _c = __assign(__assign({}, created), { hasAlpha: source.hasAlpha });
                    return [3 /*break*/, 9];
                case 7: return [4 /*yield*/, verifyRequestImage(created, source.hasAlpha)];
                case 8:
                    _c = _d.sent();
                    _d.label = 9;
                case 9:
                    _b = (_c);
                    _d.label = 10;
                case 10:
                    version = _b;
                    signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                    if (!(cached === undefined && version.data !== attachment.data)) return [3 /*break*/, 12];
                    return [4 /*yield*/, writeCached(path, version.data)];
                case 11:
                    _d.sent();
                    _d.label = 12;
                case 12: return [2 /*return*/, {
                        variantId: variantId,
                        attachment: attachment.ref,
                        data: version.data,
                        mediaType: version.mediaType,
                        bytes: version.data.byteLength,
                        width: version.width,
                        height: version.height,
                        depth: 'uchar',
                        space: 'srgb',
                        hasAlpha: version.hasAlpha,
                    }];
            }
        });
    });
}
