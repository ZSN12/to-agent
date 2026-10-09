"use strict";
/**
 * Durable session skill catalog and model-facing `skill` loader tool.
 *
 * @module @z/dsh-tool-skill
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
exports.Config = exports.inject = exports.name = void 0;
exports.apply = apply;
var node_crypto_1 = require("node:crypto");
var schemastery_1 = require("@z/schemastery");
var dsh_tools_1 = require("@z/dsh-tools");
var dsh_llm_1 = require("@z/dsh-llm");
var dsh_skill_1 = require("@z/dsh-skill");
exports.name = 'tool-skill';
exports.inject = ['agents', 'tools', 'skills'];
var DEFAULT_CATALOG_DESCRIPTION_MAX_LENGTH = 500;
/** Durable entry list mirroring the rendered catalog lines, for non-model consumers. */
function catalogSourceEntries(skills, descriptionMaxLength) {
    return skills.map(function (skill) { return ({
        name: skill.name,
        description: catalogDescription(skill.description, descriptionMaxLength),
    }); });
}
/** Validate and default the model-facing skill catalog configuration. */
exports.Config = schemastery_1.default.object({
    catalogDescriptionMaxLength: schemastery_1.default.number().default(DEFAULT_CATALOG_DESCRIPTION_MAX_LENGTH),
});
/**
 * Register the model-facing skill loader and its visibility-matched
 * durable session catalog. The catalog is emitted only when the calling agent
 * resolves this plugin's exact tool registration; a restriction or scoped
 * same-name shadow therefore removes both the schema and its call guidance.
 */
function apply(ctx, config) {
    var _this = this;
    var _a;
    if (config === void 0) { config = {}; }
    var catalogDescriptionMaxLength = (_a = config.catalogDescriptionMaxLength) !== null && _a !== void 0 ? _a : DEFAULT_CATALOG_DESCRIPTION_MAX_LENGTH;
    assertPositiveInteger('catalogDescriptionMaxLength', catalogDescriptionMaxLength, 3);
    var skillTool = (0, dsh_tools_1.defineTool)({
        name: 'skill',
        description: 'Load the full instructions for an available skill. Call this with the exact skill name from the session skill catalog before acting on a task that names or clearly matches that skill.',
        parameters: {
            name: { type: 'string', required: true, description: 'The exact skill name from the available skills list.' },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    name: { type: 'string', required: true },
                    provider: { type: 'string', required: true },
                    resourceBase: {
                        oneOf: [
                            {
                                type: 'object',
                                additionalProperties: false,
                                properties: {
                                    kind: { type: 'string', required: true, const: 'directory' },
                                    path: { type: 'string', required: true },
                                },
                            },
                            {
                                type: 'object',
                                additionalProperties: false,
                                properties: {
                                    kind: { type: 'string', required: true, const: 'url' },
                                    url: { type: 'string', required: true },
                                },
                            },
                            {
                                type: 'object',
                                additionalProperties: false,
                                properties: {
                                    kind: { type: 'string', required: true, const: 'opaque' },
                                    description: { type: 'string', required: true },
                                },
                            },
                        ],
                    },
                    content: { type: 'string', required: true },
                },
            },
            render: function (_args, value) { return [{ type: 'text', text: (0, dsh_skill_1.renderSkillContent)(value) }]; },
        },
        execute: function (args, exec) {
            return __awaiter(this, void 0, void 0, function () {
                var lookup, summary, skill;
                var _a;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0:
                            if (!(0, dsh_skill_1.isSkillName)(args.name)) {
                                throw new Error("invalid skill name \"".concat(args.name, "\""));
                            }
                            lookup = { cwd: (_a = exec.agent) === null || _a === void 0 ? void 0 : _a.session.header.cwd, signal: exec.signal, scope: exec.agent };
                            return [4 /*yield*/, ctx.skills.list(lookup)];
                        case 1:
                            summary = (_b.sent()).find(function (skill) { return skill.name === args.name; });
                            if (!summary) {
                                throw new Error("skill \"".concat(args.name, "\" is unknown or no longer available"));
                            }
                            if (!(0, dsh_skill_1.isModelInvocable)(summary)) {
                                throw new Error("skill \"".concat(args.name, "\" is not available for model invocation"));
                            }
                            return [4 /*yield*/, ctx.skills.get(args.name, lookup)];
                        case 2:
                            skill = _b.sent();
                            if (!skill) {
                                throw new Error("skill \"".concat(args.name, "\" is unknown or no longer available"));
                            }
                            if (!(0, dsh_skill_1.isModelInvocable)(skill)) {
                                throw new Error("skill \"".concat(args.name, "\" is not available for model invocation"));
                            }
                            return [2 /*return*/, __assign(__assign({ name: skill.name, provider: skill.provider }, skill.resourceBase !== undefined ? {
                                    resourceBase: __assign({}, skill.resourceBase),
                                } : {}), { content: skill.content })];
                    }
                });
            });
        },
        presentCall: function (args) {
            return { card: 'generic', title: "Load skill ".concat(args.name), kind: 'read', rawInput: args.name };
        },
    });
    ctx.tools.register(skillTool);
    // User-explicit skill invocation: a claimed user message whose first line
    // starts with `/<name>` naming a user-invocable skill is a deterministic
    // load gesture. The rendered body enters this step as injected
    // instructions context appended after every other injection — background
    // first (workspace rules, runtime policy, the catalog), the material the
    // model must act on last, closest to its answer. Registration order makes
    // that placement deterministic: this listener registers before the catalog
    // listener, so the waterfall hands it the catalog-bearing list to extend.
    // Only `source.kind === 'user'` messages are scanned — external text
    // cannot forge the gesture — and a token naming no user-invocable skill
    // stays ordinary prose (the command registry is a different closed
    // namespace, resolved client-side before a line ever becomes a prompt).
    // This is the only entry point for `disable-model-invocation` skills; the
    // catalog and the `skill` tool below never see them.
    ctx.on('agent/pre-step', function (_a, next_1) { return __awaiter(_this, [_a, next_1], void 0, function (_b, next) {
        var decision, names, lookup, injections, _i, names_1, name_1, skill, source;
        var agent = _b.agent, messages = _b.messages, signal = _b.signal;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, next()];
                case 1:
                    decision = _c.sent();
                    if (decision.kind === 'reject')
                        return [2 /*return*/, decision];
                    names = invokedSkillNames(messages);
                    if (names.length === 0)
                        return [2 /*return*/, decision];
                    signal.throwIfAborted();
                    lookup = { cwd: agent.session.header.cwd, signal: signal, scope: agent };
                    injections = [];
                    _i = 0, names_1 = names;
                    _c.label = 2;
                case 2:
                    if (!(_i < names_1.length)) return [3 /*break*/, 5];
                    name_1 = names_1[_i];
                    return [4 /*yield*/, ctx.skills.get(name_1, lookup)];
                case 3:
                    skill = _c.sent();
                    signal.throwIfAborted();
                    // Unknown names and user-disabled skills stay plain prose: the
                    // gesture was never a claim this boundary recognizes. The check sits
                    // on the loaded definition — the single lookup that produces what is
                    // actually injected.
                    if (skill === undefined || !(0, dsh_skill_1.isUserInvocable)(skill))
                        return [3 /*break*/, 4];
                    source = { kind: 'skill-invocation', name: name_1, form: 'instructions' };
                    injections.push((0, dsh_llm_1.createUserMessage)({
                        content: [{ type: 'text', text: (0, dsh_skill_1.renderSkillContent)(skill) }],
                        source: source,
                    }));
                    _c.label = 4;
                case 4:
                    _i++;
                    return [3 /*break*/, 2];
                case 5:
                    if (injections.length === 0)
                        return [2 /*return*/, decision];
                    return [2 /*return*/, { kind: 'enter', messages: __spreadArray(__spreadArray([], decision.messages, true), injections, true) }];
            }
        });
    }); });
    // Register after the tool so reverse teardown removes guidance first. Exact definition
    // identity prevents a scoped shadow merely named `skill` from inheriting this catalog.
    //
    // The comparison is against the definition this plugin registered, not against
    // a lookup of its own name: `register()` files into the CALLING context's
    // scope, so a plugin mounted inside an agent preset registers for that agent
    // alone and an unscoped lookup correctly finds nothing.
    ctx.on('agent/pre-step', function (_a, next_1) { return __awaiter(_this, [_a, next_1], void 0, function (_b, next) {
        var decision, toolVisible, snapshot, _c, skills, entries, digest, history, existing, catalog;
        var agent = _b.agent, signal = _b.signal;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0: return [4 /*yield*/, next()];
                case 1:
                    decision = _d.sent();
                    if (decision.kind === 'reject')
                        return [2 /*return*/, decision];
                    signal.throwIfAborted();
                    toolVisible = ctx.tools.get(skillTool.name, agent) === skillTool;
                    if (!toolVisible) return [3 /*break*/, 3];
                    return [4 /*yield*/, ctx.skills.snapshot({ cwd: agent.session.header.cwd, signal: signal, scope: agent })];
                case 2:
                    _c = _d.sent();
                    return [3 /*break*/, 4];
                case 3:
                    _c = { skills: [], complete: true };
                    _d.label = 4;
                case 4:
                    snapshot = _c;
                    signal.throwIfAborted();
                    if (!snapshot.complete)
                        return [2 /*return*/, decision];
                    skills = snapshot.skills.filter(dsh_skill_1.isModelInvocable);
                    entries = catalogSourceEntries(skills, catalogDescriptionMaxLength);
                    digest = digestCatalogEntries(entries);
                    history = catalogHistory(agent);
                    existing = catalogMessage(decision.messages);
                    if (history.visibleDigest === digest) {
                        return [2 /*return*/, existing === undefined
                                ? decision
                                : { kind: 'enter', messages: decision.messages.filter(function (message) { return message.id !== existing.message.id; }) }];
                    }
                    if (existing !== undefined && digestCatalogEntries(existing.entries) === digest)
                        return [2 /*return*/, decision];
                    if (!history.published && skills.length === 0) {
                        return [2 /*return*/, existing === undefined
                                ? decision
                                : { kind: 'enter', messages: decision.messages.filter(function (message) { return message.id !== existing.message.id; }) }];
                    }
                    catalog = history.published
                        ? renderCatalogUpdate(entries)
                        : renderCatalogMessage(entries);
                    return [2 /*return*/, {
                            kind: 'enter',
                            messages: existing === undefined
                                ? __spreadArray(__spreadArray([], decision.messages, true), [catalog], false) : decision.messages.map(function (message) { return message.id === existing.message.id ? catalog : message; }),
                        }];
            }
        });
    }); });
}
function renderCatalogMessage(entries) {
    return (0, dsh_llm_1.createUserMessage)({
        content: [{
                type: 'text',
                text: __spreadArray(__spreadArray([
                    '<system-reminder>',
                    'A skill is a reusable set of task-specific instructions. The following skills are available in this session:',
                    '',
                    '<available_skills>'
                ], renderCatalogEntries(entries), true), [
                    '</available_skills>',
                    '',
                    "If the user names a skill, or the task clearly matches a skill's description, call the `skill` tool with the exact skill name before taking task actions. Load all applicable skills, then follow their full instructions. This catalog contains summaries only; do not infer or follow a skill's instructions until it has been loaded.",
                    'A user may also invoke a skill directly; its <skill_content> block then appears in this conversation. Follow it, and do not call the `skill` tool again for that skill.',
                    '</system-reminder>',
                ], false).join('\n'),
            }],
        source: {
            kind: 'skill-catalog',
            form: 'catalog',
            entries: entries,
        },
    });
}
function renderCatalogUpdate(entries) {
    var availability = entries.length === 0
        ? [
            'No skills are currently available through the `skill` tool. Do not use names from earlier skill catalogs.',
            'A user may still invoke a skill directly; its <skill_content> block then appears in this conversation. Follow it, and do not call the `skill` tool for it.',
        ]
        : [
            'Use only names in this replacement catalog. If the user names a listed skill, or the task clearly matches its description, call the `skill` tool with the exact name before acting.',
            'A user may also invoke a skill directly; its <skill_content> block then appears in this conversation. Follow it, and do not call the `skill` tool again for that skill.',
        ];
    return (0, dsh_llm_1.createUserMessage)({
        content: [{
                type: 'text',
                text: __spreadArray(__spreadArray(__spreadArray(__spreadArray([
                    '<system-reminder>',
                    'The available skill catalog changed. This complete catalog replaces every earlier available-skills list in this session:',
                    '',
                    '<available_skills>'
                ], renderCatalogEntries(entries), true), [
                    '</available_skills>',
                    ''
                ], false), availability, true), [
                    '</system-reminder>',
                ], false).join('\n'),
            }],
        source: {
            kind: 'skill-catalog',
            form: 'catalog',
            update: true,
            entries: entries,
        },
    });
}
/**
 * Model-facing catalog lines, projected from the same entries the source records.
 * The pseudo-XML escaping belongs to this frame, not to the published fact, so it
 * is applied here and never stored. Names are `isSkillName`-validated and carry
 * no escapable character.
 */
function renderCatalogEntries(entries) {
    return entries.map(function (entry) { return "- `".concat(entry.name, "`: ").concat((0, dsh_skill_1.escapeText)(entry.description)); });
}
/**
 * Catalog identity over the durable entry list rather than the rendered prose.
 * The entries are what changes; the surrounding `<system-reminder>` framing is
 * written for the model and must not decide whether a republish is needed.
 */
function digestCatalogEntries(entries) {
    // JSON per entry rather than a separator character: every separator is itself
    // a legal description character, so only quoting makes the boundary exact.
    var canonical = entries.map(function (entry) { return JSON.stringify([entry.name, entry.description]); }).join('\n');
    return (0, node_crypto_1.createHash)('sha256')
        .update(canonical)
        .digest('hex');
}
/**
 * Entries of one durable catalog message, or undefined when the record is not a
 * usable catalog.
 *
 * `agent.session.events` may be a resumed, forked, or externally written seed,
 * and seed validation only guarantees a source object with a non-empty `kind`;
 * no per-kind field is checked there. An unreadable record is therefore treated
 * as "not this plugin's catalog" — the posture the replaced content digest had —
 * rather than throwing inside the step listener, which would fail every
 * subsequent turn of that session.
 */
function readCatalogEntries(source) {
    var entries = source.entries;
    if (!Array.isArray(entries))
        return undefined;
    var readable = [];
    for (var _i = 0, _a = entries; _i < _a.length; _i++) {
        var entry = _a[_i];
        if (typeof entry !== 'object' || entry === null)
            return undefined;
        var _b = entry, name_2 = _b.name, description = _b.description;
        if (typeof name_2 !== 'string' || name_2 === '' || typeof description !== 'string')
            return undefined;
        readable.push({ name: name_2, description: description });
    }
    return readable;
}
function catalogHistory(agent) {
    var visible = new Set(agent.session.surface.nodes);
    var events = agent.session.events;
    var published = false;
    for (var index = events.length - 1; index >= 0; index -= 1) {
        // The loop bounds prove the read-only event view contains this index.
        // oxlint-disable-next-line typescript/no-non-null-assertion
        var event_1 = events[index];
        if (event_1.type !== 'user/message' || event_1.data.source.kind !== 'skill-catalog')
            continue;
        var entries = readCatalogEntries(event_1.data.source);
        if (entries === undefined)
            continue;
        var digest = digestCatalogEntries(entries);
        published = true;
        if (visible.has(event_1.seq))
            return { visibleDigest: digest, published: published };
    }
    return { published: published };
}
function catalogMessage(messages) {
    for (var _i = 0, messages_1 = messages; _i < messages_1.length; _i++) {
        var message = messages_1[_i];
        if (message.source.kind !== 'skill-catalog')
            continue;
        var entries = readCatalogEntries(message.source);
        if (entries !== undefined)
            return { message: message, entries: entries };
    }
    return undefined;
}
/** Normalized, length-bounded description exactly as the catalog publishes it (unescaped). */
function catalogDescription(value, maxLength) {
    var normalized = value.replaceAll(/\s+/g, ' ').trim();
    return normalized.length <= maxLength ? normalized : "".concat(normalized.slice(0, maxLength - 3), "...");
}
function assertPositiveInteger(name, value, minimum) {
    if (minimum === void 0) { minimum = 1; }
    if (!Number.isInteger(value) || value < minimum) {
        throw new Error("tool-skill: ".concat(name, " must be an integer greater than or equal to ").concat(minimum));
    }
}
/**
 * A whitespace-bounded `/name` token (the public skill-name grammar) anywhere
 * in the text — the same word-boundary shape the transcript chip decoration
 * uses, so a gesture reads as one wherever it sits in the sentence. A second
 * `/` or any non-boundary character breaks the match, which keeps file paths
 * (`/usr/bin`) and fractions (`5/8`) out.
 */
var SKILL_GESTURE = /(^|\s)\/([a-z0-9]+(?:-[a-z0-9]+)*)(?=\s|$)/g;
/**
 * `/name` gesture tokens from the claimed user messages, deduplicated in
 * first-seen order. Every text block of direct user input is scanned; no
 * other source can forge a gesture.
 * @param messages - the step's claimed batch.
 * @returns candidate skill names, unvalidated against the registry.
 */
function invokedSkillNames(messages) {
    var names = [];
    for (var _i = 0, messages_2 = messages; _i < messages_2.length; _i++) {
        var message = messages_2[_i];
        if (message.source.kind !== 'user')
            continue;
        for (var _a = 0, _b = message.content; _a < _b.length; _a++) {
            var block = _b[_a];
            if (block.type !== 'text')
                continue;
            for (var _c = 0, _d = block.text.matchAll(SKILL_GESTURE); _c < _d.length; _c++) {
                var match = _d[_c];
                var name_3 = match[2];
                if (name_3 !== undefined && !names.includes(name_3))
                    names.push(name_3);
            }
        }
    }
    return names;
}
