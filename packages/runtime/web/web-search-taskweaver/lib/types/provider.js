"use strict";
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
exports.TaskWeaverSearchProvider = void 0;
var dsh_web_1 = require("@z/dsh-web");
var RUNTIME_ENV = {
    enabled: 'TASKWEAVER_WEB_SEARCH_ENABLED',
    apiKey: 'TASKWEAVER_WEB_SEARCH_API_KEY_SECRET',
    endpoint: 'TASKWEAVER_WEB_SEARCH_ENDPOINT',
    maxResults: 'TASKWEAVER_WEB_SEARCH_MAX_RESULTS',
};
var DEFAULT_RESULTS = 5;
var MAX_RESULTS = 50;
var ERROR_TEXT_MAX = 500;
var TIMEOUTS = {
    duckduckgo: 15000,
    tavily: 20000,
    generic: 15000,
};
function readConfig() {
    var _a, _b, _c, _d;
    var maxResults = Number(process.env[RUNTIME_ENV.maxResults]);
    return {
        enabled: process.env[RUNTIME_ENV.enabled] === 'true',
        apiKey: (_b = (_a = process.env[RUNTIME_ENV.apiKey]) === null || _a === void 0 ? void 0 : _a.trim()) !== null && _b !== void 0 ? _b : '',
        endpoint: (_d = (_c = process.env[RUNTIME_ENV.endpoint]) === null || _c === void 0 ? void 0 : _c.trim()) !== null && _d !== void 0 ? _d : '',
        maxResults: Number.isFinite(maxResults) ? clamp(maxResults, 1, MAX_RESULTS) : DEFAULT_RESULTS,
    };
}
function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function asRecords(value) {
    return Array.isArray(value) ? value.filter(isRecord) : [];
}
function firstString() {
    var _a;
    var values = [];
    for (var _i = 0; _i < arguments.length; _i++) {
        values[_i] = arguments[_i];
    }
    return (_a = values.find(function (value) { return typeof value === 'string' && value.trim().length > 0; })) === null || _a === void 0 ? void 0 : _a.trim();
}
function sourceFrom(value) {
    var url = firstString(value.url, value.link, value.href);
    if (!url)
        return undefined;
    var title = firstString(value.title, value.name, value.heading, value.web_anchor, value.website);
    var snippet = firstString(value.content, value.snippet, value.description, value.text, value.body);
    var publishedAt = firstString(value.date, value.publishedAt, value.published_at, value.published_date);
    return __assign(__assign(__assign({ url: url }, (title ? { title: title } : {})), (snippet ? { snippet: snippet } : {})), (publishedAt ? { publishedAt: publishedAt } : {}));
}
function resultFromSources(values, limit, content) {
    var allSources = values.map(function (value) { return value ? sourceFrom(value) : undefined; })
        .filter(function (source) { return source !== undefined; });
    var sources = allSources.slice(0, limit);
    return __assign(__assign({}, (content ? { content: content } : {})), { sources: sources, truncated: allSources.length > sources.length });
}
function noResults(query) {
    return "\u672A\u627E\u5230\u4E0E\u300C".concat(query, "\u300D\u76F8\u5173\u7684\u516C\u5F00\u68C0\u7D22\u7ED3\u679C\uFF0C\u8BF7\u5C1D\u8BD5\u66F4\u6362\u5173\u952E\u8BCD\u3002");
}
function timeoutSignal(signal, timeoutMs) {
    var timeout = AbortSignal.timeout(timeoutMs);
    return signal ? AbortSignal.any([signal, timeout]) : timeout;
}
function describeError(value) {
    return value instanceof Error ? value.message : String(value);
}
function requestJson(input, init, label) {
    return __awaiter(this, void 0, void 0, function () {
        var response, error_1, payload, _a, _b, error_2, detail;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    _c.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, fetch(input, init)];
                case 1:
                    response = _c.sent();
                    return [3 /*break*/, 3];
                case 2:
                    error_1 = _c.sent();
                    throw new dsh_web_1.WebError("".concat(label, "\u8BF7\u6C42\u5931\u8D25\uFF1A").concat(describeError(error_1)), 'WEB_PROVIDER_ERROR', { cause: error_1 });
                case 3:
                    _c.trys.push([3, 5, , 6]);
                    _b = (_a = JSON).parse;
                    return [4 /*yield*/, response.text()];
                case 4:
                    payload = _b.apply(_a, [_c.sent()]);
                    return [3 /*break*/, 6];
                case 5:
                    error_2 = _c.sent();
                    throw new dsh_web_1.WebError("".concat(label, "\u8FD4\u56DE\u4E86\u65E0\u6548 JSON (HTTP ").concat(response.status, ")"), 'WEB_PROVIDER_ERROR', { cause: error_2 });
                case 6:
                    if (!response.ok) {
                        detail = isRecord(payload) ? firstString(payload.message, payload.error) : undefined;
                        throw new dsh_web_1.WebError("".concat(label, " HTTP ").concat(response.status).concat(detail ? ": ".concat(detail.slice(0, ERROR_TEXT_MAX)) : ''), 'WEB_PROVIDER_ERROR');
                    }
                    return [2 /*return*/, { response: response, payload: payload }];
            }
        });
    });
}
function searchBaidu(config, query, limit, signal) {
    return __awaiter(this, void 0, void 0, function () {
        var payload, code, message, requestId;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    if (!config.apiKey)
                        throw new dsh_web_1.WebError('百度搜索 API Key 未配置', 'WEB_PROVIDER_UNAVAILABLE');
                    return [4 /*yield*/, requestJson(config.endpoint, {
                            method: 'POST',
                            redirect: 'error',
                            headers: {
                                Accept: 'application/json',
                                'Content-Type': 'application/json',
                                Authorization: "Bearer ".concat(config.apiKey),
                                'X-Appbuilder-Authorization': "Bearer ".concat(config.apiKey),
                            },
                            body: JSON.stringify({
                                messages: [{ role: 'user', content: query }],
                                search_source: 'baidu_search_v2',
                                resource_type_filter: [{ type: 'web', top_k: Math.min(MAX_RESULTS, limit) }],
                            }),
                            signal: timeoutSignal(signal, TIMEOUTS.generic),
                        }, '百度搜索')];
                case 1:
                    payload = (_b.sent()).payload;
                    if (!isRecord(payload))
                        throw new dsh_web_1.WebError('百度搜索返回了无效 JSON 对象', 'WEB_PROVIDER_ERROR');
                    code = payload.code;
                    if (code !== undefined && code !== 0 && code !== '0' && code !== 'success') {
                        message = (_a = firstString(payload.message)) !== null && _a !== void 0 ? _a : JSON.stringify(payload);
                        requestId = firstString(payload.request_id);
                        throw new dsh_web_1.WebError("\u767E\u5EA6\u641C\u7D22\u5931\u8D25 (".concat(String(code), "): ").concat(message).concat(requestId ? " request_id=".concat(requestId) : ''), 'WEB_PROVIDER_ERROR');
                    }
                    return [2 /*return*/, resultFromSources(asRecords(payload.references), limit)];
            }
        });
    });
}
function searchTavily(config, query, limit, signal) {
    return __awaiter(this, void 0, void 0, function () {
        var endpoint, headers, payload, results;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    endpoint = config.endpoint || 'https://api.tavily.com/search';
                    headers = { 'Content-Type': 'application/json' };
                    if (config.apiKey)
                        headers.Authorization = "Bearer ".concat(config.apiKey);
                    return [4 /*yield*/, requestJson(endpoint, {
                            method: 'POST',
                            headers: headers,
                            body: JSON.stringify({
                                query: query,
                                max_results: limit,
                                api_key: config.apiKey || undefined,
                                search_depth: 'basic',
                            }),
                            signal: timeoutSignal(signal, TIMEOUTS.tavily),
                        }, 'Tavily 检索')];
                case 1:
                    payload = (_a.sent()).payload;
                    results = isRecord(payload) ? asRecords(payload.results) : [];
                    return [2 /*return*/, resultFromSources(results, limit, results.length ? undefined : noResults(query))];
            }
        });
    });
}
function searchBrave(config, query, limit, signal) {
    return __awaiter(this, void 0, void 0, function () {
        var endpoint, targetUrl, headers, payload, results;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    endpoint = config.endpoint || 'https://api.search.brave.com/res/v1/web/search';
                    targetUrl = new URL(endpoint);
                    targetUrl.searchParams.set('q', query);
                    targetUrl.searchParams.set('count', String(limit));
                    headers = { Accept: 'application/json' };
                    if (config.apiKey)
                        headers['X-Subscription-Token'] = config.apiKey;
                    return [4 /*yield*/, requestJson(targetUrl, {
                            method: 'GET',
                            headers: headers,
                            signal: timeoutSignal(signal, TIMEOUTS.generic),
                        }, 'Brave 检索')];
                case 1:
                    payload = (_a.sent()).payload;
                    results = isRecord(payload) && isRecord(payload.web) ? asRecords(payload.web.results) : [];
                    return [2 /*return*/, resultFromSources(results.map(function (item) { return (__assign(__assign({}, item), { snippet: item.description })); }), limit, results.length ? undefined : noResults(query))];
            }
        });
    });
}
function searchSerper(config, query, limit, signal) {
    return __awaiter(this, void 0, void 0, function () {
        var endpoint, headers, payload, results;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    endpoint = config.endpoint || 'https://google.serper.dev/search';
                    headers = { 'Content-Type': 'application/json' };
                    if (config.apiKey)
                        headers['X-API-KEY'] = config.apiKey;
                    return [4 /*yield*/, requestJson(endpoint, {
                            method: 'POST',
                            headers: headers,
                            body: JSON.stringify({ q: query, num: limit }),
                            signal: timeoutSignal(signal, TIMEOUTS.generic),
                        }, 'Serper 检索')];
                case 1:
                    payload = (_a.sent()).payload;
                    results = isRecord(payload) ? asRecords(payload.organic) : [];
                    return [2 /*return*/, resultFromSources(results.map(function (item) { return (__assign(__assign({}, item), { url: item.link, snippet: item.snippet })); }), limit, results.length ? undefined : noResults(query))];
            }
        });
    });
}
function searchCustom(config, query, limit, signal) {
    return __awaiter(this, void 0, void 0, function () {
        var headers, timeout, response, target, error_3, postError_1, separator, target, error_4, payload, _a, _b, error_5, detail, record, rawList;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    headers = {
                        Accept: 'application/json',
                        'Content-Type': 'application/json',
                    };
                    if (config.apiKey) {
                        headers.Authorization = "Bearer ".concat(config.apiKey);
                        headers['X-API-Key'] = config.apiKey;
                    }
                    timeout = timeoutSignal(signal, TIMEOUTS.generic);
                    if (!(config.endpoint.includes('{query}') || config.endpoint.includes('?'))) return [3 /*break*/, 5];
                    target = config.endpoint.includes('{query}')
                        ? config.endpoint.replace('{query}', encodeURIComponent(query))
                        : "".concat(config.endpoint, "&q=").concat(encodeURIComponent(query));
                    _c.label = 1;
                case 1:
                    _c.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, fetch(target, { method: 'GET', headers: headers, signal: timeout })];
                case 2:
                    response = _c.sent();
                    return [3 /*break*/, 4];
                case 3:
                    error_3 = _c.sent();
                    throw new dsh_web_1.WebError("\u81EA\u5B9A\u4E49\u68C0\u7D22\u8BF7\u6C42\u5931\u8D25\uFF1A".concat(describeError(error_3)), 'WEB_PROVIDER_ERROR', { cause: error_3 });
                case 4: return [3 /*break*/, 12];
                case 5:
                    _c.trys.push([5, 7, , 12]);
                    return [4 /*yield*/, fetch(config.endpoint, {
                            method: 'POST',
                            headers: headers,
                            body: JSON.stringify({
                                query: query,
                                q: query,
                                maxResults: limit,
                                limit: limit,
                                apiKey: config.apiKey || undefined,
                            }),
                            signal: timeout,
                        })];
                case 6:
                    response = _c.sent();
                    return [3 /*break*/, 12];
                case 7:
                    postError_1 = _c.sent();
                    if ((signal === null || signal === void 0 ? void 0 : signal.aborted) || timeout.aborted) {
                        throw new dsh_web_1.WebError("\u81EA\u5B9A\u4E49\u68C0\u7D22\u8BF7\u6C42\u5931\u8D25\uFF1A".concat(describeError(postError_1)), 'WEB_PROVIDER_ERROR', { cause: postError_1 });
                    }
                    separator = config.endpoint.includes('?') ? '&' : '?';
                    target = "".concat(config.endpoint).concat(separator, "q=").concat(encodeURIComponent(query), "&limit=").concat(limit);
                    _c.label = 8;
                case 8:
                    _c.trys.push([8, 10, , 11]);
                    return [4 /*yield*/, fetch(target, { method: 'GET', headers: headers, signal: timeout })];
                case 9:
                    response = _c.sent();
                    return [3 /*break*/, 11];
                case 10:
                    error_4 = _c.sent();
                    throw new dsh_web_1.WebError("\u81EA\u5B9A\u4E49\u68C0\u7D22\u8BF7\u6C42\u5931\u8D25\uFF1A".concat(describeError(error_4)), 'WEB_PROVIDER_ERROR', { cause: error_4 });
                case 11: return [3 /*break*/, 12];
                case 12:
                    _c.trys.push([12, 14, , 15]);
                    _b = (_a = JSON).parse;
                    return [4 /*yield*/, response.text()];
                case 13:
                    payload = _b.apply(_a, [_c.sent()]);
                    return [3 /*break*/, 15];
                case 14:
                    error_5 = _c.sent();
                    throw new dsh_web_1.WebError("\u81EA\u5B9A\u4E49\u68C0\u7D22\u63A5\u53E3\u8FD4\u56DE\u4E86\u65E0\u6548 JSON (HTTP ".concat(response.status, ")"), 'WEB_PROVIDER_ERROR', { cause: error_5 });
                case 15:
                    if (!response.ok) {
                        detail = isRecord(payload) ? firstString(payload.message, payload.error) : undefined;
                        throw new dsh_web_1.WebError("\u81EA\u5B9A\u4E49\u68C0\u7D22\u63A5\u53E3 HTTP ".concat(response.status).concat(detail ? ": ".concat(detail.slice(0, ERROR_TEXT_MAX)) : ''), 'WEB_PROVIDER_ERROR');
                    }
                    record = isRecord(payload) ? payload : undefined;
                    rawList = Array.isArray(payload)
                        ? asRecords(payload)
                        : record
                            ? asRecords(record.results).length ? asRecords(record.results)
                                : asRecords(record.data).length ? asRecords(record.data)
                                    : asRecords(record.organic).length ? asRecords(record.organic)
                                        : asRecords(record.items)
                            : [];
                    if (rawList.length)
                        return [2 /*return*/, resultFromSources(rawList, limit)];
                    if (record && typeof record.text === 'string')
                        return [2 /*return*/, { content: record.text, sources: [], truncated: false }];
                    if (record && typeof record.content === 'string')
                        return [2 /*return*/, { content: record.content, sources: [], truncated: false }];
                    return [2 /*return*/, { content: JSON.stringify(payload, null, 2), sources: [], truncated: false }];
            }
        });
    });
}
function searchDuckDuckGo(query, limit, signal) {
    return __awaiter(this, void 0, void 0, function () {
        var target, payload, results, abstractText, abstractUrl, appendTopic, _i, _a, item, _b, _c, sub;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    target = new URL('https://api.duckduckgo.com/');
                    target.searchParams.set('q', query);
                    target.searchParams.set('format', 'json');
                    target.searchParams.set('no_redirect', '1');
                    target.searchParams.set('skip_disambig', '1');
                    return [4 /*yield*/, requestJson(target, {
                            method: 'GET',
                            signal: timeoutSignal(signal, TIMEOUTS.duckduckgo),
                        }, 'DuckDuckGo 检索')];
                case 1:
                    payload = (_d.sent()).payload;
                    if (!isRecord(payload))
                        throw new dsh_web_1.WebError('DuckDuckGo 返回了无效 JSON 对象', 'WEB_PROVIDER_ERROR');
                    results = [];
                    abstractText = firstString(payload.AbstractText);
                    abstractUrl = firstString(payload.AbstractURL);
                    if (abstractText && abstractUrl) {
                        results.push({ title: payload.Heading || '概要', url: abstractUrl, content: abstractText });
                    }
                    appendTopic = function (item) {
                        var text = firstString(item.Text);
                        var url = firstString(item.FirstURL);
                        if (text && url)
                            results.push({ title: text.split(' - ')[0] || '相关主题', url: url, content: text });
                    };
                    for (_i = 0, _a = asRecords(payload.RelatedTopics); _i < _a.length; _i++) {
                        item = _a[_i];
                        if (results.length >= limit)
                            break;
                        if (Array.isArray(item.Topics)) {
                            for (_b = 0, _c = asRecords(item.Topics); _b < _c.length; _b++) {
                                sub = _c[_b];
                                if (results.length >= limit)
                                    break;
                                appendTopic(sub);
                            }
                        }
                        else {
                            appendTopic(item);
                        }
                    }
                    return [2 /*return*/, resultFromSources(results, limit, results.length ? undefined : noResults(query))];
            }
        });
    });
}
function isBaiduEndpoint(endpoint) {
    try {
        var url = new URL(endpoint);
        return url.hostname === 'qianfan.baidubce.com'
            && url.pathname.replace(/\/+$/, '').endsWith('/v2/ai_search/web_search');
    }
    catch (_a) {
        return false;
    }
}
/** Search provider using only configuration injected by Electron at Host startup. */
var TaskWeaverSearchProvider = /** @class */ (function () {
    function TaskWeaverSearchProvider() {
        this.id = 'taskweaver-baidu';
    }
    TaskWeaverSearchProvider.prototype.available = function () {
        return readConfig().enabled;
    };
    TaskWeaverSearchProvider.prototype.search = function (request, signal) {
        return __awaiter(this, void 0, void 0, function () {
            var config, query, limit;
            var _a;
            return __generator(this, function (_b) {
                config = readConfig();
                if (!config.enabled)
                    throw new dsh_web_1.WebError('TaskWeaver 网页搜索尚未启用', 'WEB_PROVIDER_UNAVAILABLE');
                query = request.query.trim();
                if (!query)
                    throw new dsh_web_1.WebError('query 不能为空', 'WEB_INVALID_REQUEST');
                limit = clamp((_a = request.maxResults) !== null && _a !== void 0 ? _a : config.maxResults, 1, MAX_RESULTS);
                if (config.endpoint && isBaiduEndpoint(config.endpoint)) {
                    return [2 /*return*/, searchBaidu(config, query, limit, signal)];
                }
                if (config.endpoint.toLowerCase().includes('tavily') || (!config.endpoint && config.apiKey.startsWith('tvly-'))) {
                    return [2 /*return*/, searchTavily(config, query, limit, signal)];
                }
                if (config.endpoint.toLowerCase().includes('brave') || config.endpoint.toLowerCase().includes('search.brave.com')) {
                    return [2 /*return*/, searchBrave(config, query, limit, signal)];
                }
                if (config.endpoint.toLowerCase().includes('serper')) {
                    return [2 /*return*/, searchSerper(config, query, limit, signal)];
                }
                if (config.endpoint)
                    return [2 /*return*/, searchCustom(config, query, limit, signal)];
                return [2 /*return*/, searchDuckDuckGo(query, limit, signal)];
            });
        });
    };
    return TaskWeaverSearchProvider;
}());
exports.TaskWeaverSearchProvider = TaskWeaverSearchProvider;
