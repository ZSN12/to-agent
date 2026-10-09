"use strict";
/**
 * Vocabulary for the fs-observation-policy plugin: the minimal execution-context
 * fields used to derive an observed-state owner by narrowing the opaque `object`
 * actor the `fs/*` events carry.
 *
 * The provider vocabulary (`FsTarget`, `FsVersion`, write/edit request types) is
 * re-used from `@z/dsh-fs`; this package owns only the observed-state
 * owner structure on top of it.
 *
 * @module @z/dsh-fs-observation-policy/types
 */
Object.defineProperty(exports, "__esModule", { value: true });
