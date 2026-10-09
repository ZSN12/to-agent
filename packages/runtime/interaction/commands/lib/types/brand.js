"use strict";
/**
 * dsh-commands' owned branded id: command lifecycle pairing across the
 * session log, the wire admission response, and client-side flow pairing.
 *
 * The `Branded<B>` primitive lives in `@z/dsh-brand`; this module
 * is a pure type/constructor outlet (no cordis imports, no module
 * augmentation) so wire and client programs can name the brand without
 * loading the host plugin's Context merges — the `dsh-llm/brand` shape.
 *
 * @module @z/dsh-commands/brand
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommandId = CommandId;
/**
 * Brand a string as a {@link CommandId}.
 * @param id - the executor-minted pairing id.
 * @returns the same string, branded; no validation is performed.
 */
function CommandId(id) {
    return id;
}
