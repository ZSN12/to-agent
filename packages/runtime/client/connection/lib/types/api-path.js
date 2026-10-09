"use strict";
/**
 * The /api URL prefix — single source for both halves of the web transport.
 * The node half registers this prefix on the web server; both halves share the
 * event paths below for the browser WebSocket downlinks.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.HOST_EVENTS_PATH = exports.MUX_EVENTS_PATH = exports.API_PATH = void 0;
/** Route prefix owning every api request (`/api` and `/api/<anything>`). */
exports.API_PATH = '/api';
/** Browser mux-frame WebSocket pathname. */
exports.MUX_EVENTS_PATH = "".concat(exports.API_PATH, "/events.mux");
/** Browser host-frame WebSocket pathname. */
exports.HOST_EVENTS_PATH = "".concat(exports.API_PATH, "/events.host");
