"use strict";
/** Unified JSON-value schema DSL, inference, compilation, and typed tool helper. @module dsh-tools/schema */
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
exports.ToolArgsError = void 0;
exports.valueSchemaSpecToJsonSchema = valueSchemaSpecToJsonSchema;
exports.parameterSchemaSpecToJsonSchema = parameterSchemaSpecToJsonSchema;
exports.validateArgs = validateArgs;
exports.defineTool = defineTool;
var dsh_llm_1 = require("@z/dsh-llm");
var json_schema_ts_1 = require("./json-schema.ts");
var ANNOTATION_KEYS = ['description', 'title', 'default', 'examples'];
/** Throw one author-schema violation through the shared schema error type. */
function authorError(message) {
    throw new json_schema_ts_1.JsonSchemaError([message]);
}
/** Copy own annotation fields for validation by the raw-schema boundary. */
function copyAnnotations(source, target) {
    if (Object.hasOwn(source, 'description'))
        target.description = source.description;
    if (Object.hasOwn(source, 'title'))
        target.title = source.title;
    if (Object.hasOwn(source, 'default'))
        target.default = source.default;
    if (Object.hasOwn(source, 'examples'))
        target.examples = source.examples;
}
/** Reject author-only keys outside one node's declared vocabulary. */
function assertAuthorKeys(source, path, allowed) {
    for (var _i = 0, _a = Object.keys(source); _i < _a.length; _i++) {
        var key = _a[_i];
        if (!allowed.includes(key))
            authorError("".concat(path, ".").concat(key, " is not supported by the value schema DSL"));
    }
}
/** Install a compiled node without giving `__proto__` assignment semantics. */
function assignCompiledNode(destination, node) {
    switch (destination.kind) {
        case 'root':
            destination.holder.value = node;
            break;
        case 'property':
            Object.defineProperty(destination.target, destination.key, {
                value: node,
                enumerable: true,
                configurable: true,
                writable: true,
            });
            break;
        case 'item':
            destination.target.items = node;
            break;
        case 'one-of':
            destination.target[destination.index] = node;
            break;
    }
}
/** Install a compiled property map at its root or containing object node. */
function assignCompiledPropertyMap(destination, compiled) {
    if (destination.kind === 'root') {
        destination.holder.value = compiled;
    }
    else {
        destination.target.properties = compiled.properties;
    }
}
/** Execute an author-schema compilation task graph without recursive descent. */
function runSchemaCompiler(initial) {
    var seen = new Set();
    var tasks = [initial];
    for (var task = tasks.pop(); task !== undefined; task = tasks.pop()) {
        if (task.kind === 'leave') {
            seen.delete(task.input);
            continue;
        }
        if (task.kind === 'property-map-tail') {
            if (task.required.length > 0) {
                task.compiled.required = task.required;
                if (task.destination.kind === 'object')
                    task.destination.target.required = task.required;
            }
            continue;
        }
        if (task.kind === 'property') {
            if (!(0, json_schema_ts_1.isJsonSchemaRecord)(task.property))
                authorError("".concat(task.path, " must be a value schema object"));
            if (Object.hasOwn(task.property, 'required') && task.property.required !== true) {
                authorError("".concat(task.path, ".required must be true when present"));
            }
            if (Object.hasOwn(task.property, 'required') && task.property.required === true)
                task.required.push(task.key);
            tasks.push({
                kind: 'value',
                input: task.property,
                path: task.path,
                allowRequired: true,
                destination: { kind: 'property', target: task.properties, key: task.key },
            });
            continue;
        }
        if (task.kind === 'property-map') {
            if (!(0, json_schema_ts_1.isJsonSchemaRecord)(task.input))
                authorError("".concat(task.path, " must be an object of value schemas"));
            if (seen.has(task.input))
                authorError("".concat(task.path, " is circular"));
            seen.add(task.input);
            var compiled = { properties: {} };
            var required = [];
            assignCompiledPropertyMap(task.destination, compiled);
            tasks.push({ kind: 'leave', input: task.input });
            tasks.push({ kind: 'property-map-tail', compiled: compiled, required: required, destination: task.destination });
            var entries = Object.entries(task.input);
            for (var index = entries.length - 1; index >= 0; index--) {
                var entry = entries[index];
                /* v8 ignore next -- the loop is bounded by the captured entry count. */
                if (entry === undefined)
                    continue;
                tasks.push({
                    kind: 'property',
                    property: entry[1],
                    path: "".concat(task.path, ".").concat(entry[0]),
                    key: entry[0],
                    properties: compiled.properties,
                    required: required,
                });
            }
            continue;
        }
        var input = task.input, path = task.path;
        if (!(0, json_schema_ts_1.isJsonSchemaRecord)(input))
            authorError("".concat(path, " must be a value schema object"));
        if (seen.has(input))
            authorError("".concat(path, " is circular"));
        seen.add(input);
        var authorKeys = __spreadArray(__spreadArray([], ANNOTATION_KEYS, true), (task.allowRequired ? ['required'] : []), true);
        var node = {};
        assignCompiledNode(task.destination, node);
        tasks.push({ kind: 'leave', input: input });
        if (Object.hasOwn(input, 'oneOf')) {
            assertAuthorKeys(input, path, __spreadArray(__spreadArray([], authorKeys, true), ['oneOf', 'type'], false));
            if (Object.hasOwn(input, 'type'))
                authorError("".concat(path, " cannot declare both type and oneOf"));
            if (!(0, json_schema_ts_1.isPlainJsonArray)(input.oneOf))
                authorError("".concat(path, ".oneOf must be an array of at least two value schemas"));
            var branches = [];
            node.oneOf = branches;
            copyAnnotations(input, node);
            for (var index = input.oneOf.length - 1; index >= 0; index--) {
                tasks.push({
                    kind: 'value',
                    input: input.oneOf[index],
                    path: "".concat(path, ".oneOf[").concat(index, "]"),
                    allowRequired: false,
                    destination: { kind: 'one-of', target: branches, index: index },
                });
            }
            continue;
        }
        var inputType = Object.hasOwn(input, 'type') ? input.type : undefined;
        switch (inputType) {
            case 'json':
                assertAuthorKeys(input, path, __spreadArray(__spreadArray([], authorKeys, true), ['type'], false));
                copyAnnotations(input, node);
                break;
            case 'object':
                assertAuthorKeys(input, path, __spreadArray(__spreadArray([], authorKeys, true), ['type', 'properties', 'additionalProperties'], false));
                if (!Object.hasOwn(input, 'additionalProperties') || typeof input.additionalProperties !== 'boolean') {
                    authorError("".concat(path, ".additionalProperties must be explicitly true or false"));
                }
                node.type = 'object';
                copyAnnotations(input, node);
                node.additionalProperties = input.additionalProperties;
                if (Object.hasOwn(input, 'properties')) {
                    tasks.push({
                        kind: 'property-map',
                        input: input.properties,
                        path: "".concat(path, ".properties"),
                        destination: { kind: 'object', target: node },
                    });
                }
                break;
            case 'array':
                assertAuthorKeys(input, path, __spreadArray(__spreadArray([], authorKeys, true), ['type', 'items'], false));
                node.type = 'array';
                copyAnnotations(input, node);
                if (Object.hasOwn(input, 'items')) {
                    tasks.push({
                        kind: 'value',
                        input: input.items,
                        path: "".concat(path, ".items"),
                        allowRequired: false,
                        destination: { kind: 'item', target: node },
                    });
                }
                break;
            case 'string':
            case 'number':
            case 'integer':
            case 'boolean':
            case 'null':
                assertAuthorKeys(input, path, __spreadArray(__spreadArray([], authorKeys, true), ['type', 'enum', 'const'], false));
                node.type = inputType;
                copyAnnotations(input, node);
                if (Object.hasOwn(input, 'enum')) {
                    if (!(0, json_schema_ts_1.isPlainJsonArray)(input.enum))
                        authorError("".concat(path, ".enum must be a non-empty array of scalar values"));
                    node.enum = Array.from(input.enum, function (entry) { return entry; });
                }
                if (Object.hasOwn(input, 'const'))
                    node.const = input.const;
                break;
            default:
                authorError("".concat(path, ".type must be string/number/integer/boolean/null/array/object/json, or use oneOf"));
        }
    }
}
/** Compile one implicit property map, collecting per-property requiredness. */
function compilePropertyMap(input, path) {
    var _a;
    var holder = {};
    runSchemaCompiler({ kind: 'property-map', input: input, path: path, destination: { kind: 'root', holder: holder } });
    /* v8 ignore next -- the root task assigns before scheduling any descendants. */
    return (_a = holder.value) !== null && _a !== void 0 ? _a : authorError("".concat(path, " did not compile"));
}
/** Compile one author node without applying any consumer root restriction. */
function compileValueSchema(input, path) {
    var _a;
    var holder = {};
    runSchemaCompiler({ kind: 'value', input: input, path: path, allowRequired: false, destination: { kind: 'root', holder: holder } });
    /* v8 ignore next -- the root task assigns before scheduling any descendants. */
    return (_a = holder.value) !== null && _a !== void 0 ? _a : authorError("".concat(path, " did not compile"));
}
/**
 * Compile one author-facing value schema to the enforced raw JSON Schema
 * subset. The author-only `json` node becomes an annotation-only schema.
 * @param spec - schema for any JSON-value root.
 * @returns The asserted raw schema projection.
 */
function valueSchemaSpecToJsonSchema(spec) {
    var schema = compileValueSchema(spec, 'schema');
    (0, json_schema_ts_1.assertSupportedJsonSchema)(schema);
    return schema;
}
/**
 * Compile the implicit open parameter object into raw JSON Schema.
 * @param spec - per-property parameter definitions.
 * @returns An object-rooted raw schema with no implicit-root openness override.
 */
function parameterSchemaSpecToJsonSchema(spec) {
    var compiled = compilePropertyMap(spec, 'parameters');
    var schema = __assign({ type: 'object', properties: compiled.properties }, (compiled.required === undefined ? {} : { required: compiled.required }));
    (0, json_schema_ts_1.assertSupportedJsonSchema)(schema);
    return schema;
}
/** Invalid model-generated arguments for a typed tool. */
var ToolArgsError = /** @class */ (function (_super) {
    __extends(ToolArgsError, _super);
    function ToolArgsError(violations) {
        var _this = _super.call(this, "invalid arguments: ".concat(violations.join('; ')), 'INVALID_ARGS') || this;
        _this.name = 'ToolArgsError';
        _this.violations = violations;
        return _this;
    }
    return ToolArgsError;
}(dsh_llm_1.HarnessError));
exports.ToolArgsError = ToolArgsError;
/**
 * Validate model-generated arguments against an implicit parameter schema.
 * @param spec - declared parameter schema.
 * @param args - candidate arguments, however malformed.
 * @returns Path-qualified violations; empty means valid.
 */
function validateArgs(spec, args) {
    return (0, json_schema_ts_1.validateJsonSchemaValue)(parameterSchemaSpecToJsonSchema(spec), args, '');
}
/**
 * Define a first-party tool with inferred arguments and strict execution
 * validation. Replay-only presenters validate softly and fall back to generic
 * rendering for obsolete logged arguments.
 * @param options - typed definition and optional finalizer and presenters.
 * @returns A registry-ready definition.
 */
function defineTool(options) {
    // Object-literal methods do not use `this`; retaining references is safe.
    // oxlint-disable-next-line typescript/unbound-method
    var userExecute = options.execute;
    // oxlint-disable-next-line typescript/unbound-method
    var userFinalizeContent = options.finalizeContent;
    // oxlint-disable-next-line typescript/unbound-method
    var userRender = options.output.render;
    // oxlint-disable-next-line typescript/unbound-method
    var userPresentationMeta = options.output.presentationMeta;
    // oxlint-disable-next-line typescript/unbound-method
    var userPresentCall = options.presentCall;
    // oxlint-disable-next-line typescript/unbound-method
    var userPresentResult = options.presentResult;
    // oxlint-disable-next-line typescript/unbound-method
    var userIsConcurrencySafe = options.isConcurrencySafe;
    if (options.timeoutMs !== undefined && (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0)) {
        throw new Error("defineTool(".concat(options.name, "): timeoutMs must be a positive finite number"));
    }
    var parameters = parameterSchemaSpecToJsonSchema(options.parameters);
    var outputSchema = valueSchemaSpecToJsonSchema(options.output.schema);
    var validate = function (args) { return (0, json_schema_ts_1.validateJsonSchemaValue)(parameters, args, ''); };
    var tool = __assign(__assign({ name: options.name, description: options.description, parameters: parameters, output: __assign({ schema: outputSchema, render: function (args, value) {
                return userRender(args, value);
            } }, userPresentationMeta !== undefined ? {
            presentationMeta: function (args, value) {
                return userPresentationMeta(args, value);
            },
        } : {}) }, (options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {})), { execute: function (args, exec) {
            return __awaiter(this, void 0, void 0, function () {
                var violations;
                return __generator(this, function (_a) {
                    violations = validate(args);
                    if (violations.length > 0)
                        throw new ToolArgsError(violations);
                    return [2 /*return*/, userExecute(args, exec)];
                });
            });
        } });
    if (userFinalizeContent) {
        tool.finalizeContent = function (exec, result) { return userFinalizeContent(exec, result); };
    }
    // Presentation is display-only and may run on REPLAY of arbitrary logged args
    // (possibly from an older schema), so it must never throw: validate softly and
    // fall back to `undefined` (a generic UI presentation) on any mismatch, rather
    // than the hard `ToolArgsError` the execute path raises.
    if (userPresentCall) {
        tool.presentCall = function (args) {
            if (validate(args).length > 0)
                return undefined;
            return userPresentCall(args);
        };
    }
    if (userPresentResult) {
        tool.presentResult = function (args, result) {
            if (validate(args).length > 0)
                return undefined;
            return userPresentResult(args, result);
        };
    }
    if (userIsConcurrencySafe) {
        tool.isConcurrencySafe = function (args) {
            if (validate(args).length > 0)
                return false;
            return userIsConcurrencySafe(args);
        };
    }
    return tool;
}
