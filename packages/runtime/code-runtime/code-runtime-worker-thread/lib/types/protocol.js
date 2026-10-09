"use strict";
/**
 * Versionless, structured-clone wire protocol between co-shipped host and worker code. The host
 * treats inbound traffic as hostile because model code can forge `parentPort` messages; the
 * worker trusts host replies.
 * @module @z/dsh-code-runtime-worker-thread/src/protocol
 */
Object.defineProperty(exports, "__esModule", { value: true });
