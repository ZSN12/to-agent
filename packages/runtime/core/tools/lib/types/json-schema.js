"use strict";
/**
 * Enforced JSON Schema subset shared by tool outputs, generated Code Mode
 * types, subagents, and workflows. The subset accepts any JSON root, an
 * annotation-only schema for unconstrained JSON, one scalar `type`, object
 * `properties`/`required`/boolean `additionalProperties`, array `items`,
 * type-correct scalar `enum`/`const`, and exact-one `oneOf`.
 *
 * Unsupported or misplaced keywords reject rather than being accepted without
 * enforcement. Consumers that require an object root apply
 * {@link assertObjectJsonSchema} before accepting input.
 * @module dsh-tools/json-schema
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.JsonSchemaError = void 0;
exports.isPlainJsonRecord = isPlainJsonRecord;
exports.isJsonSchemaRecord = isJsonSchemaRecord;
exports.isPlainJsonArray = isPlainJsonArray;
exports.assertSupportedJsonSchema = assertSupportedJsonSchema;
exports.assertObjectJsonSchema = assertObjectJsonSchema;
exports.validateJsonSchemaValue = validateJsonSchemaValue;
var dsh_llm_1 = require("@z/dsh-llm");
var dsh_session_1 = require("@z/dsh-session");
/**
 * Thrown when a raw schema falls outside the enforced subset. `violations`
 * lists every offending path instead of stopping at the first author error.
 */
var JsonSchemaError = /** @class */ (function (_super) {
    __extends(JsonSchemaError, _super);
    function JsonSchemaError(violations) {
        var _this = _super.call(this, "unsupported JSON schema: ".concat(violations.join('; ')), 'UNSUPPORTED_SCHEMA') || this;
        _this.name = 'JsonSchemaError';
        _this.violations = violations;
        return _this;
    }
    return JsonSchemaError;
}(dsh_llm_1.HarnessError));
exports.JsonSchemaError = JsonSchemaError;
var CONSTRAINT_KEYWORDS = new Set([
    'type',
    'oneOf',
    'properties',
    'required',
    'additionalProperties',
    'items',
    'enum',
    'const',
]);
var ANNOTATION_KEYWORDS = new Set(['description', 'title', 'default', 'examples']);
var SCHEMA_TYPES = ['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'];
/* jscpd:ignore-start -- this realm boundary mirrors the session-owned lossless-JSON intrinsic test */
/** Whether a realm-owned intrinsic prototype is backed by its native constructor. */
function hasIntrinsicConstructor(prototype, name) {
    var descriptor = Object.getOwnPropertyDescriptor(prototype, 'constructor');
    var constructor = descriptor === null || descriptor === void 0 ? void 0 : descriptor.value;
    if (typeof constructor !== 'function')
        return false;
    try {
        return constructor.name === name
            && constructor.prototype === prototype
            && Function.prototype.toString.call(constructor) === "function ".concat(name, "() { [native code] }");
    }
    catch (_a) {
        return false;
    }
}
/** Whether a candidate is one realm's intrinsic `Object.prototype`. */
function isIntrinsicObjectPrototype(value) {
    return Object.getPrototypeOf(value) === null && hasIntrinsicConstructor(value, 'Object');
}
/**
 * Test for a realm-agnostic plain JSON record without accepting arrays or
 * exotic objects.
 * @param value - candidate record from any JavaScript realm.
 * @returns Whether the value has a plain-object prototype chain.
 */
function isPlainJsonRecord(value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        return false;
    try {
        var prototype = Object.getPrototypeOf(value);
        return prototype === null
            || typeof prototype === 'object' && isIntrinsicObjectPrototype(prototype);
    }
    catch (_a) {
        return false;
    }
}
/** Whether an array uses one realm's intrinsic `Array.prototype`. */
function hasPlainArrayPrototype(value) {
    var prototype = Object.getPrototypeOf(value);
    if (!Array.isArray(prototype) || !hasIntrinsicConstructor(prototype, 'Array'))
        return false;
    var objectPrototype = Object.getPrototypeOf(prototype);
    return typeof objectPrototype === 'object'
        && objectPrototype !== null
        && isIntrinsicObjectPrototype(objectPrototype);
}
/* jscpd:ignore-end */
/** Return whether a record contains only own enumerable string keys. */
function hasOnlyEnumerableStringKeys(value) {
    try {
        return Reflect.ownKeys(value)
            .every(function (key) { return typeof key === 'string' && Object.prototype.propertyIsEnumerable.call(value, key); });
    }
    catch (_a) {
        return false;
    }
}
/**
 * Test for an ordinary schema record whose keys survive JSON projection.
 * @param value - candidate record from any JavaScript realm.
 * @returns Whether the record has an intrinsic prototype and only own enumerable string keys.
 */
function isJsonSchemaRecord(value) {
    return isPlainJsonRecord(value) && hasOnlyEnumerableStringKeys(value);
}
/**
 * Test for a dense ordinary array with no JSON-invisible decorations.
 * @param value - candidate array from any JavaScript realm.
 * @returns Whether the array is intrinsic, dense, and undecorated.
 */
function isPlainJsonArray(value) {
    if (!Array.isArray(value))
        return false;
    try {
        if (!hasPlainArrayPrototype(value) || Reflect.ownKeys(value).length !== value.length + 1)
            return false;
        for (var index = 0; index < value.length; index++) {
            if (!Object.hasOwn(value, index))
                return false;
        }
        return true;
    }
    catch (_a) {
        return false;
    }
}
/** Lossless finite JSON number, excluding negative zero. */
function isJsonNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) && !Object.is(value, -0);
}
/** Whether a scalar is valid for one declared schema type. */
function scalarMatches(type, value) {
    switch (type) {
        case 'string': return typeof value === 'string';
        case 'number': return isJsonNumber(value);
        case 'integer': return isJsonNumber(value) && Number.isInteger(value);
        case 'boolean': return typeof value === 'boolean';
        case 'null': return value === null;
        /* v8 ignore next -- JsonSchemaScalarType is closed; this retains compile-time exhaustiveness. */
        default: return (0, dsh_llm_1.assertNever)(type, 'JsonSchemaType');
    }
}
/** Keywords that are invalid beside `oneOf`. */
var ONE_OF_SIBLING_KEYWORDS = ['properties', 'required', 'additionalProperties', 'items', 'enum', 'const'];
/** Validate object-only fields after its property schemas have been visited. */
function checkObjectSchemaTail(node, path, properties, violations) {
    var hasRequired = Object.hasOwn(node, 'required');
    var required = hasRequired ? node.required : undefined;
    if (hasRequired) {
        if (!isPlainJsonArray(required) || required.some(function (entry) { return typeof entry !== 'string'; })) {
            violations.push("".concat(path, ".required must be an array of strings"));
        }
        else {
            var declared = isJsonSchemaRecord(properties) ? properties : {};
            for (var _i = 0, _a = required; _i < _a.length; _i++) {
                var key = _a[_i];
                if (!Object.hasOwn(declared, key))
                    violations.push("".concat(path, ".required names \"").concat(key, "\" which is not in properties"));
            }
        }
    }
    if (Object.hasOwn(node, 'additionalProperties') && typeof node.additionalProperties !== 'boolean') {
        violations.push("".concat(path, ".additionalProperties must be a boolean"));
    }
}
/** Collect every violation for one raw schema tree without using the JavaScript call stack. */
function checkSchemaNode(root, rootPath, violations, seen) {
    var tasks = [{ kind: 'enter', node: root, path: rootPath }];
    var _loop_1 = function (task) {
        if (task.kind === 'leave') {
            seen.delete(task.node);
            return "continue";
        }
        if (task.kind === 'one-of-tail') {
            for (var _i = 0, ONE_OF_SIBLING_KEYWORDS_1 = ONE_OF_SIBLING_KEYWORDS; _i < ONE_OF_SIBLING_KEYWORDS_1.length; _i++) {
                var key = ONE_OF_SIBLING_KEYWORDS_1[_i];
                if (Object.hasOwn(task.node, key))
                    violations.push("".concat(task.path, ".").concat(key, " is not supported beside oneOf"));
            }
            return "continue";
        }
        if (task.kind === 'object-tail') {
            checkObjectSchemaTail(task.node, task.path, task.properties, violations);
            return "continue";
        }
        var node = task.node, path = task.path;
        if (!isJsonSchemaRecord(node)) {
            violations.push("".concat(path, " must be a schema object"));
            return "continue";
        }
        if (seen.has(node)) {
            violations.push("".concat(path, " is circular"));
            return "continue";
        }
        seen.add(node);
        tasks.push({ kind: 'leave', node: node });
        for (var _a = 0, _b = Object.keys(node); _a < _b.length; _a++) {
            var key = _b[_a];
            if (CONSTRAINT_KEYWORDS.has(key))
                continue;
            if (ANNOTATION_KEYWORDS.has(key)) {
                try {
                    if (!(0, dsh_session_1.isJsonValue)(node[key]))
                        violations.push("".concat(path, ".").concat(key, " annotation must be lossless JSON data"));
                }
                catch (_c) {
                    violations.push("".concat(path, ".").concat(key, " annotation must be lossless JSON data"));
                }
                continue;
            }
            violations.push("".concat(path, ".").concat(key, " is not a supported keyword (subset: type/oneOf/properties/required/additionalProperties/items/enum/const + annotations)"));
        }
        if (Object.hasOwn(node, 'description') && typeof node.description !== 'string') {
            violations.push("".concat(path, ".description must be a string"));
        }
        if (Object.hasOwn(node, 'title') && typeof node.title !== 'string') {
            violations.push("".concat(path, ".title must be a string"));
        }
        var hasType = Object.hasOwn(node, 'type');
        var hasOneOf = Object.hasOwn(node, 'oneOf');
        if (hasType && hasOneOf) {
            violations.push("".concat(path, " cannot declare both type and oneOf"));
            return "continue";
        }
        if (!hasType && !hasOneOf) {
            for (var _d = 0, ONE_OF_SIBLING_KEYWORDS_2 = ONE_OF_SIBLING_KEYWORDS; _d < ONE_OF_SIBLING_KEYWORDS_2.length; _d++) {
                var key = ONE_OF_SIBLING_KEYWORDS_2[_d];
                if (Object.hasOwn(node, key))
                    violations.push("".concat(path, ".").concat(key, " requires type or oneOf"));
            }
            return "continue";
        }
        if (hasOneOf) {
            var oneOf = node.oneOf;
            tasks.push({ kind: 'one-of-tail', node: node, path: path });
            if (!isPlainJsonArray(oneOf) || oneOf.length < 2) {
                violations.push("".concat(path, ".oneOf must be an array of at least two schemas"));
            }
            else {
                for (var index = oneOf.length - 1; index >= 0; index--) {
                    tasks.push({ kind: 'enter', node: oneOf[index], path: "".concat(path, ".oneOf[").concat(index, "]") });
                }
            }
            return "continue";
        }
        var type = node.type;
        if (typeof type !== 'string' || !SCHEMA_TYPES.includes(type)) {
            violations.push(Array.isArray(type)
                ? "".concat(path, ".type must be a single type string (type arrays are not supported)")
                : "".concat(path, ".type must be one of ").concat(SCHEMA_TYPES.join('/')));
            return "continue";
        }
        var schemaType = type;
        var allowedFor = {
            properties: ['object'],
            required: ['object'],
            additionalProperties: ['object'],
            items: ['array'],
            enum: ['string', 'number', 'integer', 'boolean', 'null'],
            const: ['string', 'number', 'integer', 'boolean', 'null'],
        };
        for (var _e = 0, _f = Object.entries(allowedFor); _e < _f.length; _e++) {
            var _g = _f[_e], key = _g[0], types = _g[1];
            if (Object.hasOwn(node, key) && !types.includes(schemaType)) {
                violations.push("".concat(path, ".").concat(key, " is not supported on type \"").concat(schemaType, "\""));
            }
        }
        switch (schemaType) {
            case 'object': {
                var properties = Object.hasOwn(node, 'properties') ? node.properties : undefined;
                tasks.push({ kind: 'object-tail', node: node, path: path, properties: properties });
                if (Object.hasOwn(node, 'properties')) {
                    if (!isJsonSchemaRecord(properties)) {
                        violations.push("".concat(path, ".properties must be an object of schemas"));
                    }
                    else {
                        var entries = Object.entries(properties);
                        for (var index = entries.length - 1; index >= 0; index--) {
                            var entry = entries[index];
                            /* v8 ignore next -- the loop is bounded by the captured entry count. */
                            if (entry === undefined)
                                continue;
                            tasks.push({ kind: 'enter', node: entry[1], path: "".concat(path, ".properties.").concat(entry[0]) });
                        }
                    }
                }
                break;
            }
            case 'array': {
                if (Object.hasOwn(node, 'items'))
                    tasks.push({ kind: 'enter', node: node.items, path: "".concat(path, ".items") });
                break;
            }
            case 'string':
            case 'number':
            case 'integer':
            case 'boolean':
            case 'null': {
                var hasEnum = Object.hasOwn(node, 'enum');
                var allowed = hasEnum ? node.enum : undefined;
                var enumValid = isPlainJsonArray(allowed)
                    && allowed.length > 0
                    && allowed.every(function (entry) { return scalarMatches(schemaType, entry); });
                if (hasEnum && !enumValid) {
                    violations.push("".concat(path, ".enum must be a non-empty array of ").concat(schemaType, " values"));
                }
                var hasConst = Object.hasOwn(node, 'const');
                var declaredConst = hasConst ? node.const : undefined;
                var constValid = scalarMatches(schemaType, declaredConst);
                if (hasConst) {
                    if (!constValid) {
                        violations.push("".concat(path, ".const must be a ").concat(schemaType, " value"));
                    }
                    else if (enumValid && !allowed.includes(declaredConst)) {
                        violations.push("".concat(path, ".const must be one of ").concat(path, ".enum when both are declared"));
                    }
                }
                break;
            }
            /* v8 ignore next -- schemaType was narrowed from the closed SCHEMA_TYPES table above. */
            default: (0, dsh_llm_1.assertNever)(schemaType, 'JsonSchemaType');
        }
    };
    for (var task = tasks.pop(); task !== undefined; task = tasks.pop()) {
        _loop_1(task);
    }
}
/**
 * Assert that an arbitrary raw schema uses only the enforced subset.
 * Annotation-only schemas are accepted as the standard unconstrained-JSON
 * form; callers that require an object root use {@link assertObjectJsonSchema}.
 * @param schema - untrusted raw JSON Schema.
 * @returns Assertion that the schema belongs to the supported subset.
 */
function assertSupportedJsonSchema(schema) {
    var violations = [];
    checkSchemaNode(schema, 'schema', violations, new Set());
    if (violations.length > 0)
        throw new JsonSchemaError(violations);
}
/**
 * Assert the enforced subset plus the object-root constraint retained by
 * subagent and workflow structured outputs.
 * @param schema - untrusted caller-supplied schema.
 * @returns Assertion that the schema belongs to the supported subset and has an object root.
 */
function assertObjectJsonSchema(schema) {
    var violations = [];
    checkSchemaNode(schema, 'schema', violations, new Set());
    if (violations.length === 0
        && (!isJsonSchemaRecord(schema) || !Object.hasOwn(schema, 'type') || schema.type !== 'object')) {
        violations.push('schema.type must be "object" (structured output is object-rooted)');
    }
    if (violations.length > 0)
        throw new JsonSchemaError(violations);
}
/** Safely test the lossless JSON boundary when a getter may throw. */
function safelyIsJsonValue(value) {
    try {
        return (0, dsh_session_1.isJsonValue)(value);
    }
    catch (_a) {
        return false;
    }
}
/** Root-aware diagnostic path for the parameter validator's empty sentinel. */
function diagnosticPath(path) {
    return path === '' ? 'arguments' : path;
}
/** Append one object property without a leading dot at an implicit root. */
function propertyPath(path, key) {
    return path === '' ? key : "".concat(path, ".").concat(key);
}
/** The generic exception-containment diagnostic owned by one valid schema node. */
function losslessValueViolation(path) {
    return ["\"".concat(diagnosticPath(path), "\" must be a lossless JSON value")];
}
/** Append diagnostics without spreading a potentially wide child result as call arguments. */
function appendViolations(target, source) {
    for (var _i = 0, source_1 = source; _i < source_1.length; _i++) {
        var violation = source_1[_i];
        target.push(violation);
    }
}
/** Initialize one validation frame with empty aggregation state. */
function valueFrame(node, value, path) {
    return {
        node: node,
        value: value,
        path: path,
        catches: false,
        phase: 'start',
        children: [],
        childIndex: 0,
        violations: [],
        tailViolations: [],
        matches: 0,
    };
}
/** Validate one scalar node after its primitive type check. */
function checkScalarValue(node, value, path) {
    var allowed = Object.hasOwn(node, 'enum') ? node.enum : undefined;
    if (allowed !== undefined && !allowed.includes(value)) {
        return ["\"".concat(diagnosticPath(path), "\" must be one of ").concat(JSON.stringify(allowed))];
    }
    if (Object.hasOwn(node, 'const') && value !== node.const) {
        return ["\"".concat(diagnosticPath(path), "\" must be ").concat(JSON.stringify(node.const))];
    }
    return [];
}
/** Validate one trusted schema/value pair with explicit frames rather than recursive calls. */
function checkValue(schema, value, path) {
    var _a, _b;
    var frames = [valueFrame(schema, value, path)];
    var rootResult;
    var receive = function (result) {
        var parent = frames.at(-1);
        if (parent === undefined) {
            rootResult = result;
            return;
        }
        if (parent.kind === 'oneOf') {
            if (result.length === 0)
                parent.matches++;
        }
        else {
            appendViolations(parent.violations, result);
        }
    };
    var finish = function (result) {
        frames.pop();
        receive(result);
    };
    var _loop_2 = function () {
        var frame = frames.at(-1);
        /* v8 ignore next -- the loop condition guarantees a current frame. */
        if (frame === undefined)
            return "break";
        try {
            if (frame.phase === 'children') {
                if (frame.childIndex < frame.children.length) {
                    var child = frame.children[frame.childIndex];
                    /* v8 ignore next -- childIndex is bounded by children.length. */
                    if (child === undefined)
                        throw new Error('missing schema-value child frame');
                    frame.childIndex++;
                    frames.push(valueFrame(child.node, child.value, child.path));
                    return "continue";
                }
                if (frame.kind === 'oneOf') {
                    finish(frame.matches === 1 ? [] : ["\"".concat(diagnosticPath(frame.path), "\" must match exactly one oneOf branch (matched ").concat(frame.matches, ")")]);
                    return "continue";
                }
                appendViolations(frame.violations, frame.tailViolations);
                if (frame.violations.length > 0) {
                    finish(frame.violations);
                }
                else if (frame.kind === 'object') {
                    finish(safelyIsJsonValue(frame.value) ? [] : ["\"".concat(diagnosticPath(frame.path), "\" must be a lossless JSON object")]);
                }
                else {
                    finish(safelyIsJsonValue(frame.value) ? [] : ["\"".concat(diagnosticPath(frame.path), "\" must be a dense lossless JSON array")]);
                }
                return "continue";
            }
            var nodeType = Object.hasOwn(frame.node, 'type') ? frame.node.type : undefined;
            frame.catches = !(nodeType !== undefined && !SCHEMA_TYPES.includes(nodeType));
            var oneOf = Object.hasOwn(frame.node, 'oneOf') ? frame.node.oneOf : undefined;
            if (oneOf !== undefined) {
                frame.kind = 'oneOf';
                frame.children = Array.from(oneOf, function (branch) { return ({ node: branch, value: frame.value, path: frame.path }); });
                frame.childIndex = 0;
                frame.matches = 0;
                frame.phase = 'children';
                return "continue";
            }
            if (nodeType === undefined) {
                finish(safelyIsJsonValue(frame.value) ? [] : losslessValueViolation(frame.path));
                return "continue";
            }
            switch (nodeType) {
                case 'object': {
                    if (!isPlainJsonRecord(frame.value)) {
                        finish(["\"".concat(diagnosticPath(frame.path), "\" must be an object")]);
                        break;
                    }
                    var properties = Object.hasOwn(frame.node, 'properties') ? (_a = frame.node.properties) !== null && _a !== void 0 ? _a : {} : {};
                    var violations = [];
                    var required = Object.hasOwn(frame.node, 'required') ? (_b = frame.node.required) !== null && _b !== void 0 ? _b : [] : [];
                    for (var _i = 0, required_1 = required; _i < required_1.length; _i++) {
                        var key = required_1[_i];
                        if (!Object.hasOwn(frame.value, key) || frame.value[key] === undefined) {
                            violations.push("missing required property \"".concat(propertyPath(frame.path, key), "\""));
                        }
                    }
                    var children = [];
                    for (var _c = 0, _d = Object.entries(properties); _c < _d.length; _c++) {
                        var _e = _d[_c], key = _e[0], child = _e[1];
                        if (!Object.hasOwn(frame.value, key) || frame.value[key] === undefined)
                            continue;
                        children.push({ node: child, value: frame.value[key], path: propertyPath(frame.path, key) });
                    }
                    var tailViolations = [];
                    if (Object.hasOwn(frame.node, 'additionalProperties') && frame.node.additionalProperties === false) {
                        for (var _f = 0, _g = Object.keys(frame.value); _f < _g.length; _f++) {
                            var key = _g[_f];
                            if (!Object.hasOwn(properties, key)) {
                                tailViolations.push("\"".concat(propertyPath(frame.path, key), "\" is not a declared property (additionalProperties: false)"));
                            }
                        }
                    }
                    frame.kind = 'object';
                    frame.children = children;
                    frame.childIndex = 0;
                    frame.violations = violations;
                    frame.tailViolations = tailViolations;
                    frame.phase = 'children';
                    break;
                }
                case 'array': {
                    if (!Array.isArray(frame.value)) {
                        finish(["\"".concat(diagnosticPath(frame.path), "\" must be an array")]);
                        break;
                    }
                    var items_1 = Object.hasOwn(frame.node, 'items') ? frame.node.items : undefined;
                    var children = items_1 === undefined
                        ? []
                        : frame.value.flatMap(function (entry, index) { return [{ node: items_1, value: entry, path: "".concat(frame.path, "[").concat(index, "]") }]; });
                    frame.kind = 'array';
                    frame.children = children;
                    frame.childIndex = 0;
                    frame.violations = [];
                    frame.phase = 'children';
                    break;
                }
                case 'string':
                    finish(typeof frame.value === 'string'
                        ? checkScalarValue(frame.node, frame.value, frame.path)
                        : ["\"".concat(diagnosticPath(frame.path), "\" must be a string")]);
                    break;
                case 'number':
                    finish(typeof frame.value !== 'number'
                        ? ["\"".concat(diagnosticPath(frame.path), "\" must be a number")]
                        : !isJsonNumber(frame.value)
                            ? ["\"".concat(diagnosticPath(frame.path), "\" must be a finite JSON number")]
                            : checkScalarValue(frame.node, frame.value, frame.path));
                    break;
                case 'integer':
                    finish(!isJsonNumber(frame.value) || !Number.isInteger(frame.value)
                        ? ["\"".concat(diagnosticPath(frame.path), "\" must be an integer")]
                        : checkScalarValue(frame.node, frame.value, frame.path));
                    break;
                case 'boolean':
                    finish(typeof frame.value === 'boolean'
                        ? checkScalarValue(frame.node, frame.value, frame.path)
                        : ["\"".concat(diagnosticPath(frame.path), "\" must be a boolean")]);
                    break;
                case 'null':
                    finish(frame.value === null
                        ? checkScalarValue(frame.node, frame.value, frame.path)
                        : ["\"".concat(diagnosticPath(frame.path), "\" must be null")]);
                    break;
                default:
                    finish((0, dsh_llm_1.assertNever)(nodeType, 'JsonSchemaType'));
            }
        }
        catch (error) {
            var failed = frames.pop();
            while (failed !== undefined && !failed.catches)
                failed = frames.pop();
            if (failed === undefined)
                throw error;
            receive(losslessValueViolation(failed.path));
        }
    };
    while (frames.length > 0) {
        var state_1 = _loop_2();
        if (state_1 === "break")
            break;
    }
    /* v8 ignore next -- every root frame finishes or throws. */
    return rootResult !== null && rootResult !== void 0 ? rootResult : losslessValueViolation(path);
}
/**
 * Validate a candidate value against an asserted raw schema. The function is
 * total for arbitrary values and returns path-qualified violations.
 * @param schema - a schema accepted by {@link assertSupportedJsonSchema}.
 * @param value - the candidate JSON value.
 * @param path - root label used in diagnostics.
 * @returns All violations in walk order; empty means valid.
 */
function validateJsonSchemaValue(schema, value, path) {
    if (path === void 0) { path = 'value'; }
    return checkValue(schema, value, path);
}
