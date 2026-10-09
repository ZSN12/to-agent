"use strict";
/** Package-owned prompt-assembly invariants. @module @z/dsh-system-prompt/invariant */
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
exports.apply = exports.inject = exports.name = void 0;
var PACKAGE_NAME = '@z/dsh-system-prompt';
var VARIABLE_NAME = /^[a-z][a-z0-9_]*$/;
/** Cordis companion plugin name. */
exports.name = 'system-prompt-invariant';
/** Service required before the companion can reserve package ownership. */
exports.inject = ['invariants'];
/** Validate the authoritative assembly returned by the waterfall. */
function validateAssembly(assembly, fail) {
    var sectionNames = new Set();
    for (var _i = 0, _a = assembly.sections; _i < _a.length; _i++) {
        var section = _a[_i];
        if (section.name.length === 0)
            fail('assembled section names must be non-empty');
        if (sectionNames.has(section.name))
            fail("assembled section name ".concat(JSON.stringify(section.name), " is duplicated"));
        sectionNames.add(section.name);
        if (typeof section.text !== 'string')
            fail("assembled section ".concat(JSON.stringify(section.name), " text must be a string"));
    }
    var contextNames = new Set();
    for (var _b = 0, _c = assembly.contexts; _b < _c.length; _b++) {
        var context = _c[_b];
        if (context.name.length === 0)
            fail('assembled context names must be non-empty');
        if (contextNames.has(context.name))
            fail("assembled context name ".concat(JSON.stringify(context.name), " is duplicated"));
        contextNames.add(context.name);
        if (typeof context.text !== 'string')
            fail("assembled context ".concat(JSON.stringify(context.name), " text must be a string"));
    }
    for (var _d = 0, _e = assembly.tools; _d < _e.length; _d++) {
        var tool = _e[_d];
        if (tool.name.length === 0)
            fail('assembled tool names must be non-empty');
    }
    for (var _f = 0, _g = Object.entries(assembly.variables); _f < _g.length; _f++) {
        var _h = _g[_f], name_1 = _h[0], value = _h[1];
        if (!VARIABLE_NAME.test(name_1))
            fail("assembled variable name ".concat(JSON.stringify(name_1), " is invalid"));
        if (value !== undefined && typeof value !== 'string') {
            fail("assembled variable ".concat(JSON.stringify(name_1), " must be a string or undefined"));
        }
    }
}
/** Install validation around the authoritative assembly waterfall result. */
var install = function (ctx, fail) {
    ctx.on('system-prompt/assemble', function (_assembly, _context, next) { return __awaiter(void 0, void 0, void 0, function () {
        var assembled;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, next()];
                case 1:
                    assembled = _a.sent();
                    validateAssembly(assembled, fail);
                    return [2 /*return*/, assembled];
            }
        });
    }); }, { global: true, prepend: true });
};
/**
 * Register the system-prompt invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
var apply = function (ctx) {
    return Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
};
exports.apply = apply;
