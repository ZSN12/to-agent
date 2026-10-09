"use strict";
/** Content-addressed, owner-private local attachment storage. */
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
exports.validateImageFile = validateImageFile;
exports.prepareImageFile = prepareImageFile;
exports.commitPreparedImageFile = commitPreparedImageFile;
exports.saveImageFile = saveImageFile;
exports.readImageFile = readImageFile;
var node_crypto_1 = require("node:crypto");
var node_fs_1 = require("node:fs");
var promises_1 = require("node:fs/promises");
var node_path_1 = require("node:path");
var dsh_attachment_1 = require("@z/dsh-attachment");
var normalization_ts_1 = require("./normalization.ts");
var image_ts_1 = require("./image.ts");
var ID_PATTERN = /^sha256:([a-f0-9]{64})$/;
var durableHomes = new Set();
function digest(data) {
    return (0, node_crypto_1.createHash)('sha256').update(data).digest('hex');
}
function displayName(value) {
    if (value === undefined)
        return undefined;
    // Strip both separator styles by hand: a POSIX host treats `\` as an
    // ordinary character, so path.basename would keep a Windows client's full
    // local path and leak it into the reference and the session log.
    var leaf = value.slice(Math.max(value.lastIndexOf('/'), value.lastIndexOf('\\')) + 1);
    var clean = leaf.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 255);
    return clean === '' ? undefined : clean;
}
function objectPath(root, sha256) {
    return (0, node_path_1.join)(root, 'objects', sha256.slice(0, 2), sha256);
}
function ensureReference(ref) {
    var match = ID_PATTERN.exec(String(ref.attachmentId));
    if ((match === null || match === void 0 ? void 0 : match[1]) === undefined)
        throw new dsh_attachment_1.AttachmentError('Attachment reference is invalid.', 'INVALID_ATTACHMENT_REF');
    return match[1];
}
function inspectMetadata(data, declaredMediaType, limits) {
    return __awaiter(this, void 0, void 0, function () {
        var detected;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (data.byteLength === 0)
                        throw new dsh_attachment_1.AttachmentError('Image is empty.', 'INVALID_IMAGE');
                    return [4 /*yield*/, (0, image_ts_1.detectImage)(data, { maxPixels: limits.maxImagePixels, maxDimension: limits.maxImageDimension })];
                case 1:
                    detected = _a.sent();
                    if (detected.mediaType !== declaredMediaType)
                        throw new dsh_attachment_1.AttachmentError('Declared image type does not match its bytes.', 'IMAGE_TYPE_MISMATCH');
                    return [2 /*return*/, detected];
            }
        });
    });
}
/**
 * Run the full admission policy for one image without touching storage,
 * including normalization: a batch whose members all validate cannot later
 * be refused by the normalized image byte cap during publication.
 * @param input - encoded bytes and declared metadata.
 * @param limits - resolved source admission policy.
 * @param policy - resolved normalization policy.
 * @returns completion after the raster has been decoded and its normalized version proven to fit.
 */
function validateImageFile(input, limits, policy) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, prepareImageFile(input, limits, policy)];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * Decode, normalize, and verify one submitted image without touching storage.
 * @param input - submitted encoded bytes and declared media type.
 * @param limits - source admission policy.
 * @param policy - independent normalization policy.
 * @returns immutable reference facts beside bytes ready for atomic publication.
 */
function prepareImageFile(input, limits, policy) {
    return __awaiter(this, void 0, void 0, function () {
        var detected, normalized, sha256, name, downscaled;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (input.data.byteLength > limits.maxImageBytes) {
                        throw new dsh_attachment_1.AttachmentError('Image exceeds the configured byte limit.', 'IMAGE_TOO_LARGE');
                    }
                    return [4 /*yield*/, inspectMetadata(input.data, input.mediaType, limits)];
                case 1:
                    detected = _a.sent();
                    return [4 /*yield*/, (0, normalization_ts_1.normalizeImage)(input.data, detected, policy)];
                case 2:
                    normalized = _a.sent();
                    sha256 = digest(normalized.data);
                    name = displayName(input.name);
                    downscaled = detected.width !== normalized.width || detected.height !== normalized.height;
                    return [2 /*return*/, {
                            data: normalized.data,
                            ref: __assign(__assign({ attachmentId: (0, dsh_attachment_1.AttachmentId)("sha256:".concat(sha256)), mediaType: normalized.mediaType, width: normalized.width, height: normalized.height, bytes: normalized.data.byteLength }, (name !== undefined ? { name: name } : {})), downscaled ? { originalDimensions: { width: detected.width, height: detected.height } } : {}),
                        }];
            }
        });
    });
}
/**
 * Make a directory's entries durable (fsync on a read-only directory handle).
 * A synced file alone does not survive a crash when its directory entry never
 * reached storage, so the publication directory is synced before a durable
 * reference is reported.
 */
function syncDirectory(path) {
    return __awaiter(this, void 0, void 0, function () {
        var handle;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    /* v8 ignore next -- Windows cannot open directory handles; NTFS metadata journaling owns entry durability there. */
                    if (process.platform === 'win32')
                        return [2 /*return*/];
                    return [4 /*yield*/, (0, promises_1.open)(path, node_fs_1.constants.O_RDONLY)];
                case 1:
                    handle = _a.sent();
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, , 4, 6]);
                    return [4 /*yield*/, handle.sync()];
                case 3:
                    _a.sent();
                    return [3 /*break*/, 6];
                case 4: return [4 /*yield*/, handle.close()];
                case 5:
                    _a.sent();
                    return [7 /*endfinally*/];
                case 6: return [2 /*return*/];
            }
        });
    });
}
/**
 * Create one private directory tree and persist every ancestor entry up to a
 * caller-vouched durable boundary. The walk deliberately ignores what mkdir
 * reports as newly created: a concurrent first save can create a level this
 * process then merely observes, so "already existed" is not "already durable"
 * — the entry may still be unsynced in the creator, and a crash would drop a
 * directory the session checkpoint already references. Re-syncing a durable
 * entry is harmless; skipping an unsynced one is not.
 * @param path - absolute directory to create.
 * @param boundary - absolute ancestor the caller vouches is already durable.
 */
function ensureDurableDirectory(path, boundary) {
    return __awaiter(this, void 0, void 0, function () {
        var target, stop, level, parent_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    target = (0, node_path_1.resolve)(path);
                    stop = (0, node_path_1.resolve)(boundary);
                    return [4 /*yield*/, (0, promises_1.mkdir)(target, { recursive: true, mode: 448 })];
                case 1:
                    _a.sent();
                    return [4 /*yield*/, (0, promises_1.chmod)(target, 448)];
                case 2:
                    _a.sent();
                    level = target;
                    _a.label = 3;
                case 3:
                    if (!(level !== stop)) return [3 /*break*/, 5];
                    parent_1 = (0, node_path_1.dirname)(level);
                    return [4 /*yield*/, syncDirectory(parent_1)
                        /* v8 ignore next -- filesystem-root guard: callers pass a boundary that is an ancestor of path, so the walk reaches it first. */
                    ];
                case 4:
                    _a.sent();
                    /* v8 ignore next -- filesystem-root guard: callers pass a boundary that is an ancestor of path, so the walk reaches it first. */
                    if (parent_1 === level)
                        return [2 /*return*/];
                    level = parent_1;
                    return [3 /*break*/, 3];
                case 5: return [2 /*return*/];
            }
        });
    });
}
/**
 * Establish this process's proof that one DSH_HOME entry and every ancestor
 * below the filesystem root are durable. Mere existence is insufficient: a
 * concurrent process may have created the directory but not synced its parent.
 */
function ensureDurableHome(path) {
    return __awaiter(this, void 0, void 0, function () {
        var home;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    home = (0, node_path_1.resolve)(path);
                    if (!!durableHomes.has(home)) return [3 /*break*/, 2];
                    return [4 /*yield*/, ensureDurableDirectory(home, (0, node_path_1.parse)(home).root)];
                case 1:
                    _a.sent();
                    durableHomes.add(home);
                    _a.label = 2;
                case 2: return [2 /*return*/, home];
            }
        });
    });
}
/**
 * Publish one already verified normalized image below a versioned attachment root.
 * @param root - absolute `DSH_HOME/attachments/v1` root.
 * @param prepared - deterministic normalized bytes and reference.
 * @returns durable content-addressed normalized image reference.
 */
function commitPreparedImageFile(root, prepared) {
    return __awaiter(this, void 0, void 0, function () {
        var normalized, sha256, bucket, staging, boundary, temporary, target, handle, error_1, existing, _a, error_2;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    normalized = prepared.data;
                    sha256 = ensureReference(prepared.ref);
                    if (digest(normalized) !== sha256 || normalized.byteLength !== prepared.ref.bytes) {
                        throw new dsh_attachment_1.AttachmentError('Prepared attachment bytes do not match their reference.', 'ATTACHMENT_CORRUPT');
                    }
                    bucket = (0, node_path_1.join)(root, 'objects', sha256.slice(0, 2));
                    staging = (0, node_path_1.join)(root, 'tmp');
                    return [4 /*yield*/, ensureDurableHome((0, node_path_1.dirname)((0, node_path_1.dirname)((0, node_path_1.resolve)(root))))];
                case 1:
                    boundary = _b.sent();
                    return [4 /*yield*/, ensureDurableDirectory(bucket, boundary)];
                case 2:
                    _b.sent();
                    return [4 /*yield*/, ensureDurableDirectory(staging, boundary)];
                case 3:
                    _b.sent();
                    temporary = (0, node_path_1.join)(staging, (0, node_crypto_1.randomUUID)());
                    target = objectPath(root, sha256);
                    _b.label = 4;
                case 4:
                    _b.trys.push([4, 17, , 21]);
                    return [4 /*yield*/, (0, promises_1.open)(temporary, node_fs_1.constants.O_CREAT | node_fs_1.constants.O_EXCL | node_fs_1.constants.O_WRONLY, 384)];
                case 5:
                    handle = _b.sent();
                    return [4 /*yield*/, handle.writeFile(normalized)];
                case 6:
                    _b.sent();
                    return [4 /*yield*/, handle.sync()];
                case 7:
                    _b.sent();
                    return [4 /*yield*/, handle.close()];
                case 8:
                    _b.sent();
                    handle = undefined;
                    _b.label = 9;
                case 9:
                    _b.trys.push([9, 11, , 13]);
                    return [4 /*yield*/, (0, promises_1.link)(temporary, target)];
                case 10:
                    _b.sent();
                    return [3 /*break*/, 13];
                case 11:
                    error_1 = _b.sent();
                    /* v8 ignore next -- Private same-filesystem directories make EEXIST the only recoverable link race. */
                    if (!(error_1 instanceof Error && 'code' in error_1 && error_1.code === 'EEXIST'))
                        throw error_1;
                    _a = Uint8Array.bind;
                    return [4 /*yield*/, (0, promises_1.readFile)(target)];
                case 12:
                    existing = new (_a.apply(Uint8Array, [void 0, _b.sent()]))();
                    if (digest(existing) !== sha256)
                        throw new dsh_attachment_1.AttachmentError('Stored attachment failed integrity verification.', 'ATTACHMENT_CORRUPT');
                    return [3 /*break*/, 13];
                case 13: 
                // Persist the target entry and close a concurrent bucket-creation window
                // before the reference can reach a session checkpoint. The dedup path
                // repeats both syncs because it may observe another writer's link before
                // that writer reaches its own durability boundary.
                return [4 /*yield*/, syncDirectory(bucket)];
                case 14:
                    // Persist the target entry and close a concurrent bucket-creation window
                    // before the reference can reach a session checkpoint. The dedup path
                    // repeats both syncs because it may observe another writer's link before
                    // that writer reaches its own durability boundary.
                    _b.sent();
                    return [4 /*yield*/, syncDirectory((0, node_path_1.join)(root, 'objects'))];
                case 15:
                    _b.sent();
                    return [4 /*yield*/, (0, promises_1.unlink)(temporary)];
                case 16:
                    _b.sent();
                    return [3 /*break*/, 21];
                case 17:
                    error_2 = _b.sent();
                    if (!(handle !== undefined)) return [3 /*break*/, 19];
                    return [4 /*yield*/, handle.close().catch(
                        /* v8 ignore next -- Close failure is superseded by the storage operation that entered cleanup. */
                        function () { })];
                case 18:
                    _b.sent();
                    _b.label = 19;
                case 19: return [4 /*yield*/, (0, promises_1.unlink)(temporary).catch(
                    /* v8 ignore next -- The callback requires a second independent staging-unlink failure. */
                    function (cleanupError) {
                        /* v8 ignore next -- Cleanup is best-effort only for a staging file already removed by a failed operation. */
                        if (!(cleanupError instanceof Error && 'code' in cleanupError && cleanupError.code === 'ENOENT'))
                            throw cleanupError;
                    })];
                case 20:
                    _b.sent();
                    if (error_2 instanceof dsh_attachment_1.AttachmentError)
                        throw error_2;
                    throw new dsh_attachment_1.AttachmentError('Unable to persist image attachment.', 'ATTACHMENT_WRITE_FAILED', { cause: error_2 });
                case 21: return [2 /*return*/, prepared.ref];
            }
        });
    });
}
/**
 * Decode and normalize one image once, then publish the prepared object.
 * @param root - absolute `DSH_HOME/attachments/v1` root.
 * @param input - submitted encoded bytes and declared media type.
 * @param limits - resolved source admission policy.
 * @param policy - resolved normalization policy.
 * @returns durable content-addressed normalized image reference.
 */
function saveImageFile(root, input, limits, policy) {
    return __awaiter(this, void 0, void 0, function () {
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    _a = commitPreparedImageFile;
                    _b = [root];
                    return [4 /*yield*/, prepareImageFile(input, limits, policy)];
                case 1: return [2 /*return*/, _a.apply(void 0, _b.concat([_c.sent()]))];
            }
        });
    });
}
/**
 * Read and verify one content-addressed image.
 * @param root - absolute `DSH_HOME/attachments/v1` root.
 * @param ref - reference recorded in the session log.
 * @param signal - optional cancellation for filesystem and verification work.
 * @returns verified bytes and reference.
 * @throws the signal reason when aborted, or an AttachmentError when verification fails.
 */
function readImageFile(root, ref, signal) {
    return __awaiter(this, void 0, void 0, function () {
        var sha256, data, _a, error_3, metadata;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                    sha256 = ensureReference(ref);
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 3, , 4]);
                    _a = Uint8Array.bind;
                    return [4 /*yield*/, (0, promises_1.readFile)(objectPath(root, sha256), { signal: signal })];
                case 2:
                    data = new (_a.apply(Uint8Array, [void 0, _b.sent()]))();
                    return [3 /*break*/, 4];
                case 3:
                    error_3 = _b.sent();
                    signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                    if (error_3 instanceof Error && 'code' in error_3 && error_3.code === 'ENOENT')
                        throw new dsh_attachment_1.AttachmentError('Attachment object is missing.', 'ATTACHMENT_NOT_FOUND');
                    throw new dsh_attachment_1.AttachmentError('Unable to read image attachment.', 'ATTACHMENT_READ_FAILED', { cause: error_3 });
                case 4:
                    signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                    if (digest(data) !== sha256)
                        throw new dsh_attachment_1.AttachmentError('Stored attachment failed integrity verification.', 'ATTACHMENT_CORRUPT');
                    return [4 /*yield*/, (0, image_ts_1.probeImage)(data)];
                case 5:
                    metadata = _b.sent();
                    signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                    if (metadata.mediaType !== ref.mediaType || data.byteLength !== ref.bytes
                        || metadata.width !== ref.width || metadata.height !== ref.height) {
                        throw new dsh_attachment_1.AttachmentError('Stored attachment metadata does not match its reference.', 'ATTACHMENT_CORRUPT');
                    }
                    return [2 /*return*/, { ref: ref, data: data }];
            }
        });
    });
}
