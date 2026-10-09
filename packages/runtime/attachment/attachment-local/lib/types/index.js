"use strict";
/** Local durable attachment backend rooted below `DSH_HOME`. @module @z/dsh-attachment-local */
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
exports.LocalAttachmentStore = exports.MAX_IMAGE_COMPRESSION_CONCURRENCY = exports.DEFAULT_IMAGE_COMPRESSION_CONCURRENCY = exports.DEFAULT_NORMALIZED_IMAGE_MAX_BYTES = exports.DEFAULT_NORMALIZED_IMAGE_MAX_DIMENSION = exports.DEFAULT_MAX_IMAGE_DIMENSION = exports.DEFAULT_MAX_IMAGE_PIXELS = exports.DEFAULT_MAX_MESSAGE_IMAGE_BYTES = exports.DEFAULT_MAX_IMAGES_PER_MESSAGE = exports.DEFAULT_MAX_IMAGE_BYTES = exports.requestImageVariantId = exports.requestImageDimensions = exports.readRequestImageFile = exports.validateImageFile = exports.saveImageFile = exports.readImageFile = exports.prepareImageFile = exports.commitPreparedImageFile = exports.normalizeImage = exports.canPassThroughNormalization = void 0;
var node_path_1 = require("node:path");
var schemastery_1 = require("@z/schemastery");
var dsh_attachment_1 = require("@z/dsh-attachment");
var dsh_home_paths_1 = require("@z/dsh-home-paths");
var compression_limiter_ts_1 = require("./compression-limiter.ts");
var store_ts_1 = require("./store.ts");
var request_image_ts_1 = require("./request-image.ts");
var normalization_ts_1 = require("./normalization.ts");
Object.defineProperty(exports, "canPassThroughNormalization", { enumerable: true, get: function () { return normalization_ts_1.canPassThroughNormalization; } });
Object.defineProperty(exports, "normalizeImage", { enumerable: true, get: function () { return normalization_ts_1.normalizeImage; } });
var store_ts_2 = require("./store.ts");
Object.defineProperty(exports, "commitPreparedImageFile", { enumerable: true, get: function () { return store_ts_2.commitPreparedImageFile; } });
Object.defineProperty(exports, "prepareImageFile", { enumerable: true, get: function () { return store_ts_2.prepareImageFile; } });
Object.defineProperty(exports, "readImageFile", { enumerable: true, get: function () { return store_ts_2.readImageFile; } });
Object.defineProperty(exports, "saveImageFile", { enumerable: true, get: function () { return store_ts_2.saveImageFile; } });
Object.defineProperty(exports, "validateImageFile", { enumerable: true, get: function () { return store_ts_2.validateImageFile; } });
var request_image_ts_2 = require("./request-image.ts");
Object.defineProperty(exports, "readRequestImageFile", { enumerable: true, get: function () { return request_image_ts_2.readRequestImageFile; } });
Object.defineProperty(exports, "requestImageDimensions", { enumerable: true, get: function () { return request_image_ts_2.requestImageDimensions; } });
Object.defineProperty(exports, "requestImageVariantId", { enumerable: true, get: function () { return request_image_ts_2.requestImageVariantId; } });
/** Default maximum encoded bytes for one submitted image; oversized sources are refused, not shrunk. */
exports.DEFAULT_MAX_IMAGE_BYTES = 20 * 1024 * 1024;
/** Default maximum images in one prompt. */
exports.DEFAULT_MAX_IMAGES_PER_MESSAGE = 20;
/** Default maximum aggregate image bytes in one prompt. */
exports.DEFAULT_MAX_MESSAGE_IMAGE_BYTES = 200 * 1024 * 1024;
/** Default maximum intrinsic pixels for one submitted image. */
exports.DEFAULT_MAX_IMAGE_PIXELS = 64000000;
/** Default per-side pixel cap for one submitted image. */
exports.DEFAULT_MAX_IMAGE_DIMENSION = 8192;
/**
 * Default long-edge target of the stored normalized image. A larger source
 * is admitted and downscaled to this edge, so admission bounds what rides
 * every later model request without refusing ordinary large sources.
 */
exports.DEFAULT_NORMALIZED_IMAGE_MAX_DIMENSION = 2048;
/** Default independent safety cap for one stored normalized image. */
exports.DEFAULT_NORMALIZED_IMAGE_MAX_BYTES = 4 * 1024 * 1024;
/** Conservative default number of simultaneous native image transformations per store. */
exports.DEFAULT_IMAGE_COMPRESSION_CONCURRENCY = 2;
/** Maximum configurable native image transformations per store. */
exports.MAX_IMAGE_COMPRESSION_CONCURRENCY = 8;
function abortReason(signal) {
    var reason = signal.reason;
    return reason instanceof Error
        ? reason
        : new Error('Attachment request cancelled with a non-Error reason.', { cause: reason });
}
var SharedRequest = /** @class */ (function () {
    function SharedRequest(start) {
        var _this = this;
        this.controller = new AbortController();
        this.settled = false;
        this.waiters = 0;
        this.promise = start(this.controller.signal).finally(function () {
            _this.settled = true;
        });
    }
    SharedRequest.prototype.wait = function (signal) {
        var _this = this;
        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
        this.waiters += 1;
        if (signal === undefined) {
            return this.promise.finally(function () {
                _this.release(false);
            });
        }
        var released = false;
        var release = function (cancelled) {
            if (released)
                return;
            released = true;
            _this.release(cancelled, signal);
        };
        return new Promise(function (resolve, reject) {
            var abort = function () {
                release(true);
                reject(abortReason(signal));
            };
            signal.addEventListener('abort', abort, { once: true });
            void _this.promise.then(function (value) {
                signal.removeEventListener('abort', abort);
                release(false);
                resolve(value);
            }, function (error) {
                signal.removeEventListener('abort', abort);
                release(false);
                // CompressionLimiter normalizes task rejections before this handler.
                // oxlint-disable-next-line typescript/prefer-promise-reject-errors
                reject(error);
            });
        });
    };
    SharedRequest.prototype.release = function (cancelled, signal) {
        this.waiters -= 1;
        if (cancelled && this.waiters === 0 && !this.settled && signal !== undefined) {
            this.controller.abort(abortReason(signal));
        }
    };
    return SharedRequest;
}());
/** Persistent content-addressed local attachment store. */
var LocalAttachmentStore = /** @class */ (function (_super) {
    __extends(LocalAttachmentStore, _super);
    function LocalAttachmentStore(ctx, config) {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        var _this = _super.call(this, ctx) || this;
        _this.requestInflight = new Map();
        _this.root = (0, node_path_1.resolve)((0, node_path_1.join)((0, dsh_home_paths_1.resolveDshHome)(config.dshHome), 'attachments', 'v1'));
        _this.imageLimits = Object.freeze({
            maxImageBytes: (_a = config.maxImageBytes) !== null && _a !== void 0 ? _a : exports.DEFAULT_MAX_IMAGE_BYTES,
            maxImagesPerMessage: (_b = config.maxImagesPerMessage) !== null && _b !== void 0 ? _b : exports.DEFAULT_MAX_IMAGES_PER_MESSAGE,
            maxMessageImageBytes: (_c = config.maxMessageImageBytes) !== null && _c !== void 0 ? _c : exports.DEFAULT_MAX_MESSAGE_IMAGE_BYTES,
            maxImagePixels: (_d = config.maxImagePixels) !== null && _d !== void 0 ? _d : exports.DEFAULT_MAX_IMAGE_PIXELS,
            maxImageDimension: (_e = config.maxImageDimension) !== null && _e !== void 0 ? _e : exports.DEFAULT_MAX_IMAGE_DIMENSION,
            mediaTypes: Object.freeze(['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
        });
        _this.normalizationPolicy = Object.freeze({
            maxDimension: (_f = config.normalizedImageMaxDimension) !== null && _f !== void 0 ? _f : exports.DEFAULT_NORMALIZED_IMAGE_MAX_DIMENSION,
            maxBytes: (_g = config.normalizedImageMaxBytes) !== null && _g !== void 0 ? _g : exports.DEFAULT_NORMALIZED_IMAGE_MAX_BYTES,
        });
        var compressionConcurrency = (_h = config.imageCompressionConcurrency) !== null && _h !== void 0 ? _h : exports.DEFAULT_IMAGE_COMPRESSION_CONCURRENCY;
        if (!Number.isSafeInteger(compressionConcurrency)
            || compressionConcurrency < 1
            || compressionConcurrency > exports.MAX_IMAGE_COMPRESSION_CONCURRENCY) {
            throw new Error("attachment-local: imageCompressionConcurrency must be an integer from 1 through ".concat(exports.MAX_IMAGE_COMPRESSION_CONCURRENCY));
        }
        _this.imageCompressionConcurrency = compressionConcurrency;
        _this.compression = new compression_limiter_ts_1.CompressionLimiter(compressionConcurrency);
        return _this;
    }
    LocalAttachmentStore.prototype.validateImage = function (input) {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.compression.run(function () { return (0, store_ts_1.validateImageFile)(input, _this.imageLimits, _this.normalizationPolicy); })];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    LocalAttachmentStore.prototype.saveImages = function (inputs) {
        return __awaiter(this, void 0, void 0, function () {
            var prepared, refs, _i, prepared_1, image, _a, _b;
            var _this = this;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        this.validateImageBatch(inputs);
                        return [4 /*yield*/, Promise.all(inputs.map(function (input) { return _this.compression.run(function () { return (0, store_ts_1.prepareImageFile)(input, _this.imageLimits, _this.normalizationPolicy); }); }))];
                    case 1:
                        prepared = _c.sent();
                        refs = [];
                        _i = 0, prepared_1 = prepared;
                        _c.label = 2;
                    case 2:
                        if (!(_i < prepared_1.length)) return [3 /*break*/, 5];
                        image = prepared_1[_i];
                        _b = (_a = refs).push;
                        return [4 /*yield*/, (0, store_ts_1.commitPreparedImageFile)(this.root, image)];
                    case 3:
                        _b.apply(_a, [_c.sent()]);
                        _c.label = 4;
                    case 4:
                        _i++;
                        return [3 /*break*/, 2];
                    case 5: return [2 /*return*/, refs];
                }
            });
        });
    };
    LocalAttachmentStore.prototype.saveImage = function (input) {
        return __awaiter(this, void 0, void 0, function () {
            var prepared;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.compression.run(function () { return (0, store_ts_1.prepareImageFile)(input, _this.imageLimits, _this.normalizationPolicy); })];
                    case 1:
                        prepared = _a.sent();
                        return [2 /*return*/, (0, store_ts_1.commitPreparedImageFile)(this.root, prepared)];
                }
            });
        });
    };
    LocalAttachmentStore.prototype.readImage = function (ref, signal) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, (0, store_ts_1.readImageFile)(this.root, ref, signal)];
            });
        });
    };
    LocalAttachmentStore.prototype.readImageRequest = function (ref, policy, signal) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.requestVersion(ref, policy, undefined, signal)];
            });
        });
    };
    LocalAttachmentStore.prototype.requestVersion = function (ref, policy, stored, signal) {
        var _this = this;
        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
        var variantId = (0, request_image_ts_1.requestImageVariantId)(ref, policy);
        var key = String(variantId);
        var operation = this.requestInflight.get(key);
        if (operation === null || operation === void 0 ? void 0 : operation.controller.signal.aborted) {
            this.requestInflight.delete(key);
            operation = undefined;
        }
        if (operation === undefined) {
            var shared_1 = new SharedRequest(function (sharedSignal) { return _this.compression.run(function () { return __awaiter(_this, void 0, void 0, function () {
                var _a, _b, _c;
                return __generator(this, function (_d) {
                    switch (_d.label) {
                        case 0:
                            _a = request_image_ts_1.readRequestImageFile;
                            _b = [this.root];
                            if (!(stored !== null && stored !== void 0)) return [3 /*break*/, 1];
                            _c = stored;
                            return [3 /*break*/, 3];
                        case 1: return [4 /*yield*/, this.readImage(ref, sharedSignal)];
                        case 2:
                            _c = _d.sent();
                            _d.label = 3;
                        case 3: return [2 /*return*/, _a.apply(void 0, _b.concat([_c, policy,
                                sharedSignal]))];
                    }
                });
            }); }); });
            operation = shared_1;
            this.requestInflight.set(key, shared_1);
            void shared_1.promise.finally(function () {
                if (_this.requestInflight.get(key) === shared_1)
                    _this.requestInflight.delete(key);
            }).catch(function () { });
        }
        return operation.wait(signal);
    };
    LocalAttachmentStore.Config = schemastery_1.default.object({
        dshHome: schemastery_1.default.string(),
        maxImageBytes: schemastery_1.default.number().step(1).min(1).default(exports.DEFAULT_MAX_IMAGE_BYTES),
        maxImagesPerMessage: schemastery_1.default.number().step(1).min(1).default(exports.DEFAULT_MAX_IMAGES_PER_MESSAGE),
        maxMessageImageBytes: schemastery_1.default.number().step(1).min(1).default(exports.DEFAULT_MAX_MESSAGE_IMAGE_BYTES),
        maxImagePixels: schemastery_1.default.number().step(1).min(1).default(exports.DEFAULT_MAX_IMAGE_PIXELS),
        maxImageDimension: schemastery_1.default.number().step(1).min(1).default(exports.DEFAULT_MAX_IMAGE_DIMENSION),
        normalizedImageMaxDimension: schemastery_1.default.number().step(1).min(1).default(exports.DEFAULT_NORMALIZED_IMAGE_MAX_DIMENSION),
        normalizedImageMaxBytes: schemastery_1.default.number().step(1).min(1).default(exports.DEFAULT_NORMALIZED_IMAGE_MAX_BYTES),
        imageCompressionConcurrency: schemastery_1.default.number().step(1).min(1).max(exports.MAX_IMAGE_COMPRESSION_CONCURRENCY)
            .default(exports.DEFAULT_IMAGE_COMPRESSION_CONCURRENCY),
    });
    return LocalAttachmentStore;
}(dsh_attachment_1.AttachmentStore));
exports.LocalAttachmentStore = LocalAttachmentStore;
exports.default = LocalAttachmentStore;
