"use strict";
/**
 * The model-facing `read_image` tool commits a PNG/JPEG/WebP/GIF file.
 *
 * The route gate is deliberately stricter than the host upload preflight. An
 * image-reading tool is useful only when the exact calling route can inspect
 * its result, so unknown capability refuses instead of relying on an adapter
 * failure after filesystem and attachment work.
 * @module @z/dsh-tool-fs/src/read-image
 */
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.imageMediaTypeForPath = imageMediaTypeForPath;
exports.assertImageCapableRoute = assertImageCapableRoute;
exports.imageRefFromValue = imageRefFromValue;
exports.formatImageReadOutput = formatImageReadOutput;
exports.applyReadImageTool = applyReadImageTool;
var node_path_1 = require("node:path");
var dsh_attachment_1 = require("@z/dsh-attachment");
var dsh_tools_1 = require("@z/dsh-tools");
var read_target_ts_1 = require("./read-target.ts");
/** Extensions `read_image` accepts; magic-byte validation at the attachment service stays authoritative. */
var IMAGE_EXTENSIONS = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
};
var IMAGE_VALUE_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    required: true,
    properties: {
        attachmentId: { type: 'string', required: true },
        mediaType: { type: 'string', enum: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'], required: true },
        bytes: { type: 'integer', required: true },
        width: { type: 'integer', required: true },
        height: { type: 'integer', required: true },
        name: { type: 'string' },
        originalDimensions: {
            type: 'object',
            additionalProperties: false,
            properties: {
                width: { type: 'integer', required: true },
                height: { type: 'integer', required: true },
            },
        },
    },
};
/**
 * Map a model-supplied path to its declared image media type by extension.
 * @param filePath - the raw `file_path` argument (not yet resolved).
 * @returns the declared media type, or undefined when the path does not claim an image.
 */
function imageMediaTypeForPath(filePath) {
    return IMAGE_EXTENSIONS[(0, node_path_1.extname)(filePath).toLowerCase()];
}
/**
 * Enforce the strict image-capability gate for the calling route. Resolves the
 * session's latest routed provider/model (request header config, then agent
 * options) and requires the exact resolved route to declare `image` input explicitly.
 * @param ctx - the plugin context used to resolve the optional `llm` service.
 * @param exec - the tool-execution context supplying the calling agent.
 * @param requestedPath - the raw, not-yet-resolved path rendered in refusal messages.
 */
function assertImageCapableRoute(ctx, exec, requestedPath) {
    return __awaiter(this, void 0, void 0, function () {
        var routed, provider, model, llm, active;
        var _a, _b, _c, _d, _e, _f;
        return __generator(this, function (_g) {
            switch (_g.label) {
                case 0:
                    routed = (_b = (_a = exec.agent) === null || _a === void 0 ? void 0 : _a.session.requestHeader()) === null || _b === void 0 ? void 0 : _b.config;
                    provider = (_c = routed === null || routed === void 0 ? void 0 : routed.provider) !== null && _c !== void 0 ? _c : (_d = exec.agent) === null || _d === void 0 ? void 0 : _d.options.provider;
                    model = (_e = routed === null || routed === void 0 ? void 0 : routed.model) !== null && _e !== void 0 ? _e : (_f = exec.agent) === null || _f === void 0 ? void 0 : _f.options.model;
                    llm = ctx.get('llm');
                    if (provider === undefined || model === undefined || llm === undefined) {
                        throw new Error("cannot read \"".concat(requestedPath, "\" as an image: the current model route could not be resolved"));
                    }
                    return [4 /*yield*/, llm.resolveModelInfo(provider, model, exec.signal)];
                case 1:
                    active = _g.sent();
                    if (active.inputModalities === undefined || !active.inputModalities.includes('image')) {
                        throw new Error("cannot read \"".concat(requestedPath, "\" as an image: model \"").concat(model, "\" does not declare image input; switch to an image-capable model to read images"));
                    }
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * Re-brand a structured image outcome into the durable attachment reference an
 * `ImageBlock` carries.
 * @param image - the image metadata from the output schema.
 * @returns the branded attachment reference.
 */
function imageRefFromValue(image) {
    return __assign(__assign({ attachmentId: (0, dsh_attachment_1.AttachmentId)(image.attachmentId), mediaType: image.mediaType, bytes: image.bytes, width: image.width, height: image.height }, image.name === undefined ? {} : { name: image.name }), image.originalDimensions === undefined ? {} : {
        originalDimensions: __assign({}, image.originalDimensions),
    });
}
/**
 * Format an image read as the model-facing envelope beside its image block.
 * A downscaled read names the on-disk dimensions and the multiplier that maps
 * coordinates measured on the attached image back onto the original file.
 * @param displayPath - the backend-resolved path rendered in the envelope's `<path>` element.
 * @param image - the image metadata to summarize.
 * @returns the model-facing envelope; the image itself rides the adjacent image block.
 */
function formatImageReadOutput(displayPath, image) {
    var scaled = '';
    if (image.originalDimensions !== undefined) {
        // Integer rounding can give the two axes slightly different ratios, so the
        // advice names one multiplier only when both round to the same value.
        var x = (image.originalDimensions.width / image.width).toFixed(2);
        var y = (image.originalDimensions.height / image.height).toFixed(2);
        var advice = x === y
            ? "multiply coordinates by ".concat(x)
            : "multiply x coordinates by ".concat(x, " and y coordinates by ").concat(y);
        scaled = " (downscaled from ".concat(image.originalDimensions.width, "x").concat(image.originalDimensions.height, " px; ").concat(advice, " to locate features in the original file)");
    }
    return "<path>".concat(displayPath, "</path>\n<type>image</type>\n<content>\n").concat(image.mediaType, " image, ").concat(image.width, "x").concat(image.height, " px, ").concat(image.bytes, " bytes").concat(scaled, "\n</content>");
}
/**
 * Project one structured image read into its model-facing envelope and image.
 * @param value - the image-read outcome.
 * @returns the two content blocks used by native and nested dispatches.
 */
function imageReadContent(value) {
    return [
        { type: 'text', text: formatImageReadOutput(value.path, value.image) },
        { type: 'image', attachment: imageRefFromValue(value.image) },
    ];
}
/**
 * Register the `read_image` tool into the given context. The composing plugin
 * owns the attachments gate: `src/index.ts` calls this inside
 * `ctx.inject(['attachments'], …)` so the tool exists only while a durable
 * store is mounted. Execution still re-checks `ctx.get('attachments')` for
 * direct callers and gates on the calling route's declared image input.
 * @param ctx - the registration scope; execution uses its `fs` service plus
 *   the optional `attachments`/`llm` services.
 */
function applyReadImageTool(ctx) {
    ctx.tools.register((0, dsh_tools_1.defineTool)({
        name: 'read_image',
        description: 'Read a PNG/JPEG/WebP/GIF file and return the image itself. '
            + 'Harness validates and downscales large supported images before the next model request, so use this tool directly instead of installing image libraries or creating thumbnails merely to inspect an image. '
            + 'Independent files may be read concurrently in small batches. Requires the current model to accept image input.',
        parameters: {
            file_path: { type: 'string', required: true, description: 'Path to the image file, resolved by the filesystem backend.' },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    path: { type: 'string', required: true },
                    image: IMAGE_VALUE_SCHEMA,
                },
            },
            render: function (_args, value) { return imageReadContent(value); },
        },
        // Content-addressed attachment writes are idempotent, so concurrent reads
        // of the same file cannot conflict.
        isConcurrencySafe: function () { return true; },
        execute: function (args, exec) {
            return __awaiter(this, void 0, void 0, function () {
                var mediaType, attachments, _a, target, info, byteCap, data, ref, error_1, extension, value;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0:
                            if (args.file_path.trim().length === 0)
                                throw new Error('file_path must be a non-empty string');
                            mediaType = imageMediaTypeForPath(args.file_path);
                            if (mediaType === undefined) {
                                throw new Error("cannot read \"".concat(args.file_path, "\": read_image only accepts PNG/JPEG/WebP/GIF paths"));
                            }
                            attachments = ctx.get('attachments');
                            if (attachments === undefined) {
                                throw new Error("cannot read \"".concat(args.file_path, "\" as an image: no attachment service is mounted"));
                            }
                            if (!attachments.imageLimits.mediaTypes.includes(mediaType)) {
                                throw new Error("cannot read \"".concat(args.file_path, "\": ").concat(mediaType, " images are not accepted by this deployment"));
                            }
                            return [4 /*yield*/, assertImageCapableRoute(ctx, exec, args.file_path)];
                        case 1:
                            _b.sent();
                            return [4 /*yield*/, (0, read_target_ts_1.resolveRegularReadTarget)(ctx, exec, args.file_path)
                                // The tool result is one message carrying one image, so the per-message
                                // aggregate bound applies beside the per-image bound.
                            ];
                        case 2:
                            _a = _b.sent(), target = _a.target, info = _a.info;
                            byteCap = Math.min(attachments.imageLimits.maxImageBytes, attachments.imageLimits.maxMessageImageBytes);
                            return [4 /*yield*/, ctx.fs.readBytes(target, exec.signal, byteCap)
                                // Persist before returning: the image block must reference a durably
                                // committed object by the time the tool/result event is appended.
                            ];
                        case 3:
                            data = _b.sent();
                            _b.label = 4;
                        case 4:
                            _b.trys.push([4, 6, , 7]);
                            return [4 /*yield*/, attachments.saveImage({ data: data, mediaType: mediaType, name: (0, node_path_1.basename)(target.displayPath) })];
                        case 5:
                            ref = _b.sent();
                            return [3 /*break*/, 7];
                        case 6:
                            error_1 = _b.sent();
                            if (!(error_1 instanceof dsh_attachment_1.AttachmentError))
                                throw error_1;
                            // Dimension refusals stay recoverable tool errors: an oversized image
                            // must never enter durable history, where it would ride every later
                            // model request past provider-side dimension rejections.
                            if (error_1.code === 'IMAGE_DIMENSION_TOO_LARGE') {
                                throw new Error("cannot read \"".concat(target.displayPath, "\": at least one image side exceeds the ").concat(attachments.imageLimits.maxImageDimension, "px limit; downscale the image and read the smaller copy"), { cause: error_1 });
                            }
                            if (error_1.code === 'IMAGE_TOO_MANY_PIXELS') {
                                throw new Error("cannot read \"".concat(target.displayPath, "\": the image exceeds the ").concat(attachments.imageLimits.maxImagePixels, "-pixel decoded-size limit; downscale the image and read the smaller copy"), { cause: error_1 });
                            }
                            if (error_1.code === 'IMAGE_TOO_LARGE') {
                                throw new Error("cannot read \"".concat(target.displayPath, "\": the image cannot be stored within the deployment's byte limits; downscale the image and read the smaller copy"), { cause: error_1 });
                            }
                            if (error_1.code === 'ATTACHMENT_WRITE_FAILED' && /16-bit PNG/iu.test(error_1.message)) {
                                throw new Error("cannot read \"".concat(target.displayPath, "\": the 16-bit PNG could not be converted to the normalized 8-bit sRGB form; convert it to an 8-bit PNG/JPEG/WebP and retry"), { cause: error_1 });
                            }
                            if (error_1.code !== 'IMAGE_TYPE_MISMATCH')
                                throw error_1;
                            extension = (0, node_path_1.extname)(target.displayPath).toLowerCase();
                            throw new Error("cannot read \"".concat(target.displayPath, "\": the ").concat(extension, " extension declares ").concat(mediaType, ", but the bytes use a different image format; rename the file to match its actual format if it is PNG/JPEG/WebP/GIF, or convert it to one of those formats"), { cause: error_1 });
                        case 7:
                            ctx.emit('fs/observed', target, { kind: 'present', version: info.version }, exec);
                            value = {
                                path: target.displayPath,
                                image: __assign(__assign({ attachmentId: ref.attachmentId, mediaType: ref.mediaType, bytes: ref.bytes, width: ref.width, height: ref.height }, ref.name === undefined ? {} : { name: ref.name }), ref.originalDimensions === undefined ? {} : {
                                    originalDimensions: __assign({}, ref.originalDimensions),
                                }),
                            };
                            return [2 /*return*/, value];
                    }
                });
            });
        },
        // Pure display: a generic card in the read family with a follow-along
        // location on the image file.
        presentCall: function (args) {
            return {
                card: 'generic',
                title: "Read image ".concat(args.file_path),
                kind: 'read',
                locations: [{ path: args.file_path }],
            };
        },
    }));
}
