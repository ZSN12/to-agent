"use strict";
/**
 * Zstandard frame primitives for the JSONL persistence backend. The backend
 * owns a concatenated-frame container so it can append and recover batches
 * without exposing compression mechanics through the persistence seam.
 * @module dsh-session-persistence-jsonl/zstd
 */
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
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.scanZstdFrames = scanZstdFrames;
exports.compressZstdFrame = compressZstdFrame;
exports.decompressZstdFrame = decompressZstdFrame;
exports.createZstdFrameDecoder = createZstdFrameDecoder;
exports.decompressZstdPrefix = decompressZstdPrefix;
var node_zlib_1 = require("node:zlib");
var node_util_1 = require("node:util");
var zstd_private_decoder_ts_1 = require("./zstd-private-decoder.ts");
var zstd_public_decoder_ts_1 = require("./zstd-public-decoder.ts");
var ZSTD_MAGIC = 0xFD2FB528;
var zstdCompressAsync = (0, node_util_1.promisify)(node_zlib_1.zstdCompress);
var zstdDecompressAsync = (0, node_util_1.promisify)(node_zlib_1.zstdDecompress);
var CHECKSUM_OPTIONS = {
    params: (_a = {}, _a[node_zlib_1.constants.ZSTD_c_checksumFlag] = 1, _a),
};
var INCOMPLETE_FRAME_OPTIONS = {
    finishFlush: node_zlib_1.constants.ZSTD_e_flush,
};
/**
 * Locate complete frames without decompressing their blocks. Invalid complete
 * structure rejects; EOF inside the final frame returns its start for repair.
 * @param buffer - complete bytes currently present in the session artifact.
 * @param maxFrames - optional complete-frame limit for metadata-only readers.
 * @returns complete frame ranges and an optional incomplete-final-frame start.
 */
function scanZstdFrames(buffer, maxFrames) {
    if (maxFrames === void 0) { maxFrames = Number.POSITIVE_INFINITY; }
    var frames = [];
    var offset = 0;
    while (offset < buffer.length) {
        var start = offset;
        if (buffer.length - offset < 4)
            return { frames: frames, tornStart: start };
        if (buffer.readUInt32LE(offset) !== ZSTD_MAGIC) {
            throw new Error("corrupt Zstandard session log: invalid frame magic at byte ".concat(offset));
        }
        offset += 4;
        if (offset === buffer.length)
            return { frames: frames, tornStart: start };
        var descriptor = buffer.readUInt8(offset);
        offset += 1;
        if ((descriptor & 0x18) !== 0) {
            throw new Error("corrupt Zstandard session log: reserved frame-header bit at byte ".concat(offset - 1));
        }
        var contentSizeFlag = descriptor >>> 6;
        var singleSegment = (descriptor & 0x20) !== 0;
        var checksum = (descriptor & 0x04) !== 0;
        var dictionaryFlag = descriptor & 0x03;
        var dictionaryBytes = dictionaryFlag === 3 ? 4 : dictionaryFlag;
        var contentSizeBytes = contentSizeFlag === 0
            ? (singleSegment ? 1 : 0)
            : 1 << contentSizeFlag;
        var remainingHeaderBytes = (singleSegment ? 0 : 1) + dictionaryBytes + contentSizeBytes;
        if (buffer.length - offset < remainingHeaderBytes)
            return { frames: frames, tornStart: start };
        offset += remainingHeaderBytes;
        for (;;) {
            if (buffer.length - offset < 3)
                return { frames: frames, tornStart: start };
            var blockHeader = buffer.readUIntLE(offset, 3);
            offset += 3;
            var lastBlock = (blockHeader & 1) !== 0;
            var blockType = (blockHeader >>> 1) & 0x03;
            var blockSize = blockHeader >>> 3;
            if (blockType === 0x03) {
                throw new Error("corrupt Zstandard session log: reserved block type at byte ".concat(offset - 3));
            }
            var payloadBytes = blockType === 0x01 ? 1 : blockSize;
            if (buffer.length - offset < payloadBytes)
                return { frames: frames, tornStart: start };
            offset += payloadBytes;
            if (lastBlock)
                break;
        }
        if (checksum) {
            if (buffer.length - offset < 4)
                return { frames: frames, tornStart: start };
            offset += 4;
        }
        frames.push({ start: start, end: offset });
        if (frames.length === maxFrames)
            return { frames: frames };
    }
    return { frames: frames };
}
/**
 * Compress one independently decodable, checksummed Zstandard frame.
 * @param input - JSONL bytes for a header or durable event batch.
 * @returns the complete encoded frame.
 */
function compressZstdFrame(input) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, zstdCompressAsync(input, CHECKSUM_OPTIONS)];
        });
    });
}
/**
 * Decompress one complete frame and validate its checksum.
 * @param input - one structurally complete Zstandard frame.
 * @returns the frame plaintext.
 */
function decompressZstdFrame(input) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, zstdDecompressAsync(input)];
        });
    });
}
/**
 * Select the shared private decoder when the running Node 22/24/26 shape is
 * compatible, otherwise preserve correctness with the public one-shot API.
 * @returns a synchronous decoder with an implementation-independent lifecycle.
 */
function createZstdFrameDecoder() {
    var _a;
    return (_a = zstd_private_decoder_ts_1.NodePrivateZstdFrameDecoder.create()) !== null && _a !== void 0 ? _a : new zstd_public_decoder_ts_1.PublicZstdFrameDecoder();
}
/**
 * Recover available plaintext from a structurally incomplete final frame.
 * `ZSTD_e_flush` deliberately suppresses final-frame and checksum completion;
 * callers must establish the torn frame boundary before using this helper.
 * @param input - available bytes from a known incomplete Zstandard frame.
 * @returns plaintext produced from the available input.
 */
function decompressZstdPrefix(input) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, zstdDecompressAsync(input, INCOMPLETE_FRAME_OPTIONS)];
        });
    });
}
