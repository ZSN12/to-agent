"use strict";
/**
 * Filesystem discovery of agent presets. A preset is a directory holding
 * {@link COMPOSITION_FILE}, optionally beside a {@link METADATA_FILE} carrying
 * its display text; the directory name is the preset id. Discovery
 * re-reads the roots on every call so a preset authored while the process is
 * running is visible without a restart.
 *
 * Discovery also owns preset HEALTH: a directory whose composition is
 * missing or unloadable is reported as a broken roster row rather than
 * skipped. A skipped directory would still occupy its id on disk — the copy
 * path refuses the name while no surface shows anything to delete — and a
 * malformed composition would otherwise read as an ordinary preset until the
 * first session fails to mount it.
 * @module @z/dsh-agent-presets/discovery
 */
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
exports.USER_PRESET_DIR = exports.COMPOSITION_FILE = void 0;
exports.scanRoot = scanRoot;
exports.discoverPresets = discoverPresets;
var promises_1 = require("node:fs/promises");
var node_path_1 = require("node:path");
var js_yaml_1 = require("js-yaml");
var cordis_plugin_include_1 = require("@z/cordis-plugin-include");
var dsh_home_paths_1 = require("@z/dsh-home-paths");
var metadata_ts_1 = require("./metadata.ts");
var preset_ts_1 = require("./preset.ts");
/** The composition file that makes a directory a preset. */
exports.COMPOSITION_FILE = 'agent.cordis.yml';
/**
 * Harness-home directory holding locally authored presets.
 *
 * This package owns the writable root the way `dsh-skill-filesystem` owns
 * `<dshHome>/skills`. An app must assemble the SHIPPED root, whose path only
 * the installed app can resolve; where a person's own presets go is the same
 * place in every deployment that does not say otherwise, so a launcher that
 * forgets to configure one still finds them.
 *
 * Package-internal on purpose: no consumer outside this package addresses the
 * directory by name, and a test that imported it could not catch this value
 * being wrong — the expected segment is spelled out where it is asserted.
 */
exports.USER_PRESET_DIR = '.agent-presets';
/**
 * Why `rows` cannot be an entry list, or undefined when it can.
 *
 * A shallow shape check, deliberately short of the loader's work: it does not
 * resolve plugin names or apply configs. What it catches is the hand-edit
 * that produces a file the loader cannot even begin with — and it must accept
 * everything the loader accepts, which is why rows are only required to be
 * maps carrying a plugin `name` (groups recurse into their own lists).
 * @param rows - the parsed composition document.
 * @param at - row-path prefix for nested diagnostics, empty at the top level.
 * @returns one human-readable reason, or undefined when the shape holds.
 */
function entryListProblem(rows, at) {
    if (at === void 0) { at = ''; }
    if (!Array.isArray(rows)) {
        return at === ''
            ? 'the composition must be a top-level list of plugin rows'
            : "group ".concat(at, " must hold a list of plugin rows");
    }
    for (var _i = 0, _a = rows.entries(); _i < _a.length; _i++) {
        var _b = _a[_i], index = _b[0], row = _b[1];
        var label = at === '' ? "row ".concat(String(index + 1)) : "".concat(at, " row ").concat(String(index + 1));
        if (typeof row !== 'object' || row === null || Array.isArray(row)) {
            return "".concat(label, " is not a plugin row (expected a map with a \"name\")");
        }
        var _c = row, name_1 = _c.name, group = _c.group, config = _c.config;
        if (typeof name_1 !== 'string' || name_1 === '') {
            return "".concat(label, " names no plugin (a \"name\" string is required)");
        }
        if (group === true) {
            var nested = entryListProblem(config, label);
            if (nested !== undefined)
                return nested;
        }
    }
    return undefined;
}
/**
 * Why the composition at `path` cannot mount, or undefined when it looks
 * loadable. Parsed with the loader's own YAML dialect ({@link entryListSchema},
 * the one carrying `!!js`), so health can never call a composition broken
 * that the loader would accept.
 * @param path - absolute path of the composition file.
 * @returns one human-readable reason, or undefined when the file is loadable.
 */
function compositionProblem(path) {
    return __awaiter(this, void 0, void 0, function () {
        var content, _a, rows, full;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, (0, promises_1.readFile)(path, 'utf8')];
                case 1:
                    content = _b.sent();
                    return [3 /*break*/, 3];
                case 2:
                    _a = _b.sent();
                    // The caller statted this file moments ago; any read failure now —
                    // deleted in between, permissions — is the same answer as unparsable.
                    return [2 /*return*/, "the composition file ".concat(exports.COMPOSITION_FILE, " cannot be read")];
                case 3:
                    try {
                        rows = (0, js_yaml_1.load)(content, { schema: cordis_plugin_include_1.entryListSchema });
                    }
                    catch (error) {
                        full = error instanceof Error ? error.message : String(error);
                        // First line only: js-yaml appends a multi-line code-frame snippet, and
                        // the reason is displayed on a roster card, not in a terminal.
                        return [2 /*return*/, "the composition is not valid YAML: ".concat(full.replace(/\n[\s\S]*$/, ''))];
                    }
                    return [2 /*return*/, entryListProblem(rows)];
            }
        });
    });
}
/**
 * Whether `path` names an existing regular file.
 * @param path - absolute path to test.
 * @returns true when the path resolves to a file.
 */
function isFile(path) {
    return __awaiter(this, void 0, void 0, function () {
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, (0, promises_1.stat)(path)];
                case 1: return [2 /*return*/, (_b.sent()).isFile()];
                case 2:
                    _a = _b.sent();
                    // Any stat failure — absent, unreadable, a dangling link — means this
                    // directory does not present a composition, which is not an error: the
                    // directory simply is not a preset.
                    return [2 /*return*/, false];
                case 3: return [2 /*return*/];
            }
        });
    });
}
/**
 * Scan one root for preset directories.
 *
 * An absent root yields no presets rather than throwing: the user root does
 * not exist until the first locally authored preset, and naming a default
 * that no root supplies already fails loud at resolution.
 *
 * Every directory whose name is a usable preset id is a roster row — broken
 * when its composition is missing or unloadable. A directory named outside
 * {@link PRESET_ID} is skipped instead: no copy could ever claim that name,
 * so it blocks nothing, and reporting `.DS_Store`-grade residue as broken
 * presets would teach users to ignore the marker.
 * @param root - the directory and the trust its presets inherit.
 * @returns the root's presets ordered by id.
 */
function scanRoot(root) {
    return __awaiter(this, void 0, void 0, function () {
        var dir, children, error_1, found, _i, children_1, child, directory, path, broken, _a, metadata;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    dir = (0, node_path_1.resolve)((0, dsh_home_paths_1.expandHomePath)(root.path));
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, (0, promises_1.readdir)(dir, { withFileTypes: true })];
                case 2:
                    children = _b.sent();
                    return [3 /*break*/, 4];
                case 3:
                    error_1 = _b.sent();
                    if (error_1.code === 'ENOENT')
                        return [2 /*return*/, []];
                    throw new Error("agent-presets: cannot read preset root ".concat(dir, ": ").concat(String(error_1)), { cause: error_1 });
                case 4:
                    found = [];
                    _i = 0, children_1 = children;
                    _b.label = 5;
                case 5:
                    if (!(_i < children_1.length)) return [3 /*break*/, 12];
                    child = children_1[_i];
                    if (!child.isDirectory() || !preset_ts_1.PRESET_ID.test(child.name))
                        return [3 /*break*/, 11];
                    directory = (0, node_path_1.join)(dir, child.name);
                    path = (0, node_path_1.join)(directory, exports.COMPOSITION_FILE);
                    return [4 /*yield*/, isFile(path)];
                case 6:
                    if (!(_b.sent())) return [3 /*break*/, 8];
                    return [4 /*yield*/, compositionProblem(path)];
                case 7:
                    _a = _b.sent();
                    return [3 /*break*/, 9];
                case 8:
                    _a = "the composition file ".concat(exports.COMPOSITION_FILE, " is missing \u2014 the directory still occupies the id; delete it or restore the file");
                    _b.label = 9;
                case 9:
                    broken = _a;
                    return [4 /*yield*/, (0, metadata_ts_1.readPresetMetadata)(directory)];
                case 10:
                    metadata = _b.sent();
                    found.push(__assign(__assign({ id: child.name, trust: root.trust, path: path }, metadata), broken === undefined ? {} : { broken: broken }));
                    _b.label = 11;
                case 11:
                    _i++;
                    return [3 /*break*/, 5];
                case 12: 
                // Declared order first so the shipped set reads by capability; everything
                // else falls back to the id, which keeps authored presets stable.
                return [2 /*return*/, found.sort(function (left, right) {
                        var _a, _b;
                        var byOrder = ((_a = left.order) !== null && _a !== void 0 ? _a : Number.POSITIVE_INFINITY) - ((_b = right.order) !== null && _b !== void 0 ? _b : Number.POSITIVE_INFINITY);
                        return byOrder === 0 ? left.id.localeCompare(right.id) : byOrder;
                    })];
            }
        });
    });
}
/**
 * Scan every root in precedence order.
 * @param roots - roots in precedence order; an earlier root wins a duplicate id.
 * @returns every discovered preset, first-root-wins per id.
 */
function discoverPresets(roots) {
    return __awaiter(this, void 0, void 0, function () {
        var byId, _i, roots_1, root, _a, _b, preset;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    byId = new Map();
                    _i = 0, roots_1 = roots;
                    _c.label = 1;
                case 1:
                    if (!(_i < roots_1.length)) return [3 /*break*/, 6];
                    root = roots_1[_i];
                    _a = 0;
                    return [4 /*yield*/, scanRoot(root)];
                case 2:
                    _b = _c.sent();
                    _c.label = 3;
                case 3:
                    if (!(_a < _b.length)) return [3 /*break*/, 5];
                    preset = _b[_a];
                    if (byId.has(preset.id))
                        return [3 /*break*/, 4];
                    byId.set(preset.id, preset);
                    _c.label = 4;
                case 4:
                    _a++;
                    return [3 /*break*/, 3];
                case 5:
                    _i++;
                    return [3 /*break*/, 1];
                case 6: return [2 /*return*/, __spreadArray([], byId.values(), true)];
            }
        });
    });
}
