"use strict";
/**
 * Code Mode codegen: the pure projection from registered tool schemas to the TypeScript SDK
 * text the model programs against (the `tools:sdk` prompt section). Sibling of
 * `json-schema.ts` — `schemas()` (native function calling) and this module (the generated
 * `declare const tools` API) are two projections of the same store.
 * @module @z/dsh-tools/src/ts-types
 */
var __makeTemplateObject = (this && this.__makeTemplateObject) || function (cooked, raw) {
    if (Object.defineProperty) { Object.defineProperty(cooked, "raw", { value: raw }); } else { cooked.raw = raw; }
    return cooked;
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
exports.jsonSchemaToTs = jsonSchemaToTs;
exports.renderToolsSdk = renderToolsSdk;
var json_schema_ts_1 = require("./json-schema.ts");
/** Property names that are valid bare TS identifiers; anything else is quoted. */
var IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
/** Render an object key: bare when it is a valid identifier, quoted otherwise (every name stays reachable, no aliasing). */
function renderKey(name) {
    return IDENTIFIER.test(name) ? name : JSON.stringify(name);
}
/** One `indent`-deep line prefix (two spaces per level). */
function pad(indent) {
    return '  '.repeat(indent);
}
/** A one-line JSDoc block for a schema `description`, or no lines when there is none. */
function docLines(description, indent) {
    if (typeof description !== 'string' || description.length === 0)
        return [];
    // Collapse prose to stable one-line docs and escape comment closers so a
    // schema description cannot terminate generated JSDoc.
    var collapsed = description.replace(/\s+/g, ' ').trim();
    return ["".concat(pad(indent), "/** ").concat(collapsed.replaceAll('*/', String.raw(templateObject_1 || (templateObject_1 = __makeTemplateObject(["*/"], ["*\\/"])))), " */")];
}
/** Render one scalar already validated by the unified schema boundary. */
function renderScalar(value) {
    return JSON.stringify(value);
}
/** Render a validated scalar `const`/`enum`, falling back to the broad type. */
function renderConstrainedScalar(node, type) {
    var broad = type === 'integer' ? 'number' : type;
    if (Object.hasOwn(node, 'const'))
        return renderScalar(node.const);
    if (Object.hasOwn(node, 'enum')) {
        return node.enum.map(renderScalar).join(' | ');
    }
    return broad;
}
/** Build one document from captured parts while retaining the legacy array-parenthesization test. */
function typeDocumentFrom(parts) {
    return {
        parts: parts,
        containsUnionOrIntersection: parts.some(function (part) { return typeof part === 'string'
            ? part.includes('|') || part.includes('&')
            : part.containsUnionOrIntersection; }),
    };
}
/** Build a small document without an intermediate array at each call site. */
function typeDocument() {
    var parts = [];
    for (var _i = 0; _i < arguments.length; _i++) {
        parts[_i] = arguments[_i];
    }
    return typeDocumentFrom(parts);
}
/** Flatten a nested document with an explicit work stack. */
function flattenTypeDocument(document) {
    var chunks = [];
    var tasks = [document];
    for (var task = tasks.pop(); task !== undefined; task = tasks.pop()) {
        if (typeof task === 'string') {
            chunks.push(task);
            continue;
        }
        for (var index = task.parts.length - 1; index >= 0; index--) {
            var part = task.parts[index];
            /* v8 ignore next -- the loop is bounded by the captured part count. */
            if (part !== undefined)
                tasks.push(part);
        }
    }
    return chunks.join('');
}
/** Initialize one schema-render frame with empty aggregation state. */
function schemaRenderFrame(node, indent) {
    return { node: node, indent: indent, phase: 'start', children: [], childIndex: 0, childDocuments: [], entries: [] };
}
/** Render an already asserted schema to a composable document. */
function renderSupportedSchema(schema, indent) {
    var _a;
    var frames = [schemaRenderFrame(schema, indent)];
    var rootDocument;
    var finish = function (document) {
        frames.pop();
        var parent = frames.at(-1);
        if (parent === undefined)
            rootDocument = document;
        else
            parent.childDocuments.push(document);
    };
    var _loop_1 = function () {
        var frame = frames.at(-1);
        /* v8 ignore next -- the loop condition guarantees a current frame. */
        if (frame === undefined)
            return "break";
        if (frame.phase === 'children') {
            if (frame.childIndex < frame.children.length) {
                var child = frame.children[frame.childIndex];
                /* v8 ignore next -- childIndex is bounded by children.length. */
                if (child === undefined)
                    throw new Error('missing schema render child');
                frame.childIndex++;
                frames.push(schemaRenderFrame(child.node, child.indent));
                return "continue";
            }
            if (frame.kind === 'oneOf') {
                var parts_1 = [];
                for (var index = 0; index < frame.childDocuments.length; index++) {
                    if (index > 0)
                        parts_1.push(' | ');
                    var child = frame.childDocuments[index];
                    /* v8 ignore next -- child documents correspond one-to-one with children. */
                    if (child !== undefined)
                        parts_1.push(child);
                }
                finish(typeDocumentFrom(parts_1));
                return "continue";
            }
            if (frame.kind === 'array') {
                var child = frame.childDocuments[0];
                /* v8 ignore next -- array frames always schedule exactly one child. */
                if (child === undefined)
                    throw new Error('missing array item type');
                finish(child.containsUnionOrIntersection
                    ? typeDocument('(', child, ')[]')
                    : typeDocument(child, '[]'));
                return "continue";
            }
            var required = new Set(frame.node.required);
            var parts = ['{'];
            for (var index = 0; index < frame.entries.length; index++) {
                var entry = frame.entries[index];
                var child = frame.childDocuments[index];
                /* v8 ignore next -- object entries and child documents have the same length. */
                if (entry === undefined || child === undefined)
                    throw new Error('missing object property type');
                var name_1 = entry[0], prop = entry[1];
                for (var _i = 0, _b = docLines(prop.description, frame.indent + 1); _i < _b.length; _i++) {
                    var line = _b[_i];
                    parts.push('\n', line);
                }
                parts.push('\n', "".concat(pad(frame.indent + 1)).concat(renderKey(name_1)).concat(required.has(name_1) ? '' : '?', ": "), child, ';');
            }
            parts.push('\n', "".concat(pad(frame.indent), "}"));
            var declared = typeDocumentFrom(parts);
            finish(frame.node.additionalProperties === false
                ? declared
                : typeDocument(declared, ' & Record<string, JsonValue>'));
            return "continue";
        }
        var node = frame.node;
        if (node.oneOf !== undefined) {
            frame.kind = 'oneOf';
            frame.children = Array.from(node.oneOf, function (child) { return ({ node: child, indent: frame.indent }); });
            frame.childIndex = 0;
            frame.childDocuments = [];
            frame.phase = 'children';
            return "continue";
        }
        if (node.type === undefined) {
            finish(typeDocument('JsonValue'));
            return "continue";
        }
        switch (node.type) {
            case 'string':
            case 'number':
            case 'integer':
            case 'boolean':
            case 'null':
                finish(typeDocument(renderConstrainedScalar(node, node.type)));
                break;
            case 'array':
                if (node.items === undefined) {
                    finish(typeDocument('JsonValue[]'));
                }
                else {
                    frame.kind = 'array';
                    frame.children = [{ node: node.items, indent: frame.indent }];
                    frame.childIndex = 0;
                    frame.childDocuments = [];
                    frame.phase = 'children';
                }
                break;
            case 'object': {
                var open_1 = node.additionalProperties !== false;
                var entries = Object.entries((_a = node.properties) !== null && _a !== void 0 ? _a : {});
                if (entries.length === 0) {
                    finish(typeDocument(open_1 ? 'Record<string, JsonValue>' : 'Record<string, never>'));
                }
                else {
                    frame.kind = 'object';
                    frame.entries = entries;
                    frame.children = entries.map(function (_a) {
                        var child = _a[1];
                        return ({ node: child, indent: frame.indent + 1 });
                    });
                    frame.childIndex = 0;
                    frame.childDocuments = [];
                    frame.phase = 'children';
                }
                break;
            }
            /* v8 ignore next -- assertSupportedJsonSchema narrowed this closed type union. */
            default:
                finish(typeDocument('unknown'));
        }
    };
    while (frames.length > 0) {
        var state_1 = _loop_1();
        if (state_1 === "break")
            break;
    }
    /* v8 ignore next -- every root frame produces one document. */
    return rootDocument !== null && rootDocument !== void 0 ? rootDocument : typeDocument('unknown');
}
/**
 * Map one enforced JSON-Schema node to a TypeScript type literal. Supports
 * every unified schema construct and returns `unknown` for malformed or
 * unsupported inputs without throwing.
 * @param schema - the JSON-Schema node (any shape; hostile inputs degrade).
 * @param indent - the indentation level for nested object members.
 * @returns the TS type text (multi-line for objects with properties).
 */
function jsonSchemaToTs(schema, indent) {
    if (indent === void 0) { indent = 0; }
    try {
        (0, json_schema_ts_1.assertSupportedJsonSchema)(schema);
        return flattenTypeDocument(renderSupportedSchema(schema, indent));
    }
    catch (_a) {
        return 'unknown';
    }
}
/** The fixed model-facing usage contract rendered above the declarations (see the Code Mode Agent Note's "What the model sees"). */
var SDK_INSTRUCTIONS = "## Writing code for run_code\n\n`run_code` takes two required arguments: `code` \u2014 the body of an async TypeScript function (erasable syntax only \u2014 no `enum` or namespaces; type annotations are advisory, the code runs type-stripped) \u2014 and `description`, a short summary of what the program does. Inside the program:\n\n- Call tools as `await tools.name(args)` \u2014 quoted access for exotic names: `tools[\"my-tool\"](args)`. Every call resolves to the tool's typed canonical JSON value. Tool arguments must be lossless JSON.\n- A FAILED tool call rejects with `ToolCallError`, whose `toolName` identifies the failed tool and whose `message` is human-readable \u2014 `try/catch` it to handle and continue.\n- Independent read-only calls MAY overlap under `Promise.all` (safe calls run concurrently; mutating calls run alone, in submission order). Sequence dependent work with `await`.\n- Emit results with `return` and/or `console.log(...)`. Only what you print or return is program output. A successful tool result containing an image is attached after the run so you can inspect it on the next step; every other intermediate result stays out of the conversation, so extract just what you need.\n\nThe available tools:";
/**
 * Render the full `tools:sdk` prompt section: the fixed usage instructions
 * plus one `declare const tools` interface covering every given tool.
 * Deterministic — tools are emitted in lexicographic name order, so an
 * unchanged tool set produces byte-identical text across assemblies. The sort
 * is not a total order on byte-equal names, so two schemas sharing a name
 * would render in argument order; the caller's visible-capability map is keyed
 * by name, so the input never carries a duplicate.
 * @param schemas - the tool schemas to declare (the caller excludes
 *   `run_code` itself).
 * @returns the complete section text.
 */
function renderToolsSdk(schemas) {
    var sorted = __spreadArray([], schemas, true).sort(function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; });
    var argsMembers = [];
    var outputMembers = [];
    for (var _i = 0, sorted_1 = sorted; _i < sorted_1.length; _i++) {
        var schema = sorted_1[_i];
        argsMembers.push.apply(argsMembers, docLines(schema.description, 1));
        argsMembers.push("".concat(pad(1)).concat(renderKey(schema.name), ": ").concat(jsonSchemaToTs(schema.parameters, 1), ";"));
        outputMembers.push("".concat(pad(1)).concat(renderKey(schema.name), ": ").concat(jsonSchemaToTs(schema.output, 1), ";"));
    }
    var argsMap = "interface ToolArgsMap {".concat(argsMembers.length > 0 ? "\n".concat(argsMembers.join('\n'), "\n") : '', "}");
    var outputMap = "interface ToolOutputMap {".concat(outputMembers.length > 0 ? "\n".concat(outputMembers.join('\n'), "\n") : '', "}");
    var declaration = [
        argsMap,
        outputMap,
        'type ToolName = keyof ToolOutputMap',
        ['declare class ToolCallError extends Error {', '  readonly name: "ToolCallError";', '  readonly toolName: ToolName;', '}'].join('\n'),
        ['declare const tools: {', '  [K in ToolName]: (args: ToolArgsMap[K]) => Promise<ToolOutputMap[K]>;', '}'].join('\n'),
    ].join('\n\n');
    var jsonValue = 'type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }';
    return "".concat(SDK_INSTRUCTIONS, "\n\n```ts\n").concat(jsonValue, "\n\n").concat(declaration, "\n```");
}
var templateObject_1;
