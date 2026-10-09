"use strict";
/**
 * Copying, reading, and deleting locally authored presets.
 *
 * Authoring is confined to a `user` root: the shipped `.system` set is part of
 * the deployment, and letting a browser rewrite it would turn "reset to a known
 * preset" into something the same caller could have broken first.
 *
 * The only authoring write is a whole-directory copy of an existing preset.
 * No caller supplies composition text: the inputs are ids the host resolves
 * against its own roots plus an optional display name, so authoring grants no
 * capability the copied preset did not already carry.
 * @module @z/dsh-agent-presets/authoring
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.PresetNotWritableError = exports.PresetExistsError = exports.InvalidPresetIdError = void 0;
exports.writableRoot = writableRoot;
exports.readComposition = readComposition;
exports.copyComposition = copyComposition;
exports.deleteComposition = deleteComposition;
var promises_1 = require("node:fs/promises");
var node_path_1 = require("node:path");
var dsh_atomic_write_1 = require("@z/dsh-atomic-write");
var dsh_home_paths_1 = require("@z/dsh-home-paths");
var metadata_ts_1 = require("./metadata.ts");
var preset_ts_1 = require("./preset.ts");
/** A preset id that cannot be used as a directory name under a root. */
var InvalidPresetIdError = /** @class */ (function (_super) {
    __extends(InvalidPresetIdError, _super);
    function InvalidPresetIdError(
    /** The rejected id. */
    presetId) {
        var _this = _super.call(this, "agent-presets: preset id ".concat(JSON.stringify(presetId), " must match ").concat(String(preset_ts_1.PRESET_ID), " \u2014 ")
            + 'the id is a directory name, so anything else could escape the preset root') || this;
        _this.presetId = presetId;
        return _this;
    }
    return InvalidPresetIdError;
}(Error));
exports.InvalidPresetIdError = InvalidPresetIdError;
/** A copy target that is already occupied — a copy never overwrites. */
var PresetExistsError = /** @class */ (function (_super) {
    __extends(PresetExistsError, _super);
    function PresetExistsError(
    /** The id that is already taken. */
    presetId) {
        var _this = _super.call(this, "agent-presets: preset \"".concat(presetId, "\" already exists \u2014 ")
            + 'a copy never overwrites; delete the existing preset first or choose another id') || this;
        _this.presetId = presetId;
        return _this;
    }
    return PresetExistsError;
}(Error));
exports.PresetExistsError = PresetExistsError;
/** Authoring was attempted where the deployment allows none. */
var PresetNotWritableError = /** @class */ (function (_super) {
    __extends(PresetNotWritableError, _super);
    function PresetNotWritableError(
    /** What the caller tried to change, for the diagnostic. */
    presetId, reason) {
        var _this = _super.call(this, "agent-presets: preset \"".concat(presetId, "\" cannot be written: ").concat(reason)) || this;
        _this.presetId = presetId;
        return _this;
    }
    return PresetNotWritableError;
}(Error));
exports.PresetNotWritableError = PresetNotWritableError;
/**
 * The root locally authored presets are written to.
 * @param roots - the configured roots in precedence order.
 * @returns the absolute path of the first `user` root.
 * @throws when the deployment configured no writable root.
 */
function writableRoot(roots) {
    var root = roots.find(function (candidate) { return candidate.trust === 'user'; });
    if (root === undefined) {
        throw new PresetNotWritableError('', 'this deployment configures no user-writable preset root');
    }
    return (0, node_path_1.resolve)((0, dsh_home_paths_1.expandHomePath)(root.path));
}
/**
 * Read one preset's composition text.
 * @param preset - the resolved preset.
 * @returns the file's contents.
 */
function readComposition(preset) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, promises_1.readFile)(preset.path, 'utf8')];
                case 1: return [2 /*return*/, _a.sent()];
            }
        });
    });
}
/** Whether anything occupies the path (cp's own errorOnExist backstops races). */
function occupied(path) {
    return __awaiter(this, void 0, void 0, function () {
        var present, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    present = true;
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, (0, promises_1.stat)(path)];
                case 2:
                    _b.sent();
                    return [3 /*break*/, 4];
                case 3:
                    _a = _b.sent();
                    // Every stat failure means the same thing here: nothing usable occupies
                    // the path, so the copy may claim it.
                    present = false;
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/, present];
            }
        });
    });
}
/**
 * Re-tighten a copied tree to owner-only. A shipped preset is world-readable
 * in its install and `cp` preserves that; the copy carries the same weight as
 * the settings document beside it, so group/other access is stripped. A
 * file's owner-execute bit survives — a preset may ship runnable helpers.
 */
function tightenModes(dir) {
    return __awaiter(this, void 0, void 0, function () {
        var _i, _a, entry, target, _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0: return [4 /*yield*/, (0, promises_1.chmod)(dir, 448)];
                case 1:
                    _d.sent();
                    _i = 0;
                    return [4 /*yield*/, (0, promises_1.readdir)(dir, { withFileTypes: true })];
                case 2:
                    _a = _d.sent();
                    _d.label = 3;
                case 3:
                    if (!(_i < _a.length)) return [3 /*break*/, 9];
                    entry = _a[_i];
                    target = (0, node_path_1.join)(dir, entry.name);
                    if (!entry.isDirectory()) return [3 /*break*/, 5];
                    return [4 /*yield*/, tightenModes(target)];
                case 4:
                    _d.sent();
                    return [3 /*break*/, 8];
                case 5:
                    _b = promises_1.chmod;
                    _c = [target];
                    return [4 /*yield*/, (0, promises_1.stat)(target)];
                case 6: 
                /* v8 ignore next -- Windows exposes no POSIX owner-execute bit; the POSIX lane covers both file modes. */
                return [4 /*yield*/, _b.apply(void 0, _c.concat([((_d.sent()).mode & 64) === 0 ? 384 : 448]))];
                case 7:
                    /* v8 ignore next -- Windows exposes no POSIX owner-execute bit; the POSIX lane covers both file modes. */
                    _d.sent();
                    _d.label = 8;
                case 8:
                    _i++;
                    return [3 /*break*/, 3];
                case 9: return [2 /*return*/];
            }
        });
    });
}
/**
 * Create a preset by copying an existing one's whole directory.
 *
 * The copy carries everything the source directory holds — composition,
 * metadata, skill directories, assets — because a preset is its directory,
 * not one file. Symlinks are dereferenced so the copy is self-contained
 * rather than a set of links back into the install it was copied from.
 *
 * The copied metadata is then rewritten: the source's description is kept
 * (the file is the author's to edit afterwards), but its name and roster
 * `order` are not — a copy presenting itself identically to its source, or
 * sorted into the shipped set's declared order, would make the roster stop
 * distinguishing them. With no name given and no description to keep, the
 * file is removed so the copy publishes nothing rather than a blank.
 * @param roots - the configured roots; the first `user` one receives the copy.
 * @param source - the resolved preset the copy starts from.
 * @param id - the new preset's id, which becomes its directory name.
 * @param name - display name for the copy; omitted falls back to the id.
 * @returns the absolute path of the new preset directory.
 * @throws when the id is unusable or already occupied on disk, or the
 * deployment configures no writable root.
 */
function copyComposition(roots, source, id, name) {
    return __awaiter(this, void 0, void 0, function () {
        var dir, rendered, metadataPath, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!preset_ts_1.PRESET_ID.test(id))
                        throw new InvalidPresetIdError(id);
                    dir = (0, node_path_1.join)(writableRoot(roots), id);
                    return [4 /*yield*/, occupied(dir)];
                case 1:
                    // The roster check upstream only sees discovered presets; a directory with
                    // no composition file still occupies the name and deserves a readable
                    // refusal rather than a filesystem error code.
                    if (_a.sent())
                        throw new PresetExistsError(id);
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 9, , 11]);
                    return [4 /*yield*/, (0, promises_1.cp)((0, node_path_1.dirname)(source.path), dir, {
                            recursive: true, dereference: true, force: false, errorOnExist: true,
                        })];
                case 3:
                    _a.sent();
                    return [4 /*yield*/, tightenModes(dir)];
                case 4:
                    _a.sent();
                    rendered = (0, metadata_ts_1.renderPresetMetadata)(__assign(__assign({}, name === undefined ? {} : { name: name }), source.description === undefined ? {} : { description: source.description }));
                    metadataPath = (0, node_path_1.join)(dir, metadata_ts_1.METADATA_FILE);
                    if (!(rendered === undefined)) return [3 /*break*/, 6];
                    return [4 /*yield*/, (0, promises_1.rm)(metadataPath, { force: true })];
                case 5:
                    _a.sent();
                    return [3 /*break*/, 8];
                case 6: return [4 /*yield*/, (0, dsh_atomic_write_1.writeFileAtomic)(metadataPath, rendered, { mode: 384, dirMode: 448 })];
                case 7:
                    _a.sent();
                    _a.label = 8;
                case 8: return [3 /*break*/, 11];
                case 9:
                    error_1 = _a.sent();
                    // A half-copied directory would be invisible to discovery at best and a
                    // mountable-but-incomplete preset at worst; a failed copy leaves nothing.
                    return [4 /*yield*/, (0, promises_1.rm)(dir, { recursive: true, force: true })];
                case 10:
                    // A half-copied directory would be invisible to discovery at best and a
                    // mountable-but-incomplete preset at worst; a failed copy leaves nothing.
                    _a.sent();
                    throw error_1;
                case 11: return [2 /*return*/, dir];
            }
        });
    });
}
/**
 * Delete a locally authored preset.
 *
 * A shipped preset is refused: it belongs to the deployment. A preset a live
 * session mounted is NOT refused — the composition was read at creation and is
 * never re-read, so that session keeps running exactly as it was.
 * @param roots - the configured roots.
 * @param preset - the resolved preset to remove.
 * @throws when the preset ships with the deployment or lies outside the writable root.
 */
function deleteComposition(roots, preset) {
    return __awaiter(this, void 0, void 0, function () {
        var dir;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (preset.trust !== 'user') {
                        throw new PresetNotWritableError(preset.id, 'it ships with the deployment');
                    }
                    dir = (0, node_path_1.join)(writableRoot(roots), preset.id);
                    // Belt and braces over the id pattern: the resolved directory must still be
                    // the one the writable root owns, whatever discovery reported.
                    if (!(0, node_path_1.isAbsolute)(preset.path) || !preset.path.startsWith(dir)) {
                        throw new PresetNotWritableError(preset.id, 'it does not live under the writable preset root');
                    }
                    return [4 /*yield*/, (0, promises_1.rm)(dir, { recursive: true, force: true })];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
