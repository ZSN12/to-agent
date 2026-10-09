"use strict";
/**
 * Domain declaration vocabulary. A spec object is the single source of a
 * domain's identity, layout, and record schemas: the owning package defines
 * it once with {@link defineDomain} and both the type surface and the runtime
 * (validation, descriptor projection) derive from it. Record schemas are zod
 * (`z.infer` keeps types un-duplicated and the same schemas later project to
 * RPC wire schemas); plugin `Config` stays schemastery.
 * @module @z/dsh-storage-domain/src/spec
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.domainTable = domainTable;
exports.defineDomain = defineDomain;
exports.descriptorOf = descriptorOf;
var dsh_storage_1 = require("@z/dsh-storage");
/**
 * Declare one table.
 * @param schema - zod schema validating every stored record of this table.
 * @returns the table declaration, key-typed by `K`.
 */
function domainTable(schema) {
    return { valueSchema: schema };
}
/**
 * Identity helper that pins a spec's literal types and validates its fields.
 * Misconfiguration fails loud at the owning package's module load, before any
 * medium is touched: a domain or table name outside `UNIT_NAME_RE`, a version
 * that is not a non-negative integer, or a global schema that accepts `null`
 * all throw. The `null` rejection guards round-tripping: backends store the
 * global as opaque JSON with `null` as the "never written" sentinel, so a
 * nullable global would be indistinguishable from an absent one on reopen
 * (a stored `null` silently reverts to `initial`).
 * @param spec - The domain declaration.
 * @returns the same spec, narrowed to its literal type.
 */
function defineDomain(spec) {
    if (!dsh_storage_1.UNIT_NAME_RE.test(spec.name)) {
        throw new Error("domain name '".concat(spec.name, "' must match ").concat(dsh_storage_1.UNIT_NAME_RE));
    }
    if (!Number.isInteger(spec.version) || spec.version < 0) {
        throw new Error("domain '".concat(spec.name, "' version must be a non-negative integer, got ").concat(spec.version));
    }
    for (var _i = 0, _a = Object.keys(spec.tables); _i < _a.length; _i++) {
        var table = _a[_i];
        if (!dsh_storage_1.UNIT_NAME_RE.test(table)) {
            throw new Error("domain '".concat(spec.name, "' table name '").concat(table, "' must match ").concat(dsh_storage_1.UNIT_NAME_RE));
        }
    }
    if (spec.global !== undefined && spec.global.schema.safeParse(null).success) {
        throw new Error("domain '".concat(spec.name, "' global schema must not accept null: ")
            + 'null is the medium\'s "never written" sentinel, so a stored null could not round-trip');
    }
    return spec;
}
/**
 * Project a spec onto the backend-facing unit descriptor.
 * @param spec - The domain declaration.
 * @returns the descriptor handed to `KvFacet.open`.
 */
function descriptorOf(spec) {
    return {
        name: spec.name,
        version: spec.version,
        tables: Object.keys(spec.tables),
        hasGlobal: spec.global !== undefined,
    };
}
