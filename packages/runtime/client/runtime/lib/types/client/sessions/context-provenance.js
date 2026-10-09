"use strict";
// Context source projection: the role and the human-facing producer name
// of one logged non-user `user/message`, read from its durable `source` alone.
// The client keeps no table of known plugin ids — a renamed or newly mounted
// producer must never need a client release to stay identifiable, and a resumed
// or foreign log must project the same way as a live one.
Object.defineProperty(exports, "__esModule", { value: true });
exports.sessionRecallLabels = sessionRecallLabels;
exports.contextProvenance = contextProvenance;
exports.contextForm = contextForm;
/** One durable source narrowed to the readable-record shape; null for anything else. */
function asRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? value
        : null;
}
/** A record field read as a non-empty string, or null. */
function readString(record, key) {
    var value = record[key];
    return typeof value === 'string' && value.length > 0 ? value : null;
}
/** Distinct non-empty `field` values of an array-valued source member, in first-seen order. */
function collect(source, member, field) {
    var list = source[member];
    if (!Array.isArray(list))
        return [];
    var seen = [];
    for (var _i = 0, list_1 = list; _i < list_1.length; _i++) {
        var entry = list_1[_i];
        var record = asRecord(entry);
        var value = record === null ? null : readString(record, field);
        if (value !== null && !seen.includes(value))
            seen.push(value);
    }
    return seen;
}
/** A collected name list rendered as one label; null when the list is empty. */
function joined(names) {
    return names.length > 0 ? names.join(', ') : null;
}
/**
 * The referenced-session labels of one durable `session-reference` recall
 * source, in first-seen order; empty for every other source shape, including
 * a foreign or older log whose reference entries carry no readable label.
 * @param source - the logged `user/message` source, exactly as recorded.
 * @returns distinct non-empty reference labels.
 */
function sessionRecallLabels(source) {
    var record = asRecord(source);
    if (record === null || readString(record, 'kind') !== 'session-reference')
        return [];
    return collect(record, 'references', 'label');
}
/**
 * Project one durable message source onto its transcript role and producer name.
 *
 * The source arrives over the wire as opaque JSON (`MessageSource` is
 * merge-extensible, so no client-side union can be exhaustive), and a durable
 * log may predate or postdate this UI; every unreadable shape therefore
 * degrades to `inject` with whatever name the record still carries.
 * @param source - the logged `user/message` source, exactly as recorded.
 * @returns the role and producer name to present for this context.
 */
function contextProvenance(source) {
    var _a, _b, _c, _d;
    var record = asRecord(source);
    var kind = record === null ? null : readString(record, 'kind');
    if (record === null || kind === null)
        return { role: 'inject', label: null };
    switch (kind) {
        // Cross-session snapshots are the one durable source that carries another
        // session's material; its references name the sessions they were read from.
        case 'session-reference':
            return { role: 'recall', label: (_a = joined(collect(record, 'references', 'label'))) !== null && _a !== void 0 ? _a : kind };
        // Workspace instructions name the files they were reconciled from, which
        // identifies the producer far better than the plugin id would.
        case 'agent-instructions':
            return { role: 'inject', label: (_b = joined(collect(record, 'changes', 'path'))) !== null && _b !== void 0 ? _b : kind };
        case 'plugin':
            return { role: 'inject', label: (_c = readString(record, 'plugin')) !== null && _c !== void 0 ? _c : kind };
        // A user-explicit skill invocation names the skill it injected.
        case 'skill-invocation':
            return { role: 'inject', label: (_d = readString(record, 'name')) !== null && _d !== void 0 ? _d : kind };
        // Documented default arm of the merge-extensible source map: an unknown
        // producer still identifies itself by its own durable kind.
        default:
            return { role: 'inject', label: kind };
    }
}
/**
 * Context forms this UI version renders with a dedicated presentation. The
 * durable vocabulary (`ContextForm` in `dsh-llm`) may already be wider — an
 * unrecognized or absent value degrades to the opaque presentation rather than
 * dropping the row, so a log written by a newer or foreign producer still
 * renders.
 */
var KNOWN_FORMS = ['instructions', 'catalog', 'snapshot', 'notice', 'relay', 'recall'];
/**
 * Read the producer-declared form off one durable message source.
 * @param source - the logged `user/message` source, exactly as recorded.
 * @returns the form when this UI version presents it, otherwise null (opaque).
 */
function contextForm(source) {
    var record = asRecord(source);
    var form = record === null ? null : readString(record, 'form');
    return form !== null && KNOWN_FORMS.includes(form)
        ? form
        : null;
}
