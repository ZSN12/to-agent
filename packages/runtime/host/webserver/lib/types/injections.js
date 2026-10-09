"use strict";
/**
 * Structured index injections: the typed rows plugins contribute to the boot
 * HTML instead of raw `tapIndex` string transforms. Rows are pure
 * JSON-serializable data because one table feeds two renderers: the served
 * form renders rows into the index.html text ({@link renderIndexInjections}),
 * and a static worker deployment ships the same rows over its boot payload
 * for a page-side interpreter. Anything not expressible as a row stays on
 * `tapIndex`, which runs after row rendering.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderIndexInjections = renderIndexInjections;
/** Escape a row value before placing it in a quoted HTML attribute. */
function escapeHtmlAttribute(value) {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('"', '&quot;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;');
}
function assertNever(row) {
    throw new Error("webserver: unknown index injection row ".concat(JSON.stringify(row)));
}
/** Render one row to markup with its placement. */
function renderRow(row) {
    switch (row.kind) {
        case 'global': {
            // `<` is escaped in JSON so a row-controlled string cannot break out of
            // the script element.
            var name_1 = JSON.stringify(row.name).replaceAll('<', '\\u003c');
            var value = row.value === undefined
                ? 'undefined'
                : JSON.stringify(row.value).replaceAll('<', '\\u003c');
            return { placement: 'head', markup: "<script>globalThis[".concat(name_1, "] = ").concat(value, "</script>") };
        }
        case 'script':
            return { placement: row.placement, markup: "<script>".concat(row.text, "</script>") };
        case 'script-src':
            return { placement: row.placement, markup: "<script src=\"".concat(escapeHtmlAttribute(row.src), "\"></script>") };
        case 'style':
            return { placement: 'head', markup: "<style>".concat(row.text, "</style>") };
        case 'html':
            return { placement: row.placement, markup: row.html };
        default:
            return assertNever(row);
    }
}
/** Insert `markup` into `html` at `at`. */
function splice(html, at, markup) {
    return "".concat(html.slice(0, at)).concat(markup).concat(html.slice(at));
}
/**
 * Render rows into an index.html body: head rows immediately after the
 * opening head tag, body rows immediately after the opening body tag, each
 * group in table order.
 * @param html - the raw index.html body.
 * @param rows - the collected injection table.
 * @returns the html with every row rendered.
 */
function renderIndexInjections(html, rows) {
    var head = '';
    var body = '';
    for (var _i = 0, rows_1 = rows; _i < rows_1.length; _i++) {
        var row = rows_1[_i];
        var rendered = renderRow(row);
        if (rendered.placement === 'head')
            head += rendered.markup;
        else
            body += rendered.markup;
    }
    var out = html;
    if (head !== '') {
        var open_1 = /<head(?:\s[^>]*)?>/i.exec(out);
        // Headless fixture pages may lack <head>; prepending keeps the rows ahead
        // of every document script.
        out = open_1 === null ? "".concat(head).concat(out) : splice(out, open_1.index + open_1[0].length, head);
    }
    if (body !== '') {
        var open_2 = /<body(?:\s[^>]*)?>/i.exec(out);
        // Body-less fragments receive the rows at the end, where the HTML parser
        // has already synthesized a body.
        out = open_2 === null ? "".concat(out).concat(body) : splice(out, open_2.index + open_2[0].length, body);
    }
    return out;
}
