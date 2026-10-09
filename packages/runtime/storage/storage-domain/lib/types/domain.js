"use strict";
/**
 * Runtime of one open domain: authoritative in-memory state, the single
 * per-domain write chain, and change-event emission. Reads are synchronous
 * from memory; every write queues on the chain, awaits backend durability
 * FIRST, then mutates memory, then emits `domain/changed` — a rejected
 * backend write leaves memory untouched (no divergence between reads and the
 * medium), and events carry values that equal the in-memory state at
 * emission, in write order.
 * @module @z/dsh-storage-domain/src/domain
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
exports.DomainImpl = void 0;
var error_ts_1 = require("./error.ts");
var noop = function () { };
/**
 * The single domain implementation behind the {@link Domain} interface. The
 * facility constructs it from a validated `loadAll` snapshot and erases it to
 * `Domain<S>`; nothing outside this package constructs one.
 */
var DomainImpl = /** @class */ (function () {
    /**
     * @param ctx - Context that carries `domain/changed` emissions.
     * @param spec - The domain declaration.
     * @param unit - The opened backend unit; this instance owns its lifecycle.
     * @param records - Validated records from the unit's `loadAll`, one entry
     * per declared table (empty maps included) — the facility builds it from
     * the spec, so the entry set IS the table set.
     * @param globalValue - Validated stored global, or the spec's `initial`
     * when the medium held none; `undefined` when the spec declares no global.
     * @param onClosed - Facility hook run once after teardown completes; frees
     * the domain name for a later open.
     */
    function DomainImpl(ctx, spec, unit, records, globalValue, onClosed) {
        var _this = this;
        this.ctx = ctx;
        this.unit = unit;
        this.onClosed = onClosed;
        this.tables = new Map();
        /** Tail of the write chain; every link settles (rejections are observed by the caller's slice). */
        this.chain = Promise.resolve();
        /** Set when close begins: new writes reject while already-queued writes drain. */
        this.disposing = false;
        /** Set when close finishes (chain drained, unit closed): reads reject from here on. */
        this.closed = false;
        this.name = spec.name;
        var host = {
            domainName: spec.name,
            unit: unit,
            enqueue: function (job) { return _this.enqueue(job); },
            assertReadable: function () { _this.assertReadable(); },
            emitChanged: function (change) { _this.emitChanged(change); },
        };
        for (var _i = 0, records_1 = records; _i < records_1.length; _i++) {
            var _a = records_1[_i], table = _a[0], tableRecords = _a[1];
            this.tables.set(table, new KvTableImpl(host, table, tableRecords));
        }
        if (spec.global !== undefined) {
            this.globalValue = globalValue;
            this.globalHandle = {
                get: function () {
                    _this.assertReadable();
                    return _this.globalValue;
                },
                set: function (value) { return _this.enqueue(function () { return __awaiter(_this, void 0, void 0, function () {
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0: return [4 /*yield*/, this.unit.setGlobal(value)];
                            case 1:
                                _a.sent();
                                this.globalValue = value;
                                this.emitChanged({ domain: this.name, table: '', key: '', operation: 'put', value: value });
                                return [2 /*return*/];
                        }
                    });
                }); }); },
            };
        }
    }
    Object.defineProperty(DomainImpl.prototype, "global", {
        /** Global singleton handle; accessing it on a spec that declares no global is a caller bug and throws. */
        get: function () {
            if (this.globalHandle === undefined) {
                throw new Error("domain '".concat(this.name, "' declares no global"));
            }
            return this.globalHandle;
        },
        enumerable: false,
        configurable: true
    });
    /**
     * Resolve one declared table handle; an undeclared name is a caller bug
     * and throws.
     * @param name - Declared table name.
     * @returns the stable table handle.
     */
    DomainImpl.prototype.table = function (name) {
        var table = this.tables.get(name);
        if (table === undefined) {
            throw new Error("domain '".concat(this.name, "' declares no table '").concat(name, "'"));
        }
        return table;
    };
    /**
     * Close this domain: reject new writes immediately, drain already-queued
     * writes (their events still emit), close the unit, then free the name via
     * the facility hook. Idempotent — repeated calls share one teardown.
     * @returns resolution after the unit is released.
     */
    DomainImpl.prototype.close = function () {
        var _a;
        (_a = this.disposal) !== null && _a !== void 0 ? _a : (this.disposal = this.runClose());
        return this.disposal;
    };
    DomainImpl.prototype.runClose = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        this.disposing = true;
                        // Chain links never reject (each is settled via then(noop, noop)), so
                        // this await is a pure drain barrier.
                        return [4 /*yield*/, this.chain];
                    case 1:
                        // Chain links never reject (each is settled via then(noop, noop)), so
                        // this await is a pure drain barrier.
                        _a.sent();
                        return [4 /*yield*/, this.unit.close()];
                    case 2:
                        _a.sent();
                        this.closed = true;
                        this.onClosed();
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Dispatch one post-durability change notification, containing observer
     * failures: the write is already committed (medium and memory both hold
     * the new state), so a throwing listener must not retroactively reject it.
     */
    DomainImpl.prototype.emitChanged = function (change) {
        try {
            this.ctx.emit('domain/changed', change);
        }
        catch (error) {
            // Swallows synchronous observer exceptions only: emit dispatches
            // listeners inline and nothing else runs in the try. The event is a
            // notification, not a transaction participant — the commit point has
            // passed, so containment (with a log) is the only correct outcome.
            this.ctx.logger.warn("domain '".concat(this.name, "': domain/changed listener failed: ").concat(String(error)));
        }
    };
    DomainImpl.prototype.enqueue = function (job) {
        if (this.disposing) {
            return Promise.reject(new error_ts_1.DomainError('closed', "domain '".concat(this.name, "' is closed")));
        }
        var result = this.chain.then(job);
        this.chain = result.then(noop, noop);
        return result;
    };
    DomainImpl.prototype.assertReadable = function () {
        if (this.closed) {
            throw new error_ts_1.DomainError('closed', "domain '".concat(this.name, "' is closed"));
        }
    };
    return DomainImpl;
}());
exports.DomainImpl = DomainImpl;
/** Table handle bound to one in-memory record map and its domain's write chain. */
var KvTableImpl = /** @class */ (function () {
    function KvTableImpl(host, tableName, records) {
        this.host = host;
        this.tableName = tableName;
        this.records = records;
    }
    KvTableImpl.prototype.get = function (key) {
        this.host.assertReadable();
        return this.records.get(key);
    };
    KvTableImpl.prototype.entries = function () {
        this.host.assertReadable();
        return __spreadArray([], this.records.entries(), true)[Symbol.iterator]();
    };
    KvTableImpl.prototype.keys = function () {
        this.host.assertReadable();
        return __spreadArray([], this.records.keys(), true)[Symbol.iterator]();
    };
    Object.defineProperty(KvTableImpl.prototype, "size", {
        get: function () {
            this.host.assertReadable();
            return this.records.size;
        },
        enumerable: false,
        configurable: true
    });
    KvTableImpl.prototype.put = function (key, value) {
        var _this = this;
        return this.host.enqueue(function () { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.host.unit.putRecord(this.tableName, key, value)];
                    case 1:
                        _a.sent();
                        this.records.set(key, value);
                        this.emitPut(key, value);
                        return [2 /*return*/];
                }
            });
        }); });
    };
    KvTableImpl.prototype.delete = function (key) {
        var _this = this;
        return this.host.enqueue(function () { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        // Existence is decided at this job's chain slot, not at call time: an
                        // earlier queued put of the same key makes this delete observe it.
                        if (!this.records.has(key))
                            return [2 /*return*/, false];
                        return [4 /*yield*/, this.host.unit.deleteRecord(this.tableName, key)];
                    case 1:
                        _a.sent();
                        this.records.delete(key);
                        this.host.emitChanged({
                            domain: this.host.domainName,
                            table: this.tableName,
                            key: key,
                            operation: 'deleted',
                        });
                        return [2 /*return*/, true];
                }
            });
        }); });
    };
    KvTableImpl.prototype.update = function (key, fn) {
        var _this = this;
        return this.host.enqueue(function () { return __awaiter(_this, void 0, void 0, function () {
            var next;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.records.has(key)) {
                            throw new error_ts_1.DomainError('missing-key', "domain '".concat(this.host.domainName, "' table '").concat(this.tableName, "' has no record '").concat(key, "' to update"));
                        }
                        next = fn(this.records.get(key));
                        return [4 /*yield*/, this.host.unit.putRecord(this.tableName, key, next)];
                    case 1:
                        _a.sent();
                        this.records.set(key, next);
                        this.emitPut(key, next);
                        return [2 /*return*/, next];
                }
            });
        }); });
    };
    KvTableImpl.prototype.emitPut = function (key, value) {
        this.host.emitChanged({
            domain: this.host.domainName,
            table: this.tableName,
            key: key,
            operation: 'put',
            value: value,
        });
    };
    return KvTableImpl;
}());
