"use strict";
/**
 * One opened JSON unit. The in-memory state is authoritative; every write
 * primitive mutates it and republishes the whole file atomically. Writes are
 * NOT queued here — per the backend contract, write ordering belongs to the
 * caller (the domain layer's write chain); this unit only guarantees that
 * each single call publishes a complete, durable file.
 * @module @z/dsh-storage-json/src/unit
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.openJsonUnit = openJsonUnit;
var promises_1 = require("node:fs/promises");
var dsh_storage_1 = require("@z/dsh-storage");
var atomic_ts_1 = require("./atomic.ts");
var format_ts_1 = require("./format.ts");
/**
 * Open (load or lazily create) one unit backed by `path`.
 * @param descriptor - Static identity and shape of the unit.
 * @param path - Absolute unit file path under the backend root.
 * @param onClose - Backend callback releasing the unit's open-slot.
 * @returns the opened unit.
 */
function openJsonUnit(descriptor, path, onClose) {
    return __awaiter(this, void 0, void 0, function () {
        var text, error_1, state;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, (0, promises_1.readFile)(path, 'utf8')];
                case 1:
                    text = _a.sent();
                    return [3 /*break*/, 3];
                case 2:
                    error_1 = _a.sent();
                    if (error_1.code !== 'ENOENT')
                        throw error_1;
                    return [3 /*break*/, 3];
                case 3:
                    state = text === undefined
                        ? {
                            version: descriptor.version,
                            global: null,
                            tables: new Map(descriptor.tables.map(function (table) { return [table, new Map()]; })),
                        }
                        : (0, format_ts_1.parse)(text, descriptor);
                    return [2 /*return*/, new JsonKvUnit(descriptor, path, state, onClose)];
            }
        });
    });
}
var JsonKvUnit = /** @class */ (function () {
    function JsonKvUnit(descriptor, path, state, onClose) {
        this.descriptor = descriptor;
        this.path = path;
        this.state = state;
        this.onClose = onClose;
        this.closed = false;
        /** In-flight publishes; close() drains them before releasing the unit. */
        this.inFlight = new Set();
    }
    // oxlint-disable-next-line typescript/require-await -- async keeps the closed guard a rejection, not a synchronous throw
    JsonKvUnit.prototype.loadAll = function () {
        return __awaiter(this, void 0, void 0, function () {
            var tables, _i, _a, _b, table, records;
            return __generator(this, function (_c) {
                this.assertOpen();
                tables = {};
                for (_i = 0, _a = this.state.tables; _i < _a.length; _i++) {
                    _b = _a[_i], table = _b[0], records = _b[1];
                    tables[table] = Object.fromEntries(records);
                }
                return [2 /*return*/, { tables: tables, global: this.state.global }];
            });
        });
    };
    JsonKvUnit.prototype.putRecord = function (table, key, value) {
        return __awaiter(this, void 0, void 0, function () {
            var records, hadKey, previous;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        this.assertOpen();
                        records = this.records(table);
                        hadKey = records.has(key);
                        previous = records.get(key);
                        records.set(key, value);
                        // Roll back on a failed publish: memory is authoritative, so a rejected
                        // write must not survive in memory (or ride along with the next publish).
                        return [4 /*yield*/, this.publish().catch(function (error) {
                                if (hadKey)
                                    records.set(key, previous);
                                else
                                    records.delete(key);
                                throw error;
                            })];
                    case 1:
                        // Roll back on a failed publish: memory is authoritative, so a rejected
                        // write must not survive in memory (or ride along with the next publish).
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    JsonKvUnit.prototype.deleteRecord = function (table, key) {
        return __awaiter(this, void 0, void 0, function () {
            var records, previous;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        this.assertOpen();
                        records = this.records(table);
                        if (!records.has(key))
                            return [2 /*return*/];
                        previous = records.get(key);
                        records.delete(key);
                        return [4 /*yield*/, this.publish().catch(function (error) {
                                records.set(key, previous);
                                throw error;
                            })];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    JsonKvUnit.prototype.setGlobal = function (value) {
        return __awaiter(this, void 0, void 0, function () {
            var previous;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        this.assertOpen();
                        if (!this.descriptor.hasGlobal) {
                            throw new Error("unit '".concat(this.descriptor.name, "' does not declare a global slot"));
                        }
                        previous = this.state.global;
                        this.state.global = value;
                        return [4 /*yield*/, this.publish().catch(function (error) {
                                _this.state.global = previous;
                                throw error;
                            })];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    JsonKvUnit.prototype.close = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.closed) return [3 /*break*/, 2];
                        return [4 /*yield*/, Promise.allSettled(this.inFlight)];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                    case 2:
                        this.closed = true;
                        return [4 /*yield*/, Promise.allSettled(this.inFlight)];
                    case 3:
                        _a.sent();
                        this.onClose();
                        return [2 /*return*/];
                }
            });
        });
    };
    JsonKvUnit.prototype.assertOpen = function () {
        if (this.closed) {
            throw new dsh_storage_1.StorageError('closed', "unit '".concat(this.descriptor.name, "' is closed"));
        }
    };
    JsonKvUnit.prototype.records = function (table) {
        var records = this.state.tables.get(table);
        if (!records) {
            throw new Error("unit '".concat(this.descriptor.name, "' does not declare table '").concat(table, "'"));
        }
        return records;
    };
    JsonKvUnit.prototype.publish = function () {
        var _this = this;
        var write = (0, atomic_ts_1.writeAtomic)(this.path, (0, format_ts_1.serialize)(this.descriptor.name, this.state));
        this.inFlight.add(write);
        // Swallow only on the tracking branch: the caller still awaits `write`
        // itself, so rejections stay observed exactly once.
        write.catch(function () { }).finally(function () { return _this.inFlight.delete(write); });
        return write;
    };
    return JsonKvUnit;
}());
