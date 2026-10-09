"use strict";
/**
 * On-disk JSON unit format: the file is always the current net state, kept
 * human-readable (pretty-printed, stable key order from insertion) — that
 * legibility is this backend's reason to exist.
 * @module @z/dsh-storage-json/src/format
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.serialize = serialize;
exports.parse = parse;
var dsh_storage_1 = require("@z/dsh-storage");
/**
 * Serialize a unit state to file content.
 * @param name - Unit name, stamped into the header.
 * @param state - Authoritative in-memory state.
 * @returns pretty-printed JSON document with a trailing newline.
 */
function serialize(name, state) {
    var tables = {};
    for (var _i = 0, _a = state.tables; _i < _a.length; _i++) {
        var _b = _a[_i], table = _b[0], records = _b[1];
        tables[table] = Object.fromEntries(records);
    }
    var document = {
        unit: { name: name, version: state.version },
        global: state.global,
        tables: tables,
    };
    return "".concat(JSON.stringify(document, null, 2), "\n");
}
/**
 * Parse file content into unit state, validating shape and version.
 * @param text - Raw file content.
 * @param descriptor - Expected identity; version mismatch rejects.
 * @returns the parsed state.
 */
function parse(text, descriptor) {
    var document;
    try {
        document = JSON.parse(text);
    }
    catch (error) {
        throw new dsh_storage_1.StorageError('malformed-medium', "unit '".concat(descriptor.name, "': file is not valid JSON"), { cause: error });
    }
    if (typeof document !== 'object' || document === null) {
        throw new dsh_storage_1.StorageError('malformed-medium', "unit '".concat(descriptor.name, "': file is not a JSON object"));
    }
    var _a = document, unit = _a.unit, globalValue = _a.global, tables = _a.tables;
    if (typeof unit !== 'object' || unit === null ||
        unit['name'] !== descriptor.name ||
        typeof unit['version'] !== 'number') {
        throw new dsh_storage_1.StorageError('malformed-medium', "unit '".concat(descriptor.name, "': missing or foreign unit header"));
    }
    var version = unit['version'];
    if (version !== descriptor.version) {
        throw new dsh_storage_1.StorageError('version-mismatch', "unit '".concat(descriptor.name, "': stored version ").concat(version, " != expected ").concat(descriptor.version));
    }
    if (typeof tables !== 'object' || tables === null) {
        throw new dsh_storage_1.StorageError('malformed-medium', "unit '".concat(descriptor.name, "': tables is not an object"));
    }
    var state = { version: version, global: globalValue !== null && globalValue !== void 0 ? globalValue : null, tables: new Map() };
    for (var _i = 0, _b = descriptor.tables; _i < _b.length; _i++) {
        var table = _b[_i];
        var records = tables[table];
        if (records === undefined) {
            state.tables.set(table, new Map());
            continue;
        }
        if (typeof records !== 'object' || records === null || Array.isArray(records)) {
            throw new dsh_storage_1.StorageError('malformed-medium', "unit '".concat(descriptor.name, "': table '").concat(table, "' is not an object"));
        }
        state.tables.set(table, new Map(Object.entries(records)));
    }
    return state;
}
