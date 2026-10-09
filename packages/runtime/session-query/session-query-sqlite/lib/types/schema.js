"use strict";
/** SQLite schema for the disposable session full-text read model. */
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
exports.SESSION_QUERY_SQLITE_APPLICATION_ID = exports.SESSION_QUERY_SQLITE_SCHEMA_VERSION = void 0;
exports.openSearchDatabase = openSearchDatabase;
var promises_1 = require("node:fs/promises");
var node_path_1 = require("node:path");
/** Current derived-index schema version. Incompatible versions reset in place. */
exports.SESSION_QUERY_SQLITE_SCHEMA_VERSION = 10;
/** SQLite application id protecting unrelated databases from derived resets. */
exports.SESSION_QUERY_SQLITE_APPLICATION_ID = 0x44534851;
var DERIVED_USER_TABLES = new Set([
    'search_state',
    'persisted_sessions',
    'persisted_docs',
    'persisted_docs_data',
    'persisted_docs_idx',
    'persisted_docs_content',
    'persisted_docs_docsize',
    'persisted_docs_config',
]);
/**
 * Exclusively create a missing database file with owner-only permissions.
 * Existing files retain their modes, and errors other than `EEXIST` propagate.
 */
function createDatabaseFile(path) {
    return __awaiter(this, void 0, void 0, function () {
        var handle, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 3, , 4]);
                    return [4 /*yield*/, (0, promises_1.open)(path, 'wx', 384)];
                case 1:
                    handle = _a.sent();
                    return [4 /*yield*/, handle.close()];
                case 2:
                    _a.sent();
                    return [3 /*break*/, 4];
                case 3:
                    error_1 = _a.sent();
                    if (error_1.code !== 'EEXIST')
                        throw error_1;
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/];
            }
        });
    });
}
/**
 * Open, validate, and initialize persistent and connection-local schemas.
 * @param path - dedicated derived-index path or `:memory:`; missing filesystem paths are created owner-only.
 * @param journalMode - validated SQLite journal mode.
 * @returns initialized database handle owned by the search service.
 */
function openSearchDatabase(path, journalMode) {
    return __awaiter(this, void 0, void 0, function () {
        var actual, DatabaseSync, db, applicationId, version, userTables;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    actual = path === ':memory:' ? path : (0, node_path_1.resolve)(path);
                    if (!(actual !== ':memory:')) return [3 /*break*/, 3];
                    return [4 /*yield*/, (0, promises_1.mkdir)((0, node_path_1.dirname)(actual), { recursive: true, mode: 448 })];
                case 1:
                    _a.sent();
                    return [4 /*yield*/, createDatabaseFile(actual)];
                case 2:
                    _a.sent();
                    _a.label = 3;
                case 3: return [4 /*yield*/, Promise.resolve().then(function () { return require('node:sqlite'); })];
                case 4:
                    DatabaseSync = (_a.sent()).DatabaseSync;
                    db = new DatabaseSync(actual);
                    try {
                        applicationId = db.prepare('PRAGMA application_id').get().application_id;
                        version = db.prepare('PRAGMA user_version').get().user_version;
                        userTables = listUserTables(db);
                        if (applicationId !== 0 && applicationId !== exports.SESSION_QUERY_SQLITE_APPLICATION_ID) {
                            throw new Error("session-search database at \"".concat(actual, "\" belongs to another application"));
                        }
                        if (applicationId === 0 && userTables.length > 0) {
                            throw new Error("session-search database at \"".concat(actual, "\" is not an empty or recognized derived index"));
                        }
                        if (applicationId === exports.SESSION_QUERY_SQLITE_APPLICATION_ID) {
                            assertDerivedUserTables(actual, userTables);
                            if (version !== exports.SESSION_QUERY_SQLITE_SCHEMA_VERSION)
                                resetDerivedSchema(db, userTables);
                        }
                        // Apply mutating pragmas only after refusing foreign or canonical files.
                        // journalMode is a validated closed union, not caller-controlled SQL.
                        db.exec("PRAGMA journal_mode = ".concat(journalMode.toUpperCase()));
                        ensurePersistentSchema(db);
                        ensureTemporarySchema(db);
                        return [2 /*return*/, db];
                    }
                    catch (error) {
                        db.close();
                        throw error;
                    }
                    return [2 /*return*/];
            }
        });
    });
}
function listUserTables(db) {
    var rows = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT GLOB 'sqlite_*' ORDER BY name").all();
    return rows.map(function (row) { return row.name; });
}
function assertDerivedUserTables(path, userTables) {
    var unknownTables = userTables.filter(function (name) { return !DERIVED_USER_TABLES.has(name); });
    if (unknownTables.length > 0) {
        throw new Error("session-search database at \"".concat(path, "\" has unrecognized user tables: ").concat(unknownTables.join(', ')));
    }
}
function resetDerivedSchema(db, userTables) {
    for (var _i = 0, userTables_1 = userTables; _i < userTables_1.length; _i++) {
        var name_1 = userTables_1[_i];
        db.exec("DROP TABLE IF EXISTS ".concat(quoteIdentifier(name_1)));
    }
    db.exec('PRAGMA user_version = 0');
}
function ensurePersistentSchema(db) {
    db.exec("PRAGMA application_id = ".concat(exports.SESSION_QUERY_SQLITE_APPLICATION_ID));
    db.exec("\n    CREATE TABLE IF NOT EXISTS search_state (\n      singleton         INTEGER PRIMARY KEY CHECK (singleton = 1),\n      global_generation INTEGER NOT NULL\n    ) STRICT\n  ");
    db.exec('INSERT OR IGNORE INTO search_state (singleton, global_generation) VALUES (1, 0)');
    db.exec("\n    CREATE TABLE IF NOT EXISTS persisted_sessions (\n      id             TEXT PRIMARY KEY,\n      version        INTEGER NOT NULL,\n      created_at     INTEGER NOT NULL,\n      cwd            TEXT,\n      parent_session TEXT,\n      seed_length    INTEGER,\n      delegation_depth INTEGER,\n      agent_preset  TEXT,\n      revision       TEXT NOT NULL,\n      generation     INTEGER NOT NULL\n    ) STRICT\n  ");
    db.exec("\n    CREATE VIRTUAL TABLE IF NOT EXISTS persisted_docs USING fts5(\n      text,\n      session_id UNINDEXED,\n      seq UNINDEXED,\n      type UNINDEXED,\n      time UNINDEXED,\n      surface UNINDEXED,\n      codepoint_length UNINDEXED,\n      tokenize = 'trigram remove_diacritics 1'\n    )\n  ");
    db.exec("PRAGMA user_version = ".concat(exports.SESSION_QUERY_SQLITE_SCHEMA_VERSION));
}
function ensureTemporarySchema(db) {
    db.exec("\n    CREATE TEMP TABLE IF NOT EXISTS live_sessions (\n      id             TEXT PRIMARY KEY,\n      version        INTEGER NOT NULL,\n      created_at     INTEGER NOT NULL,\n      cwd            TEXT,\n      parent_session TEXT,\n      seed_length    INTEGER,\n      delegation_depth INTEGER,\n      agent_preset  TEXT,\n      fingerprint    TEXT NOT NULL,\n      persisted      INTEGER NOT NULL CHECK (persisted IN (0, 1)),\n      generation     INTEGER NOT NULL\n    ) STRICT\n  ");
    db.exec("\n    CREATE VIRTUAL TABLE IF NOT EXISTS temp.live_docs USING fts5(\n      text,\n      session_id UNINDEXED,\n      seq UNINDEXED,\n      type UNINDEXED,\n      time UNINDEXED,\n      surface UNINDEXED,\n      codepoint_length UNINDEXED,\n      tokenize = 'trigram remove_diacritics 1'\n    )\n  ");
}
function quoteIdentifier(value) {
    return "\"".concat(value.replaceAll('"', '""'), "\"");
}
