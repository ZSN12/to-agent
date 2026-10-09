"use strict";
/**
 * Node-private synchronous Zstandard frame decoder optimization.
 * @module dsh-session-persistence-jsonl/zstd-private-decoder
 */
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
exports.NodePrivateZstdFrameDecoder = void 0;
var node_buffer_1 = require("node:buffer");
var node_zlib_1 = require("node:zlib");
var DECODE_CHUNK_SIZE = 1024 * 1024;
/** Return the stream with its observed private Node contract, or reject that optimization. */
function privateZstdStream(stream) {
    var candidate = stream;
    var handle = candidate._handle;
    var errorKey = Reflect.ownKeys(stream).find(function (key) { return (typeof key === 'symbol' && key.description === 'kError'); });
    /* v8 ignore next -- one test runtime exposes one Node-private shape; the Node 22/24/26 matrix checks compatibility. */
    if (typeof handle !== 'object' || handle === null
        || typeof handle.writeSync !== 'function'
        || !(candidate._writeState instanceof Uint32Array)
        || candidate._writeState.length < 2
        || typeof candidate._defaultFlushFlag !== 'number'
        || errorKey === undefined
        || candidate[errorKey] !== null)
        return undefined;
    return { stream: stream, errorKey: errorKey };
}
/**
 * Synchronous multi-frame decoder backed by one Node Zstd stream handle. Node
 * exposes synchronous decoding only as a one-shot API, so this adapter uses
 * the stream's private handle contract to reuse its native context and output
 * chunks across frames.
 */
var NodePrivateZstdFrameDecoder = /** @class */ (function () {
    function NodePrivateZstdFrameDecoder(stream, errorKey) {
        var _this = this;
        this.stream = stream;
        this.errorKey = errorKey;
        this.output = Buffer.allocUnsafe(DECODE_CHUNK_SIZE);
        this.started = false;
        this.closed = false;
        this.stream.on('error', function (error) {
            var _a;
            (_a = _this.decoderError) !== null && _a !== void 0 ? _a : (_this.decoderError = error);
        });
    }
    /**
     * Create the optimized decoder when this Node release exposes the expected
     * private stream shape.
     * @returns a shared decoder, or `undefined` when callers must use the public fallback.
     */
    NodePrivateZstdFrameDecoder.create = function () {
        var stream = (0, node_zlib_1.createZstdDecompress)({ chunkSize: DECODE_CHUNK_SIZE });
        var privateAccess = privateZstdStream(stream);
        /* v8 ignore next -- reached only when a supported Node release changes its private stream shape. */
        if (privateAccess !== undefined) {
            return new NodePrivateZstdFrameDecoder(privateAccess.stream, privateAccess.errorKey);
        }
        /* v8 ignore next -- the active Node runtime passed the private-shape probe above. */
        stream.close();
        /* v8 ignore next -- the active Node runtime passed the private-shape probe above. */
        return undefined;
    };
    /** @inheritdoc */
    NodePrivateZstdFrameDecoder.prototype.decode = function (source, frames) {
        var _i, frames_1, frame, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (this.started)
                        throw new Error('Zstandard frame decoder was already started');
                    if (this.closed)
                        throw new Error('cannot start a closed Zstandard frame decoder');
                    this.started = true;
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, , 8, 9]);
                    _i = 0, frames_1 = frames;
                    _a.label = 2;
                case 2:
                    if (!(_i < frames_1.length)) return [3 /*break*/, 7];
                    frame = frames_1[_i];
                    _a.label = 3;
                case 3:
                    _a.trys.push([3, 5, , 6]);
                    return [4 /*yield*/, this.decodeFrame(source.subarray(frame.start, frame.end))];
                case 4:
                    _a.sent();
                    return [3 /*break*/, 6];
                case 5:
                    error_1 = _a.sent();
                    throw new Error("corrupt Zstandard session log: frame at byte ".concat(frame.start, " failed validation"), {
                        cause: error_1,
                    });
                case 6:
                    _i++;
                    return [3 /*break*/, 2];
                case 7: return [3 /*break*/, 9];
                case 8:
                    this.close();
                    return [7 /*endfinally*/];
                case 9: return [2 /*return*/];
            }
        });
    };
    /** Decode one frame; its returned scratch view remains valid until the next call. */
    NodePrivateZstdFrameDecoder.prototype.decodeFrame = function (input) {
        var handle = this.stream._handle;
        /* v8 ignore next -- decode() rejects closed instances before entering this private frame operation. */
        if (this.closed || handle === null)
            throw new Error('cannot decode with a closed Zstandard frame decoder');
        var inputOffset = 0;
        var inputRemaining = input.length;
        var outputBytes = 0;
        var fullChunks = [];
        for (;;) {
            handle.writeSync(this.stream._defaultFlushFlag, input, inputOffset, inputRemaining, this.output, 0, this.output.length);
            if (this.decoderError !== undefined)
                throw this.decoderError;
            var internalError = this.stream[this.errorKey];
            if (internalError !== null) {
                if (internalError instanceof Error)
                    throw internalError;
                throw new Error('Zstandard decoder exposed a non-Error internal failure');
            }
            var outputAfter = this.stream._writeState[0];
            var inputAfter = this.stream._writeState[1];
            var consumed = inputRemaining - inputAfter;
            var produced = this.output.length - outputAfter;
            if (produced > 0) {
                outputBytes += produced;
                /* v8 ignore next -- Buffer cannot materialize a frame beyond its own process-wide maximum length. */
                if (outputBytes > node_buffer_1.constants.MAX_LENGTH) {
                    throw new Error("Zstandard frame output exceeds ".concat(node_buffer_1.constants.MAX_LENGTH, " bytes"));
                }
            }
            if (outputAfter !== 0) {
                /* v8 ignore next -- structurally scanned ranges contain exactly one complete frame and no trailing bytes. */
                if (inputAfter !== 0)
                    throw new Error('Zstandard frame decoder left trailing input');
                var finalChunk = this.output.subarray(0, produced);
                if (fullChunks.length === 0)
                    return finalChunk;
                if (produced > 0)
                    fullChunks.push(Buffer.from(finalChunk));
                var onlyChunk = fullChunks[0];
                return fullChunks.length === 1
                    ? onlyChunk
                    : Buffer.concat(fullChunks, outputBytes);
            }
            fullChunks.push(Buffer.from(this.output));
            inputOffset += consumed;
            inputRemaining = inputAfter;
        }
    };
    /** @inheritdoc */
    NodePrivateZstdFrameDecoder.prototype.close = function () {
        if (this.closed)
            return;
        this.closed = true;
        this.stream.close();
    };
    return NodePrivateZstdFrameDecoder;
}());
exports.NodePrivateZstdFrameDecoder = NodePrivateZstdFrameDecoder;
