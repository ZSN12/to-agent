"use strict";
// FixtureApi: standalone UI development without a server. Real contract shape: unary takes
// RpcRequest<P> and returns RpcResponse<T> (echoing the rpcId); streams yield RpcRequest<frame>
// (the fixture IS the fake server, so it mints frame rpcIds); root respond takes ClientResponse
// and returns RpcReceipt. fx-alpha carries a hand-built history script (74 turns, pageable);
// prompt triggers a chunked streaming replay; cancel stops the replay; resident pending
// approval/question requests exercise replay and composer takeover with stable rpcIds.
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
var __await = (this && this.__await) || function (v) { return this instanceof __await ? (this.v = v, this) : new __await(v); }
var __asyncGenerator = (this && this.__asyncGenerator) || function (thisArg, _arguments, generator) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var g = generator.apply(thisArg, _arguments || []), i, q = [];
    return i = Object.create((typeof AsyncIterator === "function" ? AsyncIterator : Object).prototype), verb("next"), verb("throw"), verb("return", awaitReturn), i[Symbol.asyncIterator] = function () { return this; }, i;
    function awaitReturn(f) { return function (v) { return Promise.resolve(v).then(f, reject); }; }
    function verb(n, f) { if (g[n]) { i[n] = function (v) { return new Promise(function (a, b) { q.push([n, v, a, b]) > 1 || resume(n, v); }); }; if (f) i[n] = f(i[n]); } }
    function resume(n, v) { try { step(g[n](v)); } catch (e) { settle(q[0][3], e); } }
    function step(r) { r.value instanceof __await ? Promise.resolve(r.value.v).then(fulfill, reject) : settle(q[0][2], r); }
    function fulfill(value) { resume("next", value); }
    function reject(value) { resume("throw", value); }
    function settle(f, v) { if (f(v), q.shift(), q.length) resume(q[0][0], q[0][1]); }
};
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
var __asyncDelegator = (this && this.__asyncDelegator) || function (o) {
    var i, p;
    return i = {}, verb("next"), verb("throw", function (e) { throw e; }), verb("return"), i[Symbol.iterator] = function () { return this; }, i;
    function verb(n, f) { i[n] = o[n] ? function (v) { return (p = !p) ? { value: __await(o[n](v)), done: false } : f ? f(v) : v; } : f; }
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
var __values = (this && this.__values) || function(o) {
    var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
    if (m) return m.call(o);
    if (o && typeof o.length === "number") return {
        next: function () {
            if (o && i >= o.length) o = void 0;
            return { value: o && o[i++], done: !o };
        }
    };
    throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
};
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.FixtureApiClient = void 0;
exports.createFixtureApi = createFixtureApi;
exports.createFixtureFaces = createFixtureFaces;
var message_1 = require("@z/dsh-llm/message");
var brand_1 = require("@z/dsh-llm/brand");
var surface_1 = require("@z/dsh-session/surface");
var api_ts_1 = require("./api.ts");
var random_uuid_ts_1 = require("./random-uuid.ts");
/** The fake carrier mints like a real one (business code never mints). */
function rpcRequest(payload) {
    return { rpcId: (0, api_ts_1.RpcId)((0, random_uuid_ts_1.randomUuid)()), payload: payload };
}
function text(t) {
    return [{ type: 'text', text: t }];
}
function userMessage(content, source) {
    if (source === void 0) { source = { kind: 'user' }; }
    return (0, message_1.createUserMessage)({ content: content, source: source });
}
function assistantMessage(content, model) {
    if (model === void 0) { model = 'fx-1'; }
    return (0, message_1.createAssistantMessage)({
        content: content,
        source: { provider: 'fixture', model: model },
    });
}
function toolResultMessage(callId, content, isError) {
    return (0, message_1.createToolResultMessage)({ callId: (0, brand_1.CallId)(callId), content: content, isError: isError });
}
var MARKDOWN_FIXTURE = [
    '# Markdown fixture',
    '',
    'Assistant output renders **strong text**, *emphasis*, and `inline code`.',
    '',
    '- first item',
    '  - nested item',
    '',
    '| Area | State |',
    '| --- | --- |',
    '| history | rendered |',
    '| streaming | stable |',
    '',
    '[DeepSeek](https://www.deepseek.com)',
    '',
    '```ts',
    'const markdown = true',
    '```',
].join('\n');
var USER_MARKDOWN_LITERAL = '用户字面量：# 不渲染 `code` [link](https://example.com)';
/**
 * SGR wrapper for the terminal output sample below: authoring the escapes as
 * `\u001b` keeps literal control bytes out of this source file.
 * @param code - the SGR parameter (an ANSI color or attribute number).
 * @param body - the text the attribute applies to.
 * @returns the body wrapped in the attribute and a reset.
 */
function sgr(code, body) {
    return "\u001B[".concat(code, "m").concat(body, "\u001B[0m");
}
/**
 * Terminal output sample for fixture turn 66, authored to carry every feature
 * the terminal card draws that turn 60's two prompt rows cannot reach:
 * basic-16 SGR foreground runs (green, red, bright-black) that must resolve to
 * `--dsw-*` tokens, a bold run, column-aligned table rows that must scroll
 * rather than fold, more than DEFAULT_TERMINAL_MAX_LINES (16) lines so the
 * height cap collapses the middle. The exit status is authored separately in
 * TERMINAL_EXIT_STATUS and deliberately absent from this text: the real bash
 * presenter CONSUMES its `[exit code: N]` marker out of the body, because a
 * terminal card shows the exit as its own pill and leaving the marker in would
 * render it twice (packages/shell/tool-bash/src/render.ts).
 */
var TERMINAL_OUTPUT_FIXTURE = [
    sgr(1, 'Running 4 checks'),
    "".concat(sgr(32, '\u2713'), " typecheck                                          1.82s"),
    "".concat(sgr(32, '\u2713'), " lint                                               0.94s"),
    "".concat(sgr(32, '\u2713'), " duplication                                        2.10s"),
    "".concat(sgr(31, '\u2717'), " unit                                               8.41s"),
    '',
    sgr(90, 'packages/client/ui-primitives/tests/terminal-block.client.spec.tsx'),
    "  ".concat(sgr(31, 'FAIL'), " caps output at the configured line budget"),
    '    expected 16 lines, received 24',
    '',
    'NAME                        LINES    BRANCHES    FUNCTIONS    UNCOVERED',
    'TerminalBlock.tsx           100%     100%        100%         -',
    'ansi.ts                     100%     100%        100%         -',
    'clipboard.ts                100%     100%        100%         -',
    'CodeBlock.tsx               98.4%    96.2%       100%         41-43',
    'highlight.ts                100%     100%        100%         -',
    'Pill.tsx                    100%     100%        100%         -',
    'StateDot.tsx                100%     100%        100%         -',
    'markdown/Markdown.tsx       100%     100%        100%         -',
    '',
    sgr(31, '1 of 4 checks failed'),
].join('\n');
/**
 * Exit status for each terminal sample, keyed by its output text. Authored
 * alongside the sample rather than parsed back out of its trailing marker,
 * which is the bash tool's own job and not something to reimplement here.
 */
var TERMINAL_EXIT_STATUS = (_a = {},
    _a[TERMINAL_OUTPUT_FIXTURE] = { exitCode: 1 },
    _a);
/**
 * Structured grep result for the search sample (turn 67): matches grouped by
 * file, authored inline because the client-side fixture cannot import the tool
 * that produces the canonical value. `truncated` with a larger `total` than the
 * retained match count exercises the search card's capped indicator; the file
 * with more than CHAT_SEARCH_MAX_LINES rows exercises its head/tail height cap.
 */
var SEARCH_MATCHES_FIXTURE = [
    {
        path: 'packages/client/ui-primitives/src/SearchBlock.tsx',
        matches: [
            { lineNumber: 16, line: 'export const DEFAULT_SEARCH_MAX_LINES = 16' },
            { lineNumber: 138, line: 'export function SearchBlock(props: SearchBlockProps) {' },
            { lineNumber: 141, line: '  const [collapsed, setCollapsed] = useState<ReadonlySet<number>>(() => new Set())' },
        ],
    },
    {
        path: 'packages/client/ui-tool/src/client/tool/models/search-card-model.ts',
        matches: [
            { lineNumber: 45, line: 'export const CHAT_SEARCH_MAX_LINES = 8' },
            { lineNumber: 130, line: 'export function searchCardModel(block: ToolCallBlock): SearchCardModel | null {' },
        ],
    },
    {
        path: 'packages/client/ui-tool/src/client/tool/toolviews/search-row.tsx',
        matches: [
            { lineNumber: 34, line: 'export function SearchRow({ toolName, block, inspect, t }: SearchRowProps) {' },
            { lineNumber: 36, line: '  const search = searchCardModel(block)' },
            { lineNumber: 56, line: '      search={search}' },
            { lineNumber: 78, line: "      yield ctx.slots.register({ name: 'tool.call.toolview', key: 'grep', locale: NS }, SearchRow)" },
        ],
    },
];
/**
 * The model-facing grep render text for the sample — what a UI without a search
 * card shows, attached as the view's `content`. Mirrors the real grep
 * presenter's shape (see formatGrepOutput in dsh-tool-fs-search): a
 * `Found X of Y matches` header, the matches grouped under file headers with
 * `Line N:` rows, then a spill-recovery footer.
 */
var SEARCH_MATCHES_TEXT = __spreadArray(__spreadArray([
    'Found 9 of 42 matches',
    ''
], SEARCH_MATCHES_FIXTURE.map(function (file) {
    return __spreadArray([file.path], file.matches.map(function (m) { return "Line ".concat(m.lineNumber, ": ").concat(m.line); }), true).join('\n');
}), true), [
    '',
    '(Full grep result stored at: fixture://spill/grep-66. Read it to see every match.)',
], false).join('\n');
/**
 * Structured glob result for the search sample (turn 68): a flat path list,
 * truncated with a larger `total` so the path card shows its capped indicator.
 */
var SEARCH_PATHS_FIXTURE = [
    'packages/client/ui-primitives/src/SearchBlock.tsx',
    'packages/client/ui-primitives/src/SearchBlock.module.css',
    'packages/client/ui-tool/src/client/tool/models/search-card-model.ts',
    'packages/client/ui-tool/src/client/tool/toolviews/search-row.tsx',
    'packages/client/ui-tool/tests/search-card.client.spec.tsx',
];
/**
 * The model-facing glob render text — the newline-joined path list plus a
 * spill-recovery footer, mirroring the real glob presenter's shape (see
 * formatGlobOutput in dsh-tool-fs-search).
 */
var SEARCH_PATHS_TEXT = __spreadArray(__spreadArray([], SEARCH_PATHS_FIXTURE, true), [
    '',
    '(Showing 5 of 23 paths. Full sorted result stored at: fixture://spill/glob-67. Read it to see every path.)',
], false).join('\n');
/**
 * Read-card sample for the read turn: a WINDOW past an offset, so the line
 * numbers start above 1 (the card's gutter keeps the file's own numbering) and
 * `totalLines` exceeds the window (the card shows a "showing N of M" note). The
 * fixture is client-side and cannot import the read tool, so the structured
 * window is authored inline exactly as the tool would project it through
 * `presentationMeta`. `lang` is a `ts` hint so the shiki path highlights it.
 */
var READ_SAMPLE_FIRST_LINE = 41;
var READ_SAMPLE_SOURCE = [
    'export interface ReadBlockProps {',
    '  label?: string | undefined',
    '  lines: readonly ReadBlockLine[]',
    '  totalLines: number',
    '  lang?: string | undefined',
    '  maxLines?: number | undefined',
    '  className?: string | undefined',
    '}',
    '',
    '// A windowed read keeps the file line numbers in the gutter.',
    'const marker = "fixture read sample"',
];
var READ_SAMPLE_LINES = READ_SAMPLE_SOURCE.map(function (text, index) { return ({ number: READ_SAMPLE_FIRST_LINE + index, text: text }); });
var READ_SAMPLE_PATH = 'packages/client/ui-primitives/src/ReadBlock.tsx';
var READ_SAMPLE_TOTAL = 180;
var READ_SAMPLE_TEXT = READ_SAMPLE_SOURCE.map(function (text, index) { return "".concat(READ_SAMPLE_FIRST_LINE + index, ": ").concat(text); }).join('\n');
/**
 * The structured `web_search` result view for the web-search turn, authored inline
 * because this client-side fixture cannot import the web tool that projects it.
 * The sources exercise the citation list's features: a titled source with a
 * snippet and a date, a source with no title (its hostname labels the link) and
 * a snippet but no date, and a source with a title and a date but no snippet.
 * `truncated` marks the capped indicator. The shape is the contract's own
 * search view minus its wire discriminants.
 */
var WEB_SEARCH_RESULT = {
    answer: 'DeepSeek Harness is a plugin-based agent harness on vendored Cordis where **every capability is a plugin**.',
    sources: [
        {
            url: 'https://github.com/deepseek-ai/deepseek-harness',
            title: 'DeepSeek Harness — plugin-based agent harness',
            snippet: 'Everything is a plugin: session, tools, agent-loop, and LLM adapters all mount on the same Cordis context.',
            publishedAt: '2026-07-01',
        },
        {
            url: 'https://www.deepseek.com/blog/harness-architecture',
            snippet: 'The capability-seam pattern splits each capability into interface, implementation, and consumer packages.',
        },
        {
            url: 'https://docs.deepseek.com/harness/plugins',
            title: 'Writing a harness plugin',
            publishedAt: '2026-06-15',
        },
    ],
    truncated: true,
};
/** The `web_fetch` result view for the web-fetch turn, authored inline for the same reason. */
var WEB_FETCH_RESULT = {
    url: 'https://www.deepseek.com/blog/harness-architecture',
    statusCode: 200,
    truncated: false,
};
var DEEPSEEK_REASONING = {
    efforts: [
        { id: 'off', name: 'Off' },
        { id: 'high', name: 'High' },
        { id: 'max', name: 'Max' },
    ],
    defaultEffort: 'high',
};
var OPENAI_REASONING = {
    efforts: [
        { id: 'off', name: 'Off' },
        { id: 'medium', name: 'Medium' },
        { id: 'high', name: 'High' },
        { id: 'max', name: 'Max' },
    ],
    defaultEffort: 'medium',
};
/** Catalog served by `session.models` and `llm.models` alike (fresh copies per call). */
function fixtureModelGroups() {
    return [
        {
            id: 'deepseek-official',
            name: 'DeepSeek',
            models: [
                {
                    id: 'deepseek-v4-flash',
                    name: 'DeepSeek-V4-Flash',
                    description: '快速响应',
                    reasoning: DEEPSEEK_REASONING,
                },
                {
                    id: 'deepseek-v4-pro',
                    name: 'DeepSeek-V4-Pro',
                    description: '复杂任务',
                    reasoning: DEEPSEEK_REASONING,
                },
            ],
        },
        {
            id: 'openai',
            name: 'OpenAI',
            models: [{ id: 'gpt-5', name: 'GPT-5', reasoning: OPENAI_REASONING }],
        },
    ];
}
function sid(id) {
    return id;
}
var FIXTURE_IMAGE_DATA = 'iVBORw0KGgoAAAANSUhEUgAAAKAAAABaCAYAAAA/xl1SAAAAvklEQVR42u3SMQ0AAAjAMIyhELM4AAe8PD1qYFlk9cCXEAEDYkAwIAYEA2JAMCAGBANiQDAgBgQDYkAwIAYEA2JAMCAGBANiQDAgBgQDYkAwIAYEA2JAMCAGxIBCYEAMCAbEgGBADAgGxIBgQAwIBsSAYEAMCAbEgGBADAgGxIBgQAwIBsSAYEAMCAbEgGBADAgGxIAYEAyIAcGAGBAMiAHBgBgQDIgBwYAYEAyIAcGAGBAMiAHBgBgQDIgB4bYWLb6pnOb1xAAAAABJRU5ErkJggg==';
var FIXTURE_IMAGE_REF = {
    attachmentId: 'fixture:image',
    mediaType: 'image/png',
    bytes: 247,
    width: 160,
    height: 90,
    name: 'fixture-image.png',
};
/** Deterministic provider billing attached to fixture assistant messages. */
function fixtureUsage(turn, step) {
    return {
        inputTokens: 20 + turn % 5,
        outputTokens: 8 + step,
        cacheReadTokens: turn === 0 ? 0 : 80,
        cacheWriteTokens: turn % 10 === 0 ? 4 : 0,
    };
}
/** fx-alpha history script: 75 turns (~150+ messages -> 4 pages at PAGE_MESSAGES=50),
 *  mixing reasoning blocks / tool call+result / context. */
function buildAlphaLog() {
    var _a;
    var events = [];
    var time = Date.now() - 3600000;
    var push = function (e) {
        var seq = events.length;
        var data = e['data'];
        var authored = e['type'] === 'assistant/message' && data !== undefined
            ? __assign(__assign({}, e), { data: __assign(__assign({}, data), { usage: fixtureUsage(data['turn'], data['step']) }) }) : e;
        events.push(__assign({ seq: seq, time: (time += 800) }, authored));
        return seq;
    };
    // This resident history represents completed model requests, so retain the
    // route capacity that accompanied them just as the live prompt path does.
    push({
        type: 'request/context',
        data: { provider: 'deepseek-official', model: 'deepseek-v4-flash', contextWindow: 128000 },
    });
    for (var turn = 0; turn < 60; turn++) {
        push({ type: 'turn/start', data: { turn: turn } });
        var userSeq = push({
            type: 'user/message', surfaceOp: 'append',
            data: userMessage(text(turn === 59 ? USER_MARKDOWN_LITERAL : "\u95EE\u9898 ".concat(turn, "\uFF1Afixture \u5386\u53F2\u6D88\u606F\uFF0C\u7528\u4E8E\u7FFB\u9875\u4E0E\u6E32\u67D3\u9A8C\u6536\u3002"))),
        });
        if (turn === 0) {
            push({
                type: 'session/title',
                data: { title: 'Fixture 历史会话', messageSeqs: [userSeq], source: { kind: 'fallback' } },
            });
        }
        if (turn % 9 === 4) {
            push({ type: 'user/message', surfaceOp: 'append', data: userMessage(text("[fixture] \u4E0A\u4E0B\u6587\u6CE8\u5165\uFF08turn ".concat(turn, "\uFF09")), { kind: 'plugin', plugin: 'fixture' }) });
        }
        push({ type: 'step/start', data: { turn: turn, step: 0 } });
        var withTool = turn % 5 === 2;
        var withReasoning = turn % 3 === 1;
        var blocks = [];
        if (withReasoning)
            blocks.push({ type: 'reasoning', text: "\u601D\u8003\u8FC7\u7A0B ".concat(turn, "\uFF1A\u8FD9\u662F\u4E00\u6BB5\u53EF\u6298\u53E0\u7684 reasoning \u5185\u5BB9\u3002") });
        blocks.push({ type: 'text', text: turn === 59 ? MARKDOWN_FIXTURE : "\u56DE\u7B54 ".concat(turn, "\uFF1A\u8FD9\u662F fixture \u751F\u6210\u7684\u5386\u53F2\u56DE\u590D\u6B63\u6587\u3002") });
        if (withTool) {
            var callId = "fx-call-".concat(turn);
            blocks.push({ type: 'tool-call', id: callId, name: 'echo', arguments: "{\"text\":\"turn ".concat(turn, "\"}") });
            push({ type: 'assistant/message', surfaceOp: 'append', data: { turn: turn, step: 0, message: assistantMessage(blocks) } });
            push({ type: 'tool/call', data: { turn: turn, step: 0, callId: callId, name: 'echo', arguments: "{\"text\":\"turn ".concat(turn, "\"}") } });
            push({ type: 'tool/result', surfaceOp: 'append', data: { turn: turn, step: 0, message: toolResultMessage(callId, text("ECHO: TURN ".concat(turn)), turn % 25 === 12) } });
            push({ type: 'step/end', data: { turn: turn, step: 0 } });
            push({ type: 'step/start', data: { turn: turn, step: 1 } });
            push({ type: 'assistant/message', surfaceOp: 'append', data: { turn: turn, step: 1, message: assistantMessage(text("\u5DE5\u5177\u7ED3\u679C\u5DF2\u6D88\u5316\uFF08turn ".concat(turn, "\uFF09\u3002"))) } });
            push({ type: 'step/end', data: { turn: turn, step: 1 } });
        }
        else {
            push({ type: 'assistant/message', surfaceOp: 'append', data: { turn: turn, step: 0, message: assistantMessage(blocks) } });
            push({ type: 'step/end', data: { turn: turn, step: 0 } });
        }
        push({ type: 'turn/end', data: { turn: turn, reason: { kind: 'completed' } } });
    }
    // Three view-sample turns (60-62) cover the built-in card types. The real filesystem names in
    // turns 62-63 also exercise their dedicated generic-row icon/title/path summaries. `echo` above
    // stays presenter-less as the unknown fallback.
    var toolTurn = function (turn, name, args, resultText) {
        var callId = "fx-call-".concat(turn);
        push({ type: 'turn/start', data: { turn: turn } });
        push({ type: 'user/message', surfaceOp: 'append', data: userMessage(text("\u95EE\u9898 ".concat(turn, "\uFF1A").concat(name, " \u6837\u672C\u3002"))) });
        push({ type: 'step/start', data: { turn: turn, step: 0 } });
        push({
            type: 'assistant/message', surfaceOp: 'append',
            data: { turn: turn, step: 0, message: assistantMessage([{ type: 'tool-call', id: callId, name: name, arguments: args }]) },
        });
        push({ type: 'tool/call', data: { turn: turn, step: 0, callId: callId, name: name, arguments: args } });
        push({ type: 'tool/result', surfaceOp: 'append', data: { turn: turn, step: 0, message: toolResultMessage(callId, text(resultText), false) } });
        push({ type: 'step/end', data: { turn: turn, step: 0 } });
        push({ type: 'turn/end', data: { turn: turn, reason: { kind: 'completed' } } });
    };
    // A two-line command, so the fixture covers the terminal card's one-row-per-
    // command-line prompt (and that the card still marks the call exactly once).
    toolTurn(60, 'fx-bash', '{"command":"ls -la\\necho done","cwd":"/tmp/fixture"}', 'total 2\ndrwxr-xr-x fixture\n-rw-r--r-- demo.txt');
    toolTurn(61, 'fx-write', '{"path":"notes/demo.txt","content":"hello fixture\\n"}', 'wrote notes/demo.txt');
    toolTurn(62, 'edit', '{"file_path":"notes/demo.txt","old_string":"hello","new_string":"hello fixture"}', '已编辑');
    toolTurn(63, 'write', '{"file_path":"notes/new-demo.txt","content":"hello fixture\\n"}', '已写入');
    // Turn 64: a multi-hunk edit — two scattered replacements in one file. Named
    // `edit` so it lands on the keyed FileMutationRow (the resident diff card the
    // single-hunk turn 62 also uses), and file_path `src/config.ts` is the marker
    // the presenter reads to emit the two-hunk sample: the card draws one path
    // header, the first hunk, a `⋯` gap, then the second (the same-file
    // second-hunk arm turns 62/63 cannot reach).
    toolTurn(64, 'edit', '{"file_path":"src/config.ts","old_string":"const timeout = 30","new_string":"const timeout = 60"}', '已编辑');
    // Turn 65: one run_code turn with three logged sub-dispatches — the Code
    // Mode acceptance surface (parent code row + nested native-identical rows,
    // including an isError sub-call and a bash sub-call that must hit the same
    // keyed registration a top-level bash row uses).
    {
        var turn = 65;
        var callId_1 = "fx-call-".concat(turn);
        var program = 'const listing = await tools.bash({ command: "ls notes", description: "List notes" })\n'
            + 'const demo = await tools.read({ file_path: "notes/demo.txt" })\n'
            + 'await tools.read({ file_path: "notes/missing.txt" }).catch(() => "tolerated")\n'
            + 'return { listing, demo }';
        var args = JSON.stringify({ code: program, description: 'Read the notes files and summarize' });
        push({ type: 'turn/start', data: { turn: turn } });
        push({ type: 'user/message', surfaceOp: 'append', data: userMessage(text("\u95EE\u9898 ".concat(turn, "\uFF1Arun_code \u6837\u672C\u3002"))) });
        push({ type: 'step/start', data: { turn: turn, step: 0 } });
        push({
            type: 'assistant/message', surfaceOp: 'append',
            data: { turn: turn, step: 0, message: assistantMessage([{ type: 'tool-call', id: callId_1, name: 'run_code', arguments: args }]) },
        });
        push({ type: 'tool/call', data: { turn: turn, step: 0, callId: callId_1, name: 'run_code', arguments: args } });
        var dispatchPair = function (n, name, dispatchArgs, resultText, isError) {
            if (isError === void 0) { isError = false; }
            push({
                type: 'tool/code-dispatch-start',
                data: { rootCallId: callId_1, parentCallId: callId_1, subCallId: "".concat(callId_1, ":code:").concat(n), name: name, arguments: dispatchArgs },
            });
            push({
                type: 'tool/code-dispatch',
                data: {
                    rootCallId: callId_1, parentCallId: callId_1, subCallId: "".concat(callId_1, ":code:").concat(n),
                    name: name,
                    arguments: dispatchArgs,
                    isError: isError,
                    content: [{ type: 'text', text: resultText }],
                },
            });
        };
        dispatchPair(1, 'bash', { command: 'ls notes', description: 'List notes' }, 'demo.txt\nnew-demo.txt');
        dispatchPair(2, 'read', { file_path: 'notes/demo.txt' }, 'hello fixture\n');
        dispatchPair(3, 'read', { file_path: 'notes/missing.txt' }, 'Error: ENOENT: notes/missing.txt not found', true);
        push({
            type: 'tool/result', surfaceOp: 'append',
            data: { turn: turn, step: 0, message: toolResultMessage(callId_1, text('{"listing":"demo.txt\\nnew-demo.txt","demo":"hello fixture\\n"}'), false) },
        });
        push({ type: 'step/end', data: { turn: turn, step: 0 } });
        push({ type: 'turn/end', data: { turn: turn, reason: { kind: 'completed' } } });
    }
    // Turn 74: todo_write sample — the TodoRow toolview in the flow plus the
    // todo/write snapshot event feeding the TodoPanel plan strip. Two items are
    // in_progress: this fixture chooses the parallel policy, so both surfaces
    // must render a parallel plan rather than the first active item alone.
    var fixtureTodos = [
        { content: '梳理需求', status: 'completed' },
        { content: '实现 fixture 样本', status: 'in_progress' },
        { content: '跑后台构建', status: 'in_progress' },
        { content: '浏览器验收', status: 'pending' },
    ];
    // Turn 66: the terminal sample turn 60's two clean prompt rows cannot cover —
    // ANSI SGR coloring, output past the terminal card's height cap, a nested cwd
    // whose prompt label is its last segment, and a non-zero exit authored beside
    // the sample in TERMINAL_EXIT_STATUS — its body deliberately carries no
    // `[exit code: N]` marker, since the real presenter consumes that one out of
    // the body. Named `bash`, so it also covers
    // the keyed toolview row (turn 60's `fx-bash` covers the render-site fallback
    // row) — the two chat-row shapes the terminal card renders in.
    //
    // Ordered BEFORE the todo turn deliberately: the standing plan retires at the
    // next `turn/start`, so a turn appended after it would leave the dock's plan
    // strip empty and take the todo surfaces' own coverage with it.
    toolTurn(66, 'bash', '{"command":"pnpm run check","cwd":"/tmp/fixture/deep/nested"}', TERMINAL_OUTPUT_FIXTURE);
    // Turns 67-68: the search card's two shapes. `grep` emits a `card: 'search'`
    // `shape: 'matches'` result view (grouped-by-file matches, truncated with a
    // larger `total`), `glob` emits `shape: 'paths'` (a flat path list, likewise
    // truncated). Both ride the keyed SearchRow registration under their own
    // names; the render-site fallback row is covered by the model derivation
    // tests, since every fixture search tool has a keyed row. Ordered before the
    // todo turn for the same standing-plan reason the bash turn is.
    toolTurn(67, 'grep', '{"pattern":"SEARCH_MAX_LINES","path":"packages/client"}', SEARCH_MATCHES_TEXT);
    toolTurn(68, 'glob', '{"pattern":"**/SearchBlock*","path":"packages/client"}', SEARCH_PATHS_TEXT);
    // Turn 69: the read sample — a WINDOW past an offset so the card draws file
    // line numbers starting above 1 and a "showing N of M" note (the window is
    // shorter than READ_SAMPLE_TOTAL), with a `ts` language hint the shiki path
    // highlights. Named `read`, so it exercises the keyed ReadRow registration.
    // The render-site fallback ROW SHAPE (a read call on the generic flattened
    // path) is covered by the turn 65 run_code read sub-dispatches, which
    // session.ts folds with resultView: null; the fallback-row + read-CARD
    // combination is pinned by the web_fetch case in read-card.spec.tsx, not by
    // this fixture. The read render intent is result-side only, so its pending
    // call stays a generic `kind: 'read'` card; presentResult carries the
    // structured window.
    toolTurn(69, 'read', "{\"file_path\":".concat(JSON.stringify(READ_SAMPLE_PATH), ",\"offset\":").concat(READ_SAMPLE_FIRST_LINE, "}"), READ_SAMPLE_TEXT);
    // Turns 70-71: the web render intent — a web_search whose result view carries
    // structured sources plus an answer (the citation list, one source lacking a
    // title so its hostname labels the link, the capped indicator on), and a
    // web_fetch whose result view carries the fetched URL and its HTTP status.
    // Both keep a generic pending call view and add the `web` card only at
    // result time, which is the contract's result-only web shape. Named after
    // the real tools so they hit the keyed WebRow registration. Ordered BEFORE
    // the todo turn for the same reason turn 66 is: the standing plan retires at
    // the next turn/start, so a turn after it would empty the dock's plan strip.
    toolTurn(70, 'web_search', '{"queries":["deepseek harness architecture"]}', 'Search results for deepseek harness architecture.');
    toolTurn(71, 'web_fetch', '{"url":"https://www.deepseek.com/blog/harness-architecture"}', '# Harness architecture\n\nEverything is a plugin.');
    // Turn 72: max-tokens sample — the provider ends the turn at its output cap
    // mid-sentence, so the chat flow must render the turn-max-tokens notice
    // instead of ending silently. Ordered before the todo turn for the same
    // standing-plan reason the bash turn is.
    push({ type: 'turn/start', data: { turn: 72 } });
    push({ type: 'user/message', surfaceOp: 'append', data: userMessage(text('问题 72：请完整列出全部一百条条目。')) });
    push({ type: 'step/start', data: { turn: 72, step: 0 } });
    push({
        type: 'assistant/message',
        surfaceOp: 'append',
        data: { turn: 72, step: 0, message: assistantMessage(text('条目 1：第一条。条目 2：第二条。条目 3：这一条写到一半被')) },
    });
    push({ type: 'step/end', data: { turn: 72, step: 0 } });
    push({ type: 'turn/end', data: { turn: 72, reason: { kind: 'max-tokens' } } });
    // Turn 73: user and assistant images share one durable fixture object.
    // The todo turn remains last so its standing projection stays visible.
    push({ type: 'turn/start', data: { turn: 73 } });
    push({
        type: 'user/message',
        surfaceOp: 'append',
        data: userMessage(__spreadArray([{ type: 'image', attachment: FIXTURE_IMAGE_REF }], text('历史用户图片'), true)),
    });
    push({ type: 'step/start', data: { turn: 73, step: 0 } });
    push({
        type: 'assistant/message',
        surfaceOp: 'append',
        data: {
            turn: 73,
            step: 0,
            message: assistantMessage(__spreadArray(__spreadArray([], text('结构化模型图片：'), true), [{ type: 'image', attachment: FIXTURE_IMAGE_REF }], false), 'fx-vision'),
        },
    });
    push({ type: 'step/end', data: { turn: 73, step: 0 } });
    push({ type: 'turn/end', data: { turn: 73, reason: { kind: 'completed' } } });
    var todoArgs = JSON.stringify({ todos: fixtureTodos });
    toolTurn(74, 'todo_write', todoArgs, 'Updated todo list: 1 pending, 2 in progress, 1 completed.');
    // The real tool appends the snapshot mid-execution — between tool/call and
    // tool/result — so the fixture reproduces that exact ordering (the last
    // toolTurn events run ... tool/call, tool/result, step/end, turn/end).
    var callIndex = events.length - 4;
    var callTime = (_a = events[callIndex]) === null || _a === void 0 ? void 0 : _a.time;
    events.splice(callIndex + 1, 0, { type: 'todo/write', time: callTime + 400, data: { todos: fixtureTodos } });
    events.forEach(function (e, i) { e.seq = i; });
    return events;
}
/** Narrows a parsed-JSON field to string; fixture args are authored in-file, so non-strings only mean a typo here. */
/* v8 ignore next -- the fallback arm is the same in-file-typo guard as the JSON.parse catch above. */
var str = function (value, fallback) {
    if (fallback === void 0) { fallback = ''; }
    return typeof value === 'string' ? value : fallback;
};
/** Fixture presenter registry (mirrors host viewFor): pure derivation, undefined = no view. */
function presentCall(name, argsRaw) {
    var args;
    try {
        args = JSON.parse(argsRaw);
    }
    catch (_a) {
        /* v8 ignore next 2 -- defensive: fixture args are authored in-file as valid JSON; only an in-file typo could reach the catch. */
        return undefined;
    }
    switch (name) {
        // Both names present the same terminal card: `fx-bash` lands on the
        // render-site fallback row, `bash` on the keyed BashRow registration.
        case 'fx-bash':
        case 'bash':
            return { card: 'terminal', title: str(args.command), cwd: str(args.cwd, '/tmp/fixture'), description: 'fixture 终端样本' };
        case 'fx-write':
            return {
                card: 'diff', title: "Write ".concat(str(args.path)),
                diffs: [{ path: str(args.path), oldText: null, newText: str(args.content) }],
            };
        // A read pending call is a GENERIC card (kind: 'read', a follow-along
        // location): the read render intent is result-side only, because a call
        // carries no file content until execute returns. The rich read card arrives
        // in presentResult.
        case 'read':
            return { card: 'generic', title: "Read ".concat(str(args.file_path)), kind: 'read', locations: [{ path: str(args.file_path) }] };
        case 'edit':
            // The multi-hunk sample (turn 64) is keyed on its file_path, so the two
            // scattered hunks share one path header and the card draws the `⋯` gap.
            if (str(args.file_path) === 'src/config.ts') {
                return {
                    card: 'diff', title: "Edit ".concat(str(args.file_path)),
                    diffs: [
                        { path: str(args.file_path), oldText: 'const timeout = 30', newText: 'const timeout = 60' },
                        { path: str(args.file_path), oldText: 'retries: 1', newText: 'retries: 3' },
                    ],
                };
            }
            return {
                card: 'diff', title: "Edit ".concat(str(args.file_path)),
                diffs: [{ path: str(args.file_path), oldText: str(args.old_string), newText: str(args.new_string) }],
            };
        case 'write':
            return {
                card: 'diff', title: "Write ".concat(str(args.file_path)),
                diffs: [{ path: str(args.file_path), oldText: null, newText: str(args.content) }],
            };
        // A search call stays a generic card (kind: 'search'): the structured
        // matches/paths exist only after execute, so the search card is result-time
        // only (presentResult builds it). This mirrors the real grep/glob presenters.
        case 'grep':
            return { card: 'generic', title: "Grep ".concat(str(args.pattern)), kind: 'search', rawInput: args };
        case 'glob':
            return { card: 'generic', title: "Glob ".concat(str(args.pattern)), kind: 'search', rawInput: args };
        // The web tools keep a GENERIC pending card and add the `web` result card
        // only at result time (the contract's result-only web shape); their pending
        // kind matches the result kind so a call and its result read as one category.
        case 'web_search': {
            var queries = Array.isArray(args.queries) ? args.queries.filter(function (query) { return typeof query === 'string' && query !== ''; }) : [];
            var title = queries.join(', ');
            return { card: 'generic', title: "Search ".concat(title), kind: 'search', rawInput: args };
        }
        case 'web_fetch':
            return { card: 'generic', title: "Fetch ".concat(str(args.url)), kind: 'fetch', rawInput: args };
        default:
            return undefined; // echo et al: the documented no-view fallback path
    }
}
function presentResult(name, argsRaw, resultText) {
    var _a;
    var call = presentCall(name, argsRaw);
    if (call === undefined)
        return undefined;
    // Search is result-time only: the call stays a generic search card, and the
    // result view carries the structured shape the card renders. The view holds no
    // result text — a UI without a search card falls back to the raw tool/result
    // content — so the truncation recovery footer rides that raw content (the
    // `toolTurn` message text), not the view. `total` exceeds the retained count so
    // the card shows its capped indicator.
    if (name === 'grep') {
        return { card: 'search', shape: 'matches', files: SEARCH_MATCHES_FIXTURE, truncated: true, total: 42 };
    }
    if (name === 'glob') {
        return { card: 'search', shape: 'paths', paths: SEARCH_PATHS_FIXTURE, truncated: true, total: 23 };
    }
    // The read result is the structured window the tool projects through
    // `presentationMeta`; the fixture authors it inline (it cannot import the
    // tool). Keyed on the name because the read pending call is a generic card,
    // so `call.card` alone does not distinguish it from edit/write.
    if (name === 'read') {
        return {
            card: 'read', path: READ_SAMPLE_PATH, offset: READ_SAMPLE_FIRST_LINE, lines: READ_SAMPLE_LINES,
            totalLines: READ_SAMPLE_TOTAL, lang: 'ts', content: text(resultText),
        };
    }
    // The web tools keep a generic pending card, so their result card is chosen
    // by tool name rather than by the pending card tag: the structured `web` card
    // the frontend consumes. The view carries no `content` copy (per the contract
    // and the web-result-card note); a capability-less UI falls back to the raw
    // `tool/result` content, which this fixture emits from `resultText`.
    if (name === 'web_search') {
        return __assign({ card: 'web', kind: 'search' }, WEB_SEARCH_RESULT);
    }
    if (name === 'web_fetch') {
        return __assign({ card: 'web', kind: 'fetch' }, WEB_FETCH_RESULT);
    }
    switch (call.card) {
        case 'terminal':
            // The sample's own exit status, authored beside it: re-parsing the
            // trailing marker here would duplicate the bash tool's `parseExitStatus`,
            // which this client-side fixture cannot import.
            return __assign({ card: 'terminal', output: resultText }, ((_a = TERMINAL_EXIT_STATUS[resultText]) !== null && _a !== void 0 ? _a : { exitCode: 0 }));
        case 'diff':
            return { card: 'diff', diffs: call.diffs };
        case 'generic':
            return { card: 'generic', content: text(resultText) };
    }
}
/** Host-side viewFor mirror: tool/call presents from its own args; tool/result back-scans the log for the paired call. */
function viewFor(event, log) {
    if (event.type === 'tool/call') {
        var view = presentCall(event.data.name, event.data.arguments);
        return view === undefined ? undefined : { for: 'call', view: view };
    }
    if (event.type === 'tool/result') {
        var callId = String(event.data.message.source.callId);
        for (var i = log.length - 1; i >= 0; i--) {
            var candidate = log[i];
            /* v8 ignore next -- dense-array guard: i stays within [0, log.length),
            so the undefined arm needs a sparse log no code path builds. */
            if (candidate !== undefined && candidate.type === 'tool/call' && String(candidate.data.callId) === callId) {
                var resultText = event.data.message.content[0].content.map(function (b) { return (b.type === 'text' ? b.text : ''); }).join('');
                var view = presentResult(candidate.data.name, candidate.data.arguments, resultText);
                return view === undefined ? undefined : { for: 'result', view: view };
            }
        }
        return undefined; // cross-page unpaired: documented default
    }
    return undefined;
}
/**
 * Fixture parallel of the plan unit's lifecycle fold. The paired
 * `command/done` retains successful plan selections and drops failures;
 * `plan/mode` commits one. `wanted` is exposed for the prompt boundary (the
 * fixture's step/start parallel).
 */
function foldPlan(log) {
    var _a, _b, _c;
    var active = false;
    var wanted = null;
    var running = null;
    for (var _i = 0, log_1 = log; _i < log_1.length; _i++) {
        var event_1 = log_1[_i];
        var item = event_1;
        if (item.type === 'command/run' && ((_a = item.data) === null || _a === void 0 ? void 0 : _a['name']) === 'plan') {
            var args = item.data['args'];
            if (typeof args !== 'string')
                continue;
            running = { commandId: item.data['commandId'], wanted: args.trim() !== 'off' };
        }
        else if (item.type === 'command/done'
            && item.data !== undefined
            && running !== null
            && item.data['commandId'] === running.commandId) {
            wanted = item.data['kind'] === 'success' && running.wanted !== active ? running.wanted : null;
            running = null;
        }
        else if (item.type === 'plan/mode') {
            active = ((_b = item.data) === null || _b === void 0 ? void 0 : _b['active']) === true;
            wanted = null;
        }
    }
    var selected = (_c = running === null || running === void 0 ? void 0 : running.wanted) !== null && _c !== void 0 ? _c : wanted;
    return { active: active, pending: selected !== null && selected !== active, wanted: selected };
}
/** The plan projection's wire view over the full log. */
function planViewOf(log) {
    var plan = foldPlan(log);
    return { active: plan.active, pending: plan.pending };
}
/** Fixture parallel of the host's projection units: whole current values per key over the full log. */
/** Fixture preset table (the host PermissionPresetService defaults). */
var PERMISSION_PRESETS = {
    'workspace-write': { sandbox: 'workspace-write', approval: 'ask', description: 'Write inside the workspace and permitted temporary directories; wider retries require approval.' },
    'danger-full-access': { sandbox: 'danger-full-access', approval: 'never', description: 'Full file access without approval prompts.' },
};
/** Host permissions-unit parallel: fold the three knob events, derive the select over the fixture defaults. */
function permissionSelectOf(log) {
    var preset = null;
    var sandbox = 'workspace-write';
    var approval = 'ask';
    for (var _i = 0, log_2 = log; _i < log_2.length; _i++) {
        var event_2 = log_2[_i];
        var item = event_2;
        if (item.type === 'permission/preset')
            preset = item.data['preset'];
        else if (item.type === 'sandbox/mode')
            sandbox = item.data['mode'];
        else if (item.type === 'approval/policy')
            approval = item.data['policy'];
    }
    var matches = function (spec) { return spec.sandbox === sandbox && spec.approval === approval; };
    var currentValue = 'custom';
    var folded = preset === null ? undefined : PERMISSION_PRESETS[preset];
    if (preset !== null && folded !== undefined && matches(folded)) {
        currentValue = preset;
    }
    else {
        for (var _a = 0, _b = Object.entries(PERMISSION_PRESETS); _a < _b.length; _a++) {
            var _c = _b[_a], name_1 = _c[0], spec = _c[1];
            if (matches(spec)) {
                currentValue = name_1;
                break;
            }
        }
    }
    return {
        options: __spreadArray(__spreadArray([], Object.entries(PERMISSION_PRESETS).map(function (_a) {
            var value = _a[0], spec = _a[1];
            return ({ value: value, name: value, description: spec.description });
        }), true), currentValue === 'custom' ? [{ value: 'custom', name: 'Custom', description: 'Current sandbox and approval settings do not match a preset.' }] : [], true),
        currentValue: currentValue,
    };
}
/** Read one provider usage sample from either durable carrier. */
function usageSampleOf(event) {
    var _a;
    var item = event;
    var usage = item.type === 'assistant/chunk' && ((_a = item.data.chunk) === null || _a === void 0 ? void 0 : _a.type) === 'usage'
        ? item.data.chunk.usage
        : item.type === 'assistant/message'
            ? item.data.usage
            : undefined;
    return usage === undefined || item.data.turn === undefined || item.data.step === undefined
        ? undefined
        : { turn: item.data.turn, step: item.data.step, usage: usage };
}
/** Fixture parallel of token-meter's last-sample-replacing usage projection. */
function tokenUsageOf(log) {
    var _a, _b, _c, _d, _e, _f;
    var totals = {
        uncachedInputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
    };
    var last = null;
    for (var _i = 0, log_3 = log; _i < log_3.length; _i++) {
        var event_3 = log_3[_i];
        var sample = usageSampleOf(event_3);
        if (sample === undefined)
            continue;
        var buckets = {
            uncachedInputTokens: sample.usage.inputTokens,
            outputTokens: sample.usage.outputTokens,
            cacheReadTokens: (_a = sample.usage.cacheReadTokens) !== null && _a !== void 0 ? _a : 0,
            cacheWriteTokens: (_b = sample.usage.cacheWriteTokens) !== null && _b !== void 0 ? _b : 0,
        };
        var previous = (last === null || last === void 0 ? void 0 : last.turn) === sample.turn && last.step === sample.step
            ? last.buckets
            : undefined;
        totals.uncachedInputTokens += buckets.uncachedInputTokens - ((_c = previous === null || previous === void 0 ? void 0 : previous.uncachedInputTokens) !== null && _c !== void 0 ? _c : 0);
        totals.outputTokens += buckets.outputTokens - ((_d = previous === null || previous === void 0 ? void 0 : previous.outputTokens) !== null && _d !== void 0 ? _d : 0);
        totals.cacheReadTokens += buckets.cacheReadTokens - ((_e = previous === null || previous === void 0 ? void 0 : previous.cacheReadTokens) !== null && _e !== void 0 ? _e : 0);
        totals.cacheWriteTokens += buckets.cacheWriteTokens - ((_f = previous === null || previous === void 0 ? void 0 : previous.cacheWriteTokens) !== null && _f !== void 0 ? _f : 0);
        last = { turn: sample.turn, step: sample.step, buckets: buckets };
    }
    return totals;
}
/** Fixture parallel of session-stats' whole-log counting and wall-time fold. */
function sessionStatsOf(log) {
    var _a;
    var value = { turns: 0, steps: 0, toolCalls: 0, llmMs: 0, toolMs: 0, ttftMs: 0, ttftSteps: 0, decodeMs: 0, decodeTokens: 0 };
    var lastTurn = null;
    var openStep = null;
    var pendingCalls = new Map();
    for (var _i = 0, log_4 = log; _i < log_4.length; _i++) {
        var event_4 = log_4[_i];
        switch (event_4.type) {
            case 'step/start':
                openStep = { turn: event_4.data.turn, step: event_4.data.step, startTime: event_4.time, firstTokenTime: null };
                break;
            case 'assistant/chunk':
                if (openStep !== null && openStep.turn === event_4.data.turn && openStep.step === event_4.data.step
                    && openStep.firstTokenTime === null && (0, message_1.isTokenDelta)(event_4.data.chunk)) {
                    openStep.firstTokenTime = event_4.time;
                }
                break;
            case 'assistant/message': {
                if (openStep === null || openStep.turn !== event_4.data.turn || openStep.step !== event_4.data.step)
                    break;
                value.llmMs += Math.max(0, event_4.time - openStep.startTime);
                if (openStep.firstTokenTime !== null) {
                    value.ttftMs += Math.max(0, openStep.firstTokenTime - openStep.startTime);
                    value.ttftSteps += 1;
                    var outputTokens = (_a = event_4.data.usage) === null || _a === void 0 ? void 0 : _a.outputTokens;
                    if (typeof outputTokens === 'number' && Number.isFinite(outputTokens) && outputTokens >= 0) {
                        value.decodeMs += Math.max(0, event_4.time - openStep.firstTokenTime);
                        value.decodeTokens += outputTokens;
                    }
                }
                openStep = null;
                break;
            }
            case 'tool/call':
                value.toolCalls += 1;
                pendingCalls.set(event_4.data.callId, event_4.time);
                break;
            case 'tool/code-dispatch-start':
                value.toolCalls += 1;
                break;
            case 'tool/result': {
                var callId = event_4.data.message.source.callId;
                var dispatched = pendingCalls.get(callId);
                if (dispatched === undefined)
                    break;
                pendingCalls.delete(callId);
                value.toolMs += Math.max(0, event_4.time - dispatched);
                break;
            }
            case 'step/end':
                if (event_4.data.turn !== lastTurn) {
                    value.turns += 1;
                    lastTurn = event_4.data.turn;
                }
                value.steps += 1;
                openStep = null;
                break;
            case 'turn/end':
                pendingCalls.clear();
                break;
            default:
                break;
        }
    }
    return value;
}
/** Fixed token-meter heuristic constants mirrored by this client-only fixture. */
var CHARS_PER_TOKEN = 4;
var BLOCK_OVERHEAD = 4;
var ROLE_OVERHEAD = 4;
/** Price fixture content with token-meter's fixed-density heuristic. */
function estimateFixtureContent(blocks) {
    var densityPrice = function (value) { return Math.ceil(value.length / CHARS_PER_TOKEN); };
    return blocks.reduce(function (tokens, block) {
        if (block.type === 'text' || block.type === 'reasoning') {
            return tokens + densityPrice(block.text) + BLOCK_OVERHEAD;
        }
        if (block.type === 'tool-call') {
            return tokens + densityPrice(block.name) + densityPrice(block.arguments) + BLOCK_OVERHEAD;
        }
        // ContentBlockMap is merge-extensible: this client graph sees only the
        // base four members, but fixture turns do carry extended blocks at
        // runtime, so the structural JSON fallback below is live code.
        if (block.type === 'tool-result') {
            return tokens + estimateFixtureContent(block.content) + BLOCK_OVERHEAD;
        }
        return tokens + densityPrice(JSON.stringify(block)) + BLOCK_OVERHEAD;
    }, 0);
}
/** Fixture parallel of token-meter's heuristic context-composition projection. */
function contextBreakdownOf(log) {
    var headerEvent = log.findLast(function (event) { return event.type === 'request/header'; });
    var header = headerEvent === undefined
        ? undefined
        : headerEvent.data.header;
    var messageTokens = 0;
    for (var _i = 0, _a = (0, surface_1.foldSurface)(log).nodes; _i < _a.length; _i++) {
        var seq = _a[_i];
        var event_5 = log[seq];
        if (event_5 === undefined)
            continue;
        var message = (0, surface_1.deriveEventMessage)(event_5);
        if (message !== null)
            messageTokens += estimateFixtureContent(message.content) + ROLE_OVERHEAD;
    }
    return {
        systemTokens: (header === null || header === void 0 ? void 0 : header.system) === undefined
            ? 0
            : Math.ceil(header.system.length / CHARS_PER_TOKEN) + ROLE_OVERHEAD,
        toolsTokens: (header === null || header === void 0 ? void 0 : header.tools) === undefined || header.tools.length === 0
            ? 0
            : Math.ceil(JSON.stringify(header.tools).length / CHARS_PER_TOKEN) + BLOCK_OVERHEAD,
        messageTokens: messageTokens,
    };
}
/** Latest log-only route context, or undefined before any request ran. */
function lastRequestContext(log) {
    var event = log.findLast(function (item) { return item.type === 'request/context'; });
    return event === undefined
        ? undefined
        : event.data;
}
/**
 * Fixture parallel of token-meter's request-pressure projection: the last
 * provider-reported prompt size paired with the last recorded capacity. The
 * two need not come from one request — see the token-meter README. The host's
 * `projectedTokens` is deliberately absent: reproducing it would mean
 * reimplementing the estimator client-side, and every consumer falls back to
 * the bare sample, so a fixture-driven view simply lags a compaction the way
 * the projection did before that field existed.
 */
function contextPressureOf(log) {
    var _a, _b, _c;
    var pressureTokens;
    for (var _i = 0, log_5 = log; _i < log_5.length; _i++) {
        var event_6 = log_5[_i];
        var sample = usageSampleOf(event_6);
        if (sample === undefined)
            continue;
        pressureTokens = sample.usage.inputTokens
            + ((_a = sample.usage.cacheReadTokens) !== null && _a !== void 0 ? _a : 0)
            + ((_b = sample.usage.cacheWriteTokens) !== null && _b !== void 0 ? _b : 0);
    }
    var contextWindow = (_c = lastRequestContext(log)) === null || _c === void 0 ? void 0 : _c.contextWindow;
    return __assign(__assign({}, pressureTokens === undefined ? {} : { pressureTokens: pressureTokens }), contextWindow === undefined ? {} : { contextWindow: contextWindow });
}
function projectionValuesOf(log) {
    var _a;
    var values = {};
    var titleEvent = log.findLast(function (item) { return item.type === 'session/title'; });
    if (titleEvent !== undefined) {
        values['title'] = titleEvent.data.title;
    }
    // Always present (tool-todo unit composed): null when no plan stands.
    values['todos'] = (_a = backscanTodos(log)) !== null && _a !== void 0 ? _a : null;
    // Always present (permission service composed): the whole select.
    values['permissions'] = permissionSelectOf(log);
    // Always present (plan-mode unit composed): the {active, pending} view.
    values['plan'] = planViewOf(log);
    // Always present (GoalService unit composed): null before create / after clear.
    values['goal'] = backscanGoal(log);
    // Always present (token-meter composed): full-log provider billing.
    values['tokenUsage'] = tokenUsageOf(log);
    // Always present (token-meter composed): last request pressure and capacity.
    values['contextPressure'] = contextPressureOf(log);
    // Always present (token-meter composed): heuristic request composition.
    values['contextBreakdown'] = contextBreakdownOf(log);
    // Always present (session-stats unit composed): whole-log turn/step counts.
    values['sessionStats'] = sessionStatsOf(log);
    // Always present (attachment service composed): the deployment image
    // limits, constant per boot (mirrors the attachment-local defaults).
    // Deliberate host divergence: the real gateway never pushes an imageLimits
    // change frame (constant unit), but the fixture's uniform baseline replay
    // frames every key here, incidentally exercising higher-seq-wins.
    values['imageLimits'] = {
        maxImageBytes: 5 * 1024 * 1024,
        maxImagesPerMessage: 20,
        maxMessageImageBytes: 100 * 1024 * 1024,
        maxImagePixels: 40000000,
        maxImageDimension: 2000,
        mediaTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
    };
    return values;
}
/** Host push-frame parallel: emit one session/projection frame per key the given event advanced. */
function projectionFramesOf(id, log, event) {
    var _a;
    var type = event.type;
    var frames = [];
    // One usage sample advances both token-meter units.
    if (usageSampleOf(event) !== undefined) {
        frames.push({ type: 'session/projection', sessionId: id, key: 'tokenUsage', value: tokenUsageOf(log), seq: event.seq }, { type: 'session/projection', sessionId: id, key: 'contextPressure', value: contextPressureOf(log), seq: event.seq });
    }
    if (type === 'request/context') {
        frames.push({
            type: 'session/projection',
            sessionId: id,
            key: 'contextPressure',
            value: contextPressureOf(log),
            seq: event.seq,
        });
    }
    if (type === 'request/header'
        || type === 'user/message'
        || type === 'assistant/message'
        || type === 'tool/result') {
        frames.push({
            type: 'session/projection',
            sessionId: id,
            key: 'contextBreakdown',
            value: contextBreakdownOf(log),
            seq: event.seq,
        });
    }
    // The stats fold's view advances on message assembly and tool settlement
    // (wall times) and on step close (counts).
    if (type === 'assistant/message' || type === 'tool/result' || type === 'step/end') {
        frames.push({
            type: 'session/projection',
            sessionId: id,
            key: 'sessionStats',
            value: sessionStatsOf(log),
            seq: event.seq,
        });
    }
    if (frames.length > 0)
        return frames;
    if (type === 'session/title') {
        var values = projectionValuesOf(log);
        /* v8 ignore next -- the advancing title event is in the log, so the key is present. */
        if (!Object.hasOwn(values, 'title'))
            return [];
        return [{ type: 'session/projection', sessionId: id, key: 'title', value: values['title'], seq: event.seq }];
    }
    // The goal domain's own durable change advances its projection.
    if (type === 'goal/change') {
        return [{ type: 'session/projection', sessionId: id, key: 'goal', value: backscanGoal(log), seq: event.seq }];
    }
    // Standing-plan fold: writes replace the list; turn/start clears it (null).
    if (type === 'todo/write' || type === 'turn/start') {
        return [{
                type: 'session/projection',
                sessionId: id,
                key: 'todos',
                value: (_a = backscanTodos(log)) !== null && _a !== void 0 ? _a : null,
                seq: event.seq,
            }];
    }
    // Knob fold: any of the three whole-value knob events advances the select.
    if (type === 'permission/preset' || type === 'sandbox/mode' || type === 'approval/policy') {
        return [{
                type: 'session/projection',
                sessionId: id,
                key: 'permissions',
                value: permissionSelectOf(log),
                seq: event.seq,
            }];
    }
    // The plan unit advances on its two folded event kinds when the command
    // lifecycle contains the input that represents a plan selection.
    var commandData = event;
    if (type === 'plan/mode' || (type === 'command/run'
        && commandData.data.name === 'plan' && typeof commandData.data.args === 'string')) {
        return [{
                type: 'session/projection',
                sessionId: id,
                key: 'plan',
                value: planViewOf(log),
                seq: event.seq,
            }];
    }
    return [];
}
/**
 * Message-boundary paging (mirrors the host's paging contract): count
 * maxMessages messages
 *  backwards from end, cut at a turn/start boundary.
 Entries carry pagination-time views
 *  (the host analogue computes viewFor per entry at page time). */
function pageOf(log, beforeSeq, maxMessages) {
    var end = beforeSeq === undefined ? log.length : Math.max(0, Math.min(beforeSeq, log.length));
    var start = 0;
    var messages = 0;
    for (var i = end - 1; i >= 0; i--) {
        var event_7 = log[i];
        /* v8 ignore next -- dense-array guard: log seqs are array indexes, i stays within [0, end). */
        if (event_7 === undefined)
            break;
        if (event_7.type === 'user/message' || event_7.type === 'assistant/message')
            messages++;
        if (event_7.type === 'turn/start' && messages >= maxMessages) {
            start = i;
            break;
        }
    }
    var events = log.slice(start, end).map(function (event) {
        var view = viewFor(event, log);
        return view === undefined ? { event: event } : { event: event, view: view };
    });
    return { events: events, hasMore: start > 0 };
}
/** Fixture mirror of host session-scoped attachment authorization. */
function logReferencesAttachment(log, attachmentId) {
    var visit = function (value) {
        if (Array.isArray(value))
            return value.some(visit);
        if (typeof value !== 'object' || value === null)
            return false;
        var record = value;
        if (record.attachmentId === attachmentId)
            return true;
        return Object.values(record).some(visit);
    };
    return log.some(function (event) { return visit(event.data); });
}
/** Fixture mirror of first-party message extraction used by session-query. */
function searchBlockText(block) {
    switch (block.type) {
        case 'text':
            return [block.text];
        case 'reasoning':
            return [];
        case 'tool-call':
            return [block.name, block.arguments];
        case 'tool-result':
            return block.content.flatMap(searchBlockText);
        default:
            return [];
    }
}
/** One current-surface user/assistant document, if searchable. */
function searchEventText(event) {
    var content = event.type === 'user/message'
        ? event.data.content
        : event.type === 'assistant/message'
            ? event.data.message.content
            : undefined;
    if (content === undefined)
        return '';
    return content.flatMap(searchBlockText).map(function (part) { return part.trim(); }).filter(Boolean).join('\n');
}
/**
 * Browser-safe approximation of SQLite FTS5 unicode61 token boundaries.
 * Keeping phrase matching token-based prevents the development fixture from
 * promising arbitrary within-token substring behavior that production lacks.
 */
function searchTokenSpans(value) {
    var text = value.replace(/\s+/gu, ' ').trim();
    var characters = Array.from(text);
    var tokens = [];
    var start;
    var raw = '';
    var flush = function (end) {
        if (start !== undefined) {
            var folded = raw.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase();
            if (folded !== '')
                tokens.push({ value: folded, start: start, end: end });
        }
        start = undefined;
        raw = '';
    };
    for (var index = 0; index < characters.length; index++) {
        var character = characters[index];
        var tokenBase = character.normalize('NFD').replace(/\p{M}+/gu, '');
        if (tokenBase === '') {
            if (start !== undefined)
                raw += character;
            continue;
        }
        if (/^[\p{L}\p{N}\p{Co}]+$/u.test(tokenBase)) {
            start !== null && start !== void 0 ? start : (start = index);
            raw += character;
        }
        else {
            flush(index);
        }
    }
    flush(characters.length);
    return { text: text, tokens: tokens };
}
/** Count exact contiguous token-phrase occurrences and retain the first display span. */
function phraseMatch(document, phrase) {
    var _a, _b, _c, _d;
    if (phrase.length === 0 || phrase.length > document.length)
        return { count: 0, start: 0, end: 0 };
    var count = 0;
    var firstStart = 0;
    var firstEnd = 0;
    var _loop_1 = function (start) {
        if (!phrase.every(function (token, offset) { var _a; return ((_a = document[start + offset]) === null || _a === void 0 ? void 0 : _a.value) === token; }))
            return "continue";
        count++;
        if (count === 1) {
            firstStart = (_b = (_a = document[start]) === null || _a === void 0 ? void 0 : _a.start) !== null && _b !== void 0 ? _b : 0;
            firstEnd = (_d = (_c = document[start + phrase.length - 1]) === null || _c === void 0 ? void 0 : _c.end) !== null && _d !== void 0 ? _d : firstStart;
        }
    };
    for (var start = 0; start <= document.length - phrase.length; start++) {
        _loop_1(start);
    }
    return { count: count, start: firstStart, end: firstEnd };
}
/** Match-centered fixture excerpt, bounded by Unicode code points for the sidebar. */
function searchSnippet(value, matchStart, matchEnd) {
    var characters = Array.from(value);
    if (characters.length <= 120)
        return value;
    var boundedStart = Math.min(Math.max(0, matchStart), characters.length - 1);
    var boundedEnd = Math.min(characters.length, Math.max(boundedStart + 1, matchEnd));
    var center = Math.floor((boundedStart + boundedEnd) / 2);
    var start = Math.min(characters.length - 118, Math.max(0, center - Math.floor(118 / 2)));
    var end = start + 118;
    if (start === 0) {
        end = 119;
    }
    else if (end === characters.length) {
        start = characters.length - 119;
    }
    return "".concat(start > 0 ? '…' : '').concat(characters.slice(start, end).join('')).concat(end < characters.length ? '…' : '');
}
/** Mirrors `packages/session-query/session-query-sqlite/src/index.ts`; update both together. */
function compareSearchCandidates(a, b) {
    if (a.matchCount !== b.matchCount)
        return b.matchCount - a.matchCount;
    if (a.documentLength !== b.documentLength)
        return a.documentLength - b.documentLength;
    if (a.time !== b.time)
        return b.time - a.time;
    if (a.sessionId !== b.sessionId)
        return a.sessionId < b.sessionId ? -1 : 1;
    return b.seq - a.seq;
}
/**
 * Current plan projection over the full log (host parallel: latest todo/write
 * with no later turn/start; a new turn retires the previous plan).
 */
function backscanTodos(log) {
    for (var i = log.length - 1; i >= 0; i--) {
        var event_8 = log[i];
        if (event_8 === undefined)
            continue;
        if (event_8.type === 'turn/start')
            return undefined;
        if (event_8.type === 'todo/write')
            return event_8.data.todos;
    }
    return undefined;
}
/**
 * Current goal projection over the full log (host parallel: the GoalService
 * unit's last-wins fold of goal/change whole values; clear returns null).
 */
function backscanGoal(log) {
    for (var i = log.length - 1; i >= 0; i--) {
        var event_9 = log[i];
        if (event_9 === undefined || event_9.type !== 'goal/change' || event_9.data === undefined)
            continue;
        var change = event_9.data;
        if (change.operation === 'clear')
            return null;
        return { goal: change.goal, roundsStarted: change.roundsStarted, createdAt: change.createdAt, updatedAt: change.updatedAt };
    }
    return null;
}
/** Inbox pump shared by both stream generators (FrameQueue pattern: ONE abort listener hung
 *  outside the loop — a per-iteration {once:true} listener never fires for non-final rounds and
 *  piles up for the stream's lifetime). breakNow force-ends the stream without the
 *  client's signal (timing hook: simulated connection loss). */
var FxInbox = /** @class */ (function () {
    function FxInbox() {
        this.inbox = [];
        this.wake = null;
        this.broken = false;
    }
    FxInbox.prototype.push = function (envelope) {
        var _a;
        this.inbox.push(envelope);
        (_a = this.wake) === null || _a === void 0 ? void 0 : _a.call(this);
    };
    FxInbox.prototype.breakNow = function () {
        var _a;
        this.broken = true;
        (_a = this.wake) === null || _a === void 0 ? void 0 : _a.call(this);
    };
    /** Read through a method: breakNow()/abort flip state across yields, so narrowing from the loop condition must not stick. */
    FxInbox.prototype.isLive = function (signal) {
        return !signal.aborted && !this.broken;
    };
    FxInbox.prototype.drain = function (signal) {
        return __asyncGenerator(this, arguments, function drain_1() {
            var onAbort;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        onAbort = function () { var _a; return (_a = _this.wake) === null || _a === void 0 ? void 0 : _a.call(_this); };
                        signal.addEventListener('abort', onAbort);
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, , 9, 10]);
                        _a.label = 2;
                    case 2:
                        if (!this.isLive(signal)) return [3 /*break*/, 8];
                        _a.label = 3;
                    case 3:
                        if (!(this.inbox.length > 0)) return [3 /*break*/, 6];
                        return [4 /*yield*/, __await(this.inbox.shift())];
                    case 4: return [4 /*yield*/, _a.sent()];
                    case 5:
                        _a.sent();
                        return [3 /*break*/, 3];
                    case 6:
                        if (!this.isLive(signal))
                            return [3 /*break*/, 8];
                        return [4 /*yield*/, __await(new Promise(function (resolve) {
                                _this.wake = resolve;
                            }))];
                    case 7:
                        _a.sent();
                        this.wake = null;
                        return [3 /*break*/, 2];
                    case 8: return [3 /*break*/, 10];
                    case 9:
                        signal.removeEventListener('abort', onAbort);
                        return [7 /*endfinally*/];
                    case 10: return [2 /*return*/];
                }
            });
        });
    };
    return FxInbox;
}());
/**
 * In-memory fake host: fx-alpha carries history and replay scripts; fx-beta is fx-alpha's child session (lineage indent material).
 * @param options - fixture branches for empty state and failure timing.
 * @returns an ApiProxy backed entirely by in-memory state — no host process, no network.
 */
function createFixtureApi(options) {
    if (options === void 0) { options = {}; }
    return createFixtureWorld(options).api;
}
/**
 * Build both fixture faces so a caller can drive the Remote endpoints and the
 * legacy API against one in-memory state graph.
 * @param options - fixture branches for empty state and failure timing.
 * @returns the legacy API face and the Remote RPC face.
 */
function createFixtureFaces(options) {
    if (options === void 0) { options = {}; }
    return createFixtureWorld(options);
}
/** Build the fixture's legacy API and Remote RPC faces over one state graph. */
function createFixtureWorld(options) {
    var _this = this;
    // The resident fixture sessions all carry history, so none of them is blank.
    var sessions = options.empty ? [] : [
        { sessionId: sid('fx-alpha'), updatedAt: Date.now(), running: true, blank: false, cwd: '/tmp/fixture' },
        { sessionId: sid('fx-beta'), updatedAt: Date.now() - 60000, running: false, blank: false, parentSessionId: sid('fx-alpha'), cwd: '/tmp/fixture' },
        { sessionId: sid('fx-gamma'), updatedAt: Date.now() - 120000, running: false, blank: false, cwd: '/tmp/fixture' },
    ];
    var logs = new Map([[sid('fx-alpha'), buildAlphaLog()]]);
    var modelSelections = new Map(sessions.map(function (session) { return [
        session.sessionId,
        { provider: 'deepseek-official', model: 'deepseek-v4-flash' },
    ]; }));
    var attachments = new Map([[
            String(FIXTURE_IMAGE_REF.attachmentId),
            { attachment: FIXTURE_IMAGE_REF, data: FIXTURE_IMAGE_DATA },
        ]]);
    /** Credential store double: set/unset flip the describe badge, values never read back. */
    var fixtureCredentials = new Map([
        // The assembled fixture represents an already-configured shipped
        // DeepSeek route so unrelated GUI journeys do not enter first-run setup.
        ['DEEPSEEK_API_KEY', true],
    ]);
    /**
     * Preset compositions the fixture serves. Held as state rather than
     * constants so the settings editor's save and delete are exercisable: the
     * roster a GUI journey sees after writing is the text it wrote.
     */
    var fixturePresets = new Map([
        ['standard', { trust: 'system', content: "- id: tool-bash\n  name: '@z/dsh-tool-bash'\n" }],
        ['minimal', { trust: 'system', content: "- id: tool-web-search\n  name: '@z/dsh-tool-web-search'\n" }],
        ['my-agent', { trust: 'user', content: "- id: tool-read\n  name: '@z/dsh-tool-read'\n" }],
    ]);
    var fixtureDefaultPreset = 'standard';
    var nextTurn = new Map([[sid('fx-alpha'), 75]]);
    var nextSession = 1;
    var nextRpc = 1;
    var attachedSessions = options.empty ? 0 : 1;
    // Workspace entities mirroring the host registry: the fixture sessions all
    // live under one workspace, whose account carries them in attach order.
    var wid = function (raw) { return raw; };
    var fixtureEpoch = new Date(Date.now() - 300000).toISOString();
    var FIXTURE_HOME = '/home/fixture';
    var workspaces = options.empty ? [] : [{
            workspaceId: wid('fx-ws-fixture'),
            path: '/tmp/fixture',
            title: 'fixture',
            sessionIds: [sid('fx-alpha'), sid('fx-beta'), sid('fx-gamma')],
            createdAt: fixtureEpoch,
            updatedAt: fixtureEpoch,
        }, {
            workspaceId: wid('fx-ws-home'),
            path: "".concat(FIXTURE_HOME, "/Documents/project"),
            title: 'project',
            sessionIds: [],
            createdAt: fixtureEpoch,
            updatedAt: fixtureEpoch,
        }];
    var nextWorkspace = 1;
    // Registry-global archive set mirroring the host: archived sessions keep
    // their workspace accounting slot and only grouping surfaces hide them.
    var archivedSessionIds = [];
    // In-memory browse tree behind the fixture's `browse` picker capability —
    // deterministic content mirroring the design mock so assembled Web tests
    // and snapshots can walk it. Leaves are materialized lazily: a child listed
    // by its parent lists as empty until something is created inside it.
    var directoryTree = new Map([
        ['/', ['home']],
        ['/home', ['fixture']],
        [FIXTURE_HOME, ['Documents', 'Downloads', '.config']],
        ["".concat(FIXTURE_HOME, "/Documents"), [
                'project', 'deepseek-iOS', 'deepseek-android', 'deepseek-platform',
                'deepseek-web', 'deepseek-harness', 'deepseek-app', 'deepseek-landing-blog',
            ]],
    ]);
    var childrenOf = function (path) {
        var _a;
        var known = directoryTree.get(path);
        if (known !== undefined)
            return known;
        var parent = path.slice(0, path.lastIndexOf('/')) || '/';
        var name = path.slice(path.lastIndexOf('/') + 1);
        return ((_a = directoryTree.get(parent)) === null || _a === void 0 ? void 0 : _a.includes(name)) === true ? [] : undefined;
    };
    var crumbsOf = function (path) {
        var crumbs = [{ name: '/', path: '/', hidden: false }];
        var acc = '';
        for (var _i = 0, _a = path.split('/').filter(Boolean); _i < _a.length; _i++) {
            var segment = _a[_i];
            acc += "/".concat(segment);
            crumbs.push({ name: segment, path: acc, hidden: false });
        }
        return crumbs;
    };
    var mint = function () { return (0, api_ts_1.RpcId)("fx-rpc-".concat(nextRpc++)); };
    /** Resident pending approval (stable rpcId: every mux open replays the same id while unanswered, matching host replay semantics). */
    var pendingApprovalRpcId = mint();
    var pendingApprovalId = 'fx-approval-1';
    /** Cleared once answered through respond; replay stops and approval/resolved is broadcast. */
    var approvalPending = true;
    var pendingQuestionRpcId = mint();
    var questionPending = true;
    var fixtureQuestions = [
        {
            id: 'harness-profile',
            header: '偏好',
            question: '你现在更想招哪类 Agent/Harness 候选人？',
            options: [
                { label: '工程落地型 (Recommended)', description: '更看重能直接做 runtime、tool executor、sandbox、trace 和线上问题排查。' },
                { label: '研究潜力型', description: '更看重 Agent 理解、训练评测思路和长期成长空间。' },
                { label: '均衡型', description: '同时要求工程能力和 Agent 认知，但可能筛选门槛更高。' },
            ],
        },
        {
            id: 'work-mode',
            header: '方式',
            question: '你希望候选人优先展示哪种工作方式？',
            options: [
                { label: '先做小型原型 (Recommended)', description: '用可运行结果尽快验证关键假设。' },
                { label: '先写完整设计', description: '先收敛边界、协议和风险，再开始实现。' },
            ],
        },
        {
            id: 'signals',
            header: '信号',
            question: '哪些面试信号最重要？',
            detail: '按当前招聘目标选择；跳过则视为不设偏好。',
            multiSelect: true,
            options: [
                { label: '系统设计' },
                { label: '代码质量' },
                { label: 'Agent 产品判断' },
            ],
        },
    ];
    var muxConns = new Set();
    var hostConns = new Set();
    var emitMux = function (frame) {
        for (var _i = 0, muxConns_1 = muxConns; _i < muxConns_1.length; _i++) {
            var conn = muxConns_1[_i];
            conn.push({ rpcId: mint(), payload: frame });
        }
    };
    var emitHost = function (frame) {
        for (var _i = 0, hostConns_1 = hostConns; _i < hostConns_1.length; _i++) {
            var conn = hostConns_1[_i];
            conn.push({ rpcId: mint(), payload: frame });
        }
    };
    /** OK response echoing the caller's rpcId (contract: responses always backfill, never mint). */
    function ok(request, value) {
        return Promise.resolve({ rpcId: request.rpcId, result: { ok: true, value: value } });
    }
    function err(request, error) {
        return Promise.resolve({ rpcId: request.rpcId, result: { ok: false, error: error } });
    }
    var summaryOf = function (id) { return sessions.find(function (s) { return s.sessionId === id; }); };
    /** Shared session guard for sessionId-addressed catalog routes: the error
     *  response when the session is unknown, undefined when it exists. */
    var requireSession = function (request) {
        if (summaryOf(request.payload.sessionId) !== undefined)
            return undefined;
        return err(request, {
            code: 'session-not-found',
            message: "no session ".concat(request.payload.sessionId),
            details: { sessionId: request.payload.sessionId },
        });
    };
    var setRunning = function (id, running) {
        var summary = summaryOf(id);
        if (summary === undefined || summary.running === running)
            return;
        summary.running = running;
        emitHost({ type: 'host/session-status', sessionId: id, running: running });
    };
    var logOf = function (id) {
        var log = logs.get(id);
        if (log === undefined) {
            log = [];
            logs.set(id, log);
        }
        return log;
    };
    var append = function (id, e) {
        var log = logOf(id);
        var event = __assign({ seq: log.length, time: Date.now() }, e);
        log.push(event);
        // Emission-time view derivation (mirrors the host's live path).
        var view = viewFor(event, log);
        /* v8 ignore next 3 -- the view-present arm needs a live tool/call emission,
        but the fixture replay produces text-only turns; view vocabulary is
        exercised through the history samples (turns 60-62). */
        emitMux(view === undefined
            ? { type: 'session/event', sessionId: id, event: event }
            : { type: 'session/event', sessionId: id, event: event, view: view });
        // Host eager-drive parallel: a unit-advancing event pushes its finished value.
        for (var _i = 0, _a = projectionFramesOf(id, log, event); _i < _a.length; _i++) {
            var frame = _a[_i];
            emitMux(frame);
        }
    };
    /** Append one durable goal/change (host GoalService parallel). */
    var appendGoalChange = function (id, change) {
        var log = logOf(id);
        append(id, {
            type: 'goal/change',
            data: change,
        });
        return backscanGoal(log);
    };
    var goalFailure = function (message) { return ({
        ok: false,
        error: { code: 'internal', message: message, details: {} },
    }); };
    var requireGoalSession = function (id) { return (summaryOf(id) === undefined
        ? { ok: false, error: { code: 'session-not-found', message: "no session ".concat(id), details: { sessionId: id } } }
        : undefined); };
    /** Canonical fixture implementation of the generated Commands Remote contract. */
    var commandRemotes = {
        list: function (id) {
            var missing = requireGoalSession(id);
            if (missing !== undefined)
                return missing;
            return {
                ok: true,
                value: [
                    { name: 'compact', description: 'fixture：压缩当前会话上下文' },
                    { name: 'echo', description: 'fixture：回显参数', input: { hint: 'text to echo' } },
                    { name: 'goal', description: 'set or view the goal for a long-running task', input: { hint: '<objective>', images: true } },
                    { name: 'permission', description: 'Switch the permission preset (sandbox mode + approval policy)', input: { hint: '<preset>' } },
                    { name: 'plan', description: 'Enter or leave plan mode', input: { hint: '[off|message]', images: true } },
                ],
            };
        },
        execute: function (id, line, images) {
            var _a, _b;
            if (images === void 0) { images = []; }
            var missing = requireGoalSession(id);
            if (missing !== undefined)
                return missing;
            // Structured split mirroring the Host parser: name + verbatim rawInput
            // (separator whitespace included) — the run payload carries no line.
            var match = /^\/(\S+)((?:\s.*)?)$/.exec(line.trim());
            var name = match === null || match === void 0 ? void 0 : match[1];
            var args = (_a = match === null || match === void 0 ? void 0 : match[2]) !== null && _a !== void 0 ? _a : '';
            // Mirror the Host image policy AFTER command resolution, matching the
            // executor's order (an unknown name answers undefined and logs no
            // lifecycle): the declaration rejection covers every known command
            // without `input.images`, and the two producer grammar rejections cover
            // the declaring commands' control-only lines. The fixture stores no
            // bytes, so an accepted batch is acknowledged and dropped.
            var known = ['permission', 'goal', 'compact', 'echo', 'plan'];
            if (images.length > 0 && name !== undefined && known.includes(name)) {
                var rejection = name !== 'goal' && name !== 'plan'
                    ? "/".concat(name, " does not accept image attachments")
                    : name === 'goal' && args.trim() === ''
                        ? 'Image attachments only accompany a goal objective: /goal <objective> or /goal edit <objective>.'
                        : name === 'plan' && args.trim() === 'off'
                            ? 'Image attachments cannot accompany /plan off.'
                            : undefined;
                if (rejection !== undefined) {
                    var commandId_1 = "fx-cmd-".concat(logOf(id).length);
                    append(id, { type: 'command/run', data: { commandId: commandId_1, name: name, args: args, source: { kind: 'user' } } });
                    var result_1 = { kind: 'error', text: rejection };
                    append(id, { type: 'command/done', data: __assign({ commandId: commandId_1 }, result_1) });
                    return { ok: true, value: { commandId: commandId_1, result: result_1 } };
                }
            }
            if (name === 'permission') {
                var preset = args.trim();
                var commandId_2 = "fx-cmd-".concat(logOf(id).length);
                append(id, { type: 'command/run', data: { commandId: commandId_2, name: name, args: args, source: { kind: 'user' } } });
                var spec = PERMISSION_PRESETS[preset];
                var result_2;
                if (preset === '') {
                    var current = permissionSelectOf(logOf(id)).currentValue;
                    result_2 = { kind: 'success', text: "current preset ".concat(current, " (available: ").concat(Object.keys(PERMISSION_PRESETS).join(', '), ")") };
                }
                else if (spec === undefined) {
                    result_2 = { kind: 'error', text: "unknown preset \"".concat(preset, "\" (available: ").concat(Object.keys(PERMISSION_PRESETS).join(', '), ")") };
                }
                else {
                    if (permissionSelectOf(logOf(id)).currentValue !== preset)
                        append(id, { type: 'permission/preset', data: { preset: preset } });
                    append(id, { type: 'sandbox/mode', data: { mode: spec.sandbox } });
                    append(id, { type: 'approval/policy', data: { policy: spec.approval } });
                    result_2 = { kind: 'success', text: "preset ".concat(preset) };
                }
                append(id, { type: 'command/done', data: __assign({ commandId: commandId_2 }, result_2) });
                return { ok: true, value: { commandId: commandId_2, result: result_2 } };
            }
            if (name === 'goal') {
                var commandId_3 = "fx-cmd-".concat(logOf(id).length);
                append(id, { type: 'command/run', data: { commandId: commandId_3, name: name, args: args, source: { kind: 'user' } } });
                var objective = args.trim();
                var current = backscanGoal(logOf(id));
                var text_1;
                if (objective === '') {
                    text_1 = current === null ? 'No goal is set. Usage: /goal <objective>' : "Current goal: ".concat(current.goal.objective);
                }
                else if (current !== null && current.goal.phase !== 'complete') {
                    text_1 = "A goal already exists (".concat(current.goal.objective, "). Clear it first.");
                }
                else {
                    var created = appendGoalChange(id, {
                        kind: 'goal/change', version: 1, operation: 'create',
                        goal: { id: "fx-goal-".concat(logOf(id).length), revision: 1, objective: objective, phase: 'active', maxGoalRounds: 256 },
                        roundsStarted: 0, createdAt: Date.now(), updatedAt: Date.now(),
                    });
                    text_1 = "Goal created: ".concat(created.goal.objective);
                }
                var result_3 = { kind: 'success', text: text_1 };
                append(id, { type: 'command/done', data: __assign({ commandId: commandId_3 }, result_3) });
                return { ok: true, value: { commandId: commandId_3, result: result_3 } };
            }
            var running = ((_b = summaryOf(id)) === null || _b === void 0 ? void 0 : _b.running) === true;
            var outcomes = {
                compact: 'fixture：已压缩（假动作）',
                echo: args.trim(),
                plan: args.trim() === 'off'
                    ? (running ? 'Leaving plan mode (applies from the next step).' : 'Plan mode off.')
                    : (running
                        ? 'Entering plan mode (applies from the next step). Use /plan off to leave.'
                        : 'Plan mode on. Use /plan off to leave.'),
            };
            var text = name === undefined ? undefined : outcomes[name];
            if (name === undefined || text === undefined)
                return { ok: true, value: undefined };
            var commandId = "fx-cmd-".concat(logOf(id).length);
            append(id, { type: 'command/run', data: { commandId: commandId, name: name, args: args, source: { kind: 'user' } } });
            if (name === 'plan' && !running) {
                var plan = foldPlan(logOf(id));
                if (plan.wanted !== null && plan.wanted !== plan.active) {
                    append(id, { type: 'plan/mode', data: { active: plan.wanted } });
                }
            }
            var result = __assign({ kind: 'success' }, text === '' ? {} : { text: text });
            append(id, { type: 'command/done', data: __assign({ commandId: commandId }, result) });
            return { ok: true, value: { commandId: commandId, result: result } };
        },
    };
    var goalView = function (projection) { return (__assign(__assign({}, projection.goal), { roundsStarted: projection.roundsStarted, createdAt: projection.createdAt, updatedAt: projection.updatedAt, activation: projection.goal.phase === 'active' ? 'armed' : 'disarmed' })); };
    /** Canonical fixture implementation of the generated Goal Remote contract. */
    /** Canonical fixture implementation of the generated reference-discovery Remote contracts. */
    var referenceRemotes = {
        files: function (id, query) {
            var missing = requireGoalSession(id);
            if (missing !== undefined)
                return missing;
            var needle = query.toLocaleLowerCase();
            var items = [
                { path: 'notes', kind: 'directory' },
                { path: 'README.md', kind: 'file' },
                { path: 'notes/demo.txt', kind: 'file' },
            ].filter(function (item) { return item.path.toLocaleLowerCase().includes(needle); });
            return { ok: true, value: items };
        },
        sessions: function (id, query) {
            var missing = requireGoalSession(id);
            if (missing !== undefined)
                return missing;
            var needle = query.toLocaleLowerCase();
            var value = sessions
                .filter(function (item) { return item.sessionId !== id; })
                .filter(function (item) {
                var _a;
                return String(item.sessionId).toLocaleLowerCase().includes(needle)
                    || ((_a = item.cwd) === null || _a === void 0 ? void 0 : _a.toLocaleLowerCase().includes(needle)) === true;
            })
                .map(function (item) {
                var label = item.sessionId === sid('fx-beta') ? 'Fixture child session' : String(item.sessionId);
                var encoded = btoa(JSON.stringify(item.sessionId))
                    .replaceAll('+', '-')
                    .replaceAll('/', '_')
                    .replace(/=+$/u, '');
                return __assign(__assign({ sessionId: item.sessionId, label: label }, item.cwd === undefined ? {} : { cwd: item.cwd }), { createdAt: item.updatedAt, mention: "@[".concat(label, "](dsh-session:").concat(encoded, ")") });
            });
            return { ok: true, value: value };
        },
    };
    var goalRemotes = {
        create: function (id, request) {
            var _a;
            var missing = requireGoalSession(id);
            if (missing !== undefined)
                return missing;
            var current = backscanGoal(logOf(id));
            if (current !== null && current.goal.phase !== 'complete') {
                return goalFailure("goal \"".concat(current.goal.id, "\" already exists"));
            }
            var now = Date.now();
            var projection = appendGoalChange(id, {
                kind: 'goal/change', version: 1, operation: 'create',
                goal: {
                    id: "fx-goal-".concat(logOf(id).length),
                    revision: 1,
                    objective: request.objective,
                    phase: 'active',
                    maxGoalRounds: (_a = request.maxGoalRounds) !== null && _a !== void 0 ? _a : 256,
                },
                roundsStarted: 0, createdAt: now, updatedAt: now,
            });
            return { ok: true, value: { ref: { id: projection.goal.id, revision: projection.goal.revision } } };
        },
        edit: function (id, ref, request) {
            return mutateGoal(id, ref, function (current) { return (__assign(__assign(__assign(__assign({}, current.goal), { revision: current.goal.revision + 1 }), request.objective === undefined ? {} : { objective: request.objective }), request.maxGoalRounds === undefined ? {} : { maxGoalRounds: request.maxGoalRounds })); });
        },
        pause: function (id, ref) {
            return mutateGoal(id, ref, function (current) { return (current.goal.phase === 'active'
                ? __assign(__assign({}, current.goal), { revision: current.goal.revision + 1, phase: 'paused' }) : undefined); });
        },
        resume: function (id, ref) {
            return mutateGoal(id, ref, function (current) { return (current.goal.phase === 'paused' || current.goal.phase === 'blocked' || current.goal.phase === 'active'
                ? __assign(__assign({}, current.goal), { revision: current.goal.revision + 1, phase: 'active' }) : undefined); });
        },
        complete: function (id, ref) {
            return mutateGoal(id, ref, function (current) { return (current.goal.phase === 'complete'
                ? undefined
                : __assign(__assign({}, current.goal), { revision: current.goal.revision + 1, phase: 'complete' })); });
        },
        clear: function (id, ref) {
            var resolved = resolveGoal(id, ref);
            if (!resolved.ok)
                return resolved;
            var current = resolved.value;
            var tombstone = { id: current.goal.id, revision: current.goal.revision + 1 };
            appendGoalChange(id, {
                kind: 'goal/change', version: 1, operation: 'clear', cleared: tombstone, clearedAt: Date.now(),
            });
            return { ok: true, value: tombstone };
        },
    };
    /** Resolve one current goal revision for a canonical Remote mutation. */
    function resolveGoal(id, ref) {
        var missing = requireGoalSession(id);
        if (missing !== undefined)
            return missing;
        var current = backscanGoal(logOf(id));
        if (current === null || current.goal.id !== ref.id || current.goal.revision !== ref.revision) {
            return goalFailure('stale or missing goal revision');
        }
        return { ok: true, value: current };
    }
    /** Shared CAS mutation path behind the canonical Remote verbs. */
    function mutateGoal(id, ref, next) {
        var resolved = resolveGoal(id, ref);
        if (!resolved.ok)
            return resolved;
        var current = resolved.value;
        var goal = next(current);
        if (goal === undefined) {
            return goalFailure("invalid goal transition from \"".concat(current.goal.phase, "\""));
        }
        var projection = appendGoalChange(id, {
            kind: 'goal/change', version: 1,
            operation: goal.phase === current.goal.phase ? 'edit' : goal.phase === 'paused' ? 'pause' : goal.phase === 'active' ? 'resume' : 'complete',
            goal: goal,
            roundsStarted: current.roundsStarted, createdAt: current.createdAt, updatedAt: Date.now(),
        });
        return { ok: true, value: goalView(projection) };
    }
    var mapGoalResult = function (result, map) { return (result.ok ? { ok: true, value: map(result.value) } : result); };
    var goalRefResult = function (result) { return (mapGoalResult(result, function (view) { return ({ ref: { id: view.id, revision: view.revision } }); })); };
    var legacyGoalResponse = function (request, result) { return (Promise.resolve({ rpcId: request.rpcId, result: result })); };
    /** At most one in-flight replay per session; cancel clears it. */
    var replays = new Map();
    /** history transit delay (timing hooks below); the page snapshot is taken at request time, like a real host. */
    var historyDelayMs = 0;
    /** One-shot history failure (timing hook: a pre-disconnect history request already doomed when reconnect lands). */
    var failNextHistory = false;
    /** Force-enders for currently open stream generators (timing hook: simulated connection loss). */
    var streamBreakers = new Set();
    /** Retry scenarios opened by timing hooks and completed in a later browser assertion phase. */
    var retryScenarios = new Map();
    /** The single opt-in browser stress producer; normal fixture journeys never start it. */
    var activeReasoningChunkStorm = null;
    // Timing-acceptance hooks (browser test backdoor): the in-memory fixture is
    // ideally timed. These let
    // browser acceptance runs create slow-history, lost-frame, and reconnect
    // windows a real host produces naturally.
    var timingHooks = {
        setHistoryDelay: function (ms) {
            historyDelayMs = ms;
        },
        /** Fail the NEXT history call (after its transit delay) with a transport-level throw. */
        failNextHistory: function () {
            failNextHistory = true;
        },
        /** Log append + mux emit (the normal live path). */
        appendUser: function (id, msg) {
            append(sid(id), { type: 'user/message', surfaceOp: 'append', data: userMessage(text(msg)) });
        },
        /** Append a later durable title revision through the normal raw-event + control-frame path. */
        appendTitle: function (id, title) {
            var log = logOf(sid(id));
            var messageSeqs = log.filter(function (event) { return event.type === 'user/message'; }).map(function (event) { return event.seq; });
            append(sid(id), { type: 'session/title', data: { title: title, messageSeqs: messageSeqs, source: { kind: 'provider', provider: 'fixture' } } });
        },
        /** Start an externally paced reasoning stream for the opt-in browser stress lane. */
        startReasoningChunkStorm: function (id, chunkCount, chunksPerInterval, intervalMs) {
            var _a, _b;
            if (!Number.isSafeInteger(chunkCount) || chunkCount < 1) {
                throw new Error('fixture: reasoning chunk count must be a positive safe integer');
            }
            if (!Number.isSafeInteger(chunksPerInterval) || chunksPerInterval < 1) {
                throw new Error('fixture: reasoning chunks per interval must be a positive safe integer');
            }
            if (!Number.isSafeInteger(intervalMs) || intervalMs < 1) {
                throw new Error('fixture: reasoning interval must be a positive safe integer');
            }
            if ((activeReasoningChunkStorm === null || activeReasoningChunkStorm === void 0 ? void 0 : activeReasoningChunkStorm.emitting) === true) {
                throw new Error('fixture: reasoning chunk storm already running');
            }
            var sessionId = sid(id);
            var log = logOf(sessionId);
            var turn = (_a = nextTurn.get(sessionId)) !== null && _a !== void 0 ? _a : 0;
            for (var _i = 0, log_6 = log; _i < log_6.length; _i++) {
                var event_10 = log_6[_i];
                var candidate = (_b = event_10.data) === null || _b === void 0 ? void 0 : _b.turn;
                if (typeof candidate === 'number')
                    turn = Math.max(turn, candidate + 1);
            }
            nextTurn.set(sessionId, turn + 1);
            var marker = "REASONING_STRESS_COMPLETE:".concat(String(turn), ":").concat(String(chunkCount));
            var state = {
                sessionId: id,
                chunkCount: chunkCount,
                chunksPerInterval: chunksPerInterval,
                intervalMs: intervalMs,
                emitted: 0,
                marker: marker,
                emitting: true,
            };
            activeReasoningChunkStorm = state;
            setRunning(sessionId, true);
            append(sessionId, { type: 'turn/start', data: { turn: turn, trigger: { kind: 'message', source: { kind: 'user' } } } });
            append(sessionId, {
                type: 'user/message', surfaceOp: 'append',
                data: userMessage(text("Reasoning chunk stress: ".concat(String(chunkCount), " chunks."))),
            });
            append(sessionId, { type: 'step/start', data: { turn: turn, step: 0 } });
            append(sessionId, {
                type: 'assistant/chunk',
                data: { turn: turn, step: 0, chunk: { type: 'block-start', index: 0, blockType: 'reasoning' } },
            });
            var startedAt = Date.now();
            var pump = function () {
                var elapsedIntervals = Math.floor((Date.now() - startedAt) / intervalMs) + 1;
                var due = Math.max(state.emitted + chunksPerInterval, elapsedIntervals * chunksPerInterval);
                var end = Math.min(due, chunkCount);
                for (var index = state.emitted; index < end; index++) {
                    var chunkText = index === chunkCount - 1
                        ? "\n".concat(marker)
                        : index % 64 === 63 ? '推理\n' : '推理';
                    append(sessionId, {
                        type: 'assistant/chunk',
                        data: { turn: turn, step: 0, chunk: { type: 'reasoning-delta', index: 0, text: chunkText } },
                    });
                }
                state.emitted = end;
                if (end < chunkCount) {
                    setTimeout(pump, intervalMs);
                }
                else {
                    state.emitting = false;
                }
            };
            setTimeout(pump, 0);
            return marker;
        },
        /** Return a copy so browser probes cannot mutate the active producer. */
        reasoningChunkStormState: function () {
            return activeReasoningChunkStorm === null ? null : __assign({}, activeReasoningChunkStorm);
        },
        /** Open one failed model step whose partial remains visible until llm/retry arrives. */
        beginModelRetry: function (id) {
            var _a;
            var sessionId = sid(id);
            var turn = (_a = nextTurn.get(sessionId)) !== null && _a !== void 0 ? _a : 0;
            nextTurn.set(sessionId, turn + 1);
            retryScenarios.set(sessionId, { turn: turn, stepStarted: true });
            setRunning(sessionId, true);
            append(sessionId, { type: 'turn/start', data: { turn: turn } });
            append(sessionId, { type: 'user/message', surfaceOp: 'append', data: { content: text('请重试这个请求'), source: { kind: 'user' } } });
            append(sessionId, { type: 'step/start', data: { turn: turn, step: 1 } });
            append(sessionId, { type: 'assistant/chunk', data: { turn: turn, step: 1, chunk: { type: 'block-start', index: 0, blockType: 'text' } } });
            append(sessionId, { type: 'assistant/chunk', data: { turn: turn, step: 1, chunk: { type: 'text-delta', index: 0, text: '应撤回的半截回复' } } });
        },
        /** Record one retry decision; the next attempt remains in the same step. */
        scheduleModelRetry: function (id, retry, delayMs) {
            if (retry === void 0) { retry = 1; }
            if (delayMs === void 0) { delayMs = 450; }
            var sessionId = sid(id);
            var scenario = retryScenarios.get(sessionId);
            if (scenario === undefined)
                throw new Error("fixture: no model retry scenario for ".concat(id));
            if (!scenario.stepStarted) {
                append(sessionId, { type: 'assistant/chunk', data: { turn: scenario.turn, step: 1, chunk: { type: 'block-start', index: 0, blockType: 'text' } } });
                append(sessionId, { type: 'assistant/chunk', data: { turn: scenario.turn, step: 1, chunk: { type: 'text-delta', index: 0, text: "\u7B2C ".concat(String(retry), " \u6B21\u5E94\u64A4\u56DE\u7684\u56DE\u590D") } } });
                scenario.stepStarted = true;
            }
            var failure = { code: 'TRANSPORT', message: '连接被重置' };
            append(sessionId, {
                type: 'llm/retry',
                data: {
                    turn: scenario.turn, step: 1,
                    provider: 'fixture', mode: 'normal', policyKey: 'fixture-normal',
                    retry: retry,
                    maxRetries: 2,
                    delayMs: delayMs,
                    failure: failure,
                },
            });
            scenario.stepStarted = false;
        },
        /** Record one retry decision, then cancel its source turn before the retry starts. */
        cancelModelRetryDuringBackoff: function (id, delayMs) {
            if (delayMs === void 0) { delayMs = 450; }
            var sessionId = sid(id);
            var scenario = retryScenarios.get(sessionId);
            if (scenario === undefined)
                throw new Error("fixture: no model retry scenario for ".concat(id));
            var failure = { code: 'TRANSPORT', message: '连接被重置' };
            append(sessionId, {
                type: 'llm/retry',
                data: {
                    turn: scenario.turn, step: 1,
                    provider: 'fixture', mode: 'normal', policyKey: 'fixture-normal',
                    retry: 1, maxRetries: 2,
                    delayMs: delayMs,
                    failure: failure,
                },
            });
            append(sessionId, { type: 'step/end', data: { turn: scenario.turn, step: 1 } });
            append(sessionId, { type: 'turn/end', data: { turn: scenario.turn, reason: { kind: 'aborted', reason: { kind: 'user' } },
                } });
            retryScenarios.delete(sessionId);
            setRunning(sessionId, false);
        },
        /** Finish the timing-hook retry with a finalized response in the open step. */
        completeModelRetry: function (id) {
            var sessionId = sid(id);
            var scenario = retryScenarios.get(sessionId);
            if (scenario === undefined)
                throw new Error("fixture: no model retry scenario for ".concat(id));
            retryScenarios.delete(sessionId);
            append(sessionId, { type: 'assistant/chunk', data: {
                    turn: scenario.turn,
                    step: 1,
                    chunk: { type: 'block-start', index: 0, blockType: 'text' },
                } });
            append(sessionId, {
                type: 'assistant/message',
                surfaceOp: 'append',
                data: {
                    turn: scenario.turn,
                    step: 1,
                    message: assistantMessage(text('重试后的完整回复')),
                },
            });
            append(sessionId, { type: 'step/end', data: { turn: scenario.turn, step: 1 } });
            append(sessionId, { type: 'turn/end', data: { turn: scenario.turn, reason: { kind: 'completed' } } });
            setRunning(sessionId, false);
        },
        /** Log append WITHOUT the mux emit: a frame lost in transit — history still serves it, the client must repull. */
        appendSilent: function (id, msg) {
            var log = logOf(sid(id));
            log.push({ type: 'user/message', surfaceOp: 'append', seq: log.length, time: Date.now(), data: userMessage(text(msg)) });
        },
        /** End every open stream generator (client sees both streams close -> reconnect + resync path). */
        breakStreams: function () {
            for (var _i = 0, _a = __spreadArray([], streamBreakers, true); _i < _a.length; _i++) {
                var breakNow = _a[_i];
                breakNow();
            }
        },
    };
    globalThis.__fxTiming = timingHooks;
    /** Prompt replay: chunk typewriter (80ms/frame) -> assistant/message finalize -> turn/end + running flip. */
    var startReply = function (id, turn, replyText) {
        var _a;
        var step = 0;
        append(id, { type: 'step/start', data: { turn: turn, step: step } });
        append(id, { type: 'assistant/chunk', data: { turn: turn, step: step, chunk: { type: 'block-start', index: 0, blockType: 'text' } } });
        /* v8 ignore next -- the ?? arm needs a null match, but every fixture reply is non-empty. */
        var pieces = (_a = replyText.match(/[\s\S]{1,6}/gu)) !== null && _a !== void 0 ? _a : [replyText];
        var i = 0;
        var finish = function (aborted) {
            replays.delete(id);
            var done = pieces.slice(0, i).join('');
            append(id, { type: 'assistant/chunk', data: { turn: turn, step: step, chunk: { type: 'block-end', index: 0, block: { type: 'text', text: done } } } });
            append(id, {
                type: 'assistant/message',
                surfaceOp: 'append',
                data: {
                    turn: turn,
                    step: step,
                    message: assistantMessage(text(aborted ? "".concat(done, "\uFF08\u5DF2\u4E2D\u65AD\uFF09") : done)),
                    usage: fixtureUsage(turn, step),
                },
            });
            append(id, { type: 'step/end', data: { turn: turn, step: step } });
            append(id, { type: 'turn/end', data: { turn: turn, reason: { kind: aborted ? 'cancelled' : 'completed' } } });
            setRunning(id, false);
        };
        var tick = function () {
            var piece = pieces[i];
            if (piece === undefined) {
                finish(false);
                return;
            }
            i++;
            append(id, { type: 'assistant/chunk', data: { turn: turn, step: step, chunk: { type: 'text-delta', index: 0, text: piece } } });
            replays.set(id, { timer: setTimeout(tick, 80), finish: finish });
        };
        replays.set(id, { timer: setTimeout(tick, 80), finish: finish });
    };
    var api = {
        mcp: {
            list: function (request) { return ok(request, { tools: [] }); },
            call: function (request) { return err(request, {
                code: 'internal',
                message: 'MCP execution is unavailable in the fixture API',
                details: {},
            }); },
        },
        sessions: {
            list: function (request) { return ok(request, { items: __spreadArray([], sessions, true).sort(function (a, b) { return b.updatedAt - a.updatedAt; }) }); },
            search: function (request, signal) {
                if (signal.aborted) {
                    return err(request, {
                        code: 'cancelled',
                        message: 'fixture session search was aborted',
                        details: {},
                    });
                }
                var query = searchTokenSpans(request.payload.query).tokens.map(function (token) { return token.value; });
                var matches = sessions.flatMap(function (summary) {
                    var _a;
                    var log = (_a = logs.get(summary.sessionId)) !== null && _a !== void 0 ? _a : [];
                    var current = new Set((0, surface_1.foldSurface)(log).nodes);
                    var best = log.flatMap(function (event) {
                        if (!current.has(event.seq))
                            return [];
                        var eventText = searchEventText(event);
                        var document = searchTokenSpans(eventText);
                        var match = phraseMatch(document.tokens, query);
                        if (match.count === 0)
                            return [];
                        return [{
                                sessionId: summary.sessionId,
                                seq: event.seq,
                                time: event.time,
                                text: document.text,
                                matchCount: match.count,
                                matchStart: match.start,
                                matchEnd: match.end,
                                documentLength: Array.from(eventText).length,
                            }];
                    }).sort(compareSearchCandidates)[0];
                    return best === undefined ? [] : [best];
                }).sort(compareSearchCandidates);
                return ok(request, {
                    items: matches.slice(0, api_ts_1.SESSION_SEARCH_RESULT_LIMIT).map(function (match) { return ({
                        sessionId: match.sessionId,
                        snippet: searchSnippet(match.text, match.matchStart, match.matchEnd),
                    }); }),
                    hasMore: matches.length > api_ts_1.SESSION_SEARCH_RESULT_LIMIT,
                });
            },
            create: function (request) { return __awaiter(_this, void 0, void 0, function () {
                var workspace, cwd, requestedId, attachWorkspace, attachFailure, existing, created, emitSession;
                var _a, _b, _c;
                return __generator(this, function (_d) {
                    workspace = request.payload.workspaceId === undefined
                        ? undefined
                        : workspaces.find(function (w) { return w.workspaceId === request.payload.workspaceId; });
                    if (request.payload.workspaceId !== undefined && workspace === undefined) {
                        return [2 /*return*/, err(request, {
                                code: 'workspace-not-found',
                                message: "no workspace ".concat(request.payload.workspaceId),
                                details: { workspaceId: request.payload.workspaceId },
                            })];
                    }
                    cwd = (_b = (_a = workspace === null || workspace === void 0 ? void 0 : workspace.path) !== null && _a !== void 0 ? _a : request.payload.cwd) !== null && _b !== void 0 ? _b : '/tmp/fixture';
                    requestedId = request.payload.sessionId;
                    attachWorkspace = function (sessionId) {
                        /* v8 ignore next -- callers enter only when a target Workspace exists. */
                        if (workspace === undefined || workspace.sessionIds.includes(sessionId))
                            return;
                        workspace.sessionIds = __spreadArray([sessionId], workspace.sessionIds, true);
                        workspace.updatedAt = new Date().toISOString();
                        emitHost({ type: 'host/workspace-changed', workspace: __assign({}, workspace) });
                    };
                    attachFailure = function (sessionId, workspaceId) { return err(request, {
                        code: 'workspace-attach-failed',
                        message: "fixture rejected Workspace attachment for ".concat(sessionId),
                        details: { sessionId: sessionId, workspaceId: workspaceId },
                    }); };
                    if (requestedId !== undefined) {
                        existing = summaryOf(requestedId);
                        if (existing !== undefined) {
                            if (existing.cwd !== cwd) {
                                return [2 /*return*/, err(request, {
                                        code: 'session-conflict',
                                        message: "session ".concat(requestedId, " already uses ").concat((_c = existing.cwd) !== null && _c !== void 0 ? _c : 'no cwd'),
                                        details: __assign({ sessionId: requestedId, requestedCwd: cwd }, existing.cwd === undefined ? {} : { existingCwd: existing.cwd }),
                                    })];
                            }
                            if (workspace !== undefined && !workspace.sessionIds.includes(requestedId)) {
                                if (options.failWorkspaceAttach)
                                    return [2 /*return*/, attachFailure(requestedId, workspace.workspaceId)];
                                attachWorkspace(requestedId);
                            }
                            return [2 /*return*/, ok(request, { sessionId: requestedId })];
                        }
                    }
                    created = {
                        sessionId: requestedId !== null && requestedId !== void 0 ? requestedId : sid("fx-".concat(nextSession++)), updatedAt: Date.now(), running: false, blank: true,
                        cwd: cwd,
                    };
                    sessions.push(created);
                    modelSelections.set(created.sessionId, { provider: 'deepseek-official', model: 'deepseek-v4-flash' });
                    attachedSessions += 1;
                    emitSession = function () {
                        // Mirrors the host: the frame fires at creation, so blank is constantly true.
                        emitHost({ type: 'host/session-added', sessionId: created.sessionId, blank: true, cwd: cwd });
                    };
                    if (workspace !== undefined && options.failWorkspaceAttach) {
                        emitSession();
                        return [2 /*return*/, attachFailure(created.sessionId, workspace.workspaceId)];
                    }
                    if (workspace !== undefined && options.createFrameOrder === 'workspace-first') {
                        attachWorkspace(created.sessionId);
                        emitSession();
                    }
                    else {
                        emitSession();
                        if (workspace !== undefined)
                            attachWorkspace(created.sessionId);
                    }
                    if (options.dropSessionCreateResponse)
                        throw new Error('fixture: dropped session.create response after publication');
                    return [2 /*return*/, ok(request, { sessionId: created.sessionId })];
                });
            }); },
            rename: function (request) {
                var missing = requireSession(request);
                if (missing !== undefined)
                    return missing;
                var _a = request.payload, sessionId = _a.sessionId, title = _a.title;
                var normalized = title.trim().replace(/\s+/g, ' ');
                if (normalized.length === 0) {
                    return err(request, {
                        code: 'title-invalid',
                        message: 'session title must contain visible characters',
                        details: { sessionId: sessionId },
                    });
                }
                // The append emits the session/event and its session/projection frame
                // (host parallel); the unary response settles the caller first.
                append(sessionId, {
                    type: 'session/title',
                    data: { title: normalized, messageSeqs: [], source: { kind: 'user' } },
                });
                var appended = logOf(sessionId).at(-1);
                return ok(request, { title: normalized, seq: appended.seq });
            },
            fork: function (request) {
                var _a, _b, _c, _d;
                var _e = request.payload, sessionId = _e.sessionId, atSeq = _e.atSeq;
                var source = summaryOf(sessionId);
                if (source === undefined) {
                    return err(request, {
                        code: 'session-not-found',
                        message: "no session ".concat(sessionId),
                        details: { sessionId: sessionId },
                    });
                }
                var log = (_a = logs.get(sessionId)) !== null && _a !== void 0 ? _a : [];
                var lastSeq = (_c = (_b = log.at(-1)) === null || _b === void 0 ? void 0 : _b.seq) !== null && _c !== void 0 ? _c : -1;
                var anchoredBoundary = atSeq === undefined
                    ? undefined
                    : log.find(function (e) { return e.type === 'turn/end' && e.seq >= atSeq; });
                var boundary = anchoredBoundary !== null && anchoredBoundary !== void 0 ? anchoredBoundary : (atSeq === undefined || atSeq > lastSeq
                    ? log.findLast(function (e) { return e.type === 'turn/end'; })
                    : undefined);
                if (boundary === undefined) {
                    return err(request, {
                        code: 'fork-unavailable',
                        message: atSeq !== undefined && atSeq <= lastSeq
                            ? "session ".concat(sessionId, " has not completed the turn containing event ").concat(String(atSeq))
                            : "session ".concat(sessionId, " has no completed turn"),
                        details: { sessionId: sessionId },
                    });
                }
                var cut = boundary.seq + 1;
                while (cut < log.length && ((_d = log[cut]) === null || _d === void 0 ? void 0 : _d.type) !== 'turn/start')
                    cut++;
                var child = __assign({ sessionId: sid("fx-".concat(nextSession++)), updatedAt: Date.now(), running: false, blank: false, parentSessionId: sessionId }, source.cwd === undefined ? {} : { cwd: source.cwd });
                logs.set(child.sessionId, log.slice(0, cut));
                sessions.push(child);
                emitHost(__assign({ type: 'host/session-added', sessionId: child.sessionId, blank: false, parentSessionId: sessionId }, source.cwd === undefined ? {} : { cwd: source.cwd }));
                var workspace = workspaces.find(function (w) { return w.sessionIds.includes(sessionId); });
                if (workspace !== undefined) {
                    workspace.sessionIds = __spreadArray([child.sessionId], workspace.sessionIds, true);
                    workspace.updatedAt = new Date().toISOString();
                    emitHost({ type: 'host/workspace-changed', workspace: __assign({}, workspace) });
                }
                return ok(request, { sessionId: child.sessionId });
            },
            history: function (request) { return __awaiter(_this, void 0, void 0, function () {
                var log, page, projections, doomed, delay;
                var _a, _b;
                return __generator(this, function (_c) {
                    switch (_c.label) {
                        case 0:
                            log = (_a = logs.get(request.payload.sessionId)) !== null && _a !== void 0 ? _a : [];
                            page = pageOf(log, request.payload.beforeSeq, (_b = request.payload.maxMessages) !== null && _b !== void 0 ? _b : 50);
                            projections = request.payload.beforeSeq === undefined
                                ? { asOfSeq: log.length - 1, values: projectionValuesOf(log) }
                                : undefined;
                            doomed = failNextHistory;
                            failNextHistory = false;
                            delay = historyDelayMs;
                            if (!(delay > 0)) return [3 /*break*/, 2];
                            return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, delay); })];
                        case 1:
                            _c.sent();
                            _c.label = 2;
                        case 2:
                            if (doomed)
                                throw new Error('fixture: simulated history transport failure');
                            return [2 /*return*/, ok(request, __assign(__assign({}, page), projections === undefined ? {} : { projections: projections }))];
                    }
                });
            }); },
            models: function (request) {
                var _a;
                return ok(request, {
                    current: (_a = modelSelections.get(request.payload.sessionId)) !== null && _a !== void 0 ? _a : { provider: 'deepseek-official', model: 'deepseek-v4-flash' },
                    // The fixture's routes all serve; a surface exercising the blocked
                    // posture drives it through its own stub.
                    routable: true,
                    groups: fixtureModelGroups(),
                    failures: [],
                });
            },
            selectModel: function (request) {
                var selected = __assign({ provider: request.payload.provider, model: request.payload.model }, request.payload.reasoningEffort === undefined
                    ? {}
                    : { reasoningEffort: request.payload.reasoningEffort });
                modelSelections.set(request.payload.sessionId, selected);
                return ok(request, { selected: selected });
            },
            prompt: function (request) {
                var _a, _b, _c;
                var _d = request.payload, id = _d.sessionId, mode = _d.mode, content = _d.content;
                var summary = summaryOf(id);
                if (summary === undefined) {
                    return err(request, { code: 'session-not-found', message: "no session ".concat(id), details: { sessionId: id } });
                }
                if (options.rejectPrompt) {
                    if (content.some(function (block) { return block.type === 'image'; })) {
                        return err(request, {
                            code: 'attachment-error',
                            message: 'fixture: image side exceeds the deployment limit',
                            details: { reason: 'IMAGE_DIMENSION_TOO_LARGE' },
                        });
                    }
                    return err(request, {
                        code: 'agent-busy',
                        message: 'fixture: prompt rejected before acceptance',
                        details: { reason: 'fixture-prompt-rejection' },
                    });
                }
                summary.updatedAt = Date.now();
                // First accepted prompt appends events: the summary stops being blank.
                summary.blank = false;
                var userText = content.map(function (b) { return (b.type === 'text' ? b.text : ''); }).join('');
                var durable = content.map(function (block) {
                    if (block.type === 'text')
                        return block;
                    var attachment = __assign({ attachmentId: "fixture:".concat((0, random_uuid_ts_1.randomUuid)()), mediaType: block.mediaType, bytes: Math.max(1, Math.floor(block.data.length * 3 / 4)
                            - (block.data.endsWith('==') ? 2 : block.data.endsWith('=') ? 1 : 0)), width: 160, height: 90 }, block.name === undefined ? {} : { name: block.name });
                    attachments.set(String(attachment.attachmentId), { attachment: attachment, data: block.data });
                    return { type: 'image', attachment: attachment };
                });
                if (mode === 'steer' && replays.has(id)) {
                    // Steering: the durable user/message lands inside the current turn; the replay continues.
                    append(id, { type: 'user/message', surfaceOp: 'append', data: userMessage(durable) });
                    return ok(request, { accepted: true });
                }
                var turn = (_a = nextTurn.get(id)) !== null && _a !== void 0 ? _a : 0;
                nextTurn.set(id, turn + 1);
                setRunning(id, true);
                append(id, { type: 'turn/start', data: { turn: turn } });
                // Boundary flush parallel (the host's step/start observer): an outstanding
                // /plan selection commits as plan/mode inside the opened turn.
                var plan = foldPlan(logOf(id));
                if (plan.wanted !== null && plan.wanted !== plan.active) {
                    append(id, { type: 'plan/mode', data: { active: plan.wanted } });
                }
                append(id, { type: 'user/message', surfaceOp: 'append', data: userMessage(durable) });
                // Capacity parallel of the host token-meter's request/context record:
                // log-only, appended inside the open turn, and deduplicated against the
                // route already recorded (the fixture never varies contextWindow).
                var selection = (_b = modelSelections.get(id)) !== null && _b !== void 0 ? _b : { provider: 'deepseek', model: 'deepseek-v4-flash' };
                if (((_c = lastRequestContext(logOf(id))) === null || _c === void 0 ? void 0 : _c.model) !== selection.model) {
                    append(id, {
                        type: 'request/context',
                        data: { provider: selection.provider, model: selection.model, contextWindow: 128000 },
                    });
                }
                startReply(id, turn, userText === 'render markdown'
                    ? MARKDOWN_FIXTURE
                    : userText === 'report model'
                        ? (function () {
                            var _a, _b;
                            var selection = modelSelections.get(id);
                            return "\u5F53\u524D\u6A21\u578B\uFF1A".concat((_a = selection === null || selection === void 0 ? void 0 : selection.provider) !== null && _a !== void 0 ? _a : 'unknown', "/").concat((_b = selection === null || selection === void 0 ? void 0 : selection.model) !== null && _b !== void 0 ? _b : 'unknown')
                                + ((selection === null || selection === void 0 ? void 0 : selection.reasoningEffort) === undefined ? '' : " \u00B7 \u63A8\u7406\u7B49\u7EA7\uFF1A".concat(selection.reasoningEffort));
                        })()
                        : "\u56DE\u58F0\uFF1A".concat(userText, "\u3002\u8FD9\u662F fixture \u7684\u6D41\u5F0F\u56DE\u590D\uFF0C\u7528\u4E8E\u9A8C\u8BC1\u6253\u5B57\u673A\u589E\u957F\u4E0E\u5B9A\u7A3F\u5207\u6362\u3002"));
                return ok(request, { accepted: true });
            },
            attachment: function (request) {
                var _a;
                var stored = attachments.get(String(request.payload.attachmentId));
                if (stored === undefined) {
                    return err(request, {
                        code: 'attachment-error',
                        message: 'fixture attachment missing',
                        details: { reason: 'ATTACHMENT_NOT_FOUND' },
                    });
                }
                if (!logReferencesAttachment((_a = logs.get(request.payload.sessionId)) !== null && _a !== void 0 ? _a : [], String(request.payload.attachmentId))) {
                    return err(request, {
                        code: 'attachment-error',
                        message: 'fixture attachment is not referenced by this session',
                        details: { reason: 'ATTACHMENT_NOT_REFERENCED' },
                    });
                }
                return ok(request, stored);
            },
            updateQueue: function (request) { return err(request, {
                code: 'queue-item-not-found',
                message: 'fixture has no pending queue item',
                details: { itemId: request.payload.itemId },
            }); },
            cancel: function (request) {
                var replay = replays.get(request.payload.sessionId);
                if (replay !== undefined) {
                    clearTimeout(replay.timer);
                    replay.finish(true);
                }
                else {
                    setRunning(request.payload.sessionId, false);
                }
                return ok(request, { accepted: true });
            },
        },
        subagents: {
            list: function (request) { return ok(request, { entries: [], parentAvailable: true }); },
            history: function (request) {
                var _a, _b;
                var log = (_a = logs.get(request.payload.childSessionId)) !== null && _a !== void 0 ? _a : [];
                return Promise.resolve(ok(request, pageOf(log, request.payload.beforeSeq, (_b = request.payload.maxMessages) !== null && _b !== void 0 ? _b : 50)));
            },
            prompt: function (request) { return Promise.resolve(ok(request, {
                messageId: "fixture-message-".concat(request.payload.childSessionId),
            })); },
            interrupt: function (request) { return Promise.resolve(ok(request, { accepted: true })); },
        },
        host: {
            describe: function (request) { return ok(request, {
                version: '0.0.0-fixture', cwd: '/tmp/fixture',
                attachedSessions: attachedSessions,
                home: FIXTURE_HOME, canOpenPath: true,
            }); },
            // Deterministic native pick: the keyless lanes drive the full
            // pick-then-adopt path without an OS chooser (design-mock content,
            // same tree the browse primitives serve).
            pickDirectory: function (request) { return ok(request, { path: "".concat(FIXTURE_HOME, "/Documents/project") }); },
            listDirectory: function (request) {
                var _a;
                var target = (_a = request.payload.path) !== null && _a !== void 0 ? _a : FIXTURE_HOME;
                var children = childrenOf(target);
                if (children === undefined) {
                    return err(request, { code: 'directory-unreadable', message: "cannot list ".concat(target, ": not in the fixture tree"), details: { path: target } });
                }
                return ok(request, {
                    path: target,
                    home: FIXTURE_HOME,
                    crumbs: crumbsOf(target),
                    entries: __spreadArray([], children, true).sort(function (a, b) { return a.localeCompare(b); })
                        .map(function (name) { return ({ name: name, path: target === '/' ? "/".concat(name) : "".concat(target, "/").concat(name), hidden: name.startsWith('.') }); }),
                    // The fixture tree is tiny; no level ever reaches a backend bound.
                    truncated: false,
                });
            },
            createDirectory: function (request) {
                var parent = request.payload.path;
                var children = childrenOf(parent);
                if (children === undefined) {
                    return err(request, { code: 'directory-create-failed', message: "missing parent ".concat(parent), details: { path: parent } });
                }
                // Same root special case as listDirectory's entry paths: a plain join
                // under '/' would mint '//name' and fork the tree's identity.
                var target = parent === '/' ? "/".concat(request.payload.name) : "".concat(parent, "/").concat(request.payload.name);
                if (children.includes(request.payload.name)) {
                    return err(request, { code: 'directory-exists', message: "".concat(target, " already exists"), details: { path: target } });
                }
                directoryTree.set(parent, __spreadArray(__spreadArray([], children, true), [request.payload.name], false));
                directoryTree.set(target, []);
                return ok(request, { path: target });
            },
            openPath: function (request) { return ok(request, { opened: true }); },
        },
        workspace: {
            list: function (request) { return ok(request, {
                items: workspaces.map(function (w) { return (__assign({}, w)); }),
                archivedSessionIds: __spreadArray([], archivedSessionIds, true),
            }); },
            create: function (request) {
                var _a;
                var path = request.payload.path;
                var existing = workspaces.find(function (w) { return w.path === path; });
                if (existing !== undefined)
                    return ok(request, { workspace: __assign({}, existing), created: false });
                var now = new Date().toISOString();
                var created = {
                    workspaceId: wid("fx-ws-".concat(nextWorkspace++)),
                    path: path,
                    title: (_a = path.split('/').filter(Boolean).at(-1)) !== null && _a !== void 0 ? _a : path,
                    sessionIds: [],
                    createdAt: now,
                    updatedAt: now,
                };
                workspaces.unshift(created);
                emitHost({ type: 'host/workspace-changed', workspace: __assign({}, created) });
                return ok(request, { workspace: __assign({}, created), created: true });
            },
            rename: function (request) {
                var _a = request.payload, workspaceId = _a.workspaceId, title = _a.title;
                var workspace = workspaces.find(function (w) { return w.workspaceId === workspaceId; });
                if (workspace === undefined) {
                    return err(request, {
                        code: 'workspace-not-found',
                        message: "no workspace ".concat(workspaceId),
                        details: { workspaceId: workspaceId },
                    });
                }
                var trimmed = title.trim();
                if (trimmed !== workspace.title) {
                    if (workspaces.some(function (w) { return w.workspaceId !== workspaceId && w.title === trimmed; })) {
                        return err(request, {
                            code: 'workspace-name-conflict',
                            message: "workspace name '".concat(trimmed, "' is already in use"),
                            details: { name: trimmed },
                        });
                    }
                    workspace.title = trimmed;
                    workspace.updatedAt = new Date().toISOString();
                    emitHost({ type: 'host/workspace-changed', workspace: __assign({}, workspace) });
                }
                return ok(request, { workspace: __assign({}, workspace) });
            },
            delete: function (request) {
                var workspaceId = request.payload.workspaceId;
                var index = workspaces.findIndex(function (workspace) { return workspace.workspaceId === workspaceId; });
                if (index === -1) {
                    return err(request, {
                        code: 'workspace-not-found',
                        message: "no workspace ".concat(workspaceId),
                        details: { workspaceId: workspaceId },
                    });
                }
                workspaces.splice(index, 1);
                emitHost({ type: 'host/workspace-removed', workspaceId: workspaceId });
                return ok(request, { deleted: true });
            },
            insertBefore: function (request) {
                var _a = request.payload, workspaceId = _a.workspaceId, beforeWorkspaceId = _a.beforeWorkspaceId;
                var source = workspaces.findIndex(function (workspace) { return workspace.workspaceId === workspaceId; });
                var anchor = beforeWorkspaceId === undefined
                    ? workspaces.length
                    : workspaces.findIndex(function (workspace) { return workspace.workspaceId === beforeWorkspaceId; });
                var missing = source === -1 ? workspaceId : anchor === -1 ? beforeWorkspaceId : undefined;
                if (missing !== undefined) {
                    return err(request, {
                        code: 'workspace-not-found',
                        message: "no workspace ".concat(missing),
                        details: { workspaceId: missing },
                    });
                }
                if (beforeWorkspaceId !== workspaceId) {
                    var previousOrder_1 = workspaces.map(function (candidate) { return candidate.workspaceId; });
                    var workspace = workspaces.splice(source, 1)[0];
                    /* v8 ignore next -- source was resolved from the same array immediately above. */
                    if (workspace === undefined)
                        throw new Error("fixture lost workspace ".concat(workspaceId));
                    var at = beforeWorkspaceId === undefined
                        ? workspaces.length
                        : workspaces.findIndex(function (candidate) { return candidate.workspaceId === beforeWorkspaceId; });
                    workspaces.splice(at, 0, workspace);
                    if (workspaces.some(function (candidate, index) { return candidate.workspaceId !== previousOrder_1[index]; })) {
                        emitHost({
                            type: 'host/workspace-order-changed',
                            workspaceIds: workspaces.map(function (candidate) { return candidate.workspaceId; }),
                        });
                    }
                }
                return ok(request, { workspaceIds: workspaces.map(function (candidate) { return candidate.workspaceId; }) });
            },
            insertSessionBefore: function (request) {
                var _a = request.payload, workspaceId = _a.workspaceId, sessionId = _a.sessionId, beforeSessionId = _a.beforeSessionId;
                var workspace = workspaces.find(function (w) { return w.workspaceId === workspaceId; });
                if (workspace === undefined) {
                    return err(request, {
                        code: 'workspace-not-found',
                        message: "no workspace ".concat(workspaceId),
                        details: { workspaceId: workspaceId },
                    });
                }
                if (!workspace.sessionIds.includes(sessionId)
                    || (beforeSessionId !== undefined && !workspace.sessionIds.includes(beforeSessionId))) {
                    return err(request, {
                        code: 'workspace-move-invalid',
                        message: "session or anchor is not accounted by workspace ".concat(workspaceId),
                        details: __assign({ workspaceId: workspaceId, sessionId: sessionId }, beforeSessionId === undefined ? {} : { beforeSessionId: beforeSessionId }),
                    });
                }
                var without = workspace.sessionIds.filter(function (id) { return id !== sessionId; });
                var at = beforeSessionId === undefined ? without.length : without.indexOf(beforeSessionId);
                var sessionIds = __spreadArray(__spreadArray(__spreadArray([], without.slice(0, at), true), [sessionId], false), without.slice(at), true);
                if (!sessionIds.every(function (id, index) { return id === workspace.sessionIds[index]; })) {
                    workspace.sessionIds = sessionIds;
                    workspace.updatedAt = new Date().toISOString();
                    emitHost({ type: 'host/workspace-changed', workspace: __assign({}, workspace) });
                }
                return ok(request, { workspace: __assign({}, workspace) });
            },
            archiveSession: function (request) {
                var missing = requireSession(request);
                if (missing !== undefined)
                    return missing;
                var sessionId = request.payload.sessionId;
                if (!archivedSessionIds.includes(sessionId)) {
                    archivedSessionIds.push(sessionId);
                    emitHost({ type: 'host/archived-sessions-changed', archivedSessionIds: __spreadArray([], archivedSessionIds, true) });
                }
                return ok(request, { archivedSessionIds: __spreadArray([], archivedSessionIds, true) });
            },
        },
        agentPresets: {
            // Both trusts appear, because a surface must present a locally authored
            // preset differently from one the deployment vetted.
            list: function (request) { return ok(request, {
                presets: __spreadArray([], fixturePresets, true).map(function (_a) {
                    var id = _a[0], preset = _a[1];
                    return ({
                        id: id,
                        trust: preset.trust,
                        isDefault: id === fixtureDefaultPreset,
                    });
                }),
                authorable: true,
                hasDocument: true,
            }); },
            select: function (request) {
                fixtureDefaultPreset = request.payload.agentPreset;
                return ok(request, { agentPreset: request.payload.agentPreset });
            },
            read: function (request) {
                var agentPreset = request.payload.agentPreset;
                var preset = fixturePresets.get(agentPreset);
                if (preset === undefined) {
                    return err(request, {
                        code: 'agent-preset-not-found',
                        message: "unknown agent preset \"".concat(agentPreset, "\""),
                        details: { agentPreset: agentPreset, available: __spreadArray([], fixturePresets.keys(), true) },
                    });
                }
                return ok(request, {
                    agentPreset: agentPreset,
                    trust: preset.trust,
                    content: preset.content,
                });
            },
            copy: function (request) {
                var _a = request.payload, from = _a.from, agentPreset = _a.agentPreset;
                var source = fixturePresets.get(from);
                if (source === undefined) {
                    return err(request, {
                        code: 'agent-preset-not-found',
                        message: "unknown agent preset \"".concat(from, "\""),
                        details: { agentPreset: from, available: __spreadArray([], fixturePresets.keys(), true) },
                    });
                }
                if (fixturePresets.has(agentPreset)) {
                    return err(request, {
                        code: 'agent-preset-invalid',
                        message: "agent preset \"".concat(agentPreset, "\" already exists"),
                        details: { agentPreset: agentPreset, reason: 'already exists' },
                    });
                }
                fixturePresets.set(agentPreset, { trust: 'user', content: source.content });
                return ok(request, { agentPreset: agentPreset });
            },
            // Native opens are deterministic no-op successes in this fixture, so the
            // open-directory affordance renders and the path-text fallback stays a
            // component-test concern.
            openDocument: function (request) {
                var agentPreset = request.payload.agentPreset;
                var existing = fixturePresets.get(agentPreset);
                if (existing === undefined || existing.trust === 'system') {
                    return err(request, {
                        code: 'agent-preset-read-only',
                        message: "agent preset \"".concat(agentPreset, "\" ships with the deployment"),
                        details: { agentPreset: agentPreset, reason: 'it ships with the deployment' },
                    });
                }
                return ok(request, { opened: true });
            },
            remove: function (request) {
                var agentPreset = request.payload.agentPreset;
                var existing = fixturePresets.get(agentPreset);
                if ((existing === null || existing === void 0 ? void 0 : existing.trust) === 'system') {
                    return err(request, {
                        code: 'agent-preset-read-only',
                        message: "agent preset \"".concat(agentPreset, "\" ships with the deployment"),
                        details: { agentPreset: agentPreset, reason: 'it ships with the deployment' },
                    });
                }
                fixturePresets.delete(agentPreset);
                return ok(request, {});
            },
        },
        skills: {
            list: function (request) {
                var missing = requireSession(request);
                if (missing !== undefined)
                    return missing;
                return ok(request, {
                    skills: [
                        { name: 'fixture-demo', description: 'fixture 技能样本', whenToUse: '仅供 UI 目录渲染验收', modelInvocable: true },
                        { name: 'fixture-user-only', description: 'fixture 仅用户技能样本', modelInvocable: false },
                    ],
                });
            },
        },
        goals: {
            // Compatibility face only: old API Proxy payloads and acknowledgements
            // adapt to the canonical fixture Remote implementation above.
            create: function (request) { return legacyGoalResponse(request, mapGoalResult(goalRemotes.create(request.payload.sessionId, __assign({ objective: request.payload.objective }, request.payload.maxGoalRounds === undefined ? {} : { maxGoalRounds: request.payload.maxGoalRounds })), function (value) { return ({ ref: { id: value.ref.id, revision: value.ref.revision } }); })); },
            edit: function (request) { return legacyGoalResponse(request, goalRefResult(goalRemotes.edit(request.payload.sessionId, request.payload.ref, __assign(__assign({}, request.payload.objective === undefined ? {} : { objective: request.payload.objective }), request.payload.maxGoalRounds === undefined ? {} : { maxGoalRounds: request.payload.maxGoalRounds })))); },
            pause: function (request) { return legacyGoalResponse(request, goalRefResult(goalRemotes.pause(request.payload.sessionId, request.payload.ref))); },
            resume: function (request) { return legacyGoalResponse(request, goalRefResult(goalRemotes.resume(request.payload.sessionId, request.payload.ref))); },
            complete: function (request) { return legacyGoalResponse(request, goalRefResult(goalRemotes.complete(request.payload.sessionId, request.payload.ref))); },
            clear: function (request) { return legacyGoalResponse(request, mapGoalResult(goalRemotes.clear(request.payload.sessionId, request.payload.ref), function () { return ({ cleared: true }); })); },
        },
        events: {
            mux: function (_request, signal) {
                return __asyncGenerator(this, arguments, function mux_1() {
                    var conn, breakNow, _i, sessions_1, s, log, values, _a, _b, key;
                    var _c;
                    return __generator(this, function (_d) {
                        switch (_d.label) {
                            case 0:
                                conn = new FxInbox();
                                muxConns.add(conn);
                                breakNow = function () { conn.breakNow(); };
                                streamBreakers.add(breakNow);
                                // Open baseline: subscribed sessions + pending interactions replayed with stable rpcIds.
                                for (_i = 0, sessions_1 = sessions; _i < sessions_1.length; _i++) {
                                    s = sessions_1[_i];
                                    if (!s.running)
                                        continue;
                                    log = (_c = logs.get(s.sessionId)) !== null && _c !== void 0 ? _c : [];
                                    conn.push({ rpcId: mint(), payload: { type: 'session/subscribed', sessionId: s.sessionId, lastSeq: log.length - 1 } });
                                    values = projectionValuesOf(log);
                                    for (_a = 0, _b = Object.keys(values); _a < _b.length; _a++) {
                                        key = _b[_a];
                                        conn.push({ rpcId: mint(), payload: { type: 'session/projection', sessionId: s.sessionId, key: key, value: values[key], seq: log.length - 1 } });
                                    }
                                }
                                if (approvalPending) {
                                    conn.push({
                                        rpcId: pendingApprovalRpcId,
                                        payload: {
                                            type: 'approval/requested', sessionId: sid('fx-alpha'),
                                            approvalId: pendingApprovalId,
                                            toolName: 'dangerous_tool', reason: 'fixture 常驻审批（可答：批准/拒绝后消失）',
                                        },
                                    });
                                }
                                if (questionPending) {
                                    conn.push({
                                        rpcId: pendingQuestionRpcId,
                                        payload: {
                                            type: 'question/requested', sessionId: sid('fx-alpha'), questions: fixtureQuestions,
                                        },
                                    });
                                }
                                _d.label = 1;
                            case 1:
                                _d.trys.push([1, , 4, 5]);
                                return [5 /*yield**/, __values(__asyncDelegator(__asyncValues(conn.drain(signal))))];
                            case 2: return [4 /*yield*/, __await.apply(void 0, [_d.sent()])];
                            case 3:
                                _d.sent();
                                return [3 /*break*/, 5];
                            case 4:
                                streamBreakers.delete(breakNow);
                                muxConns.delete(conn);
                                return [7 /*endfinally*/];
                            case 5: return [2 /*return*/];
                        }
                    });
                });
            },
            host: function (_request, signal) {
                return __asyncGenerator(this, arguments, function host_1() {
                    var conn, breakNow, timer;
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0:
                                conn = new FxInbox();
                                hostConns.add(conn);
                                breakNow = function () { conn.breakNow(); };
                                streamBreakers.add(breakNow);
                                timer = setInterval(function () {
                                    var gamma = summaryOf(sid('fx-gamma'));
                                    /* v8 ignore next -- the undefined arm needs fx-gamma deleted, but the fixture never removes sessions. */
                                    if (gamma !== undefined)
                                        setRunning(gamma.sessionId, !gamma.running);
                                }, 5000);
                                _a.label = 1;
                            case 1:
                                _a.trys.push([1, , 4, 5]);
                                return [5 /*yield**/, __values(__asyncDelegator(__asyncValues(conn.drain(signal))))];
                            case 2: return [4 /*yield*/, __await.apply(void 0, [_a.sent()])];
                            case 3:
                                _a.sent();
                                return [3 /*break*/, 5];
                            case 4:
                                clearInterval(timer);
                                streamBreakers.delete(breakNow);
                                hostConns.delete(conn);
                                return [7 /*endfinally*/];
                            case 5: return [2 /*return*/];
                        }
                    });
                });
            },
        },
        settings: {
            // Only the resolved DeepSeek address needed by first-run readiness is
            // represented here. Fixture-backed journeys do not open its Models
            // editor; real schema-driven forms ride the HTTP transport.
            describe: function (request) { return ok(request, {
                writable: true,
                hasDocument: true,
                namespaces: [{
                        ns: 'llm-deepseek',
                        schema: {},
                        value: { apiKeyEnv: 'DEEPSEEK_API_KEY' },
                        applies: 'live',
                        secrets: [{ path: ['apiKey'], set: false }],
                        revision: 0,
                    }],
            }); },
            // Native opens are deterministic no-op successes in this fixture, as is host.openPath.
            openDocument: function (request) { return ok(request, { opened: true }); },
            update: function (request) { return err(request, {
                code: 'settings-rejected',
                message: 'fixture: the minimal readiness settings descriptor is read-only',
                details: { ns: request.payload.ns },
            }); },
            replace: function (request) { return err(request, {
                code: 'settings-rejected',
                message: 'fixture: the minimal readiness settings descriptor is read-only',
                details: { ns: request.payload.ns },
            }); },
            mutate: function (request) { return err(request, {
                code: 'settings-rejected',
                message: 'fixture: no settings namespaces are registered',
                details: { ns: request.payload.ns },
            }); },
        },
        credentials: {
            describe: function (request) { return ok(request, {
                credentials: Object.fromEntries(request.payload.refs.map(function (ref) { return [ref, __assign(__assign({ configured: fixtureCredentials.has(ref) }, fixtureCredentials.has(ref) ? { source: 'file' } : {}), { writable: true })]; })),
            }); },
            set: function (request) {
                fixtureCredentials.set(request.payload.ref, true);
                return ok(request, {});
            },
            unset: function (request) {
                fixtureCredentials.delete(request.payload.ref);
                return ok(request, {});
            },
        },
        llm: {
            providers: function (request) { return ok(request, {
                providers: [
                    { provider: 'deepseek-official', displayName: 'DeepSeek', settingsNs: 'llm-deepseek', settingsPath: [], active: true },
                    { provider: 'openai', displayName: 'openai', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'openai'], active: true, declared: false },
                    { provider: 'anthropic', displayName: 'anthropic', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'anthropic'], active: false, declared: false },
                    // One hand-declared route, so a surface reading this fixture meets
                    // the tagged shape rather than only the shipped one.
                    { provider: 'acme-gateway', displayName: 'Acme Gateway', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'acme-gateway'], active: true, declared: true },
                ],
            }); },
            models: function (request) { return ok(request, { groups: fixtureModelGroups(), failures: [] }); },
            // The fixture endpoint is imaginary, so the interrogation answers the
            // catalog it already serves — enough for a surface to exercise adopting
            // candidates without a reachable provider.
            discoverModels: function (request) { return ok(request, {
                models: fixtureModelGroups().flatMap(function (group) { return group.models.map(function (model) { return ({ id: model.id, name: model.name }); }); }),
            }); },
        },
        respond: function (message) {
            // Same routing discipline as the host: rpcId first, then the payload's
            // audit correlation; a settled or unknown id is not-pending.
            if (message.rpcId === pendingApprovalRpcId) {
                if (!approvalPending)
                    return Promise.resolve({ accepted: false, reason: 'not-pending' });
                if (!message.result.ok)
                    return Promise.resolve({ accepted: false, reason: 'bad-response' });
                var value = message.result.value;
                if (value.approvalId !== pendingApprovalId || (value.outcome !== 'allowed-once' && value.outcome !== 'rejected')) {
                    return Promise.resolve({ accepted: false, reason: 'bad-response' });
                }
                approvalPending = false;
                emitMux({ type: 'approval/resolved', sessionId: sid('fx-alpha'), approvalId: pendingApprovalId, outcome: value.outcome });
                return Promise.resolve({ accepted: true });
            }
            if (!questionPending || message.rpcId !== pendingQuestionRpcId) {
                return Promise.resolve({ accepted: false, reason: 'not-pending' });
            }
            questionPending = false;
            emitMux({
                type: 'question/resolved', sessionId: sid('fx-alpha'),
                questionRpcId: pendingQuestionRpcId,
                outcome: message.result.ok ? 'answered' : 'cancelled',
            });
            return Promise.resolve({ accepted: true });
        },
        authorization: {
            list: function (request) { return ok(request, { flows: [] }); },
            begin: function (request) { return err(request, { code: 'internal', message: 'fixture authorization is unavailable', details: {} }); },
            cancel: function (request) { return ok(request, { cancelled: false }); },
            answer: function (request) { return ok(request, { accepted: false }); },
            logout: function (request) { return ok(request, {}); },
        },
        // Satisfies the ApiProxy contract type only: the browser export button
        // hands GET /api/session.export to the native download manager, so this
        // stub is never reached through the fixture's dispatch.
        downloads: {
            sessionLog: function () { return Promise.resolve(new Response('fixture mode does not serve session export', { status: 404 })); },
        },
    };
    var rpc = {
        call: function (channel, endpoint, payload) {
            var _a, _b, _c, _d, _e, _f;
            if (channel !== '/api') {
                return Promise.reject(new Error("fixture connection RPC channel ".concat(JSON.stringify(channel), " is unavailable")));
            }
            var args = payload.args;
            var sessionId = args.agentId;
            switch (endpoint) {
                case 'commands/list': return Promise.resolve(commandRemotes.list(sessionId));
                case 'commands/execute': return Promise.resolve(commandRemotes.execute(sessionId, args.line, (_a = args.images) !== null && _a !== void 0 ? _a : []));
                case 'fileReferences/list': return Promise.resolve(referenceRemotes.files(sessionId, (_b = args.query) !== null && _b !== void 0 ? _b : ''));
                case 'sessionReferenceResolver/candidates': return Promise.resolve(referenceRemotes.sessions(sessionId, (_c = args.query) !== null && _c !== void 0 ? _c : ''));
                case 'goals/create': return Promise.resolve(goalRemotes.create(sessionId, __assign({ objective: (_d = args.request) === null || _d === void 0 ? void 0 : _d.objective }, ((_e = args.request) === null || _e === void 0 ? void 0 : _e.maxGoalRounds) === undefined ? {} : { maxGoalRounds: args.request.maxGoalRounds })));
                case 'goals/edit': return Promise.resolve(goalRemotes.edit(sessionId, args.ref, (_f = args.request) !== null && _f !== void 0 ? _f : {}));
                case 'goals/pause': return Promise.resolve(goalRemotes.pause(sessionId, args.ref));
                case 'goals/resume': return Promise.resolve(goalRemotes.resume(sessionId, args.ref));
                case 'goals/complete': return Promise.resolve(goalRemotes.complete(sessionId, args.ref));
                case 'goals/clear': return Promise.resolve(goalRemotes.clear(sessionId, args.ref));
                default:
                    return Promise.reject(new Error("fixture connection RPC endpoint ".concat(JSON.stringify(endpoint), " is unavailable")));
            }
        },
    };
    return { api: api, rpc: rpc };
}
/**
 * Fixture platform subclass: there is no HTTP at all, so instead of a doFetch transport it
 * overrides the protocol-level virtuals (callUnary/openMux/openHost/respond) to dispatch
 * straight into the in-memory ApiProxy — while still minting rpcIds, fabricating the four
 * named full forms, and feeding the same tap as a real carrier. TODO: delete when the fixture
 * moves to the isomorphic pipeline (InProcessApiClient over toFetchHandler(fixtureImpl)).
 */
var FixtureApiClient = /** @class */ (function (_super) {
    __extends(FixtureApiClient, _super);
    function FixtureApiClient() {
        var _this = _super.call(this) || this;
        var world = createFixtureWorld(fixtureOptionsFromLocation());
        _this.api = world.api;
        _this.rpc = world.rpc;
        return _this;
    }
    FixtureApiClient.prototype.doFetch = function () {
        throw new Error('FixtureApiClient overrides all protocol paths; doFetch must be unreachable');
    };
    FixtureApiClient.prototype.callUnary = function (method, payload, signal) {
        return __awaiter(this, void 0, void 0, function () {
            var request, full, response, fullResponse;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        request = rpcRequest(payload);
                        full = { type: 'client-request', rpcId: request.rpcId, method: method, payload: payload };
                        this.onEnvelope(full);
                        return [4 /*yield*/, this.dispatch(method, request, signal !== null && signal !== void 0 ? signal : new AbortController().signal)];
                    case 1:
                        response = _a.sent();
                        fullResponse = { type: 'server-response', rpcId: response.rpcId, result: response.result };
                        this.onEnvelope(fullResponse);
                        return [2 /*return*/, response];
                }
            });
        });
    };
    /** Method-key dispatch into the in-memory contract impl (a real carrier routes by URL path instead). */
    FixtureApiClient.prototype.dispatch = function (method, request, signal) {
        switch (method) {
            case 'session.list': return this.api.sessions.list(request);
            case 'session.search': return this.api.sessions.search(request, signal);
            case 'session.create': return this.api.sessions.create(request);
            case 'session.history': return this.api.sessions.history(request);
            case 'session.models': return this.api.sessions.models(request);
            case 'session.selectModel': return this.api.sessions.selectModel(request);
            case 'session.rename': return this.api.sessions.rename(request);
            case 'session.fork': return this.api.sessions.fork(request);
            case 'session.prompt': return this.api.sessions.prompt(request);
            case 'session.attachment': return this.api.sessions.attachment(request);
            case 'session.updateQueue': return this.api.sessions.updateQueue(request);
            case 'session.cancel': return this.api.sessions.cancel(request);
            case 'subagent.list': return this.api.subagents.list(request);
            case 'subagent.history': return this.api.subagents.history(request);
            case 'subagent.prompt': return this.api.subagents.prompt(request, signal);
            case 'subagent.interrupt': return this.api.subagents.interrupt(request);
            case 'host.describe': return this.api.host.describe(request);
            case 'host.pickDirectory': return this.api.host.pickDirectory(request, new AbortController().signal);
            case 'host.listDirectory': return this.api.host.listDirectory(request, new AbortController().signal);
            case 'host.createDirectory': return this.api.host.createDirectory(request);
            case 'host.openPath': return this.api.host.openPath(request, new AbortController().signal);
            case 'workspace.list': return this.api.workspace.list(request);
            case 'workspace.create': return this.api.workspace.create(request);
            case 'workspace.rename': return this.api.workspace.rename(request);
            case 'workspace.delete': return this.api.workspace.delete(request);
            case 'workspace.insertBefore': return this.api.workspace.insertBefore(request);
            case 'workspace.insertSessionBefore': return this.api.workspace.insertSessionBefore(request);
            case 'workspace.archiveSession': return this.api.workspace.archiveSession(request);
            case 'skill.list': return this.api.skills.list(request);
            case 'agentPreset.list': return this.api.agentPresets.list(request);
            case 'agentPreset.select': return this.api.agentPresets.select(request);
            case 'agentPreset.read': return this.api.agentPresets.read(request);
            case 'agentPreset.copy': return this.api.agentPresets.copy(request);
            case 'agentPreset.openDocument': return this.api.agentPresets.openDocument(request, new AbortController().signal);
            case 'agentPreset.remove': return this.api.agentPresets.remove(request);
            case 'goal.create': return this.api.goals.create(request);
            case 'goal.edit': return this.api.goals.edit(request);
            case 'goal.pause': return this.api.goals.pause(request);
            case 'goal.resume': return this.api.goals.resume(request);
            case 'goal.complete': return this.api.goals.complete(request);
            case 'goal.clear': return this.api.goals.clear(request);
            case 'settings.describe': return this.api.settings.describe(request);
            case 'settings.openDocument': return this.api.settings.openDocument(request, signal);
            case 'settings.update': return this.api.settings.update(request);
            case 'settings.replace': return this.api.settings.replace(request);
            case 'settings.mutate': return this.api.settings.mutate(request);
            case 'credentials.describe': return this.api.credentials.describe(request);
            case 'credentials.set': return this.api.credentials.set(request);
            case 'credentials.unset': return this.api.credentials.unset(request);
            case 'llm.providers': return this.api.llm.providers(request);
            case 'llm.models': return this.api.llm.models(request);
            case 'llm.discoverModels': return this.api.llm.discoverModels(request, signal);
            case 'authorization.list': return this.api.authorization.list(request);
            case 'authorization.begin': return this.api.authorization.begin(request, signal);
            case 'authorization.cancel': return this.api.authorization.cancel(request);
            case 'authorization.answer': return this.api.authorization.answer(request);
            case 'authorization.logout': return this.api.authorization.logout(request);
            default:
                return Promise.reject(new Error("fixture RPC method ".concat(String(method), " is unavailable")));
        }
    };
    FixtureApiClient.prototype.openMux = function (payload, signal, onOpen) {
        return this.tapStream(this.api.events.mux(rpcRequest(payload), signal), onOpen);
    };
    FixtureApiClient.prototype.openHost = function (payload, signal, onOpen) {
        return this.tapStream(this.api.events.host(rpcRequest(payload), signal), onOpen);
    };
    FixtureApiClient.prototype.tapStream = function (stream, onOpen) {
        return __asyncGenerator(this, arguments, function tapStream_1() {
            var _a, stream_1, stream_1_1, envelope, full, e_1_1;
            var _b, e_1, _c, _d;
            return __generator(this, function (_e) {
                switch (_e.label) {
                    case 0:
                        // No HTTP here: the in-memory stream is established the moment iteration starts (mirrors
                        // readSse firing onOpen after response headers, before any frame).
                        onOpen === null || onOpen === void 0 ? void 0 : onOpen();
                        _e.label = 1;
                    case 1:
                        _e.trys.push([1, 8, 9, 14]);
                        _a = true, stream_1 = __asyncValues(stream);
                        _e.label = 2;
                    case 2: return [4 /*yield*/, __await(stream_1.next())];
                    case 3:
                        if (!(stream_1_1 = _e.sent(), _b = stream_1_1.done, !_b)) return [3 /*break*/, 7];
                        _d = stream_1_1.value;
                        _a = false;
                        envelope = _d;
                        full = { type: 'server-request', rpcId: envelope.rpcId, method: envelope.payload.type, payload: envelope.payload };
                        this.onEnvelope(full);
                        return [4 /*yield*/, __await(envelope)];
                    case 4: return [4 /*yield*/, _e.sent()];
                    case 5:
                        _e.sent();
                        _e.label = 6;
                    case 6:
                        _a = true;
                        return [3 /*break*/, 2];
                    case 7: return [3 /*break*/, 14];
                    case 8:
                        e_1_1 = _e.sent();
                        e_1 = { error: e_1_1 };
                        return [3 /*break*/, 14];
                    case 9:
                        _e.trys.push([9, , 12, 13]);
                        if (!(!_a && !_b && (_c = stream_1.return))) return [3 /*break*/, 11];
                        return [4 /*yield*/, __await(_c.call(stream_1))];
                    case 10:
                        _e.sent();
                        _e.label = 11;
                    case 11: return [3 /*break*/, 13];
                    case 12:
                        if (e_1) throw e_1.error;
                        return [7 /*endfinally*/];
                    case 13: return [7 /*endfinally*/];
                    case 14: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Deliver a client response to the in-memory contract impl (no HTTP POST),
     * echoing the envelope to the observation tap like every other path.
     * @param message - the client-response envelope answering a server request.
     * @returns the carrier receipt from the fixture impl.
     */
    FixtureApiClient.prototype.respond = function (message) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                this.onEnvelope(message);
                return [2 /*return*/, this.api.respond(message)];
            });
        });
    };
    return FixtureApiClient;
}(api_ts_1.AbstractApiClient));
exports.FixtureApiClient = FixtureApiClient;
/** Browser query mapping; direct unit callers pass FixtureOptions explicitly. */
function fixtureOptionsFromLocation() {
    if (typeof location === 'undefined')
        return {};
    var query = new URLSearchParams(location.search);
    return {
        empty: query.get('fixture') === 'empty',
        rejectPrompt: query.get('fixturePrompt') === 'reject',
        failWorkspaceAttach: query.get('fixtureAttach') === 'fail',
        dropSessionCreateResponse: query.get('fixtureSessionCreate') === 'drop-response',
        createFrameOrder: query.get('fixtureFrames') === 'workspace-first' ? 'workspace-first' : 'session-first',
    };
}
