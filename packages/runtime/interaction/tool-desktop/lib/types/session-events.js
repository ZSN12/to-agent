"use strict";
/**
 * Session-event augmentation for desktop control: the `desktop/action` log-only
 * audit record appended to the owning session when a desktop action is applied
 * (like `hook/*`, NOT a surface event — carries no `surfaceOp`).
 * @module @z/dsh-tool-desktop
 */
Object.defineProperty(exports, "__esModule", { value: true });
