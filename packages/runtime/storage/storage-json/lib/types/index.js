"use strict";
/**
 * JSON storage backend: one human-readable file per unit under a configured
 * root, published by atomic whole-file rewrite. Registers as backend `json`
 * on the storage hub.
 * @module @z/dsh-storage-json
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
exports.JsonStorageBackend = exports.Config = exports.inject = exports.name = void 0;
exports.apply = apply;
var promises_1 = require("node:fs/promises");
var node_path_1 = require("node:path");
var schemastery_1 = require("@z/schemastery");
var dsh_storage_1 = require("@z/dsh-storage");
var unit_ts_1 = require("./unit.ts");
/** Cordis plugin name. */
exports.name = 'storage-json';
/** The hub must exist before the backend can register. */
exports.inject = ['storage'];
/** Config schema. */
exports.Config = schemastery_1.default.object({
    root: schemastery_1.default.string().required(),
});
/** JSON backend: owns the file-tree root and serves the `kv` facet. */
var JsonStorageBackend = /** @class */ (function () {
    function JsonStorageBackend(root) {
        var _this = this;
        this.root = root;
        this.open = new Map();
        // Reserved synchronously at open() entry so a concurrent open of the same
        // unit fails, and close() can await opens still in flight.
        this.opening = new Map();
        this.closed = false;
        this.kv = {
            // The body up to the first await runs synchronously, so the opening-slot
            // reservation below still excludes a concurrent open of the same unit.
            open: function (descriptor) { return __awaiter(_this, void 0, void 0, function () {
                var opening;
                var _this = this;
                return __generator(this, function (_a) {
                    if (this.closed)
                        throw new dsh_storage_1.StorageError('closed', 'json backend is closed');
                    validateDescriptor(descriptor);
                    if (this.open.has(descriptor.name) || this.opening.has(descriptor.name)) {
                        // Double-open is a caller bug, not a medium condition.
                        throw new Error("unit '".concat(descriptor.name, "' is already open; a unit has exactly one live handle"));
                    }
                    opening = this.openUnit(descriptor);
                    this.opening.set(descriptor.name, opening);
                    return [2 /*return*/, opening.finally(function () { return _this.opening.delete(descriptor.name); })];
                });
            }); },
        };
    }
    JsonStorageBackend.prototype.openUnit = function (descriptor) {
        return __awaiter(this, void 0, void 0, function () {
            var path, unit;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, promises_1.mkdir)(this.root, { recursive: true, mode: 448 })];
                    case 1:
                        _a.sent();
                        path = (0, node_path_1.join)(this.root, "".concat(descriptor.name, ".json"));
                        return [4 /*yield*/, (0, unit_ts_1.openJsonUnit)(descriptor, path, function () { return _this.open.delete(descriptor.name); })];
                    case 2:
                        unit = _a.sent();
                        if (!this.closed) return [3 /*break*/, 4];
                        // The backend closed while this open was in flight: do not hand out a
                        // live unit past close().
                        return [4 /*yield*/, unit.close()];
                    case 3:
                        // The backend closed while this open was in flight: do not hand out a
                        // live unit past close().
                        _a.sent();
                        throw new dsh_storage_1.StorageError('closed', 'json backend is closed');
                    case 4:
                        this.open.set(descriptor.name, unit);
                        return [2 /*return*/, unit];
                }
            });
        });
    };
    JsonStorageBackend.prototype.close = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _i, _a, unit;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        if (!this.closed) {
                            this.closed = true;
                        }
                        return [4 /*yield*/, Promise.allSettled(__spreadArray([], this.opening.values(), true))];
                    case 1:
                        _b.sent();
                        _i = 0, _a = __spreadArray([], this.open.values(), true);
                        _b.label = 2;
                    case 2:
                        if (!(_i < _a.length)) return [3 /*break*/, 5];
                        unit = _a[_i];
                        return [4 /*yield*/, unit.close()];
                    case 3:
                        _b.sent();
                        _b.label = 4;
                    case 4:
                        _i++;
                        return [3 /*break*/, 2];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    return JsonStorageBackend;
}());
exports.JsonStorageBackend = JsonStorageBackend;
function validateDescriptor(descriptor) {
    if (!dsh_storage_1.UNIT_NAME_RE.test(descriptor.name)) {
        throw new dsh_storage_1.StorageError('malformed-medium', "invalid unit name '".concat(descriptor.name, "'"));
    }
    for (var _i = 0, _a = descriptor.tables; _i < _a.length; _i++) {
        var table = _a[_i];
        if (!dsh_storage_1.UNIT_NAME_RE.test(table)) {
            throw new dsh_storage_1.StorageError('malformed-medium', "invalid table name '".concat(table, "' in unit '").concat(descriptor.name, "'"));
        }
    }
}
/**
 * Register the `json` backend on the storage hub.
 * @param ctx - Plugin context.
 * @param config - Validated configuration.
 */
function apply(ctx, config) {
    var _this = this;
    var backend = new JsonStorageBackend(config.root);
    ctx.effect(function () {
        var unregister = ctx.storage.backend.register('json', backend);
        return function () { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        unregister();
                        return [4 /*yield*/, backend.close()];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }); };
    });
    ctx.provide((0, dsh_storage_1.storageBackendServiceKey)('json'), backend);
}
