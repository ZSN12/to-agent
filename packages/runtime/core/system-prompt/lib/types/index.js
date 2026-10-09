"use strict";
/**
 * Registry for ordered system sections, dynamic context, tool schemas, and prompt variables.
 *
 * @module @z/dsh-system-prompt
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
exports.SystemPrompt = exports.TOOL_ORDER_REST = exports.PERSONA_ORDER = exports.PERSONA_SECTION = void 0;
exports.renderPrompt = renderPrompt;
exports.renderContextSnapshot = renderContextSnapshot;
exports.joinContextSections = joinContextSections;
exports.renderContextSections = renderContextSections;
var cordis_1 = require("@z/cordis");
var schemastery_1 = require("@z/schemastery");
var dsh_scope_1 = require("@z/dsh-scope");
/**
 * The deployment persona's section name and order. Exported because a
 * composition can replace this slot — an agent preset shadows the
 * deployment's persona with its own — and both sides naming the same section
 * is what makes the replacement work rather than duplicate.
 */
exports.PERSONA_SECTION = 'deployment:persona';
/** Prompt order of the persona slot; the first section a model reads. */
exports.PERSONA_ORDER = 0;
/** Valid variable names: how they are written between the braces. */
var VARIABLE_NAME = /^[a-z][a-z0-9_]*$/;
/** A complete `{{...}}` reference group at the scan position (validated after). */
var GROUP_AT = /^\{\{([^{}]*)\}\}/;
/** Reserved {@link Config.toolOrder} marker for unlisted tools. */
exports.TOOL_ORDER_REST = '<unlisted-tools>';
/**
 * Validate duplicate names and the required {@link TOOL_ORDER_REST} marker.
 * Registered names are checked later because plugins have not loaded yet.
 */
function validateToolOrder(toolOrder) {
    if (toolOrder === undefined)
        return undefined;
    var seen = new Set();
    for (var _i = 0, toolOrder_1 = toolOrder; _i < toolOrder_1.length; _i++) {
        var name_1 = toolOrder_1[_i];
        if (seen.has(name_1))
            throw new Error("toolOrder lists \"".concat(name_1, "\" more than once"));
        seen.add(name_1);
    }
    if (!seen.has(exports.TOOL_ORDER_REST)) {
        throw new Error("toolOrder must contain the \"".concat(exports.TOOL_ORDER_REST, "\" rest entry (where unlisted tools are inserted)"));
    }
    return toolOrder;
}
/**
 * Apply configured tool order, inserting unlisted tools lexicographically at
 * {@link TOOL_ORDER_REST}. Unknown configured names fail; known but restricted
 * names may be absent.
 */
function orderTools(tools, toolOrder, knownNames) {
    var reserved = tools.find(function (tool) { return tool.name === exports.TOOL_ORDER_REST; });
    if (reserved !== undefined) {
        throw new Error("tool provider returned reserved tool name \"".concat(exports.TOOL_ORDER_REST, "\" (reserved for toolOrder's rest entry)"));
    }
    if (toolOrder === undefined)
        return tools.sort(compareToolNames);
    var unknown = toolOrder.filter(function (name) { return name !== exports.TOOL_ORDER_REST && !knownNames.has(name); });
    if (unknown.length > 0) {
        throw new Error("toolOrder lists unregistered tool".concat(unknown.length > 1 ? 's' : '', " ").concat(unknown.map(function (name) { return "\"".concat(name, "\""); }).join(', '), "; known tools: ").concat(__spreadArray([], knownNames, true).sort().join(', ') || '(none)'));
    }
    var listed = new Set(toolOrder);
    var rest = tools.filter(function (tool) { return !listed.has(tool.name); }).sort(compareToolNames);
    return toolOrder.flatMap(function (name) {
        return name === exports.TOOL_ORDER_REST ? rest : tools.filter(function (tool) { return tool.name === name; });
    });
}
/** Lexicographic (code-unit) name comparison — locale-independent, so the order is identical on every machine. */
function compareToolNames(a, b) {
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}
/**
 * Interpolate strict `{{variable}}` references, drop empty sections, and join
 * the rest with blank lines. Malformed, unknown, or undefined references throw;
 * a lone `{{` without any later `}}` is literal prose, and substituted values
 * are not scanned again.
 * @param assembly - the assembly whose sections and variables to render.
 * @returns the rendered prompt, or `''` when all sections are empty.
 */
function renderPrompt(assembly) {
    return assembly.sections
        .map(function (section) { return interpolate(section, assembly.variables, 'section'); })
        .filter(function (text) { return text.length > 0; })
        .join('\n\n');
}
/**
 * Render the complete dynamic context snapshot.
 * @param assembly - the assembly whose contexts and variables to render.
 * @returns the current full snapshot, or `''` when no context is active.
 */
function renderContextSnapshot(assembly) {
    return joinContextSections(renderContextSections(assembly));
}
/**
 * The model-facing snapshot text for an already-rendered section list.
 *
 * A caller that also needs the sections renders them once and joins here, so a
 * request does not interpolate every context twice.
 * @param sections - sections from {@link renderContextSections}.
 * @returns the current full snapshot, or `''` when no context is active.
 */
function joinContextSections(sections) {
    var body = sections.map(function (section) { return section.text; }).join('\n\n');
    if (body.length === 0)
        return '';
    return "Current runtime context. This snapshot supersedes earlier runtime-context snapshots.\n\n".concat(body);
}
/**
 * The same snapshot, kept as the named contributions it was assembled from.
 *
 * {@link renderContextSnapshot} joins these for the model; a consumer that
 * presents the snapshot uses them to attribute each part to the subsystem that
 * contributed it, without re-splitting the joined prose.
 * @param assembly - the assembly whose contexts and variables to render.
 * @returns one entry per contributing context that rendered to non-empty text.
 */
function renderContextSections(assembly) {
    return assembly.contexts
        .map(function (context) { return ({ name: context.name, text: interpolate(context, assembly.variables, 'context') }); })
        .filter(function (section) { return section.text.length > 0; });
}
/** Interpolate one section or context and attribute diagnostics to its owning input. */
function interpolate(input, variables, kind) {
    var text = input.text;
    var result = '';
    var last = 0;
    for (var open_1 = text.indexOf('{{'); open_1 >= 0; open_1 = text.indexOf('{{', last)) {
        var group = GROUP_AT.exec(text.slice(open_1));
        if (group === null) {
            // A later closing brace makes this malformed; otherwise it is literal prose.
            if (text.indexOf('}}', open_1 + 2) >= 0) {
                throw new Error("malformed prompt variable reference at \"".concat(text.slice(open_1, open_1 + 16), "\u2026\" in ").concat(kind, " \"").concat(input.name, "\" (references are complete simple {{name}} groups)"));
            }
            result += text.slice(last, open_1 + 2);
            last = open_1 + 2;
            continue;
        }
        // `{{}}` yields an empty name and follows the malformed-reference path.
        var name_2 = group[0].slice(2, -2);
        if (!VARIABLE_NAME.test(name_2)) {
            throw new Error("malformed prompt variable reference \"{{".concat(name_2, "}}\" in ").concat(kind, " \"").concat(input.name, "\" (variable names match ").concat(String(VARIABLE_NAME), ")"));
        }
        // Do not resolve unregistered names through Object.prototype.
        if (!Object.hasOwn(variables, name_2)) {
            var known = Object.keys(variables);
            throw new Error("unknown prompt variable \"{{".concat(name_2, "}}\" in ").concat(kind, " \"").concat(input.name, "\"; registered variables: ").concat(known.length > 0 ? known.join(', ') : '(none)'));
        }
        var value = variables[name_2];
        if (value === undefined) {
            throw new Error("prompt variable \"{{".concat(name_2, "}}\" has no value for this assembly (").concat(kind, " \"").concat(input.name, "\")"));
        }
        result += text.slice(last, open_1) + value;
        last = open_1 + group[0].length;
    }
    return result + text.slice(last);
}
/** All prompt registrations owned by one global or scoped layer. */
var PromptLayer = /** @class */ (function () {
    /**
     * Create one prompt layer with diagnostics specific to its ownership scope.
     * @param scope - the scoped owner, or `undefined` for global registrations.
     */
    function PromptLayer(scope) {
        this.runtimeContextSuppressors = new dsh_scope_1.AnonymousEntries();
        this.toolProviders = new dsh_scope_1.AnonymousEntries();
        this.sections = new dsh_scope_1.NamedEntries(function (name) { return new Error(scope === undefined
            ? "prompt section \"".concat(name, "\" is already registered (for a per-agent override, register through that agent's `agent.ctx` instead)")
            : "prompt section \"".concat(name, "\" is already registered in this scope")); });
        this.contexts = new dsh_scope_1.NamedEntries(function (name) { return new Error(scope === undefined
            ? "prompt context \"".concat(name, "\" is already registered (for a per-agent override, register through that agent's `agent.ctx` instead)")
            : "prompt context \"".concat(name, "\" is already registered in this scope")); });
        this.variables = new dsh_scope_1.NamedEntries(function (name) { return new Error(scope === undefined
            ? "prompt variable \"".concat(name, "\" is already registered (for a per-agent value, register through that agent's `agent.ctx` instead)")
            : "prompt variable \"".concat(name, "\" is already registered in this scope")); });
    }
    /** @returns whether this layer owns no prompt registrations. */
    PromptLayer.prototype.isEmpty = function () {
        return this.sections.isEmpty()
            && this.contexts.isEmpty()
            && this.runtimeContextSuppressors.isEmpty()
            && this.toolProviders.isEmpty()
            && this.variables.isEmpty();
    };
    return PromptLayer;
}());
/** Registry service for the prompt inputs assembled before each model step. */
var SystemPrompt = /** @class */ (function (_super) {
    __extends(SystemPrompt, _super);
    function SystemPrompt(ctx, config) {
        var _a, _b, _c;
        var _this = _super.call(this, ctx, 'systemPrompt') || this;
        _this.layers = new dsh_scope_1.ScopedLayers(function (scope) { return new PromptLayer(scope); }, function () { _this.ctx.emit('system-prompt/change'); });
        _this.toolOrder = validateToolOrder(config.toolOrder);
        // Keep harness-owned openers independent of the selected loop plugin.
        if ((_a = config.includeHarnessIdentity) !== null && _a !== void 0 ? _a : true) {
            _this.section({
                name: 'harness:identity',
                order: -100,
                text: 'You are an AI agent powered by DeepSeek Harness.',
            });
        }
        _this.section({
            name: exports.PERSONA_SECTION,
            order: exports.PERSONA_ORDER,
            // The fallback narrows the optional input type; the schema already defaults it.
            text: (_b = config.persona) !== null && _b !== void 0 ? _b : '',
        });
        if (!((_c = config.includeRuntimeContext) !== null && _c !== void 0 ? _c : true))
            _this.suppressRuntimeContext();
        return _this;
    }
    /**
     * Register an ordered prompt section in the calling context's scope. A scoped
     * section shadows a global section with the same name; duplicates within one
     * layer and non-finite orders throw. Registration and disposal emit
     * `system-prompt/change`.
     * @param section - the section to register.
     * @returns the exact Cordis effect disposer.
     */
    SystemPrompt.prototype.section = function (section) {
        if (!Number.isFinite(section.order)) {
            throw new TypeError("prompt section \"".concat(section.name, "\" order must be a finite number"));
        }
        return this.layers.effect(this.ctx, function (layer) { return layer.sections.insert(section.name, section); }, { label: 'systemPrompt.section()' });
    };
    /**
     * Register ordered dynamic context in the calling context's scope. Scoped
     * entries shadow global entries with the same name.
     * @param context - the context contribution to register.
     * @returns the exact Cordis effect disposer.
     */
    SystemPrompt.prototype.context = function (context) {
        if (!Number.isFinite(context.order)) {
            throw new TypeError("prompt context \"".concat(context.name, "\" order must be a finite number"));
        }
        return this.layers.effect(this.ctx, function (layer) { return layer.contexts.insert(context.name, context); }, { label: 'systemPrompt.context()' });
    };
    /**
     * Suppress every dynamic runtime-context contribution in the calling
     * context's scope without changing the services that own or enforce those
     * facts. Multiple suppressors remain independently disposable.
     * @returns the exact Cordis effect disposer.
     */
    SystemPrompt.prototype.suppressRuntimeContext = function () {
        return this.layers.effect(this.ctx, function (layer) { return layer.runtimeContextSuppressors.append(true); }, { label: 'systemPrompt.suppressRuntimeContext()' });
    };
    /**
     * Register a tool-schema provider in the calling context's scope. Global and
     * matching scoped providers both contribute; returning the reserved
     * {@link TOOL_ORDER_REST} name makes assembly fail.
     * @param provider - evaluated for each assembly with its context.
     * @returns the exact Cordis effect disposer.
     */
    SystemPrompt.prototype.tools = function (provider) {
        return this.layers.effect(this.ctx, function (layer) { return layer.toolProviders.append(provider); }, { label: 'systemPrompt.tools()' });
    };
    /**
     * Register a prompt variable in the calling context's scope. Scoped values
     * shadow globals; invalid or duplicate names throw. A provider may return
     * `undefined`, but rendering a section that references that value then fails.
     * @param name - the `[a-z][a-z0-9_]*` reference name.
     * @param provider - evaluated for each assembly.
     * @returns the exact Cordis effect disposer.
     */
    SystemPrompt.prototype.variable = function (name, provider) {
        if (!VARIABLE_NAME.test(name)) {
            throw new Error("invalid prompt variable name \"".concat(name, "\" (must match ").concat(String(VARIABLE_NAME), ")"));
        }
        return this.layers.effect(this.ctx, function (layer) { return layer.variables.insert(name, provider); }, { label: 'systemPrompt.variable()' });
    };
    /**
     * Assemble global and scoped providers, detach tool parameters, apply
     * canonical ordering, then run the assembly waterfall. Scoped sections and
     * variables shadow globals. The returned waterfall value is authoritative
     * except that an effective complete section is restored afterwards as the
     * sole prompt section.
     * @param context - the optional scope and plugin-defined assembly fields.
     * @returns the post-waterfall assembly with any complete prompt enforced.
     */
    // Keep configuration failures on the declared asynchronous error path.
    SystemPrompt.prototype.assemble = function () {
        return __awaiter(this, arguments, void 0, function (context) {
            var scope, scopeLayers, runtimeContextSuppressed, variables, _i, _a, _b, name_3, provider, _c, scopeLayers_1, layer, _d, _e, _f, name_4, provider, sectionByName, contextByName, providers, collected, knownNames, _g, providers_1, provider, result, schemas, acceptedKnownNames, _h, acceptedKnownNames_1, name_5, sectionDefinitions, completeSections, completeSection, sections, assembly, transformed;
            var _j;
            if (context === void 0) { context = {}; }
            return __generator(this, function (_k) {
                switch (_k.label) {
                    case 0:
                        scope = context.scope;
                        scopeLayers = this.layers.chainLayers(scope);
                        runtimeContextSuppressed = !this.layers.global.runtimeContextSuppressors.isEmpty()
                            || scopeLayers.some(function (layer) { return !layer.runtimeContextSuppressors.isEmpty(); });
                        variables = {};
                        for (_i = 0, _a = this.layers.global.variables.entries(); _i < _a.length; _i++) {
                            _b = _a[_i], name_3 = _b[0], provider = _b[1];
                            variables[name_3] = provider(context);
                        }
                        // Scope-chain variables, farthest first, so the nearest scope wins a name.
                        for (_c = 0, scopeLayers_1 = scopeLayers; _c < scopeLayers_1.length; _c++) {
                            layer = scopeLayers_1[_c];
                            for (_d = 0, _e = layer.variables.entries(); _d < _e.length; _d++) {
                                _f = _e[_d], name_4 = _f[0], provider = _f[1];
                                variables[name_4] = provider(context);
                            }
                        }
                        sectionByName = this.layers.merge(scope, function (layer) { return layer.sections; });
                        contextByName = this.layers.merge(scope, function (layer) { return layer.contexts; });
                        providers = __spreadArray(__spreadArray([], this.layers.global.toolProviders.values(), true), scopeLayers.flatMap(function (layer) { return __spreadArray([], layer.toolProviders.values(), true); }), true);
                        collected = [];
                        knownNames = new Set();
                        for (_g = 0, providers_1 = providers; _g < providers_1.length; _g++) {
                            provider = providers_1[_g];
                            result = provider(context);
                            schemas = result.schemas.map(function (_a) {
                                var name = _a.name, description = _a.description, parameters = _a.parameters;
                                return ({
                                    name: name,
                                    description: description,
                                    parameters: structuredClone(parameters),
                                });
                            });
                            acceptedKnownNames = (_j = result.knownNames) !== null && _j !== void 0 ? _j : schemas.map(function (tool) { return tool.name; });
                            collected.push.apply(collected, schemas);
                            for (_h = 0, acceptedKnownNames_1 = acceptedKnownNames; _h < acceptedKnownNames_1.length; _h++) {
                                name_5 = acceptedKnownNames_1[_h];
                                knownNames.add(name_5);
                            }
                        }
                        sectionDefinitions = __spreadArray([], sectionByName.values(), true).sort(function (a, b) { return a.order - b.order; });
                        completeSections = sectionDefinitions.filter(function (section) { return section.complete === true; });
                        if (completeSections.length > 1) {
                            throw new Error("multiple complete prompt sections are active: ".concat(completeSections.map(function (section) { return JSON.stringify(section.name); }).join(', ')));
                        }
                        sections = sectionDefinitions
                            .map(function (section) {
                            var assembled = {
                                name: section.name,
                                text: typeof section.text === 'function' ? section.text(context) : section.text,
                            };
                            if (section.complete === true)
                                completeSection = __assign({}, assembled);
                            return assembled;
                        });
                        assembly = {
                            sections: sections,
                            contexts: runtimeContextSuppressed
                                ? []
                                : __spreadArray([], contextByName.values(), true).sort(function (a, b) { return a.order - b.order; })
                                    .map(function (entry) { return ({
                                    name: entry.name,
                                    text: typeof entry.text === 'function' ? entry.text(context) : entry.text,
                                }); }),
                            tools: orderTools(collected, this.toolOrder, knownNames),
                            variables: variables,
                        };
                        return [4 /*yield*/, this.ctx.waterfall((0, dsh_scope_1.scopeTarget)(this, scope), 'system-prompt/assemble', assembly, context, function () { return Promise.resolve(assembly); })];
                    case 1:
                        transformed = _k.sent();
                        if (completeSection === undefined && !runtimeContextSuppressed)
                            return [2 /*return*/, transformed];
                        return [2 /*return*/, __assign(__assign({}, transformed), { sections: completeSection === undefined ? transformed.sections : [completeSection], contexts: runtimeContextSuppressed ? [] : transformed.contexts })];
                }
            });
        });
    };
    SystemPrompt.Config = schemastery_1.default.object({
        includeHarnessIdentity: schemastery_1.default.boolean().default(true),
        includeRuntimeContext: schemastery_1.default.boolean().default(true),
        persona: schemastery_1.default.string().default(''),
        // Preserve omission because an explicit empty order lacks the rest marker.
        toolOrder: schemastery_1.default.array(schemastery_1.default.string()).default(undefined),
    });
    return SystemPrompt;
}(cordis_1.Service));
exports.SystemPrompt = SystemPrompt;
exports.default = SystemPrompt;
