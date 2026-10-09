"use strict";
/**
 * Cordis-free storage mechanics for the local spill backend: private
 * session-scoped directory selection, safe-name derivation, path-traversal
 * protection, and the exclusive owner-only write. Kept out of the service class
 * (like `dsh-bash-local`'s `run.ts`) so the filesystem behavior is unit-testable
 * without a `ctx` and without the OS temp dir.
 *
 * @module @z/dsh-spill-local/store
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
exports.privateRoot = privateRoot;
exports.encodeSegment = encodeSegment;
exports.sessionDir = sessionDir;
exports.saveTextFile = saveTextFile;
var node_crypto_1 = require("node:crypto");
var node_fs_1 = require("node:fs");
var promises_1 = require("node:fs/promises");
var node_path_1 = require("node:path");
var node_os_1 = require("node:os");
var defaultRoot;
/**
 * The default spill root: a private (0700) per-process directory under the OS
 * tmpdir, created lazily. Predictable world-readable paths would let other
 * local users read spilled tool output or pre-create symlinks; `mkdtemp` gives
 * an unpredictable suffix and 0700 semantics.
 *
 * @returns The lazily-created private spill root.
 */
function privateRoot() {
    defaultRoot !== null && defaultRoot !== void 0 ? defaultRoot : (defaultRoot = (0, node_fs_1.mkdtempSync)((0, node_path_1.join)((0, node_os_1.tmpdir)(), 'dsh-spill-')));
    return defaultRoot;
}
// Deliberately mirrors the JSONL path encoder, but keeps spill's empty-name
// policy (`""` -> `"~"`) local so storage backends stay decoupled.
/* jscpd:ignore-start */
/**
 * Encode an arbitrary string as one safe path segment, injectively over ALL JS
 * (UTF-16) strings. A session id / suggested name is untrusted input, so this
 * neutralizes `../`, absolute paths, NUL, and separators before any filesystem
 * use. Each code unit is kept literal (`[A-Za-z0-9._-]`, minus `~`) or escaped
 * as `~XXXX`; `~` is itself escaped, so the mapping is reversible and distinct
 * inputs never collide. The whole-segment tokens `.`/`..` are escaped so they
 * can never traverse. An empty string encodes to `~` (never an empty segment).
 * (Mirrors the JSONL persistence backend's `encodeSegment`.)
 *
 * @param raw The untrusted string to encode as one safe path segment.
 * @returns An injective, filesystem-safe single path segment.
 */
function encodeSegment(raw) {
    if (raw.length === 0)
        return '~';
    if (raw === '.')
        return '~002E';
    if (raw === '..')
        return '~002E~002E';
    var out = '';
    for (var i = 0; i < raw.length; i++) {
        var code = raw.charCodeAt(i);
        var ch = String.fromCharCode(code);
        if (ch !== '~' && /^[A-Za-z0-9._-]$/.test(ch)) {
            out += ch;
        }
        else {
            out += '~' + code.toString(16).toUpperCase().padStart(4, '0');
        }
    }
    return out;
}
/* jscpd:ignore-end */
/**
 * The session-scoped directory: `<root>/session-<hash(sessionId)>`, a short stable hash.
 *
 * @param root The spill root directory.
 * @param sessionId The owning session id to hash into a stable directory name.
 * @returns The absolute session-scoped spill directory path.
 */
function sessionDir(root, sessionId) {
    var hash = (0, node_crypto_1.createHash)('sha256').update(sessionId).digest('hex').slice(0, 12);
    return (0, node_path_1.join)(root, "session-".concat(hash));
}
/**
 * Write `content` to a fresh file under the session-scoped directory and return
 * its path + byte length. The filename is a random hex prefix plus the
 * sanitized `suggestedName`, so it is unpredictable (defeats symlink planting in
 * a shared root) AND stays readable. The open is exclusive + owner-only
 * (`'wx', 0o600`): it fails on any existing path — symlink or not — so a
 * pre-planted target cannot redirect the write.
 *
 * @param options The resolved root and request fields required to save the file.
 * @returns The written file path and UTF-8 byte length.
 */
function saveTextFile(options) {
    return __awaiter(this, void 0, void 0, function () {
        var dir, safeName, path, bytes, handle;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    dir = sessionDir(options.root, options.sessionId);
                    return [4 /*yield*/, (0, promises_1.mkdir)(dir, { recursive: true, mode: 448 })];
                case 1:
                    _a.sent();
                    safeName = encodeSegment(options.suggestedName);
                    path = (0, node_path_1.join)(dir, "".concat((0, node_crypto_1.randomBytes)(6).toString('hex'), "-").concat(safeName));
                    bytes = Buffer.byteLength(options.content, 'utf8');
                    return [4 /*yield*/, (0, promises_1.open)(path, 'wx', 384)];
                case 2:
                    handle = _a.sent();
                    _a.label = 3;
                case 3:
                    _a.trys.push([3, , 5, 7]);
                    return [4 /*yield*/, handle.writeFile(options.content)];
                case 4:
                    _a.sent();
                    return [3 /*break*/, 7];
                case 5: return [4 /*yield*/, handle.close()];
                case 6:
                    _a.sent();
                    return [7 /*endfinally*/];
                case 7: return [2 /*return*/, { path: path, bytes: bytes }];
            }
        });
    });
}
