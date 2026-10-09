"use strict";
/**
 * A preset's display metadata: the name and description a picker shows.
 *
 * It lives in its own file because the composition is a top-level list of
 * plugin rows — YAML cannot carry sibling keys beside it, and faking a
 * metadata row would hand the Loader something to load. Keeping it separate
 * also keeps the composition exactly what its name says: a Cordis file the
 * loader owns and the cordis preset can author.
 *
 * The file carries display text ONLY. `id` is the directory name and `trust`
 * comes from the root a preset was discovered under, so neither is writable
 * here — otherwise a locally authored preset could claim to be a shipped one.
 *
 * Every read failure degrades to no metadata. A preset whose display text is
 * missing, malformed, or unreadable still mounts: presentation is not a
 * capability, and a broken name must never become an agent that cannot start.
 * @module @z/dsh-agent-presets/metadata
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.METADATA_FILE = void 0;
exports.readPresetMetadata = readPresetMetadata;
exports.renderPresetMetadata = renderPresetMetadata;
var promises_1 = require("node:fs/promises");
var node_path_1 = require("node:path");
var js_yaml_1 = require("js-yaml");
/** The optional display-metadata file beside a preset's composition. */
exports.METADATA_FILE = 'preset.yml';
/** A non-empty trimmed string, or undefined for anything else. */
function text(value) {
    if (typeof value !== 'string')
        return undefined;
    var trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
}
/**
 * Read one preset directory's display metadata.
 *
 * Absent, unparsable, and wrongly-shaped files are all the same answer —
 * empty metadata — because the caller renders a picker, not a diagnostic.
 * @param directory - the preset directory.
 * @returns the display text the preset published, possibly empty.
 */
function readPresetMetadata(directory) {
    return __awaiter(this, void 0, void 0, function () {
        var raw, _a, parsed, record, name, description, order;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, (0, promises_1.readFile)((0, node_path_1.join)(directory, exports.METADATA_FILE), 'utf8')];
                case 1:
                    raw = _b.sent();
                    return [3 /*break*/, 3];
                case 2:
                    _a = _b.sent();
                    // Absent is the common case: metadata is optional and most presets,
                    // including every one authored by duplicating another, carry none.
                    return [2 /*return*/, {}];
                case 3:
                    try {
                        parsed = js_yaml_1.default.load(raw);
                    }
                    catch (_c) {
                        // Malformed display text is not worth failing discovery over; the picker
                        // falls back to the id, and the composition still mounts.
                        return [2 /*return*/, {}];
                    }
                    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
                        return [2 /*return*/, {}];
                    record = parsed;
                    name = text(record.name);
                    description = text(record.description);
                    order = typeof record.order === 'number' && Number.isFinite(record.order)
                        ? record.order
                        : undefined;
                    return [2 /*return*/, __assign(__assign(__assign({}, name === undefined ? {} : { name: name }), description === undefined ? {} : { description: description }), order === undefined ? {} : { order: order })];
            }
        });
    });
}
/**
 * Render display metadata as the file's contents.
 *
 * Absent fields are omitted rather than written empty, so a preset with no
 * description does not ship a key that reads as an intentional blank.
 * @param metadata - the display text to store.
 * @returns the YAML document, or undefined when there is nothing to store.
 */
function renderPresetMetadata(metadata) {
    var name = text(metadata.name);
    var description = text(metadata.description);
    var order = metadata.order;
    if (name === undefined && description === undefined && order === undefined)
        return undefined;
    return js_yaml_1.default.dump(__assign(__assign(__assign({}, name === undefined ? {} : { name: name }), description === undefined ? {} : { description: description }), order === undefined ? {} : { order: order }), { lineWidth: -1 });
}
