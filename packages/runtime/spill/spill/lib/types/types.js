"use strict";
/**
 * Vocabulary for the spill storage Service Definition. Types only — the abstract service
 * lives in `./index.ts`, implementations in sibling packages
 * (`@z/dsh-spill-local` first).
 *
 * @module @z/dsh-spill/types
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SpillLocator = SpillLocator;
/**
 * Brand a string as a {@link SpillLocator}.
 *
 * @param locator The backend-produced locator string to brand.
 * @returns The branded spill locator.
 */
function SpillLocator(locator) {
    return locator;
}
