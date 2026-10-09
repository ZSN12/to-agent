"use strict";
/**
 * Path-containment mechanics for the filesystem sandbox. Canonical spellings
 * take the fast lexical path; filesystem identity supplies the conservative
 * fallback for alias-equivalent roots such as Windows 8.3 names and casing.
 * @module @z/dsh-fs-sandbox/containment
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
exports.isPathUnder = isPathUnder;
var promises_1 = require("node:fs/promises");
var node_path_1 = require("node:path");
var MISSING_CODES = new Set(['ENOENT', 'ENOTDIR']);
function isMissing(error) {
    var code = error.code;
    return MISSING_CODES.has(code);
}
function comparablePath(path, caseSensitive) {
    return caseSensitive ? path : path.toLowerCase();
}
function isLexicallyUnder(path, root, caseSensitive) {
    var comparableTarget = comparablePath(path, caseSensitive);
    var comparableRoot = comparablePath(root, caseSensitive);
    if (comparableTarget === comparableRoot)
        return true;
    var prefix = comparableRoot.endsWith(node_path_1.sep) ? comparableRoot : comparableRoot + node_path_1.sep;
    return comparableTarget.startsWith(prefix);
}
function statIfPresent(path) {
    return __awaiter(this, void 0, void 0, function () {
        var error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, (0, promises_1.stat)(path, { bigint: true })];
                case 1: return [2 /*return*/, _a.sent()];
                case 2:
                    error_1 = _a.sent();
                    /* v8 ignore else -- a non-missing stat failure requires a host permission or I/O fault after resolve reached this ancestor. */
                    if (isMissing(error_1))
                        return [2 /*return*/, undefined
                            /* v8 ignore next -- requires a host permission or I/O fault after resolve already reached this ancestor. */
                        ];
                    /* v8 ignore next -- requires a host permission or I/O fault after resolve already reached this ancestor. */
                    throw error_1;
                case 3: return [2 /*return*/];
            }
        });
    });
}
function sameIdentity(left, right) {
    return left.dev === right.dev && left.ino === right.ino;
}
/**
 * Determine whether a canonical target is a writable root or lies beneath it.
 * The lexical fast path handles normal canonical spellings. When spellings
 * differ, walk the target's existing ancestors and compare filesystem identity
 * with the root; this recognizes Windows long-name/8.3 aliases and casing
 * without weakening containment to a textual approximation.
 * @param path - canonical target key, which may end in a missing suffix.
 * @param root - canonical writable root.
 * @param caseSensitive - whether lexical comparison preserves case; defaults
 *   to the host filesystem convention used by supported platforms.
 * @returns whether the target is the root or a descendant of it.
 */
function isPathUnder(path_1, root_1) {
    return __awaiter(this, arguments, void 0, function (path, root, caseSensitive) {
        var rootInfo, ancestor, ancestorInfo, parent_1;
        if (caseSensitive === void 0) { caseSensitive = process.platform !== 'win32'; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (isLexicallyUnder(path, root, caseSensitive))
                        return [2 /*return*/, true];
                    return [4 /*yield*/, statIfPresent(root)];
                case 1:
                    rootInfo = _a.sent();
                    if (!rootInfo)
                        return [2 /*return*/, false];
                    ancestor = path;
                    _a.label = 2;
                case 2:
                    if (!true) return [3 /*break*/, 4];
                    return [4 /*yield*/, statIfPresent(ancestor)];
                case 3:
                    ancestorInfo = _a.sent();
                    if (ancestorInfo && sameIdentity(ancestorInfo, rootInfo))
                        return [2 /*return*/, true];
                    parent_1 = (0, node_path_1.dirname)(ancestor);
                    if (parent_1 === ancestor)
                        return [2 /*return*/, false];
                    ancestor = parent_1;
                    return [3 /*break*/, 2];
                case 4: return [2 /*return*/];
            }
        });
    });
}
