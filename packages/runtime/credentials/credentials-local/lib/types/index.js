"use strict";
/**
 * File-backed credentials provider over `$DSH_HOME/.credentials.yaml`, layered
 * against the environment by how much each layer is trusted:
 *
 * ```text
 * inherited process environment      (read-only, wins)
 * > $DSH_HOME/.credentials.yaml      (provider-managed, writable)
 * > <invocation cwd>/.env            (read-only fallback)
 * > $DSH_HOME/.env                   (read-only fallback)
 * ```
 *
 * The inherited environment wins because `DEEPSEEK_API_KEY=… dsh`, a CI
 * secret, or a container `-e` is this run's explicit intent; it cannot be
 * edited from inside, so it must be *visibly* read-only rather than silently
 * shadow writes. Everything below it loses to the managed store, so a key the
 * Models page writes takes effect immediately even when an older key sits in
 * the user's `.env`.
 *
 * The invoking project may supply a key, because the product trusts the
 * project it is launched in. It ranks below the managed store, so a key stored
 * through the Models page is never displaced by one a checkout happens to carry.
 *
 * The file is the provider-managed writable source: every write re-reads the
 * document under a cross-process writer lock before patching only its own key
 * — comments and the formatting of every untouched entry survive — external
 * edits hot-publish through the seam, and each reload replaces the snapshot
 * wholesale so a deleted entry never lingers in memory.
 *
 * The document holds nothing but credentials, which is why it is a strict
 * `CredentialRef`-to-string mapping rather than a dotenv file: a store the
 * Harness owns and never materializes into the environment cannot also serve
 * as the user's environment layer; a store that doubled as the environment
 * layer would shadow non-secret entries behind its precedence, making them
 * silently unreachable.
 * @module @z/dsh-credentials-local
 */
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
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
var __await = (this && this.__await) || function (v) { return this instanceof __await ? (this.v = v, this) : new __await(v); }
var __asyncGenerator = (this && this.__asyncGenerator) || function (thisArg, _arguments, generator) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var g = generator.apply(thisArg, _arguments || []), i, q = [];
    return i = Object.create((typeof AsyncIterator === "function" ? AsyncIterator : Object).prototype), verb("next"), verb("throw"), verb("return", awaitReturn), i[Symbol.asyncIterator] = function () { return this; }, i;
    function awaitReturn(f) { return function (v) { return Promise.resolve(v).then(f, reject); }; }
    function verb(n, f) { if (g[n]) { i[n] = function (v) { return new Promise(function (a, b) { q.push([n, v, a, b]) > 1 || resume(n, v); }); }; if (f) i[n] = f(i[n]); } }
    function resume(n, v) { try { step(g[n](v)); } catch (e) { settle(q[0][3], e); } }
    function step(r) { r.value instanceof __await ? Promise.resolve(r.value.v).then(fulfill, reject) : settle(q[0][2], r); }
    function fulfill(value) { resume("next", value); }
    function reject(value) { resume("throw", value); }
    function settle(f, v) { if (f(v), q.shift(), q.length) resume(q[0][0], q[0][1]); }
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
exports.LocalCredentialProvider = exports.DOCUMENT_VERSION = exports.CREDENTIALS_FILENAME = void 0;
exports.resolveSpec = resolveSpec;
exports.parseCredentialsDocument = parseCredentialsDocument;
exports.renderFlatLayoutMigration = renderFlatLayoutMigration;
var cordis_1 = require("@z/cordis");
var schemastery_1 = require("@z/schemastery");
var chokidar_1 = require("chokidar");
var promises_1 = require("node:fs/promises");
var node_path_1 = require("node:path");
var yaml_1 = require("yaml");
var dsh_atomic_write_1 = require("@z/dsh-atomic-write");
var dsh_home_paths_1 = require("@z/dsh-home-paths");
var dsh_launch_environment_1 = require("@z/dsh-launch-environment");
var dsh_credentials_1 = require("@z/dsh-credentials");
/** Basename of the credentials document inside the harness home. */
exports.CREDENTIALS_FILENAME = '.credentials.yaml';
/**
 * Resolve the runtime spec from plugin config: an explicit `path` wins,
 * otherwise the document lives at `<harness home>/.credentials.yaml`.
 * @param config - raw plugin config.
 * @returns the resolved file location and watch behavior.
 */
function resolveSpec(config) {
    var _a, _b, _c;
    return {
        filename: (0, node_path_1.resolve)((_a = config.path) !== null && _a !== void 0 ? _a : (0, node_path_1.join)((0, dsh_home_paths_1.resolveDshHome)(config.dshHome), exports.CREDENTIALS_FILENAME)),
        watch: (_b = config.watch) !== null && _b !== void 0 ? _b : true,
        debounceMs: (_c = config.debounceMs) !== null && _c !== void 0 ? _c : 100,
    };
}
/** Permission bits outside the owner; a credentials document must have none of them. */
var GROUP_OTHER_BITS = 63;
/**
 * How long a record write waits for the cross-process writer lock. A record
 * mutation runs its caller's decision while holding the lock, and for the
 * operation this half exists to serve — an owner refreshing an expired token —
 * that decision includes a network round trip. The file-work default would
 * fail every other writer of this document for its duration. A contender's
 * wait is sized by the longest holder it can meet, and refs and records share
 * one file and one lock, so every writer of this document — reference writes
 * and record deletes included — waits this long, not only the mutation that
 * holds it. Like the retry cadence in `dsh-atomic-write`, this is a
 * robustness bound of the write protocol rather than a deployment choice: it
 * is sized by what a provider request costs, which no deployment varies.
 */
var DOCUMENT_LOCK_WAIT_MS = 30000;
/**
 * Reject a credentials document other OS users can read, before its contents
 * are read at all. The provider creates and replaces the file at `0600`, but a
 * hand-written or externally generated one carries whatever umask produced it,
 * and silently serving secrets out of a world-readable file would make the
 * mode the provider promises meaningless.
 *
 * POSIX only: Windows has no mode to inspect — its ACLs are not expressible
 * here — so the check is skipped rather than faked, and the file's protection
 * there is whatever the create and replace APIs express.
 * @param filename - absolute path of the document.
 * @throws when the path hierarchy is invalid or the file exists with group or other permission bits set.
 */
function assertOwnerOnly(filename) {
    return __awaiter(this, void 0, void 0, function () {
        var mode, error_1, offending;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 4]);
                    return [4 /*yield*/, (0, promises_1.stat)(filename)];
                case 1:
                    mode = (_a.sent()).mode;
                    return [3 /*break*/, 4];
                case 2:
                    error_1 = _a.sent();
                    if (!isENOENT(error_1))
                        throw error_1;
                    return [4 /*yield*/, (0, dsh_home_paths_1.canonicalizeWatchPath)(filename)];
                case 3:
                    _a.sent();
                    return [2 /*return*/];
                case 4:
                    /* v8 ignore next -- POSIX coverage cannot take the Windows peer; native Windows coverage does. */
                    if (process.platform === 'win32')
                        return [2 /*return*/];
                    offending = mode & GROUP_OTHER_BITS;
                    if (offending === 0)
                        return [2 /*return*/];
                    throw new Error("credentials-local: ".concat(filename, " is readable beyond its owner (mode ").concat((mode & 511).toString(8), ");")
                        + " run \"chmod 600 ".concat(filename, "\" before starting again"));
            }
        });
    });
}
/** Whether a filesystem error means absence; every non-ENOENT failure must surface. */
function isENOENT(error) {
    return (error === null || error === void 0 ? void 0 : error.code) === 'ENOENT';
}
/**
 * Describe one YAML parse failure without quoting the source. The parser's own
 * message embeds the offending line, which here holds a secret.
 * @param error - the parser's error.
 * @returns the error code with its line and column.
 */
function describeYamlError(error) {
    var _a;
    var at = (_a = error.linePos) === null || _a === void 0 ? void 0 : _a[0];
    /* v8 ignore next -- `prettyErrors` populates linePos on every error; the guard answers its optional type */
    var where = at === undefined ? '' : " at line ".concat(String(at.line), ", column ").concat(String(at.col));
    return "".concat(error.code).concat(where);
}
/** The document layout this build reads and writes. */
exports.DOCUMENT_VERSION = 1;
/**
 * Parse one credentials document. Everything is rejected rather than skipped —
 * an unversioned root, an unknown top-level key, a key that is not addressable,
 * a wrong-typed value, an unknown record tag or field — because this file holds
 * nothing but credentials and a silently ignored entry reads as "the credential
 * I stored has no effect". Duplicate keys surface as parser errors. An empty
 * document is an empty store and needs no version.
 * @param text - the document's text.
 * @param filename - absolute path, quoted in errors.
 * @returns the parsed references and records.
 */
function parseCredentialsDocument(text, filename) {
    var _a;
    // `prettyErrors` is on only for `linePos`; `error.message` is never used,
    // because the parser quotes the offending source line and in this document
    // that line is a secret. Only the code and position leave this function, and
    // the same rule governs every other diagnostic here — a key name is safe to
    // print, a value is not.
    var document = (0, yaml_1.parseDocument)(text, { prettyErrors: true, uniqueKeys: true });
    if (document.errors.length > 0) {
        throw new Error("credentials-local: invalid document at ".concat(filename, ": ").concat(document.errors.map(describeYamlError).join('; ')));
    }
    var root = (_a = document.toJS()) !== null && _a !== void 0 ? _a : {};
    if (typeof root !== 'object' || root === null || Array.isArray(root)) {
        throw new TypeError("credentials-local: ".concat(filename, " must be a mapping"));
    }
    var fields = root;
    var keys = Object.keys(fields);
    // An empty (or comment-only) document is the empty store and needs no
    // version: there is nothing in it a later layout could have meant.
    if (keys.length === 0)
        return { refs: new Map(), records: new Map() };
    if (!('version' in fields)) {
        throw new Error("credentials-local: ".concat(filename, " uses the pre-release flat layout. Add `version: ").concat(exports.DOCUMENT_VERSION, "`")
            + " and nest the existing ".concat(keys.length, " ").concat(keys.length === 1 ? 'entry' : 'entries', " under `refs:`.")
            + ' No values need to change.');
    }
    if (fields['version'] !== exports.DOCUMENT_VERSION) {
        throw new Error("credentials-local: ".concat(filename, " declares version ").concat(JSON.stringify(fields['version']), ";")
            + " this build reads version ".concat(exports.DOCUMENT_VERSION));
    }
    for (var _i = 0, keys_1 = keys; _i < keys_1.length; _i++) {
        var key = keys_1[_i];
        if (key !== 'version' && key !== 'refs' && key !== 'records') {
            throw new Error("credentials-local: unknown top-level key \"".concat(key, "\" in ").concat(filename));
        }
    }
    return { refs: parseRefs(fields['refs'], filename), records: parseRecords(fields['records'], filename) };
}
/**
 * Render the version-1 layout for a pre-release flat document, or `undefined`
 * for anything else. The flat layout is recognized exactly — a non-empty
 * top-level mapping of addressable reference names to non-empty string
 * scalars, with no `version` key and no document directives — and the rewrite
 * nests the original lines verbatim under `refs:` at two spaces' indent, so
 * comments, blank lines, and each value's spelling survive byte for byte.
 * Anything the recognizer declines keeps {@link parseCredentialsDocument}'s
 * loud rejection: a document this build cannot prove it understands is never
 * rewritten. Remove with the pre-release stance at the first tagged release.
 * @param text - the document's text.
 * @returns the migrated text, or `undefined` when the text is not the recognized flat layout.
 */
function renderFlatLayoutMigration(text) {
    var document = (0, yaml_1.parseDocument)(text, { prettyErrors: true, uniqueKeys: true });
    if (document.errors.length > 0)
        return undefined;
    var flat = document.contents;
    if (!(0, yaml_1.isMap)(flat) || flat.items.length === 0)
        return undefined;
    for (var _i = 0, _a = text.split('\n'); _i < _a.length; _i++) {
        var line = _a[_i];
        // A directive or document marker would not survive being indented into
        // the `refs:` block; no shipped writer ever emitted one here.
        if (/^(%|---|\.\.\.)/.test(line))
            return undefined;
    }
    for (var _b = 0, _c = flat.items; _b < _c.length; _b++) {
        var pair = _c[_b];
        if (!(0, yaml_1.isScalar)(pair.key) || typeof pair.key.value !== 'string' || pair.key.value === 'version')
            return undefined;
        try {
            (0, dsh_credentials_1.credentialRef)(pair.key.value);
        }
        catch (_d) {
            // Only credentialRef's rejection of a non-POSIX name lands here; the
            // flat reader refused such a key too, so this is not the recognized
            // layout and the loud rejection stands.
            return undefined;
        }
        if (!(0, yaml_1.isScalar)(pair.value) || typeof pair.value.value !== 'string' || pair.value.value.length === 0)
            return undefined;
    }
    var body = text.split('\n').map(function (line) { return (line.length === 0 ? line : "  ".concat(line)); }).join('\n');
    return "version: ".concat(exports.DOCUMENT_VERSION, "\nrefs:\n").concat(body).concat(text.endsWith('\n') ? '' : '\n');
}
/** Admit a `refs` section: POSIX-identifier keys over non-empty string values. */
function parseRefs(section, filename) {
    var entries = new Map();
    for (var _i = 0, _a = Object.entries(asSection(section, 'refs', filename)); _i < _a.length; _i++) {
        var _b = _a[_i], key = _b[0], value = _b[1];
        // credentialRef throws on anything that is not a POSIX identifier, which
        // is exactly the constraint a stored reference must satisfy to be
        // addressable through the seam.
        (0, dsh_credentials_1.credentialRef)(key);
        // The key name is quoted, never the value: a wrong-typed entry is still a
        // secret the user meant to store.
        if (typeof value !== 'string') {
            throw new TypeError("credentials-local: the value for \"".concat(key, "\" in ").concat(filename, " must be a string"));
        }
        if (value.length === 0) {
            throw new Error("credentials-local: the value for \"".concat(key, "\" in ").concat(filename, " is empty; remove the key instead"));
        }
        entries.set(key, value);
    }
    return entries;
}
/** Admit a `records` section: `<scope>/<id>` keys over tagged record mappings. */
function parseRecords(section, filename) {
    var entries = new Map();
    for (var _i = 0, _a = Object.entries(asSection(section, 'records', filename)); _i < _a.length; _i++) {
        var _b = _a[_i], key = _b[0], value = _b[1];
        (0, dsh_credentials_1.parseCredentialKey)(key);
        entries.set(key, parseRecord(key, value, filename));
    }
    return entries;
}
/**
 * Refuse an api-key record the read path could not admit, before it is
 * rendered: an empty key, an env name outside the reference grammar, or an
 * empty env value would persist a document `parseRecord` rejects at the next
 * boot — a durable-boundary write is validated where it is written.
 * @param key - the record's credential key, for the failure message.
 * @param record - the api-key record a mutation returned.
 */
function assertStorableApiKey(key, record) {
    var _a;
    if (record.key !== undefined && record.key.length === 0) {
        throw new TypeError("credentials-local: record \"".concat(key, "\" has an empty key; omit the field instead"));
    }
    for (var _i = 0, _b = Object.entries((_a = record.env) !== null && _a !== void 0 ? _a : {}); _i < _b.length; _i++) {
        var _c = _b[_i], name_1 = _c[0], value = _c[1];
        (0, dsh_credentials_1.credentialRef)(name_1);
        if (value.length === 0) {
            throw new TypeError("credentials-local: record \"".concat(key, "\" env \"").concat(name_1, "\" must be a non-empty string"));
        }
    }
}
/** One section of the document as a plain mapping; absent and null both mean empty. */
function asSection(section, name, filename) {
    if (section === undefined || section === null)
        return {};
    if (typeof section !== 'object' || Array.isArray(section)) {
        throw new TypeError("credentials-local: \"".concat(name, "\" in ").concat(filename, " must be a mapping"));
    }
    return section;
}
/** Admit one record entry, rejecting an unknown tag or field rather than dropping it. */
function parseRecord(key, value, filename) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new TypeError("credentials-local: record \"".concat(key, "\" in ").concat(filename, " must be a mapping"));
    }
    var fields = value;
    var kind = fields['kind'];
    if (kind === 'api-key') {
        assertFields(key, fields, ['kind', 'key', 'env'], filename);
        var apiKey = fields['key'];
        if (apiKey !== undefined && (typeof apiKey !== 'string' || apiKey.length === 0)) {
            throw new TypeError("credentials-local: record \"".concat(key, "\" in ").concat(filename, " has a non-string or empty key"));
        }
        var env = parseRecordEnv(key, fields['env'], filename);
        return __assign(__assign({ kind: 'api-key' }, apiKey === undefined ? {} : { key: apiKey }), env === undefined ? {} : { env: env });
    }
    if (kind === 'grant') {
        assertFields(key, fields, ['kind', 'payload'], filename);
        if (!('payload' in fields)) {
            throw new Error("credentials-local: record \"".concat(key, "\" in ").concat(filename, " has no payload"));
        }
        assertJsonValue("record \"".concat(key, "\" payload in ").concat(filename), fields['payload'], new Set());
        return { kind: 'grant', payload: fields['payload'] };
    }
    if (kind === undefined)
        throw new Error("credentials-local: record \"".concat(key, "\" in ").concat(filename, " has no kind"));
    throw new Error("credentials-local: record \"".concat(key, "\" in ").concat(filename, " has unknown kind ").concat(JSON.stringify(kind)));
}
/** Reject a field the tag does not define, so a typo is not silently dropped. */
function assertFields(key, fields, allowed, filename) {
    for (var _i = 0, _a = Object.keys(fields); _i < _a.length; _i++) {
        var field = _a[_i];
        if (!allowed.includes(field)) {
            throw new Error("credentials-local: record \"".concat(key, "\" in ").concat(filename, " has unknown field \"").concat(field, "\""));
        }
    }
}
/** Admit an api-key record's provider environment: POSIX names over non-empty strings. */
function parseRecordEnv(key, env, filename) {
    if (env === undefined)
        return undefined;
    if (typeof env !== 'object' || env === null || Array.isArray(env)) {
        throw new TypeError("credentials-local: record \"".concat(key, "\" in ").concat(filename, " has a non-mapping env"));
    }
    var parsed = {};
    for (var _i = 0, _a = Object.entries(env); _i < _a.length; _i++) {
        var _b = _a[_i], name_2 = _b[0], value = _b[1];
        (0, dsh_credentials_1.credentialRef)(name_2);
        if (typeof value !== 'string' || value.length === 0) {
            throw new TypeError("credentials-local: record \"".concat(key, "\" env \"").concat(name_2, "\" in ").concat(filename, " must be a non-empty string"));
        }
        parsed[name_2] = value;
    }
    return parsed;
}
/**
 * Reject a payload that cannot survive a JSON round trip, on the way in and on
 * the way out. The seam promises owners their payload comes back exactly as
 * written, and both directions can break that: a document may spell `.inf` or
 * an alias cycle, and an owner may hand over a `Date`, a class instance, or a
 * `bigint` that this document has no faithful spelling for. Neither the value
 * nor any nested value is quoted in a diagnostic.
 * @param where - the subject named in a diagnostic, already free of any value.
 * @param value - the payload or nested value to admit.
 * @param seen - objects on the current path, for cycle detection.
 * @throws TypeError naming `where` when the value cannot round-trip.
 */
function assertJsonValue(where, value, seen) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean')
        return;
    if (typeof value === 'number') {
        if (Number.isFinite(value))
            return;
        throw new TypeError("credentials-local: ".concat(where, " holds a non-finite number"));
    }
    if (typeof value === 'object') {
        if (seen.has(value))
            throw new TypeError("credentials-local: ".concat(where, " is cyclic"));
        if (Object.getPrototypeOf(value) === Object.prototype || Array.isArray(value)) {
            seen.add(value);
            for (var _i = 0, _a = Object.values(value); _i < _a.length; _i++) {
                var nested = _a[_i];
                assertJsonValue(where, nested, seen);
            }
            seen.delete(value);
            return;
        }
    }
    throw new TypeError("credentials-local: ".concat(where, " holds a value JSON cannot represent"));
}
/**
 * The comment-preserving mutable tree one edit renders from. Editing the
 * parsed document rather than rebuilding it keeps comments and the formatting
 * of every untouched entry; an absent document starts a fresh one.
 * @param text - the current document text, `undefined` while the file is absent.
 * @returns the tree to edit, carrying this build's version stamp.
 */
function mutableDocument(text) {
    // `text` only ever caches content that parsed successfully, so this re-parse
    // for the mutable comment-preserving tree cannot fail.
    var document = text === undefined ? new yaml_1.Document({}) : (0, yaml_1.parseDocument)(text);
    // Stamped on every edit so a document this provider creates is readable by
    // the same parser that admitted the one it edits; an existing stamp is
    // rewritten to the identical value.
    document.setIn(['version'], exports.DOCUMENT_VERSION);
    return document;
}
/**
 * Render the next document text with one reference set or deleted.
 * @param text - the current document text, `undefined` while the file is absent.
 * @param ref - the reference to write.
 * @param value - the new value, or `undefined` to delete the key.
 * @returns the text to persist.
 */
function renderRef(text, ref, value) {
    var document = mutableDocument(text);
    if (value === undefined)
        deleteSectionEntry(document, 'refs', ref);
    else
        document.setIn(['refs', ref], value);
    return document.toString();
}
/**
 * Render the next document text with one record written or deleted. The record
 * node is replaced wholesale rather than edited field by field: records are
 * machine-written, so there is no hand formatting inside one to preserve.
 * @param text - the current document text, `undefined` while the file is absent.
 * @param key - the record to write.
 * @param record - the new record, or `undefined` to delete it.
 * @returns the text to persist.
 */
function renderRecord(text, key, record) {
    var document = mutableDocument(text);
    if (record === undefined)
        deleteSectionEntry(document, 'records', key);
    else
        document.setIn(['records', key], record);
    return document.toString();
}
/**
 * Remove one entry from a section, taking its annotation with it. A comment
 * block written above a section's first entry annotates that entry, but the
 * parser attaches it to the section's map rather than to the pair — leaving it
 * behind would move it onto whichever entry became first, which reads as an
 * annotation of a credential nobody wrote it for.
 * @param document - the mutable tree being edited.
 * @param section - the section holding the entry.
 * @param key - the entry to remove.
 */
function deleteSectionEntry(document, section, key) {
    var map = document.get(section, true);
    /* v8 ignore next -- both callers render a delete only for an entry they just
       found in the parsed snapshot, so the section it lives in is always a map;
       the guard is what narrows `get`'s `unknown`. */
    if ((0, yaml_1.isMap)(map)) {
        var first = map.items[0];
        /* v8 ignore next -- a map that holds the entry has a first item, and the
           parser admits only scalar keys, so only the identity test can be false. */
        if (first !== undefined && (0, yaml_1.isScalar)(first.key) && first.key.value === key) {
            map.commentBefore = null;
        }
    }
    document.deleteIn([section, key]);
}
/**
 * Structural equality over two admitted JSON values. Records reach this after
 * {@link assertJsonValue}, so the walk meets only JSON shapes; key order is
 * ignored because an external editor may reorder a record's fields without
 * changing what it stores.
 * @param left - one value.
 * @param right - the other value.
 * @returns whether the two carry the same JSON content.
 */
function sameJsonValue(left, right) {
    if (left === right)
        return true;
    if (typeof left !== 'object' || typeof right !== 'object' || left === null || right === null)
        return false;
    if (Array.isArray(left) !== Array.isArray(right))
        return false;
    var leftKeys = Object.keys(left);
    var rightKeys = Object.keys(right);
    if (leftKeys.length !== rightKeys.length)
        return false;
    return leftKeys.every(function (key) { return key in right
        && sameJsonValue(left[key], right[key]); });
}
/** File-backed credentials provider (`$DSH_HOME/.credentials.yaml`). */
var LocalCredentialProvider = /** @class */ (function (_super) {
    __extends(LocalCredentialProvider, _super);
    /* jscpd:ignore-end */
    function LocalCredentialProvider(ctx, config) {
        var _this = _super.call(this, ctx) || this;
        _this.config = config;
        /** Parsed reference snapshot; replaced wholesale on every reload. */
        _this.values = new Map();
        /** Parsed record snapshot; replaced wholesale on every reload. */
        _this.records = new Map();
        /**
         * Single exclusive operation chain: watcher reloads and line edits run one
         * at a time in queue order (settled tail), so an edit can never render from
         * text a concurrent reload is busy replacing.
         */
        _this.operations = Promise.resolve();
        /** Set at dispose: refuse new writes and let in-flight work no-op. */
        _this.closed = false;
        // Programmatic construction may bypass Schemastery normalization; resolve
        // the same defaults in one explicit step either way.
        _this.spec = resolveSpec(config);
        return _this;
    }
    /** Opaque read of {@link closed}: control flow cannot narrow it across awaits. */
    LocalCredentialProvider.prototype.isClosed = function () {
        return this.closed;
    };
    /** The inherited-environment value for a reference, or `undefined` when empty or unset. */
    LocalCredentialProvider.prototype.inherited = function (ref) {
        var entry = (0, dsh_launch_environment_1.launchEnvironmentOf)(this.ctx).getFrom(ref, ['process']);
        return entry !== undefined && entry.value.length > 0 ? entry.value : undefined;
    };
    /**
     * The `.env` fallback for a reference — below the managed store, never above
     * it. The invoking project ranks over the user's home file, matching the
     * environment layering: the more specific location wins.
     */
    LocalCredentialProvider.prototype.dotenvFallback = function (ref) {
        var entry = (0, dsh_launch_environment_1.launchEnvironmentOf)(this.ctx).getFrom(ref, ['project-env', 'user-env']);
        return entry !== undefined && entry.value.length > 0 ? entry : undefined;
    };
    LocalCredentialProvider.prototype[cordis_1.Service.init] = function () {
        return __asyncGenerator(this, arguments, function _a() {
            var watcher, _b;
            var _this = this;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, __await(function () { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_b) {
                                switch (_b.label) {
                                    case 0:
                                        // Drain: refuse new operations, then settle the queued ones so disposal
                                        // completes only once storage is quiescent.
                                        this.closed = true;
                                        return [4 /*yield*/, this.operations];
                                    case 1:
                                        _b.sent();
                                        return [2 /*return*/];
                                }
                            });
                        }); })];
                    case 1: return [4 /*yield*/, _c.sent()];
                    case 2:
                        _c.sent();
                        return [4 /*yield*/, __await(this.loadInitial())];
                    case 3:
                        _c.sent();
                        if (!!this.spec.watch) return [3 /*break*/, 5];
                        return [4 /*yield*/, __await(void 0)];
                    case 4: return [2 /*return*/, _c.sent()];
                    case 5:
                        _b = chokidar_1.watch;
                        return [4 /*yield*/, __await((0, dsh_home_paths_1.canonicalizeWatchPath)(this.spec.filename))];
                    case 6:
                        watcher = _b.apply(void 0, [_c.sent(), {
                                ignoreInitial: true,
                                awaitWriteFinish: {
                                    stabilityThreshold: this.spec.debounceMs,
                                    pollInterval: Math.max(1, Math.min(this.spec.debounceMs, 10)),
                                },
                            }]);
                        watcher.on('all', function () {
                            if (_this.closed)
                                return;
                            _this.queueRefresh();
                        });
                        watcher.on('ready', function () {
                            // The initial load raced the watcher's own setup: a change written
                            // between that read and the watcher becoming active never fires an
                            // event. One reconcile at ready closes the gap.
                            if (_this.closed)
                                return;
                            _this.queueRefresh();
                        });
                        watcher.on('error', function (error) {
                            _this.ctx.logger.warn('credentials-local: watcher error on %s', _this.spec.filename);
                            _this.ctx.logger.warn(error);
                        });
                        return [4 /*yield*/, __await(function () { return __awaiter(_this, void 0, void 0, function () {
                                return __generator(this, function (_b) {
                                    switch (_b.label) {
                                        case 0:
                                            // Quiesce: stop accepting events, close the watcher, then wait out any
                                            // queued or in-flight operation so nothing publishes after disposal.
                                            this.closed = true;
                                            return [4 /*yield*/, watcher.close()];
                                        case 1:
                                            _b.sent();
                                            return [4 /*yield*/, this.operations];
                                        case 2:
                                            _b.sent();
                                            return [2 /*return*/];
                                    }
                                });
                            }); }
                            /* jscpd:ignore-end */
                            )];
                    case 7: return [4 /*yield*/, _c.sent()];
                    case 8:
                        _c.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    LocalCredentialProvider.prototype.resolve = function (ref) {
        var inherited = this.inherited(ref);
        if (inherited !== undefined)
            return Promise.resolve({ value: inherited, source: 'env' });
        var stored = this.values.get(ref);
        if (stored !== undefined)
            return Promise.resolve({ value: stored, source: 'file' });
        var fallback = this.dotenvFallback(ref);
        if (fallback !== undefined)
            return Promise.resolve({ value: fallback.value, source: fallback.source });
        return Promise.resolve(undefined);
    };
    LocalCredentialProvider.prototype.describe = function (ref) {
        // Only the inherited environment is unwritable: it is the one layer this
        // process cannot edit. A user `.env` value is writable in the sense that
        // matters — storing a key replaces it as the effective one.
        if (this.inherited(ref) !== undefined) {
            return Promise.resolve({ configured: true, source: 'env', writable: false });
        }
        var stored = this.values.get(ref);
        if (stored !== undefined)
            return Promise.resolve({ configured: true, source: 'file', writable: true });
        var fallback = this.dotenvFallback(ref);
        if (fallback !== undefined)
            return Promise.resolve({ configured: true, source: fallback.source, writable: true });
        return Promise.resolve({ configured: false, writable: true });
    };
    LocalCredentialProvider.prototype.set = function (ref, value) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (value.length === 0) {
                            throw new Error("credentials-local: an empty value cannot be stored for \"".concat(ref, "\"; use unset"));
                        }
                        return [4 /*yield*/, this.write(ref, value)];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    LocalCredentialProvider.prototype.unset = function (ref) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.write(ref, undefined)];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    LocalCredentialProvider.prototype.readRecord = function (key) {
        return Promise.resolve(this.records.get(key));
    };
    LocalCredentialProvider.prototype.describeRecord = function (key) {
        var stored = this.records.get(key);
        // Presence is the whole fact here: no layer ranks above this document for
        // a record, so nothing can shadow one, and an api-key record carrying
        // neither a key nor environment values is a deliberate statement rather
        // than a blank.
        if (stored === undefined)
            return Promise.resolve({ configured: false, writable: true });
        return Promise.resolve({ configured: true, kind: stored.kind, writable: true });
    };
    LocalCredentialProvider.prototype.listRecords = function () {
        return Promise.resolve(__spreadArray([], this.records, true).map(function (_a) {
            var key = _a[0], record = _a[1];
            return ({
                // The parser has already proven every stored key addressable.
                key: (0, dsh_credentials_1.parseCredentialKey)(key),
                kind: record.kind,
            });
        }));
    };
    LocalCredentialProvider.prototype.modifyRecord = function (key, mutate) {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                if (this.isClosed())
                    throw new Error("credentials-local is disposed: cannot modify \"".concat(key, "\""));
                return [2 /*return*/, this.enqueue(function () { return __awaiter(_this, void 0, void 0, function () {
                        var _this = this;
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0:
                                    if (this.isClosed()) {
                                        throw new Error("credentials-local was disposed before the queued \"".concat(key, "\" modify ran"));
                                    }
                                    return [4 /*yield*/, (0, promises_1.mkdir)((0, node_path_1.dirname)(this.spec.filename), { recursive: true, mode: 448 })];
                                case 1:
                                    _a.sent();
                                    return [2 /*return*/, (0, dsh_atomic_write_1.withFileLock)(this.spec.filename, function () { return __awaiter(_this, void 0, void 0, function () {
                                            var current, next, nextText;
                                            return __generator(this, function (_a) {
                                                switch (_a.label) {
                                                    case 0: 
                                                    // Read-modify-write: `mutate` must decide against the record as it
                                                    // stands now, not as this process last saw it — another process may
                                                    // have rotated it since.
                                                    return [4 /*yield*/, this.reconcileFromDisk()];
                                                    case 1:
                                                        // Read-modify-write: `mutate` must decide against the record as it
                                                        // stands now, not as this process last saw it — another process may
                                                        // have rotated it since.
                                                        _a.sent();
                                                        current = this.records.get(key);
                                                        return [4 /*yield*/, mutate(current)];
                                                    case 2:
                                                        next = _a.sent();
                                                        if (next === undefined)
                                                            return [2 /*return*/, current
                                                                // Admitted before it is rendered: what the read path would refuse is
                                                                // refused here first, so a caller can never persist a document the
                                                                // next boot rejects, and a value refused here has not been stored.
                                                            ];
                                                        // Admitted before it is rendered: what the read path would refuse is
                                                        // refused here first, so a caller can never persist a document the
                                                        // next boot rejects, and a value refused here has not been stored.
                                                        if (next.kind === 'grant')
                                                            assertJsonValue("record \"".concat(key, "\" payload"), next.payload, new Set());
                                                        else
                                                            assertStorableApiKey(key, next);
                                                        nextText = renderRecord(this.text, key, next);
                                                        // 0600: a document holding secrets is never world-readable.
                                                        return [4 /*yield*/, (0, dsh_atomic_write_1.writeFileAtomic)(this.spec.filename, nextText, { mode: 384, dirMode: 448 })];
                                                    case 3:
                                                        // 0600: a document holding secrets is never world-readable.
                                                        _a.sent();
                                                        this.text = nextText;
                                                        this.records.set(key, next);
                                                        // After the commit, on the same terms as a reference write.
                                                        this.notifyRecordUpdated(key);
                                                        return [2 /*return*/, next];
                                                }
                                            });
                                        }); }, { waitMs: DOCUMENT_LOCK_WAIT_MS })];
                            }
                        });
                    }); })];
            });
        });
    };
    LocalCredentialProvider.prototype.deleteRecord = function (key) {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (this.isClosed())
                            throw new Error("credentials-local is disposed: cannot delete \"".concat(key, "\""));
                        return [4 /*yield*/, this.enqueue(function () { return __awaiter(_this, void 0, void 0, function () {
                                var _this = this;
                                return __generator(this, function (_a) {
                                    switch (_a.label) {
                                        case 0:
                                            if (this.isClosed()) {
                                                throw new Error("credentials-local was disposed before the queued \"".concat(key, "\" delete ran"));
                                            }
                                            return [4 /*yield*/, (0, promises_1.mkdir)((0, node_path_1.dirname)(this.spec.filename), { recursive: true, mode: 448 })];
                                        case 1:
                                            _a.sent();
                                            return [4 /*yield*/, (0, dsh_atomic_write_1.withFileLock)(this.spec.filename, function () { return __awaiter(_this, void 0, void 0, function () {
                                                    var nextText;
                                                    return __generator(this, function (_a) {
                                                        switch (_a.label) {
                                                            case 0: return [4 /*yield*/, this.reconcileFromDisk()];
                                                            case 1:
                                                                _a.sent();
                                                                if (!this.records.has(key))
                                                                    return [2 /*return*/];
                                                                nextText = renderRecord(this.text, key, undefined);
                                                                return [4 /*yield*/, (0, dsh_atomic_write_1.writeFileAtomic)(this.spec.filename, nextText, { mode: 384, dirMode: 448 })];
                                                            case 2:
                                                                _a.sent();
                                                                this.text = nextText;
                                                                this.records.delete(key);
                                                                this.notifyRecordUpdated(key);
                                                                return [2 /*return*/];
                                                        }
                                                    });
                                                }); }, { waitMs: DOCUMENT_LOCK_WAIT_MS })];
                                        case 2:
                                            _a.sent();
                                            return [2 /*return*/];
                                    }
                                });
                            }); })];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    /* jscpd:ignore-start -- the operation-chain and reload lifecycle is the same
       reviewed contract as settings-file, deliberately mirrored (prefer symmetry
       for parallel values); the two providers own different documents and
       failure policies, so extracting a shared helper would couple their teardown
       semantics across packages for a handful of lines. */
    /** Queue one exclusive document operation behind every earlier one. */
    LocalCredentialProvider.prototype.enqueue = function (operation) {
        var task = this.operations.then(operation);
        this.operations = task.then(function () { return undefined; }, function () { return undefined; });
        return task;
    };
    /** Queue a reload; only an invariant violation escaping the fan-out can reject it. */
    LocalCredentialProvider.prototype.queueRefresh = function () {
        var _this = this;
        void this.enqueue(function () { return _this.refresh(); }).catch(function (error) {
            // Only an invariant violation escaping the update fan-out can reject a
            // refresh; keep the operation queue alive and surface it as an error so
            // one poisoned commit cannot silently end hot reloading forever.
            _this.ctx.logger.error('credentials-local: reload commit failed at %s', _this.spec.filename);
            _this.ctx.logger.error(error);
        });
    };
    /* jscpd:ignore-end */
    /** Queue one line edit; entry checks reject early, the queue re-judges them at run time. */
    LocalCredentialProvider.prototype.write = function (ref, value) {
        return __awaiter(this, void 0, void 0, function () {
            var verb;
            var _this = this;
            return __generator(this, function (_a) {
                verb = value === undefined ? 'unset' : 'set';
                if (this.isClosed()) {
                    throw new Error("credentials-local is disposed: cannot ".concat(verb, " \"").concat(ref, "\""));
                }
                this.assertUnshadowed(ref, verb);
                return [2 /*return*/, this.enqueue(function () { return __awaiter(_this, void 0, void 0, function () {
                        var _this = this;
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0:
                                    if (this.isClosed()) {
                                        throw new Error("credentials-local was disposed before the queued \"".concat(ref, "\" ").concat(verb, " ran"));
                                    }
                                    // Re-judged at run time: the environment may have changed while queued.
                                    this.assertUnshadowed(ref, verb);
                                    // The writer lock's exclusive create needs the parent to exist; 0700
                                    // because the harness home holds user-private data.
                                    return [4 /*yield*/, (0, promises_1.mkdir)((0, node_path_1.dirname)(this.spec.filename), { recursive: true, mode: 448 })];
                                case 1:
                                    // The writer lock's exclusive create needs the parent to exist; 0700
                                    // because the harness home holds user-private data.
                                    _a.sent();
                                    return [4 /*yield*/, (0, dsh_atomic_write_1.withFileLock)(this.spec.filename, function () { return __awaiter(_this, void 0, void 0, function () {
                                            var existing, nextText;
                                            return __generator(this, function (_a) {
                                                switch (_a.label) {
                                                    case 0: 
                                                    // Read-modify-write: fold in any on-disk state this process has not
                                                    // observed yet — an external edit still inside the watcher debounce
                                                    // window, a change the watcher missed, or another process's write —
                                                    // so the line edit below can never resurrect a stale document.
                                                    return [4 /*yield*/, this.reconcileFromDisk()];
                                                    case 1:
                                                        // Read-modify-write: fold in any on-disk state this process has not
                                                        // observed yet — an external edit still inside the watcher debounce
                                                        // window, a change the watcher missed, or another process's write —
                                                        // so the line edit below can never resurrect a stale document.
                                                        _a.sent();
                                                        existing = this.values.get(ref);
                                                        if (value === undefined && existing === undefined)
                                                            return [2 /*return*/];
                                                        nextText = renderRef(this.text, ref, value);
                                                        // 0600: a document holding secrets is never world-readable.
                                                        return [4 /*yield*/, (0, dsh_atomic_write_1.writeFileAtomic)(this.spec.filename, nextText, { mode: 384, dirMode: 448 })];
                                                    case 2:
                                                        // 0600: a document holding secrets is never world-readable.
                                                        _a.sent();
                                                        this.text = nextText;
                                                        if (value === undefined)
                                                            this.values.delete(ref);
                                                        else
                                                            this.values.set(ref, value);
                                                        // After the commit: a broken observer must never make the durable
                                                        // write look failed (an INVARIANT failure still rethrows).
                                                        this.notifyUpdated(ref);
                                                        return [2 /*return*/];
                                                }
                                            });
                                        }); }, { waitMs: DOCUMENT_LOCK_WAIT_MS })];
                                case 2:
                                    _a.sent();
                                    return [2 /*return*/];
                            }
                        });
                    }); })];
            });
        });
    };
    /**
     * Reject a write the inherited environment would shadow into apparent
     * no-effect. Only that layer can shadow a write: everything else this
     * provider resolves ranks below the document being written.
     */
    LocalCredentialProvider.prototype.assertUnshadowed = function (ref, verb) {
        if (this.inherited(ref) !== undefined) {
            throw new Error("credentials-local: \"".concat(ref, "\" is supplied read-only by the launching environment, so ").concat(verb, " would be")
                + ' shadowed; unset it in the shell you start dsh from instead');
        }
    };
    /**
     * Boot read: an absent file is an empty store; an invalid one fails the
     * plugin's activation, because a credentials document that exists but
     * cannot be trusted must never be treated as "no credentials stored". The
     * one exception is the recognized pre-release flat layout, which is
     * upgraded in place first — a key stored by an earlier build must survive
     * the layout change without a hand edit.
     */
    LocalCredentialProvider.prototype.loadInitial = function () {
        return __awaiter(this, void 0, void 0, function () {
            var text, error_2, document;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, assertOwnerOnly(this.spec.filename)];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, 4, , 5]);
                        return [4 /*yield*/, (0, promises_1.readFile)(this.spec.filename, 'utf8')];
                    case 3:
                        text = _a.sent();
                        return [3 /*break*/, 5];
                    case 4:
                        error_2 = _a.sent();
                        if (!isENOENT(error_2))
                            throw error_2;
                        return [2 /*return*/];
                    case 5:
                        if (!(renderFlatLayoutMigration(text) !== undefined)) return [3 /*break*/, 7];
                        return [4 /*yield*/, this.migrateFlatDocument()];
                    case 6:
                        text = _a.sent();
                        _a.label = 7;
                    case 7:
                        document = parseCredentialsDocument(text, this.spec.filename);
                        this.values = document.refs;
                        this.records = document.records;
                        this.text = text;
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * One-shot upgrade of the recognized pre-release flat layout, before the
     * watcher exists. The rewrite runs under the document's writer lock and
     * re-reads first — a concurrent boot may have migrated already — and
     * whatever the re-read finds that is not the flat layout is returned
     * untouched for the ordinary parse. Values are carried verbatim; only the
     * enclosing layout changes. Remove with the pre-release stance at the
     * first tagged release.
     * @returns the document text this boot should parse.
     */
    LocalCredentialProvider.prototype.migrateFlatDocument = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                return [2 /*return*/, (0, dsh_atomic_write_1.withFileLock)(this.spec.filename, function () { return __awaiter(_this, void 0, void 0, function () {
                        var current, migrated;
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0: return [4 /*yield*/, (0, promises_1.readFile)(this.spec.filename, 'utf8')];
                                case 1:
                                    current = _a.sent();
                                    migrated = renderFlatLayoutMigration(current);
                                    /* v8 ignore next 2 -- the losing side of the cross-process migration race:
                                       another boot rewrote the document between the unlocked recognize and
                                       this lock. That interleaving cannot be scheduled deterministically
                                       through a whole boot (migration.spec drives it best-effort); the
                                       decision itself is the recognizer's covered versioned-document decline. */
                                    if (migrated === undefined)
                                        return [2 /*return*/, current
                                            // 0600: a document holding secrets is never world-readable.
                                        ];
                                    // 0600: a document holding secrets is never world-readable.
                                    return [4 /*yield*/, (0, dsh_atomic_write_1.writeFileAtomic)(this.spec.filename, migrated, { mode: 384, dirMode: 448 })];
                                case 2:
                                    // 0600: a document holding secrets is never world-readable.
                                    _a.sent();
                                    this.ctx.logger.info('credentials-local: migrated %s to the version %d layout; values are unchanged', this.spec.filename, exports.DOCUMENT_VERSION);
                                    return [2 /*return*/, migrated];
                            }
                        });
                    }); }, { waitMs: DOCUMENT_LOCK_WAIT_MS })];
            });
        });
    };
    /* jscpd:ignore-start -- same deliberate mirror of settings-file's reload and
       reconcile policy: warn-and-keep on a reload, throw on a write, invariant
       failures propagate. */
    /**
     * Re-read the document after a watcher event. Unchanged content (including
     * this provider's own writes) is a no-op; an unreadable document keeps the
     * last good snapshot and warns — a live hot-reload must never take the
     * process down. An invariant violation escaping the fan-out is not a reload
     * failure and propagates to the queue's error surface.
     */
    LocalCredentialProvider.prototype.refresh = function () {
        return __awaiter(this, void 0, void 0, function () {
            var error_3;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (this.closed)
                            return [2 /*return*/];
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this.reconcileFromDisk()];
                    case 2:
                        _a.sent();
                        return [3 /*break*/, 4];
                    case 3:
                        error_3 = _a.sent();
                        if ((error_3 === null || error_3 === void 0 ? void 0 : error_3.code) === 'INVARIANT')
                            throw error_3;
                        this.ctx.logger.warn('credentials-local: reload failed at %s; keeping the last good document', this.spec.filename);
                        this.ctx.logger.warn(error_3);
                        return [3 /*break*/, 4];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Compare the on-disk text against the cache and publish any difference
     * into the seam. Absence publishes the empty store; an unreadable or
     * invalid document throws, so each caller picks its policy — a reload warns
     * and keeps the last good snapshot, a write fails loud rather than
     * overwriting a document it could not understand.
     */
    LocalCredentialProvider.prototype.reconcileFromDisk = function () {
        return __awaiter(this, void 0, void 0, function () {
            var text, error_4, next, changedRefs, changedRecords, _i, changedRefs_1, ref, _a, changedRecords_1, key;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: 
                    // Re-checked on every reload and before every write: an external editor or
                    // a restored backup can loosen the mode after boot.
                    return [4 /*yield*/, assertOwnerOnly(this.spec.filename)];
                    case 1:
                        // Re-checked on every reload and before every write: an external editor or
                        // a restored backup can loosen the mode after boot.
                        _b.sent();
                        _b.label = 2;
                    case 2:
                        _b.trys.push([2, 4, , 5]);
                        return [4 /*yield*/, (0, promises_1.readFile)(this.spec.filename, 'utf8')];
                    case 3:
                        text = _b.sent();
                        return [3 /*break*/, 5];
                    case 4:
                        error_4 = _b.sent();
                        if (!isENOENT(error_4))
                            throw error_4;
                        text = undefined;
                        return [3 /*break*/, 5];
                    case 5:
                        if (text === this.text || this.isClosed())
                            return [2 /*return*/];
                        next = text === undefined
                            ? { refs: new Map(), records: new Map() }
                            : parseCredentialsDocument(text, this.spec.filename);
                        changedRefs = this.changedRefs(this.values, next.refs);
                        changedRecords = this.changedRecords(this.records, next.records);
                        this.text = text;
                        this.values = next.refs;
                        this.records = next.records;
                        for (_i = 0, changedRefs_1 = changedRefs; _i < changedRefs_1.length; _i++) {
                            ref = changedRefs_1[_i];
                            this.notifyUpdated(ref);
                        }
                        for (_a = 0, changedRecords_1 = changedRecords; _a < changedRecords_1.length; _a++) {
                            key = changedRecords_1[_a];
                            this.notifyRecordUpdated(key);
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    /* jscpd:ignore-end */
    /** Entries whose stored value changed; the parser has already proven every key addressable. */
    LocalCredentialProvider.prototype.changedRefs = function (prev, next) {
        var changed = [];
        for (var _i = 0, _a = new Set(__spreadArray(__spreadArray([], prev.keys(), true), next.keys(), true)); _i < _a.length; _i++) {
            var key = _a[_i];
            if (prev.get(key) === next.get(key))
                continue;
            changed.push((0, dsh_credentials_1.credentialRef)(key));
        }
        return changed;
    };
    /** Records whose stored value changed; the parser has already proven every key addressable. */
    LocalCredentialProvider.prototype.changedRecords = function (prev, next) {
        var changed = [];
        for (var _i = 0, _a = new Set(__spreadArray(__spreadArray([], prev.keys(), true), next.keys(), true)); _i < _a.length; _i++) {
            var key = _a[_i];
            if (sameJsonValue(prev.get(key), next.get(key)))
                continue;
            changed.push((0, dsh_credentials_1.parseCredentialKey)(key));
        }
        return changed;
    };
    /* jscpd:ignore-start -- deliberate config-surface and lifecycle symmetry with
       settings-file (prefer symmetry for parallel values); extracting the shared
       shape would couple the two providers' teardown semantics across packages. */
    LocalCredentialProvider.Config = schemastery_1.default.object({
        path: schemastery_1.default.string(),
        dshHome: schemastery_1.default.string(),
        watch: schemastery_1.default.boolean().default(true),
        debounceMs: schemastery_1.default.number().min(0).default(100),
    });
    return LocalCredentialProvider;
}(dsh_credentials_1.CredentialProvider));
exports.LocalCredentialProvider = LocalCredentialProvider;
exports.default = LocalCredentialProvider;
