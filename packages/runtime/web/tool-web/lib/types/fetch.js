"use strict";
/**
 * The model-facing `web_fetch` tool. This module owns its schema, validation, and presentation;
 * `ctx.web` owns retrieval. Timeout is deployment policy, not a model argument: config becomes
 * `ToolDefinition.timeoutMs`, timeout policy enforces it, and this tool forwards the resulting
 * signal. A provider timeout remains a backstop for direct service callers.
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
exports.parseFetchArgs = parseFetchArgs;
exports.formatFetchOutput = formatFetchOutput;
exports.presentFetchCall = presentFetchCall;
exports.fetchMetaFromValue = fetchMetaFromValue;
exports.fetchMetaFromResult = fetchMetaFromResult;
exports.presentFetchResult = presentFetchResult;
exports.applyWebFetchTool = applyWebFetchTool;
var turndown_1 = require("turndown");
var turndown_plugin_gfm_1 = require("@joplin/turndown-plugin-gfm");
var dsh_tools_1 = require("@z/dsh-tools");
var dsh_llm_1 = require("@z/dsh-llm");
/**
 * The shared HTML→markdown converter: turndown over its bundled domino DOM,
 * with GitHub-flavored tables/strikethrough (`@joplin/turndown-plugin-gfm`).
 * The style options are fixed model-facing presentation (matching the repo's
 * markdown conventions), not deployment tunables. `remove` drops non-content
 * elements wholesale — turndown's default keeps their text. The instance is
 * stateless across `turndown()` calls and safe to share.
 */
var turndown = new turndown_1.default({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
});
turndown.use(turndown_plugin_gfm_1.gfm);
turndown.remove(['script', 'style', 'noscript']);
/** Render one GFM table cell without interpreting HTML span counts. */
function renderTableCell(content, index) {
    var prefix = index === 0 ? '| ' : ' ';
    var escaped = content.trim().replace(/\n\r/g, '<br>').replace(/\n/g, '<br>').replace(/\|+/g, '\\|').padEnd(3, ' ');
    return "".concat(prefix).concat(escaped, " |");
}
/** Whether a row is the table's Markdown heading row. */
function isTableHeadingRow(row) {
    var cells = Array.from(row.cells);
    var section = row.parentElement;
    var table = section.parentElement;
    return (section.nodeName === 'THEAD' || table.rows[0] === row)
        && cells.every(function (cell) { return cell.nodeName === 'TH'; });
}
/** Map an HTML table-cell alignment to the GFM separator marker. */
function tableBorder(cell) {
    var alignment = (cell.getAttribute('align') || cell.style.textAlign || '').toLowerCase();
    if (alignment === 'left')
        return ':---';
    if (alignment === 'right')
        return '---:';
    if (alignment === 'center')
        return ':---:';
    return '---';
}
turndown.addRule('tableCellWithoutSpanExpansion', {
    filter: ['th', 'td'],
    replacement: function (content, node) {
        var cell = node;
        var row = cell.parentNode;
        // GFM cannot represent spanning cells. Ignoring colspan keeps conversion
        // work and output proportional to the source instead of the numeric attribute.
        return renderTableCell(content, Array.prototype.indexOf.call(row.childNodes, cell));
    },
});
turndown.addRule('tableRowWithoutSpanExpansion', {
    filter: 'tr',
    replacement: function (content, node) {
        var row = node;
        var border = isTableHeadingRow(row)
            ? Array.from(row.cells, function (cell, index) { return renderTableCell(tableBorder(cell), index); }).join('')
            : '';
        return "\n".concat(content).concat(border.length > 0 ? "\n".concat(border) : '');
    },
});
/**
 * Validate value constraints the schema DSL can't express: a non-blank `url`.
 * Throws a plain `Error` otherwise. No timeout parameter — the tool-call budget
 * is deployment policy declared via `fetchTimeoutMs` config and enforced by
 * `@z/dsh-tool-call-timeout-policy`, not a model argument.
 *
 * @param args - the schema-validated `web_fetch` arguments.
 * @returns the arguments as the seam's request fields.
 */
function parseFetchArgs(args) {
    if (args.url.trim().length === 0)
        throw new Error('url must be a non-empty string');
    return { url: args.url };
}
/**
 * Nesting-depth ceiling above which HTML skips conversion and passes through
 * raw. Conversion runs synchronously on the event loop, and unclosed-tag
 * nesting makes domino's tree (and turndown's walk over it) superlinear —
 * measured: depth 512 ≈ 0.15s, 2,000 ≈ 2s, 20,000 ≈ 5s — during which the
 * cooperative `fetchTimeoutMs` timer cannot fire. Real pages nest a few dozen
 * levels; 512 is far above content and far below weaponizable. A robustness
 * invariant, not a tunable.
 */
var MAX_CONVERSION_DEPTH = 512;
/** Elements that never take a closing tag, so they do not grow the lexical stack. */
var VOID_ELEMENTS = new Set([
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
    'link', 'meta', 'param', 'source', 'track', 'wbr',
]);
/** Elements whose contents HTML parses as text until their matching end tag. */
var RAW_TEXT_ELEMENTS = new Set(['script', 'style', 'noscript']);
/** Whether a character can occur after a raw-text end-tag name. */
function isTagBoundary(char) {
    return char === undefined || char === '>' || char === '/' || /\s/.test(char);
}
/** Find the matching raw-text end tag without interpreting markup-like body text. */
function findRawTextEnd(lowerHtml, name, from) {
    var prefix = "</".concat(name);
    var candidate = lowerHtml.indexOf(prefix, from);
    while (candidate !== -1 && !isTagBoundary(lowerHtml[candidate + prefix.length])) {
        candidate = lowerHtml.indexOf(prefix, candidate + prefix.length);
    }
    return candidate;
}
/**
 * Conservatively reject HTML whose lexical element stack crosses the conversion
 * depth ceiling. The single pass ignores closing tags inside comments, skips
 * raw-text bodies, respects quoted `>` characters, and only accepts a closing
 * tag for the current element; malformed input therefore over-counts rather
 * than hiding nesting.
 *
 * @param html - the decoded HTML body.
 * @returns whether the body crosses {@link MAX_CONVERSION_DEPTH}.
 */
function exceedsConversionDepth(html) {
    var _a;
    var lowerHtml = html.toLowerCase();
    var openElements = [];
    var offset = 0;
    var inComment = false;
    while (offset < html.length) {
        var start = html.indexOf('<', offset);
        if (inComment) {
            var end = html.indexOf('-->', offset);
            if (end !== -1 && (start === -1 || end < start)) {
                inComment = false;
                offset = end + 3;
                continue;
            }
        }
        if (start === -1)
            break;
        if (!inComment && html.startsWith('<!--', start)) {
            inComment = true;
            offset = start + 4;
            continue;
        }
        var cursor = start + 1;
        var closing = html[cursor] === '/';
        if (closing)
            cursor += 1;
        var nameStart = cursor;
        while (/[a-zA-Z0-9-]/.test((_a = html[cursor]) !== null && _a !== void 0 ? _a : ''))
            cursor += 1;
        if (cursor === nameStart || !/[a-zA-Z]/.test(html.charAt(nameStart))) {
            offset = start + 1;
            continue;
        }
        var name_1 = lowerHtml.slice(nameStart, cursor);
        var quote = void 0;
        while (cursor < html.length) {
            var char = html[cursor];
            cursor += 1;
            if (quote !== undefined) {
                if (char === quote)
                    quote = undefined;
            }
            else if (char === '"' || char === "'") {
                quote = char;
            }
            else if (char === '>') {
                break;
            }
        }
        if (html[cursor - 1] !== '>')
            break;
        if (closing) {
            if (!inComment && openElements.at(-1) === name_1)
                openElements.pop();
        }
        else {
            var last = cursor - 2;
            while (/\s/.test(html.charAt(last)))
                last -= 1;
            if (!VOID_ELEMENTS.has(name_1) && html[last] !== '/') {
                openElements.push(name_1);
                if (openElements.length > MAX_CONVERSION_DEPTH)
                    return true;
                if (!inComment && RAW_TEXT_ELEMENTS.has(name_1)) {
                    var end = findRawTextEnd(lowerHtml, name_1, cursor);
                    if (end === -1)
                        break;
                    offset = end;
                    continue;
                }
            }
        }
        offset = cursor;
    }
    return false;
}
/**
 * Render a fetched body to model-facing markdown text.
 *
 * @param body - the decoded body; `html` is converted via turndown, `text`
 *   passes through verbatim.
 * @param maxInputChars - maximum source characters processed synchronously.
 * @returns the rendered prefix and whether the source was cut. HTML nested
 *   beyond {@link MAX_CONVERSION_DEPTH} or rejected by turndown passes through
 *   raw; a degraded page beats an error for a body the provider decoded.
 */
function renderBody(body, maxInputChars) {
    var content = body.content.slice(0, maxInputChars);
    var sourceTruncated = content.length !== body.content.length;
    switch (body.kind) {
        case 'html':
            if (exceedsConversionDepth(content))
                return { text: content, sourceTruncated: sourceTruncated };
            try {
                return { text: turndown.turndown(content), sourceTruncated: sourceTruncated };
            }
            catch (_a) {
                // turndown's DOM walk recurses per element; malformed markup the lexical
                // guard cannot model can still throw RangeError. Provider errors stay
                // structured WebErrors upstream; conversion failure downgrades to raw HTML.
                return { text: content, sourceTruncated: sourceTruncated };
            }
        case 'text':
            return { text: content, sourceTruncated: sourceTruncated };
        /* v8 ignore next 2 -- WebFetchBody is a closed union; this arm is unreachable and only makes adding a kind a compile error. */
        default:
            return (0, dsh_llm_1.assertNever)(body, 'unhandled web fetch body kind');
    }
}
/** The truncation notice appended when the provider or the output cap cut content. */
var TRUNCATION_FOOTER = '\n\n(Content truncated. Fetch a more specific URL or section for the full text.)';
/**
 * Render a fetch result to its bounded model-facing text and effective
 * truncation. The single source of both the `render` text and the fetch card's
 * `truncated`, so the card never disagrees with the text the model saw. The cap
 * limits the source prefix processed synchronously, then applies again where the
 * complete output — header, rendered body, and footer — is known.
 *
 * Package-internal: the only callers are {@link formatFetchOutput} and
 * {@link fetchMetaFromValue}, both reached through the tool registry, which
 * deep-freezes the result value before calling `output.render` and
 * `output.presentationMeta`. The conversion is memoized per
 * `(result, maxOutputChars)` so the synchronous DOM parse and turndown walk run
 * once, not twice, on that same frozen value. Keeping it unexported means no
 * caller can mutate a cached input or the returned {@link RenderedFetch}, so the
 * memo needs no defensive copy.
 *
 * @param result - the seam's fetch outcome.
 * @param maxOutputChars - cap on the complete returned string; a cut body gets
 *   the same fetch-something-narrower notice as provider-side truncation.
 * @returns the complete `Fetched <url> (HTTP <status>)`-headed text and whether
 *   the provider, a source cut, or the cap trimmed the content.
 */
function renderFetchOutput(result, maxOutputChars) {
    var _a;
    var byCap = (_a = renderCache.get(result)) !== null && _a !== void 0 ? _a : new Map();
    var cached = byCap.get(maxOutputChars);
    if (cached !== undefined)
        return cached;
    var computed = computeFetchOutput(result, maxOutputChars);
    byCap.set(maxOutputChars, computed);
    renderCache.set(result, byCap);
    return computed;
}
/**
 * Per-result memo for {@link renderFetchOutput}, keyed first on the frozen
 * result value so a garbage-collected result drops its entry, then on the output
 * cap (a deployment constant per registration). Collapses the registry's twin
 * `render`/`presentationMeta` calls into one HTML→markdown conversion.
 */
var renderCache = new WeakMap();
/**
 * The uncached conversion behind {@link renderFetchOutput}. Separated so the
 * memo wraps exactly one call site and the conversion logic stays pure.
 *
 * @param result - the seam's fetch outcome.
 * @param maxOutputChars - cap on the complete returned string.
 * @returns the bounded text and effective truncation.
 */
function computeFetchOutput(result, maxOutputChars) {
    var header = "Fetched ".concat(result.url, " (HTTP ").concat(result.statusCode, ")\n\n");
    var rendered = renderBody(result.body, maxOutputChars);
    var prefix = "".concat(header).concat(rendered.text);
    var truncated = result.truncated || rendered.sourceTruncated || prefix.length > maxOutputChars;
    var full = "".concat(prefix).concat(truncated ? TRUNCATION_FOOTER : '');
    if (full.length <= maxOutputChars)
        return { text: full, truncated: truncated };
    if (maxOutputChars < TRUNCATION_FOOTER.length)
        return { text: full.slice(0, maxOutputChars), truncated: truncated };
    return { text: "".concat(prefix.slice(0, maxOutputChars - TRUNCATION_FOOTER.length)).concat(TRUNCATION_FOOTER), truncated: truncated };
}
/**
 * Format a fetch result as one model-facing text block, bounded as a whole.
 *
 * @param result - the seam's fetch outcome.
 * @param maxOutputChars - cap on the complete returned string.
 * @returns the complete text from {@link renderFetchOutput}.
 */
function formatFetchOutput(result, maxOutputChars) {
    return renderFetchOutput(result, maxOutputChars).text;
}
/**
 * Pending-call presentation: a fetch card titled by the URL.
 *
 * @param args - the raw tool arguments; only `url` feeds the view.
 * @returns the generic card view (`kind: 'fetch'`) shown while the call runs.
 */
function presentFetchCall(args) {
    return { card: 'generic', title: args.url, kind: 'fetch', rawInput: args.url };
}
/**
 * Project a validated `web_fetch` output value into its replayable presentation
 * meta ({@link WebFetchMeta} as opaque JSON). `truncated` is the effective
 * truncation the model-facing text reflects (via {@link renderFetchOutput}), not
 * the provider-only `WebFetchResult.truncated`, so the fetch card never disagrees
 * with the returned text.
 *
 * @param value - the canonical `web_fetch` output value (the seam's result shape).
 * @param maxOutputChars - the deployment's output cap, the same one
 *   {@link formatFetchOutput} applies to the render text.
 * @returns the URL, status code, and effective truncation flag.
 */
function fetchMetaFromValue(value, maxOutputChars) {
    return { url: value.url, statusCode: value.statusCode, truncated: renderFetchOutput(value, maxOutputChars).truncated };
}
/**
 * Narrow opaque live or replayed result metadata to a {@link WebFetchMeta}.
 * Malformed metadata returns `undefined` so presentation can fall back to the
 * generic card instead of throwing during replay.
 *
 * @param meta - result metadata.
 * @returns the validated fetch meta, or `undefined` for absent or malformed data.
 */
function fetchMetaFromResult(meta) {
    if (typeof meta !== 'object' || meta === null || Array.isArray(meta))
        return undefined;
    var _a = meta, url = _a.url, statusCode = _a.statusCode, truncated = _a.truncated;
    if (typeof url !== 'string' || typeof statusCode !== 'number' || typeof truncated !== 'boolean')
        return undefined;
    return { url: url, statusCode: statusCode, truncated: truncated };
}
/**
 * Completed-call presentation: a `web` fetch card carrying the retrieval summary
 * from `meta`. It sets no `content` copy — a UI without the `web` capability
 * falls back to the raw `tool/result` content, the already-markdown body (see the
 * web-result-card Agent Note).
 *
 * @param args - the raw tool arguments; `url` becomes the result-state title so a
 *   window-truncated replay that dropped the call head still has one.
 * @param result - the final model-facing tool result; `meta` carries the summary.
 * @returns the fetch result view, or `undefined` (generic card) on failure or
 *   malformed meta.
 */
function presentFetchResult(args, result) {
    if (result.isError)
        return undefined;
    var meta = fetchMetaFromResult(result.meta);
    if (meta === undefined)
        return undefined;
    return {
        card: 'web',
        kind: 'fetch',
        title: args.url,
        url: meta.url,
        statusCode: meta.statusCode,
        truncated: meta.truncated,
    };
}
/**
 * Register the `web_fetch` tool and its system-prompt guidance.
 *
 * @param ctx - context whose `tools` and `systemPrompt` registries receive the
 *   registrations; both are effect-scoped and unregister on plugin dispose.
 * @param timeoutMs - the cooperative tool-call budget (ms) attached as the tool's
 *   `ToolDefinition.timeoutMs` for `@z/dsh-tool-call-timeout-policy` to enforce.
 * @param maxOutputChars - cap on the complete rendered tool output (see
 *   {@link formatFetchOutput}) and on source characters converted synchronously.
 */
function applyWebFetchTool(ctx, timeoutMs, maxOutputChars) {
    ctx.systemPrompt.section({
        name: 'tool:web_fetch',
        order: 111,
        text: 'Use the web_fetch tool to retrieve the content of a specific HTTP(S) URL (for example a result from web_search). It returns the page content decoded to text. Cite the URL as a markdown link when you use its content.',
    });
    ctx.tools.register((0, dsh_tools_1.defineTool)({
        name: 'web_fetch',
        description: 'Fetch the content of a specific HTTP(S) URL and return it decoded to text.',
        parameters: {
            url: { type: 'string', required: true, description: 'The HTTP(S) URL to fetch.' },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    url: { type: 'string', required: true },
                    statusCode: { type: 'integer', required: true },
                    body: {
                        required: true,
                        oneOf: [
                            {
                                type: 'object',
                                additionalProperties: false,
                                properties: {
                                    kind: { type: 'string', required: true, const: 'html' },
                                    content: { type: 'string', required: true },
                                },
                            },
                            {
                                type: 'object',
                                additionalProperties: false,
                                properties: {
                                    kind: { type: 'string', required: true, const: 'text' },
                                    content: { type: 'string', required: true },
                                },
                            },
                        ],
                    },
                    truncated: { type: 'boolean', required: true },
                },
            },
            render: function (_args, value) { return [{ type: 'text', text: formatFetchOutput(value, maxOutputChars) }]; },
            presentationMeta: function (_args, value) { return fetchMetaFromValue(value, maxOutputChars); },
        },
        timeoutMs: timeoutMs,
        // Provider reads do not mutate parent-agent state.
        isConcurrencySafe: function () { return true; },
        execute: function (args, exec) {
            return __awaiter(this, void 0, void 0, function () {
                var input, result;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            input = parseFetchArgs(args);
                            return [4 /*yield*/, ctx.web.fetch({ url: input.url }, exec.signal)];
                        case 1:
                            result = _a.sent();
                            return [2 /*return*/, {
                                    url: result.url,
                                    statusCode: result.statusCode,
                                    body: { kind: result.body.kind, content: result.body.content },
                                    truncated: result.truncated,
                                }];
                    }
                });
            });
        },
        presentCall: presentFetchCall,
        presentResult: function (args, result) { return presentFetchResult(args, result); },
    }));
}
