import { WebError } from '@taskweaver/dsh-web';
const RUNTIME_ENV = {
    enabled: 'TASKWEAVER_WEB_SEARCH_ENABLED',
    apiKey: 'TASKWEAVER_WEB_SEARCH_API_KEY_SECRET',
    endpoint: 'TASKWEAVER_WEB_SEARCH_ENDPOINT',
    maxResults: 'TASKWEAVER_WEB_SEARCH_MAX_RESULTS',
};
const DEFAULT_RESULTS = 5;
const MAX_RESULTS = 50;
const ERROR_TEXT_MAX = 500;
const TIMEOUTS = {
    duckduckgo: 15_000,
    tavily: 20_000,
    generic: 15_000,
};
function readConfig() {
    const maxResults = Number(process.env[RUNTIME_ENV.maxResults]);
    return {
        enabled: process.env[RUNTIME_ENV.enabled] === 'true',
        apiKey: process.env[RUNTIME_ENV.apiKey]?.trim() ?? '',
        endpoint: process.env[RUNTIME_ENV.endpoint]?.trim() ?? '',
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
function firstString(...values) {
    return values.find((value) => typeof value === 'string' && value.trim().length > 0)?.trim();
}
function sourceFrom(value) {
    const url = firstString(value.url, value.link, value.href);
    if (!url)
        return undefined;
    const title = firstString(value.title, value.name, value.heading, value.web_anchor, value.website);
    const snippet = firstString(value.content, value.snippet, value.description, value.text, value.body);
    const publishedAt = firstString(value.date, value.publishedAt, value.published_at, value.published_date);
    return {
        url,
        ...(title ? { title } : {}),
        ...(snippet ? { snippet } : {}),
        ...(publishedAt ? { publishedAt } : {}),
    };
}
function resultFromSources(values, limit, content) {
    const allSources = values.map(value => value ? sourceFrom(value) : undefined)
        .filter((source) => source !== undefined);
    const sources = allSources.slice(0, limit);
    return {
        ...(content ? { content } : {}),
        sources,
        truncated: allSources.length > sources.length,
    };
}
function noResults(query) {
    return `未找到与「${query}」相关的公开检索结果，请尝试更换关键词。`;
}
function timeoutSignal(signal, timeoutMs) {
    const timeout = AbortSignal.timeout(timeoutMs);
    return signal ? AbortSignal.any([signal, timeout]) : timeout;
}
function describeError(value) {
    return value instanceof Error ? value.message : String(value);
}
async function requestJson(input, init, label) {
    let response;
    try {
        response = await fetch(input, init);
    }
    catch (error) {
        throw new WebError(`${label}请求失败：${describeError(error)}`, 'WEB_PROVIDER_ERROR', { cause: error });
    }
    let payload;
    try {
        payload = JSON.parse(await response.text());
    }
    catch (error) {
        throw new WebError(`${label}返回了无效 JSON (HTTP ${response.status})`, 'WEB_PROVIDER_ERROR', { cause: error });
    }
    if (!response.ok) {
        const detail = isRecord(payload) ? firstString(payload.message, payload.error) : undefined;
        throw new WebError(`${label} HTTP ${response.status}${detail ? `: ${detail.slice(0, ERROR_TEXT_MAX)}` : ''}`, 'WEB_PROVIDER_ERROR');
    }
    return { response, payload };
}
async function searchBaidu(config, query, limit, signal) {
    if (!config.apiKey)
        throw new WebError('百度搜索 API Key 未配置', 'WEB_PROVIDER_UNAVAILABLE');
    const { payload } = await requestJson(config.endpoint, {
        method: 'POST',
        redirect: 'error',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apiKey}`,
            'X-Appbuilder-Authorization': `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
            messages: [{ role: 'user', content: query }],
            search_source: 'baidu_search_v2',
            resource_type_filter: [{ type: 'web', top_k: Math.min(MAX_RESULTS, limit) }],
        }),
        signal: timeoutSignal(signal, TIMEOUTS.generic),
    }, '百度搜索');
    if (!isRecord(payload))
        throw new WebError('百度搜索返回了无效 JSON 对象', 'WEB_PROVIDER_ERROR');
    const code = payload.code;
    if (code !== undefined && code !== 0 && code !== '0' && code !== 'success') {
        const message = firstString(payload.message) ?? JSON.stringify(payload);
        const requestId = firstString(payload.request_id);
        throw new WebError(`百度搜索失败 (${String(code)}): ${message}${requestId ? ` request_id=${requestId}` : ''}`, 'WEB_PROVIDER_ERROR');
    }
    return resultFromSources(asRecords(payload.references), limit);
}
async function searchTavily(config, query, limit, signal) {
    const endpoint = config.endpoint || 'https://api.tavily.com/search';
    const headers = { 'Content-Type': 'application/json' };
    if (config.apiKey)
        headers.Authorization = `Bearer ${config.apiKey}`;
    const { payload } = await requestJson(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            query,
            max_results: limit,
            api_key: config.apiKey || undefined,
            search_depth: 'basic',
        }),
        signal: timeoutSignal(signal, TIMEOUTS.tavily),
    }, 'Tavily 检索');
    const results = isRecord(payload) ? asRecords(payload.results) : [];
    return resultFromSources(results, limit, results.length ? undefined : noResults(query));
}
async function searchBrave(config, query, limit, signal) {
    const endpoint = config.endpoint || 'https://api.search.brave.com/res/v1/web/search';
    const targetUrl = new URL(endpoint);
    targetUrl.searchParams.set('q', query);
    targetUrl.searchParams.set('count', String(limit));
    const headers = { Accept: 'application/json' };
    if (config.apiKey)
        headers['X-Subscription-Token'] = config.apiKey;
    const { payload } = await requestJson(targetUrl, {
        method: 'GET',
        headers,
        signal: timeoutSignal(signal, TIMEOUTS.generic),
    }, 'Brave 检索');
    const results = isRecord(payload) && isRecord(payload.web) ? asRecords(payload.web.results) : [];
    return resultFromSources(results.map((item) => ({
        ...item,
        snippet: item.description,
    })), limit, results.length ? undefined : noResults(query));
}
async function searchSerper(config, query, limit, signal) {
    const endpoint = config.endpoint || 'https://google.serper.dev/search';
    const headers = { 'Content-Type': 'application/json' };
    if (config.apiKey)
        headers['X-API-KEY'] = config.apiKey;
    const { payload } = await requestJson(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({ q: query, num: limit }),
        signal: timeoutSignal(signal, TIMEOUTS.generic),
    }, 'Serper 检索');
    const results = isRecord(payload) ? asRecords(payload.organic) : [];
    return resultFromSources(results.map((item) => ({
        ...item,
        url: item.link,
        snippet: item.snippet,
    })), limit, results.length ? undefined : noResults(query));
}
async function searchCustom(config, query, limit, signal) {
    const headers = {
        Accept: 'application/json',
        'Content-Type': 'application/json',
    };
    if (config.apiKey) {
        headers.Authorization = `Bearer ${config.apiKey}`;
        headers['X-API-Key'] = config.apiKey;
    }
    const timeout = timeoutSignal(signal, TIMEOUTS.generic);
    let response;
    if (config.endpoint.includes('{query}') || config.endpoint.includes('?')) {
        const target = config.endpoint.includes('{query}')
            ? config.endpoint.replace('{query}', encodeURIComponent(query))
            : `${config.endpoint}&q=${encodeURIComponent(query)}`;
        try {
            response = await fetch(target, { method: 'GET', headers, signal: timeout });
        }
        catch (error) {
            throw new WebError(`自定义检索请求失败：${describeError(error)}`, 'WEB_PROVIDER_ERROR', { cause: error });
        }
    }
    else {
        try {
            response = await fetch(config.endpoint, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    query,
                    q: query,
                    maxResults: limit,
                    limit,
                    apiKey: config.apiKey || undefined,
                }),
                signal: timeout,
            });
        }
        catch (postError) {
            if (signal?.aborted || timeout.aborted) {
                throw new WebError(`自定义检索请求失败：${describeError(postError)}`, 'WEB_PROVIDER_ERROR', { cause: postError });
            }
            const separator = config.endpoint.includes('?') ? '&' : '?';
            const target = `${config.endpoint}${separator}q=${encodeURIComponent(query)}&limit=${limit}`;
            try {
                response = await fetch(target, { method: 'GET', headers, signal: timeout });
            }
            catch (error) {
                throw new WebError(`自定义检索请求失败：${describeError(error)}`, 'WEB_PROVIDER_ERROR', { cause: error });
            }
        }
    }
    let payload;
    try {
        payload = JSON.parse(await response.text());
    }
    catch (error) {
        throw new WebError(`自定义检索接口返回了无效 JSON (HTTP ${response.status})`, 'WEB_PROVIDER_ERROR', { cause: error });
    }
    if (!response.ok) {
        const detail = isRecord(payload) ? firstString(payload.message, payload.error) : undefined;
        throw new WebError(`自定义检索接口 HTTP ${response.status}${detail ? `: ${detail.slice(0, ERROR_TEXT_MAX)}` : ''}`, 'WEB_PROVIDER_ERROR');
    }
    const record = isRecord(payload) ? payload : undefined;
    const rawList = Array.isArray(payload)
        ? asRecords(payload)
        : record
            ? asRecords(record.results).length ? asRecords(record.results)
                : asRecords(record.data).length ? asRecords(record.data)
                    : asRecords(record.organic).length ? asRecords(record.organic)
                        : asRecords(record.items)
            : [];
    if (rawList.length)
        return resultFromSources(rawList, limit);
    if (record && typeof record.text === 'string')
        return { content: record.text, sources: [], truncated: false };
    if (record && typeof record.content === 'string')
        return { content: record.content, sources: [], truncated: false };
    return { content: JSON.stringify(payload, null, 2), sources: [], truncated: false };
}
async function searchDuckDuckGo(query, limit, signal) {
    const target = new URL('https://api.duckduckgo.com/');
    target.searchParams.set('q', query);
    target.searchParams.set('format', 'json');
    target.searchParams.set('no_redirect', '1');
    target.searchParams.set('skip_disambig', '1');
    const { payload } = await requestJson(target, {
        method: 'GET',
        signal: timeoutSignal(signal, TIMEOUTS.duckduckgo),
    }, 'DuckDuckGo 检索');
    if (!isRecord(payload))
        throw new WebError('DuckDuckGo 返回了无效 JSON 对象', 'WEB_PROVIDER_ERROR');
    const results = [];
    const abstractText = firstString(payload.AbstractText);
    const abstractUrl = firstString(payload.AbstractURL);
    if (abstractText && abstractUrl) {
        results.push({ title: payload.Heading || '概要', url: abstractUrl, content: abstractText });
    }
    const appendTopic = (item) => {
        const text = firstString(item.Text);
        const url = firstString(item.FirstURL);
        if (text && url)
            results.push({ title: text.split(' - ')[0] || '相关主题', url, content: text });
    };
    for (const item of asRecords(payload.RelatedTopics)) {
        if (results.length >= limit)
            break;
        if (Array.isArray(item.Topics)) {
            for (const sub of asRecords(item.Topics)) {
                if (results.length >= limit)
                    break;
                appendTopic(sub);
            }
        }
        else {
            appendTopic(item);
        }
    }
    return resultFromSources(results, limit, results.length ? undefined : noResults(query));
}
function isBaiduEndpoint(endpoint) {
    try {
        const url = new URL(endpoint);
        return url.hostname === 'qianfan.baidubce.com'
            && url.pathname.replace(/\/+$/, '').endsWith('/v2/ai_search/web_search');
    }
    catch {
        return false;
    }
}
/** Search provider using only configuration injected by Electron at Host startup. */
export class TaskWeaverSearchProvider {
    id = 'taskweaver-baidu';
    available() {
        return readConfig().enabled;
    }
    async search(request, signal) {
        const config = readConfig();
        if (!config.enabled)
            throw new WebError('TaskWeaver 网页搜索尚未启用', 'WEB_PROVIDER_UNAVAILABLE');
        const query = request.query.trim();
        if (!query)
            throw new WebError('query 不能为空', 'WEB_INVALID_REQUEST');
        const limit = clamp(request.maxResults ?? config.maxResults, 1, MAX_RESULTS);
        if (config.endpoint && isBaiduEndpoint(config.endpoint)) {
            return searchBaidu(config, query, limit, signal);
        }
        if (config.endpoint.toLowerCase().includes('tavily') || (!config.endpoint && config.apiKey.startsWith('tvly-'))) {
            return searchTavily(config, query, limit, signal);
        }
        if (config.endpoint.toLowerCase().includes('brave') || config.endpoint.toLowerCase().includes('search.brave.com')) {
            return searchBrave(config, query, limit, signal);
        }
        if (config.endpoint.toLowerCase().includes('serper')) {
            return searchSerper(config, query, limit, signal);
        }
        if (config.endpoint)
            return searchCustom(config, query, limit, signal);
        return searchDuckDuckGo(query, limit, signal);
    }
}
//# sourceMappingURL=provider.js.map