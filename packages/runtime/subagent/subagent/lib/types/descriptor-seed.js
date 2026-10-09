"use strict";
/**
 * Seeding of a continuable child's durable descriptor event: the model-hidden
 * record of the child's declared composition before its first request, so a
 * later cold resume can reconstruct it from its own log.
 *
 * @module @z/dsh-subagent/descriptor-seed
 */
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
exports.seedDescriptorTurn = seedDescriptorTurn;
var dsh_session_1 = require("@z/dsh-session");
/**
 * Build the child's creation seed: any inherited parent-history prefix followed
 * by one model-hidden, between-turn `descriptor` event. Staging through a
 * `Session` assigns the sequence number and enforces the same lossless-JSON
 * rules the durable log does.
 * @param childId - the reserved child session id the staged log belongs to.
 * @param seed - the inherited completed-turn prefix, or `undefined` for a fresh child.
 * @param descriptor - the snapshotted composition record to persist.
 * @returns the complete seed events, contiguous from sequence zero.
 */
function seedDescriptorTurn(childId, seed, descriptor) {
    var staged = dsh_session_1.Session.create(childId, seed);
    staged.append('subagent/descriptor', descriptor);
    return __spreadArray([], staged.events, true);
}
